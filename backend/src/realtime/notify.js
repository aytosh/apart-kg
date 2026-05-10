import { sendToUser, isUserOnline } from "./ws.js";
import { sendPushToUser } from "./push.js";

/**
 * Универсальная отправка уведомления пользователю.
 * Если онлайн через WebSocket — отправляем туда.
 * Push-уведомление отправляется всегда (доставка во вкладку и/или в системные).
 */
export async function notifyUser(userId, payload) {
  const wsDelivered = sendToUser(userId, { type: "notify", ...payload });
  let pushResult = { sent: 0, failed: 0 };
  try {
    pushResult = await sendPushToUser(userId, payload);
  } catch (err) {
    console.error("[notify] push error", err?.message);
  }
  return { wsDelivered, push: pushResult, online: isUserOnline(userId) };
}
