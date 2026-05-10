import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { URL } from "url";
import { prisma } from "../prisma.js";

const userSockets = new Map();
const rooms = new Map();

function addSocket(userId, ws) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(ws);
}

function removeSocket(userId, ws) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (!set.size) userSockets.delete(userId);
  for (const [roomId, info] of rooms.entries()) {
    if (info.participants.has(userId)) {
      info.participants.delete(userId);
      if (!info.participants.size) rooms.delete(roomId);
    }
  }
}

async function joinRoom(ws, roomId) {
  const viewing = await prisma.viewingRequest.findUnique({ where: { roomId } });
  if (!viewing) return { ok: false, error: "Комната не найдена" };
  if (viewing.requesterId !== ws.userId && viewing.ownerId !== ws.userId) {
    return { ok: false, error: "Нет доступа к комнате" };
  }
  if (viewing.status === "ENDED" || viewing.status === "CANCELLED") {
    return { ok: false, error: "Просмотр завершён" };
  }
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      ownerId: viewing.ownerId,
      requesterId: viewing.requesterId,
      participants: new Set(),
    });
  }
  rooms.get(roomId).participants.add(ws.userId);
  return { ok: true, peerUserId: ws.userId === viewing.ownerId ? viewing.requesterId : viewing.ownerId };
}

function relayInRoom(ws, msg) {
  const info = rooms.get(msg.roomId);
  if (!info) return false;
  if (!info.participants.has(ws.userId)) return false;
  const targetUserId =
    ws.userId === info.ownerId ? info.requesterId : info.ownerId;
  if (!targetUserId) return false;
  return sendToUser(targetUserId, {
    ...msg,
    fromUserId: ws.userId,
  });
}

export function initWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get("token");
    if (!token) {
      socket.destroy();
      return;
    }
    let userId;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = payload.sub;
    } catch {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      addSocket(userId, ws);
      ws.send(JSON.stringify({ type: "hello", at: new Date().toISOString() }));
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", at: new Date().toISOString() }));
        return;
      }
      if (msg.type === "rtc-join" && msg.roomId) {
        const r = await joinRoom(ws, msg.roomId);
        ws.send(
          JSON.stringify({
            type: "rtc-joined",
            roomId: msg.roomId,
            ok: r.ok,
            error: r.error,
            peerUserId: r.peerUserId,
          })
        );
        if (r.ok) {
          const info = rooms.get(msg.roomId);
          const otherId =
            ws.userId === info.ownerId ? info.requesterId : info.ownerId;
          sendToUser(otherId, { type: "rtc-peer-joined", roomId: msg.roomId, fromUserId: ws.userId });
        }
        return;
      }
      if (msg.type === "rtc-leave" && msg.roomId) {
        const info = rooms.get(msg.roomId);
        if (info) {
          info.participants.delete(ws.userId);
          if (!info.participants.size) rooms.delete(msg.roomId);
        }
        const peer = info?.ownerId === ws.userId ? info?.requesterId : info?.ownerId;
        if (peer) sendToUser(peer, { type: "rtc-peer-left", roomId: msg.roomId });
        return;
      }
      if (
        msg.type === "rtc-offer" ||
        msg.type === "rtc-answer" ||
        msg.type === "rtc-ice"
      ) {
        relayInRoom(ws, msg);
      }
    });
    ws.on("close", () => removeSocket(ws.userId, ws));
    ws.on("error", () => removeSocket(ws.userId, ws));
  });

  return wss;
}

export function isUserOnline(userId) {
  return userSockets.has(userId);
}

export function sendToUser(userId, payload) {
  const set = userSockets.get(userId);
  if (!set || !set.size) return false;
  const data = JSON.stringify(payload);
  let delivered = false;
  for (const ws of set) {
    if (ws.readyState === 1) {
      ws.send(data);
      delivered = true;
    }
  }
  return delivered;
}

export function broadcastToAll(payload) {
  const data = JSON.stringify(payload);
  for (const set of userSockets.values()) {
    for (const ws of set) {
      if (ws.readyState === 1) ws.send(data);
    }
  }
}
