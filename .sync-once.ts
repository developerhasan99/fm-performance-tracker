import { syncAllStores } from "./src/lib/shopify";
(async () => {
  const started = Date.now();
  await syncAllStores();
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
  process.exit(0);
})();
