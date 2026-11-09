import { getPrisma } from "@/lib/prisma";

export type InventoryParams = { q?: string; status?: string; stock?: string };
type Level = { quantity: number; active: boolean };
type Row = { byStore: Map<string, Level> };

// Default status: active in every store. "any" = active in at least one store, "all" = every product.
const STATUSES = ["any", "all"] as const;
// Default stock: every level. A store without the SKU, or with 0 or less, counts as out of stock.
const STOCKS = ["in", "some", "out"] as const;
const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) => allowed.find((option) => option === value);

/** Whether a SKU passes the status and stock filters, judged over the given stores. */
export function matchesFilters(row: Row, storeIds: string[], status: string, stock: string | undefined) {
  const levels = storeIds.map((id) => row.byStore.get(id));
  const active = levels.filter((level) => level?.active).length;
  if (status === "everywhere" ? active < storeIds.length : status === "any" && active === 0) return false;
  const inStock = levels.filter((level) => (level?.quantity ?? 0) > 0).length;
  if (stock === "in") return inStock === storeIds.length;
  if (stock === "some") return inStock > 0 && inStock < storeIds.length;
  if (stock === "out") return inStock === 0;
  return true;
}

/** Stock per SKU for the Inventory page and its export. `page` null = every matching SKU. */
export async function getInventory(params: InventoryParams, page: { number: number; size: number } | null) {
  const query = (params.q ?? "").trim();
  const status = pick(params.status, STATUSES) ?? "everywhere";
  const stock = pick(params.stock, STOCKS);
  const prisma = getPrisma();

  // The filters pick SKUs; a picked SKU still shows its stock in every store.
  // ponytail: loads every matching level and filters in JS; fine for thousands of SKUs, move to SQL beyond that.
  const [stores, levels, syncs] = await Promise.all([
    prisma.shopifyStore.findMany({ where: { accessToken: { not: null } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.inventoryLevel.findMany({
      where: { store: { accessToken: { not: null } }, ...(query && { sku: { contains: query, mode: "insensitive" as const } }) },
      select: { sku: true, storeId: true, quantity: true, active: true },
      orderBy: { sku: "asc" },
    }),
    prisma.inventoryLevel.groupBy({ by: ["storeId"], _max: { syncedAt: true } }),
  ]);

  const all = new Map<string, Row & { total: number }>();
  for (const level of levels) {
    const row = all.get(level.sku) ?? { byStore: new Map(), total: 0 };
    row.byStore.set(level.storeId, level);
    row.total += level.quantity;
    all.set(level.sku, row);
  }
  const storeIds = stores.map((store) => store.id);
  const picked = [...all].filter(([, row]) => matchesFilters(row, storeIds, status, stock));
  return {
    query,
    status,
    stock,
    search: new URLSearchParams({ ...(query && { q: query }), ...(status !== "everywhere" && { status }), ...(stock && { stock }) }),
    stores,
    rows: page ? picked.slice((page.number - 1) * page.size, page.number * page.size) : picked,
    total: picked.length,
    anySynced: syncs.length > 0,
    syncedAt: new Map(syncs.map((sync) => [sync.storeId, sync._max.syncedAt ?? undefined])),
  };
}
