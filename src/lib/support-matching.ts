import { getPrisma } from "@/lib/prisma";

type OrderRef = { id: string; storeId: string | null };
type Candidate = { subjectNumbers: string[]; messageNumbers: string[] };

/** Picks the order a ticket points to: order numbers before tracking numbers, subject before messages. */
export function findOrderForTicket(ticket: Candidate, byOrderNumber: Map<string, OrderRef>, byTracking: Map<string, OrderRef>) {
  const passes = [
    { numbers: ticket.subjectNumbers, index: byOrderNumber, method: "Order number (subject)" },
    { numbers: ticket.subjectNumbers, index: byTracking, method: "Tracking number (subject)" },
    { numbers: ticket.messageNumbers, index: byOrderNumber, method: "Order number (message)" },
    { numbers: ticket.messageNumbers, index: byTracking, method: "Tracking number (message)" },
  ];
  for (const { numbers, index, method } of passes) {
    const order = numbers.map((number) => index.get(number)).find(Boolean);
    if (order) return { order, method };
  }
  return null;
}

/**
 * Links unlinked tickets to orders by the numbers already stored on them (no API calls), and gives the rest
 * their inbox's store. Order numbers are unique across stores, so the order alone decides the store.
 * Runs after every Shopify and Commslayer sync, so tickets link as soon as their order is imported.
 */
export async function linkTickets() {
  const prisma = getPrisma();
  const [tickets, inboxes] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { excluded: false, orderId: null },
      select: { id: true, accountId: true, inboxId: true, storeId: true, subjectNumbers: true, messageNumbers: true },
    }),
    prisma.supportInbox.findMany({ select: { accountId: true, externalInboxId: true, storeId: true } }),
  ]);
  const numbers = [...new Set(tickets.flatMap((ticket) => [...ticket.subjectNumbers, ...ticket.messageNumbers]))];
  const orders = numbers.length
    ? await prisma.order.findMany({
        where: { OR: [{ shopifyOrderId: { in: [...numbers, ...numbers.map((number) => `#${number}`)] } }, { trackingNumber: { in: numbers } }] },
        select: { id: true, storeId: true, shopifyOrderId: true, trackingNumber: true },
      })
    : [];
  const byOrderNumber = new Map(orders.map((order) => [order.shopifyOrderId.replace(/^#/, ""), order]));
  const byTracking = new Map(orders.filter((order) => order.trackingNumber).map((order) => [order.trackingNumber!, order]));
  const inboxStore = new Map(inboxes.map((inbox) => [`${inbox.accountId}|${inbox.externalInboxId}`, inbox.storeId]));

  const updates = [];
  let linked = 0;
  for (const ticket of tickets) {
    const match = findOrderForTicket(ticket, byOrderNumber, byTracking);
    if (match) {
      linked++;
      updates.push(prisma.supportTicket.update({ where: { id: ticket.id }, data: { orderId: match.order.id, storeId: match.order.storeId, matchMethod: match.method } }));
      continue;
    }
    const storeId = inboxStore.get(`${ticket.accountId}|${ticket.inboxId}`) ?? null;
    if (storeId !== ticket.storeId) updates.push(prisma.supportTicket.update({ where: { id: ticket.id }, data: { storeId } }));
  }
  for (let start = 0; start < updates.length; start += 500) await prisma.$transaction(updates.slice(start, start + 500));
  return { checked: tickets.length, linked };
}
