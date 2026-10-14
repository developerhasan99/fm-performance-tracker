import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { appUrl } from "@/lib/app-url";
import { isDemoMode, requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";
import { SHOPIFY_SCOPES, getSyncProgress } from "@/lib/shopify";
import { addStore, connectStore, deleteStore, syncNow } from "./actions";

export const metadata: Metadata = { title: "Stores" };
export const dynamic = "force-dynamic";

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  if (isDemoMode()) redirect("/");
  await requireAdmin();
  const params = await searchParams;
  const redirectUri = `${await appUrl()}/api/shopify/callback`;
  const syncHours = Number(process.env.SHOPIFY_SYNC_HOURS ?? 3);
  const storeRows = await getPrisma().shopifyStore.findMany({
    select: { id: true, name: true, shopDomain: true, customDomain: true, importOrdersFrom: true, accessToken: true, lastSyncedAt: true, lastSyncError: true, dispatchSlaDays: true, deliverySlaDays: true, _count: { select: { orders: true } } },
    orderBy: { createdAt: "asc" },
  });
  const stores = storeRows.map((store) => ({ ...store, sync: getSyncProgress(store.id) }));

  return (
    <>
      <AutoRefresh active={stores.some((store) => store.sync)} />
      <div className="page-heading"><div><p className="eyebrow">Integrations</p><h1>Shopify stores</h1><p className="page-subtitle">{syncHours > 0 ? `New and updated orders are imported every ${syncHours} hours.` : "Background sync is off (SHOPIFY_SYNC_HOURS=0)."} Each order is stored once per store.</p></div></div>
      {params.connected && <div className="sample-banner" role="status"><span><strong>Connected {params.connected}.</strong> The first import is running in the background; refresh in a minute.</span></div>}
      {params.error && <p className="form-error panel" role="alert">{params.error}</p>}

      <section className="panel users-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Before adding a store</h2><p className="panel-description">Each store needs its own app, created once in the Shopify Dev Dashboard.</p></div></div>
        <ol className="setup-steps">
          <li>In <a href="https://dev.shopify.com/dashboard" target="_blank" rel="noreferrer">dev.shopify.com</a>, create an app and choose <strong>Custom distribution</strong> for this store.</li>
          <li>In the app version, set the scope <code>{SHOPIFY_SCOPES}</code>, the App URL to <code>{redirectUri.replace("/api/shopify/callback", "")}</code> and the redirect URL to <code>{redirectUri}</code>, then release it.</li>
          <li>Copy the app&apos;s Client ID and Client secret into the form below, then click <strong>Connect</strong> and approve it in Shopify.</li>
        </ol>
      </section>

      <section className="panel users-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Add store</h2><p className="panel-description" id="import-from-help">Orders created before the import date are never imported; leave it empty for the last 60 days (Shopify&apos;s limit). SLA days set the dispatch and delivery due dates.</p></div></div>
        <ActionForm action={addStore} className="inline-form">
          <input className="text-input" name="name" placeholder="Store name" aria-label="Store name" required maxLength={100} />
          <input className="text-input" name="shopDomain" placeholder="acme.myshopify.com" aria-label="Shopify domain" required />
          <input className="text-input" name="customDomain" placeholder="acme.com (optional)" aria-label="Custom domain" />
          <input className="text-input" name="clientId" placeholder="Client ID" aria-label="Client ID" required autoComplete="off" />
          <input className="text-input" name="clientSecret" type="password" placeholder="Client secret" aria-label="Client secret" required autoComplete="off" />
          <label className="sla-field">Import orders from <input className="text-input date-input" name="importOrdersFrom" type="date" aria-describedby="import-from-help" /></label>
          <label className="sla-field">Dispatch SLA <input className="text-input" name="dispatchSlaDays" type="number" min={0} max={60} defaultValue={2} /> days</label>
          <label className="sla-field">Delivery SLA <input className="text-input" name="deliverySlaDays" type="number" min={0} max={60} defaultValue={5} /> days</label>
          <button className="search-button" type="submit">Add store</button>
        </ActionForm>
      </section>

      <section className="panel table-panel">
        {stores.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Store</th><th>Domains</th><th>Status</th><th>Last sync</th><th>Orders</th><th>Imports from</th><th>SLA</th><th /></tr></thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td className="customer-cell">{store.name}</td>
                    <td>{store.shopDomain}{store.customDomain && <><br />{store.customDomain}</>}</td>
                    <td>
                      {store.sync ? (
                        <span className="sync-running" role="status"><span className="sync-spinner" aria-hidden="true" />Syncing… {store.sync.imported} orders so far</span>
                      ) : !store.accessToken ? "Not connected" : store.lastSyncError ? "Needs attention" : "Connected"}
                      {!store.sync && store.lastSyncError && <div className="form-error">{store.lastSyncError}</div>}
                    </td>
                    <td>{store.lastSyncedAt ? formatDate(store.lastSyncedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}</td>
                    <td>{store._count.orders}</td>
                    <td>{store.importOrdersFrom ? formatDate(store.importOrdersFrom, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Last 60 days"}</td>
                    <td>{store.dispatchSlaDays}d / {store.deliverySlaDays}d</td>
                    <td>
                      <div className="row-actions">
                        <ActionForm action={connectStore}><input type="hidden" name="storeId" value={store.id} /><button className="secondary-button" type="submit">{store.accessToken ? "Reconnect" : "Connect"}</button></ActionForm>
                        {store.accessToken && !store.sync && <ActionForm action={syncNow}><input type="hidden" name="storeId" value={store.id} /><button className="secondary-button" type="submit">Sync now</button></ActionForm>}
                        {store._count.orders === 0 && <ActionForm action={deleteStore} confirmMessage={`Delete ${store.shopDomain}?`}><input type="hidden" name="storeId" value={store.id} /><button className="danger-button" type="submit">Delete</button></ActionForm>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No stores yet.</div>}
      </section>
    </>
  );
}
