import { prisma } from "../prisma.js";
import { notifyUser } from "../realtime/notify.js";

const FOUR_HOURS = 4 * 60 * 60 * 1000;

async function tick() {
  try {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const upcoming = await prisma.rentPayment.findMany({
      where: {
        status: "PENDING",
        dueDate: { gt: now, lte: in3Days },
      },
      include: { deal: { select: { tenantId: true, listing: { select: { title: true } } } } },
      take: 200,
    });
    for (const p of upcoming) {
      notifyUser(p.deal.tenantId, {
        kind: "rent-reminder",
        title: "Скоро арендный платёж",
        body: `${p.amount} ${p.currency} до ${new Date(p.dueDate).toLocaleDateString("ru-RU")}`,
        url: `/?deal=${p.dealId}`,
      }).catch(() => {});
    }

    const overdue = await prisma.rentPayment.findMany({
      where: {
        status: "PENDING",
        dueDate: { lt: now },
      },
      include: { deal: { select: { tenantId: true, landlordId: true, listing: { select: { title: true } } } } },
      take: 200,
    });
    for (const p of overdue) {
      await prisma.rentPayment.update({ where: { id: p.id }, data: { status: "OVERDUE" } });
      notifyUser(p.deal.tenantId, {
        kind: "rent-overdue",
        title: "Просрочка арендного платежа",
        body: `${p.amount} ${p.currency} от ${new Date(p.dueDate).toLocaleDateString("ru-RU")}`,
        url: `/?deal=${p.dealId}`,
      }).catch(() => {});
      notifyUser(p.deal.landlordId, {
        kind: "rent-overdue-landlord",
        title: "Арендатор не оплатил",
        body: `Просрочка по «${p.deal.listing?.title || ""}»`,
        url: `/?deal=${p.dealId}`,
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[rent-reminders] error", err?.message);
  }
}

export function startRentReminderJob() {
  console.log(`[rent-reminders] cron every 4h`);
  setTimeout(tick, 30 * 1000);
  setInterval(tick, FOUR_HOURS);
}
