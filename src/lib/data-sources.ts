import { isDemoMode } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getSupportSyncProgress } from "@/lib/commslayer";
import { getSyncProgress } from "@/lib/shopify";

export type DataSourceStatus = { tone: "ok" | "syncing" | "warn" | "error" | "idle"; lines: string[] };

function timeAgo(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Summary for the sidebar "Data sources" card. */
export async function getDataSourceStatus(): Promise<DataSourceStatus> {
  if (isDemoMode()) return { tone: "idle", lines: ["Sample preview · No database required"] };

  const [stores, supportAccounts] = await Promise.all([
    getPrisma().shopifyStore.findMany({ select: { id: true, accessToken: true, lastSyncedAt: true, lastSyncError: true } }),
    getPrisma().supportAccount.findMany({ select: { id: true, lastSyncError: true } }),
  ]);
  const supportFailing = supportAccounts.filter((account) => account.lastSyncError).length;
  const support = !supportAccounts.length ? "Support · Not connected"
    : supportAccounts.some((account) => getSupportSyncProgress(account.id)) ? "Support · Syncing…"
    : supportFailing ? `Support · ${plural(supportFailing, "account")} need${supportFailing === 1 ? "s" : ""} attention`
    : `Support · ${plural(supportAccounts.length, "account")} connected`;
  const carriers = "Carrier tracking · Not connected";
  if (!stores.length) return { tone: "warn", lines: ["Shopify · No stores added", support, carriers] };

  const connected = stores.filter((store) => store.accessToken);
  const syncing = connected.filter((store) => getSyncProgress(store.id)).length;
  const failing = connected.filter((store) => store.lastSyncError).length;
  const lastSync = connected.map((store) => store.lastSyncedAt).filter((date): date is Date => date !== null).sort((a, b) => b.getTime() - a.getTime())[0];

  const shopify = connected.length === stores.length ? `Shopify · ${plural(stores.length, "store")} connected` : `Shopify · ${connected.length} of ${plural(stores.length, "store")} connected`;
  const activity = syncing ? `Syncing ${plural(syncing, "store")} now…`
    : failing ? `${plural(failing, "store")} need${failing === 1 ? "s" : ""} attention`
    : lastSync ? `Last sync ${timeAgo(lastSync)}`
    : "Waiting for first sync";
  const tone = failing || supportFailing || connected.length < stores.length ? "error" : syncing ? "syncing" : lastSync ? "ok" : "warn";
  return { tone, lines: [shopify, activity, support, carriers] };
}
