import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { isDemoMode, requireUser } from "@/lib/auth";
import { formatDate, issueLabels } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";
import { parseTicketParams, ticketStatuses as statuses, type TicketParams } from "@/lib/tickets";

export const metadata: Metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<TicketParams & { page?: string }> }) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const prisma = getPrisma();
  const [accounts, stores] = await Promise.all([
    prisma.supportAccount.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.shopifyStore.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const { query, status, showAll, accountId, storeId, link, category, where, search } = parseTicketParams(params, accounts, stores);
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
    const pageSearch = new URLSearchParams(search);
    if (target > 1) pageSearch.set("page", String(target));
    return `/tickets${pageSearch.size ? `?${pageSearch}` : ""}`;
  };
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Customer support</p><h1>Tickets</h1><p className="page-subtitle">Commslayer conversations, linked to an order when they mention its order or tracking number.</p></div>
        <div className="heading-controls">
          <span className="results-count">{total.toLocaleString("en-GB")} {total === 1 ? "ticket" : "tickets"}{(query || status || accountId || storeId || link || showAll || category) && <> · <Link className="clear-link" href="/tickets">Clear filters</Link></>}</span>
          {total > 0 && <a className="secondary-button" href={`/tickets/export${search.size ? `?${search}` : ""}`} download title="Download every ticket matching the applied filters"><Download size={13} />Export CSV</a>}
        </div>
      </div>
      <section className="panel table-panel">
      <Form className="filter-bar" action="/tickets" key={search.toString()}>
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
        <select className="filter-select" name="category" defaultValue={category ?? ""} aria-label="Filter by category">
          <option value="">All categories</option>
          {Object.entries(issueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          <option value="none">General enquiry</option>
        </select>
        <select className="filter-select" name="link" defaultValue={link ?? ""} aria-label="Filter by order link">
          <option value="">Linked &amp; unlinked</option>
          <option value="linked">Linked to an order</option>
          <option value="unlinked">Not linked</option>
        </select>
        <label className="check-chip"><input type="checkbox" name="all" value="1" defaultChecked={showAll} />Spam &amp; merged</label>
        <button className="search-button filter-apply" type="submit">Apply</button>
      </Form>
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
