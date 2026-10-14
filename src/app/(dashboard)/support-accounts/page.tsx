import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { isDemoMode, requireAdmin } from "@/lib/auth";
import { getSupportSyncProgress } from "@/lib/commslayer";
import { formatDate } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";
import { addSupportAccount, deleteSupportAccount, setInboxStore, syncSupportNow } from "./actions";

export const metadata: Metadata = { title: "Support accounts" };
export const dynamic = "force-dynamic";

const dateTime = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } as const;

export default async function SupportAccountsPage() {
  if (isDemoMode()) redirect("/");
  await requireAdmin();
  const rows = await getPrisma().supportAccount.findMany({
    select: { id: true, name: true, externalAccountName: true, tokenExpiresAt: true, importFrom: true, lastSyncedAt: true, lastSyncError: true, _count: { select: { tickets: true } } },
    orderBy: { createdAt: "asc" },
  });
  const accounts = rows.map((account) => ({ ...account, sync: getSupportSyncProgress(account.id) }));
  const prisma = getPrisma();
  const [inboxCounts, mappings, stores, linkedCounts] = await Promise.all([
    prisma.supportTicket.groupBy({ by: ["accountId", "inboxId"], where: { excluded: false }, _count: true }),
    prisma.supportInbox.findMany({ select: { accountId: true, externalInboxId: true, storeId: true } }),
    prisma.shopifyStore.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supportTicket.groupBy({ by: ["accountId", "inboxId"], where: { excluded: false, orderId: { not: null } }, _count: true }),
  ]);
  const mappedStore = new Map(mappings.map((mapping) => [`${mapping.accountId}|${mapping.externalInboxId}`, mapping.storeId]));
  const linkedIn = new Map(linkedCounts.map((row) => [`${row.accountId}|${row.inboxId}`, row._count]));
  const accountName = new Map(rows.map((account) => [account.id, account.name]));
  const inboxes = inboxCounts
    .filter((row) => row.inboxId !== null)
    .map((row) => ({ accountId: row.accountId, inboxId: row.inboxId!, tickets: row._count, linked: linkedIn.get(`${row.accountId}|${row.inboxId}`) ?? 0, storeId: mappedStore.get(`${row.accountId}|${row.inboxId}`) ?? "" }))
    .sort((a, b) => b.tickets - a.tickets);
  const soon = Date.now() + 14 * 24 * 60 * 60 * 1000;

  return (
    <>
      <AutoRefresh active={accounts.some((account) => account.sync)} />
      <div className="page-heading"><div><p className="eyebrow">Integrations</p><h1>Support accounts</h1><p className="page-subtitle">Commslayer conversations are imported from every account and refreshed with each sync.</p></div></div>

      <section className="panel users-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Add Commslayer account</h2><p className="panel-description">Create an integration token in Commslayer with <code>conversations:read</code> (plus <code>messages:read</code> and <code>contacts:read</code> for later matching). The token is checked, then stored encrypted.</p></div></div>
        <ActionForm action={addSupportAccount} className="inline-form">
          <input className="text-input" name="name" placeholder="Name, e.g. Account 1" aria-label="Account name" required maxLength={100} />
          <input className="text-input" name="token" type="password" placeholder="Integration token" aria-label="Integration token" required autoComplete="off" />
          <label className="sla-field">Import from <input className="text-input date-input" name="importFrom" type="date" required defaultValue="2026-09-14" /></label>
          <button className="search-button" type="submit">Add account</button>
        </ActionForm>
      </section>

      <section className="panel table-panel">
        {accounts.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Commslayer account</th><th>Status</th><th>Last sync</th><th>Tickets</th><th>Imports from</th><th /></tr></thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="customer-cell">{account.name}</td>
                    <td>
                      {account.externalAccountName}
                      {account.tokenExpiresAt && account.tokenExpiresAt.getTime() < soon && <div className="form-error">Token expires {formatDate(account.tokenExpiresAt)}</div>}
                    </td>
                    <td>
                      {account.sync
                        ? <span className="sync-running" role="status"><span className="sync-spinner" aria-hidden="true" />Syncing… {account.sync.imported} so far</span>
                        : account.lastSyncError ? "Needs attention" : account.lastSyncedAt ? "Connected" : "Waiting for first sync"}
                      {!account.sync && account.lastSyncError && <div className="form-error">{account.lastSyncError}</div>}
                    </td>
                    <td>{account.lastSyncedAt ? formatDate(account.lastSyncedAt, dateTime) : "Never"}</td>
                    <td>{account._count.tickets}</td>
                    <td>{formatDate(account.importFrom, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</td>
                    <td>
                      <div className="row-actions">
                        {!account.sync && <ActionForm action={syncSupportNow}><input type="hidden" name="accountId" value={account.id} /><button className="secondary-button" type="submit">Sync now</button></ActionForm>}
                        <ActionForm action={deleteSupportAccount} confirmMessage={`Delete ${account.name} and its ${account._count.tickets} imported tickets?`}><input type="hidden" name="accountId" value={account.id} /><button className="danger-button" type="submit">Delete</button></ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No support accounts yet.</div>}
      </section>

      {inboxes.length > 0 && (
        <section className="panel table-panel inbox-panel">
          <div className="panel-heading"><div><h2 className="panel-title">Inboxes</h2><p className="panel-description">Commslayer doesn&apos;t say which store a ticket is for. Pick the store each inbox serves; tickets without an order number get that store. A linked order always wins.</p></div></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Inbox</th><th>Account</th><th>Tickets</th><th>Linked to orders</th><th>Store</th></tr></thead>
              <tbody>
                {inboxes.map((inbox) => (
                  <tr key={`${inbox.accountId}|${inbox.inboxId}`}>
                    <td className="customer-cell">{inbox.inboxId}</td>
                    <td>{accountName.get(inbox.accountId)}</td>
                    <td>{inbox.tickets}</td>
                    <td>{inbox.linked}</td>
                    <td>
                      <ActionForm action={setInboxStore} className="inline-form">
                        <input type="hidden" name="accountId" value={inbox.accountId} />
                        <input type="hidden" name="inboxId" value={inbox.inboxId} />
                        <select className="filter-select" name="storeId" defaultValue={inbox.storeId} aria-label={`Store for inbox ${inbox.inboxId}`}>
                          <option value="">Not set</option>
                          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                        </select>
                        <button className="secondary-button" type="submit">Save</button>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
