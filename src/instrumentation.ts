export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DASHBOARD_DEMO_MODE === "true") return;
  // SHOPIFY_SYNC_HOURS (Shopify + Commslayer) =0 turns the background sync off (e.g. on a local machine pointed at production).
  const hours = Number(process.env.SHOPIFY_SYNC_HOURS ?? 3);
  if (!(hours > 0)) return;
  const { syncAllStores } = await import("./lib/shopify");
  const { syncAllSupportAccounts } = await import("./lib/commslayer");
  const syncAll = async () => {
    await syncAllStores();
    await syncAllSupportAccounts();
  };
  // ponytail: in-process timer, fine for one Railway instance; with several instances, move this to a Railway cron service.
  setTimeout(() => void syncAll(), 60_000);
  setInterval(() => void syncAll(), hours * 60 * 60 * 1000);
}
