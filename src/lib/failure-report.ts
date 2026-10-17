import { Prisma } from "@prisma/client";
import { CAUSES, isCause, type Cause } from "@/lib/failure";
import { getPrisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;
const n = (value: unknown) => Number(value ?? 0);

type CostRow = { refund: number; chargeback: number; reship: number; support: number; lost: number; total: number };
const COST_SQL = Prisma.sql`
  coalesce(sum(o."refundCostCents"), 0)::float8 AS refund, coalesce(sum(o."chargebackCostCents"), 0)::float8 AS chargeback,
  coalesce(sum(o."reshipCostCents"), 0)::float8 AS reship, coalesce(sum(o."supportCostCents"), 0)::float8 AS support,
  coalesce(sum(o."lostRevenueCents"), 0)::float8 AS lost, coalesce(sum(o."failureCostCents"), 0)::float8 AS total`;
const costs = (row: Record<string, unknown>): CostRow => ({ refund: n(row.refund), chargeback: n(row.chargeback), reship: n(row.reship), support: n(row.support), lost: n(row.lost), total: n(row.total) });

/**
 * Cost of failure for orders placed in the last `days` whole UTC days (today included), so every number matches
 * the order list it links to (`from` = the first day). Replacement orders are left out: their cost sits on the order they replace.
 */
export async function getFailureReport({ days, storeId }: { days: number; storeId?: string }) {
  if (process.env.DASHBOARD_DEMO_MODE === "true") return null;
  const prisma = getPrisma();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY);
  const previousStart = new Date(start.getTime() - days * DAY);
  const scope = (from: Date, to: Date) => Prisma.sql`o."orderDate" >= ${from} AND o."orderDate" < ${to} AND o."requiresShipping" AND NOT o."isReplacement"${storeId ? Prisma.sql` AND o."storeId" = ${storeId}` : Prisma.empty}`;
  const where = scope(start, now);
  const failed = Prisma.sql`${where} AND o."failureCostCents" > 0`;

  const [[totals], [previous], causes, stores, carriers, countries, products, daily] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*)::int AS orders, count(*) FILTER (WHERE o."failureCostCents" > 0)::int AS failed, ${COST_SQL},
        coalesce(sum(o."totalCents" * o."eurRate") FILTER (WHERE o.status <> 'cancelled'), 0)::float8 AS revenue,
        count(*) FILTER (WHERE o."eurRate" IS NULL)::int AS "missingMoney"
      FROM "Order" o WHERE ${where}`,
    prisma.$queryRaw<Record<string, unknown>[]>`SELECT count(*)::int AS orders, coalesce(sum(o."failureCostCents"), 0)::float8 AS total FROM "Order" o WHERE ${scope(previousStart, start)}`,
    prisma.$queryRaw<Record<string, unknown>[]>`SELECT o."failureCause" AS key, count(*)::int AS failed, ${COST_SQL} FROM "Order" o WHERE ${failed} GROUP BY 1 ORDER BY total DESC`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT s.id AS key, s.name AS label, count(*)::int AS orders, count(*) FILTER (WHERE o."failureCostCents" > 0)::int AS failed, ${COST_SQL},
        coalesce(sum(o."totalCents" * o."eurRate") FILTER (WHERE o.status <> 'cancelled'), 0)::float8 AS revenue
      FROM "Order" o JOIN "ShopifyStore" s ON s.id = o."storeId" WHERE ${where} GROUP BY 1, 2 ORDER BY total DESC`,
    prisma.$queryRaw<Record<string, unknown>[]>`SELECT o.carrier AS key, count(*)::int AS orders, count(*) FILTER (WHERE o."failureCostCents" > 0)::int AS failed, ${COST_SQL} FROM "Order" o WHERE ${where} GROUP BY 1 ORDER BY total DESC LIMIT 10`,
    prisma.$queryRaw<Record<string, unknown>[]>`SELECT o.market AS key, count(*)::int AS orders, count(*) FILTER (WHERE o."failureCostCents" > 0)::int AS failed, ${COST_SQL} FROM "Order" o WHERE ${where} GROUP BY 1 ORDER BY total DESC LIMIT 10`,
    // An order counts once per product it contains; an order with two products adds its cost to both.
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.sku AS key, max(p.name) AS label, count(*)::int AS orders, count(*) FILTER (WHERE o."failureCostCents" > 0)::int AS failed, ${COST_SQL}
      FROM (SELECT DISTINCT "orderId", sku, name FROM "OrderItem" WHERE sku <> '') p JOIN "Order" o ON o.id = p."orderId"
      WHERE ${where} GROUP BY 1 ORDER BY total DESC LIMIT 10`,
    prisma.$queryRaw<{ day: Date; total: number }[]>`SELECT date_trunc('day', o."orderDate") AS day, coalesce(sum(o."failureCostCents"), 0)::float8 AS total FROM "Order" o WHERE ${where} GROUP BY 1`,
  ]);

  const total = costs(totals);
  const orders = n(totals.orders);
  const revenue = n(totals.revenue);
  const rate = (row: Record<string, unknown>) => ({ orders: n(row.orders), failed: n(row.failed), failRate: n(row.orders) ? n(row.failed) / n(row.orders) : null, ...costs(row) });
  const byDay = new Map(daily.map((row) => [row.day.toISOString().slice(0, 10), n(row.total)]));

  return {
    from: start.toISOString().slice(0, 10),
    orders,
    failed: n(totals.failed),
    revenue,
    // Orders synced before money fields existed have no exchange rate yet; they count as €0 until re-synced.
    missingMoney: n(totals.missingMoney),
    total,
    previousTotal: n(previous.orders) >= 10 ? n(previous.total) : null,
    causes: causes.map((row) => ({ cause: (isCause(row.key) ? row.key : "enquiry") as Cause, label: isCause(row.key) ? CAUSES[row.key] : String(row.key), failed: n(row.failed), ...costs(row) })),
    stores: stores.map((row) => ({ id: String(row.key), label: String(row.label), revenue: n(row.revenue), ...rate(row) })),
    carriers: carriers.map((row) => ({ key: String(row.key), label: String(row.key), ...rate(row) })),
    countries: countries.map((row) => ({ key: String(row.key), label: countryName(String(row.key)), ...rate(row) })),
    products: products.map((row) => ({ key: String(row.key), label: String(row.label), ...rate(row) })),
    daily: Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY);
      return { date: date.toISOString(), count: Math.round((byDay.get(date.toISOString().slice(0, 10)) ?? 0) / 100) };
    }),
  };
}

const regionNames = new Intl.DisplayNames(["en-GB"], { type: "region" });
function countryName(code: string) {
  try { return /^[A-Z]{2}$/.test(code) ? regionNames.of(code) ?? code : code; } catch { return code; }
}

export type FailureReport = NonNullable<Awaited<ReturnType<typeof getFailureReport>>>;
