import { getPrisma } from "@/lib/prisma";

export type InventoryParams = { q?: string; status?: string };

/** Stock per SKU for the Inventory page and its export. `page` null = every matching SKU. */
export async function getInventory(params: InventoryParams, page: { number: number; size: number } | null) {
  const query = (params.q ?? "").trim();
  // Default: active in every store. "any" = active in at least one store, "all" = every product.
  const status = params.status === "any" || params.status === "all" ? params.status : "everywhere";
  const prisma = getPrisma();

  // The filter picks SKUs; a picked SKU still shows its stock in every store.
  // ponytail: lists every matching SKU to paginate; fine for thousands, move to SQL DISTINCT + LIMIT beyond that.
  const [stores, matching, syncs] = await Promise.all([
    prisma.shopifyStore.findMany({ where: { accessToken: { not: null } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.inventoryLevel.groupBy({ by: ["sku"], where: { ...(query && { sku: { contains: query, mode: "insensitive" as const } }), ...(status !== "all" && { active: true, store: { accessToken: { not: null } } }) }, _count: true, orderBy: { sku: "asc" } }),
    prisma.inventoryLevel.groupBy({ by: ["storeId"], _max: { syncedAt: true } }),
  ]);
  const picked = status === "everywhere" ? matching.filter((row) => row._count === stores.length) : matching;
  const skus = (page ? picked.slice((page.number - 1) * page.size, page.number * page.size) : picked).map((row) => row.sku);
  const levels = await prisma.inventoryLevel.findMany({ where: { sku: { in: skus } } });

  const rows = new Map(skus.map((sku) => [sku, { byStore: new Map<string, { quantity: number; active: boolean }>(), total: 0 }]));
  for (const level of levels) {
    const row = rows.get(level.sku)!;
    row.byStore.set(level.storeId, level);
    row.total += level.quantity;
  }
  return {
    query,
    status,
    search: new URLSearchParams({ ...(query && { q: query }), ...(status !== "everywhere" && { status }) }),
    stores,
    rows,
    total: picked.length,
    anySynced: syncs.length > 0,
    syncedAt: new Map(syncs.map((sync) => [sync.storeId, sync._max.syncedAt ?? undefined])),
  };
}
