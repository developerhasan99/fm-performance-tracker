import type { IssueCategory, Prisma } from "@prisma/client";
import { issueLabels } from "@/lib/dashboard";

export const ticketStatuses = ["open", "pending", "snoozed", "resolved", "merged"];

export type TicketParams = { q?: string; status?: string; account?: string; store?: string; link?: string; all?: string; category?: string };

/** Validated filters from the tickets URL, shared by the list and its CSV export. `search` holds them without the page. */
export function parseTicketParams(params: TicketParams, accounts: { id: string }[], stores: { id: string }[]) {
  const query = params.q?.trim() ?? "";
  const status = ticketStatuses.find((item) => item === params.status);
  const showAll = params.all === "1";
  const accountId = accounts.find((account) => account.id === params.account)?.id;
  const storeId = stores.find((store) => store.id === params.store)?.id;
  const link = params.link === "linked" || params.link === "unlinked" ? params.link : undefined;
  // A ticket category, or "none" for tickets without one (general enquiries).
  const category = params.category === "none" || (params.category && params.category in issueLabels) ? params.category : undefined;

  const where: Prisma.SupportTicketWhereInput = {
    ...(accountId && { accountId }),
    ...(storeId && { storeId }),
    ...(link && { orderId: link === "linked" ? { not: null } : null }),
    ...(category && { category: category === "none" ? null : (category as IssueCategory), excluded: false }),
    ...(status ? { status } : showAll ? {} : { status: { not: "merged" } }),
    // Spam is hidden unless "Include spam & merged" is ticked.
    ...(!showAll && { NOT: { raw: { path: ["spam"], equals: true } } }),
    ...(query && { OR: [
      { subject: { contains: query, mode: "insensitive" } },
      { contactReason: { contains: query, mode: "insensitive" } },
      { labels: { has: query.toLowerCase() } },
      ...(/^\d+$/.test(query) ? [{ externalId: Number(query) }, { displayId: Number(query) }] : []),
    ] }),
  };
  const search = new URLSearchParams({ ...(query && { q: query }), ...(status && { status }), ...(accountId && { account: accountId }), ...(storeId && { store: storeId }), ...(link && { link }), ...(showAll && { all: "1" }), ...(category && { category }) });
  return { query, status, showAll, accountId, storeId, link, category, where, search };
}
