import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { isDemoMode, requireUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { issueLabels } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";
import { parseTicketParams } from "@/lib/tickets";

// Every ticket matching the list's filters, as CSV.
// ponytail: builds the whole file in memory; stream in batches if exports reach tens of thousands of tickets.
export async function GET(request: NextRequest) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const prisma = getPrisma();
  const [accounts, stores] = await Promise.all([
    prisma.supportAccount.findMany({ select: { id: true } }),
    prisma.shopifyStore.findMany({ select: { id: true } }),
  ]);
  const { where } = parseTicketParams(Object.fromEntries(request.nextUrl.searchParams), accounts, stores);
  const tickets = await prisma.supportTicket.findMany({
    where,
    select: { externalId: true, displayId: true, subject: true, status: true, labels: true, contactReason: true, ticketCreatedAt: true, category: true, refundRequested: true, wismo: true, matchMethod: true, subjectNumbers: true, messageNumbers: true, account: { select: { name: true } }, store: { select: { name: true } }, order: { select: { shopifyOrderId: true } } },
    orderBy: { ticketCreatedAt: "desc" },
  });
  return csvResponse("tickets", [
    ["Ticket", "Created (UTC)", "Subject", "Status", "Category", "Contact reason", "Labels", "WISMO", "Refund requested", "Support account", "Store", "Order", "Matched by", "Numbers found"],
    ...tickets.map((ticket) => [
      ticket.displayId ?? ticket.externalId, ticket.ticketCreatedAt, ticket.subject, ticket.status, ticket.category ? issueLabels[ticket.category] : null, ticket.contactReason,
      ticket.labels.join("; "), ticket.wismo ? "Yes" : "No", ticket.refundRequested ? "Yes" : "No", ticket.account?.name, ticket.store?.name,
      ticket.order?.shopifyOrderId, ticket.matchMethod, [...new Set([...ticket.subjectNumbers, ...ticket.messageNumbers])].join("; "),
    ]),
  ]);
}
