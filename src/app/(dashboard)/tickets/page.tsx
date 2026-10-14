import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { isDemoMode, requireUser } from "@/lib/auth";
import { formatDate, issueLabels } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const statuses = ["open", "pending", "snoozed", "resolved", "merged"];

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; account?: string; store?: string; link?: string; all?: string; page?: string }> }) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = statuses.find((item) => item === params.status);
  const showAll = params.all === "1";
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const prisma = getPrisma();
  const [accounts, stores] = await Promise.all([
    prisma.supportAccount.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.shopifyStore.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const accountId = accounts.find((account) => account.id === params.account)?.id;
  const storeId = stores.find((store) => store.id === params.store)?.id;
  const link = params.link === "linked" || params.link === "unlinked" ? params.link : undefined;

  const where: Prisma.SupportTicketWhereInput = {
    ...(accountId && { accountId }),
    ...(storeId && { storeId }),
    ...(link && { orderId: link === "linked" ? { not: null } : null }),
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
  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      select: { id: true, externalId: true, displayId: true, subject: true, status: true, labels: true, contactReason: true, ticketCreatedAt: true, category: true, refundRequested: true, wismo: true, matchMethod: true, subjectNumbers: true, messageNumbers: true, messagesCheckedAt: true, account: { select: { name: true } }, store: { select: { name: true } }, order: { select: { id: true, shopifyOrderId: true } } },
      orderBy: { ticketCreatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const search = new URLSearchParams({ ...(query && { q: query }), ...(status && { status }), ...(accountId && { account: accountId }), ...(storeId && { store: storeId }), ...(link && { link }), ...(showAll && { all: "1" }), ...(target > 1 && { page: String(target) }) });
    return `/tickets${search.size ? `?${search}` : ""}`;
  };
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Customer support</p><h1>Tickets</h1><p className="page-subtitle">Commslayer conversations, linked to an order when they mention its order or tracking number.</p></div></div>
      <Form className="orders-toolbar" action="/tickets" key={`${query}|${status}|${accountId}|${storeId}|${link}|${showAll}`}>
        <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search subject, reason, label or ticket #" defaultValue={query} aria-label="Search tickets" /></label>
        <select className="filter-select" name="status" defaultValue={status ?? ""} aria-label="Filter by ticket status">
          <option value="">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
        </select>
        {accounts.length > 1 && (
          <select className="filter-select" name="account" defaultValue={accountId ?? ""} aria-label="Filter by support account">
            <option value="">All accounts</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        )}
        {stores.length > 0 && (
          <select className="filter-select" name="store" defaultValue={storeId ?? ""} aria-label="Filter by store">
            <option value="">All stores</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        )}
        <select className="filter-select" name="link" defaultValue={link ?? ""} aria-label="Filter by order link">
          <option value="">Linked &amp; unlinked</option>
          <option value="linked">Linked to an order</option>
          <option value="unlinked">Not linked</option>
        </select>
        <label className="date-field"><input type="checkbox" name="all" value="1" defaultChecked={showAll} />Include spam &amp; merged</label>
        <button className="search-button" type="submit">Apply</button>
        {(query || status || accountId || storeId || link || showAll) && <Link className="secondary-button" href="/tickets">Clear</Link>}
        <span className="results-count">{total} {total === 1 ? "ticket" : "tickets"}</span>
      </Form>
      <section className="panel table-panel">
        {tickets.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>TICKET</th><th>CREATED</th><th>SUBJECT</th><th>CATEGORY</th><th>STATUS</th><th>STORE</th><th>ORDER</th></tr></thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="order-reference">#{ticket.displayId ?? ticket.externalId}</td>
                    <td>{formatDate(ticket.ticketCreatedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="customer-cell ticket-subject">
                      {ticket.subject || <span className="no-contact">No subject</span>}
                      {ticket.labels.length > 0 && <span className="label-list">{ticket.labels.map((label) => <span className="ticket-label" key={label}>{label}</span>)}</span>}
                    </td>
                    <td>
                      {ticket.category ? issueLabels[ticket.category] : ticket.contactReason ?? <span className="no-contact">—</span>}
                      {(ticket.refundRequested || ticket.wismo) && <span className="label-list">{ticket.refundRequested && <span className="ticket-label flag">Refund</span>}{ticket.wismo && <span className="ticket-label flag">WISMO</span>}</span>}
                    </td>
                    <td><span className={`ticket-status ${ticket.status}`}>{ticket.status}</span></td>
                    <td>{ticket.store?.name ?? <span className="no-contact">—</span>}</td>
                    <td>
                      {ticket.order ? (
                        <Link className="order-reference" href={`/orders/${ticket.order.id}`} title={ticket.matchMethod ?? undefined}>{ticket.order.shopifyOrderId}</Link>
                      ) : [...ticket.subjectNumbers, ...ticket.messageNumbers].length ? (
                        // A number was found but no imported order has it yet; it links on the next sync after its store is imported.
                        <span className="pending-number" title="No imported order or tracking number matches this yet">{[...ticket.subjectNumbers, ...ticket.messageNumbers][0]} · not imported</span>
                      ) : (
                        <span className="no-contact">{ticket.messagesCheckedAt ? "No number found" : "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No tickets match these filters.</div>}
      </section>
      {total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Ticket pages">
          <span>{first}–{first + tickets.length - 1} of {total}</span>
          {page > 1 ? <Link className="secondary-button" href={pageHref(page - 1)}><ChevronLeft size={12} />Previous</Link> : <span className="secondary-button" aria-disabled="true"><ChevronLeft size={12} />Previous</span>}
          <span>Page {page} of {pageCount}</span>
          {page < pageCount ? <Link className="secondary-button" href={pageHref(page + 1)}>Next<ChevronRight size={12} /></Link> : <span className="secondary-button" aria-disabled="true">Next<ChevronRight size={12} /></span>}
        </nav>
      )}
    </>
  );
}
