// EUR exchange rates from the ECB (via frankfurter.dev, free, no key). ECB publishes on working days only.
const DAY = 24 * 60 * 60 * 1000;
const day = (date: Date) => date.toISOString().slice(0, 10);

/** EUR per unit of `currency` on `date`, using the latest ECB day on or before it (up to a week back). */
export function rateOn(series: Map<string, Record<string, number>>, currency: string, date: Date) {
  if (currency === "EUR") return 1;
  for (let back = 0; back < 7; back++) {
    const perEur = series.get(day(new Date(date.getTime() - back * DAY)))?.[currency];
    if (perEur) return 1 / perEur;
  }
  return null;
}

// Per process: date → { SEK: 11.2, … } (units per EUR), refetched twice a day to pick up new ECB days.
const series = new Map<string, Record<string, number>>();
let coveredFrom: Date | null = null;
let fetchedAt = 0;

/** EUR per unit of `currency` on `date`. Throws if the ECB rates can't be fetched, so the sync retries later. */
export async function eurRate(currency: string, date: Date) {
  if (currency === "EUR") return 1;
  if (!coveredFrom || date < coveredFrom || Date.now() - fetchedAt > 12 * 60 * 60 * 1000) {
    const from = new Date(Math.min(date.getTime() - 7 * DAY, coveredFrom?.getTime() ?? Infinity));
    const response = await fetch(`https://api.frankfurter.dev/v1/${day(from)}..${day(new Date())}?base=EUR`);
    if (!response.ok) throw new Error(`Exchange rates unavailable (${response.status}); will retry next sync.`);
    const body = (await response.json()) as { rates: Record<string, Record<string, number>> };
    for (const [date, rates] of Object.entries(body.rates)) series.set(date, rates);
    coveredFrom = from;
    fetchedAt = Date.now();
  }
  return rateOn(series, currency, date);
}
