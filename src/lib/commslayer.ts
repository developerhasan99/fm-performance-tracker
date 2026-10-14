import { Prisma, type IssueCategory } from "@prisma/client";
import { decrypt } from "@/lib/encryption";
import { getPrisma, runInBatches } from "@/lib/prisma";
import { linkTickets } from "@/lib/support-matching";

const BASE_URL = "https://app.commslayer.com/api/integration/v1";
const PAGE_LIMIT = 100;
// Commslayer allows 60 requests/minute per token; stay comfortably under it.
const REQUEST_INTERVAL_MS = 1200;
// Message lookups cost one request per ticket and happen once per ticket; cap them so a sync stays short.
const MESSAGE_CHECKS_PER_SYNC = 150;

export type CommslayerConversation = {
  id: number;
  spam?: boolean;
  display_id?: number;
  inbox_id?: number;
  contact_id?: number;
  status: string;
  labels?: string[];
  contact_reason?: { id: number; name: string; parent_id: number | null } | null;
  subject?: string | null;
  custom_attributes?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  last_activity_at?: string;
};

type CommslayerMessage = { content?: string | null; message_type: string; private?: boolean; created_at: string };

type Page<T> = { data: T[]; meta?: { next_cursor?: string | null } };
type AccountInfo = { data: { id: number; name: string; token?: { scopes?: string[]; expires_at?: string | null } } };

let lastRequestAt = 0;

class NotFoundError extends Error {}

/** 6–20 digit runs that aren't part of a date, time, price or longer number: order and tracking number candidates. */
export function extractNumbers(text: string | null | undefined, limit = 10) {
  if (!text) return [];
  const found = text.replace(/<[^>]+>/g, " ").match(/(?<![\d.:,/-])\d{6,20}(?![\d.:,])/g) ?? [];
  return [...new Set(found)].slice(0, limit);
}

const has = (haystack: string[], needles: string[]) => needles.some((needle) => haystack.includes(needle));

// Contact reasons / labels that aren't customer support about an order.
const EXCLUDED_REASONS = ["customer review notification", "system generated email notification", "external solicitation"];

// Checked in order; the first rule that fits sets the category. Labels are the most reliable signal.
const CATEGORY_RULES: { category: IssueCategory; labels: string[]; reasons: string[]; subject: RegExp }[] = [
  { category: "wrong_item", labels: ["incorrect-bottles", "auto-incorrect-bottles", "wrong-item"], reasons: ["wrong item"], subject: /wrong item|falsche[rns]? (artikel|duft|parf)|fel vara|verkeerde? (artikel|geur)/i },
  { category: "missing_item", labels: ["missing-bottles", "auto-missing-bottles", "missing-item"], reasons: ["missing item"], subject: /missing|fehlend|fehlt|saknas|saknad|ontbreek/i },
  { category: "damaged", labels: ["damaged-bottles", "faulty-bottles", "auto-damaged-bottles"], reasons: ["damaged item"], subject: /damaged|broken|leak|kaputt|besch[aä]digt|ausgelaufen|trasig|skadad|l[aä]cker|kapot|beschadigd/i },
  { category: "lost_in_transit", labels: ["lost-package"], reasons: ["lost package"], subject: /lost (package|parcel)|verloren/i },
  { category: "late_delivery", labels: ["delayed-shipment", "auto-delayed-shipment"], reasons: ["delayed"], subject: /delay|versp[aä]t|f[oö]rsen|vertraag/i },
  { category: "address_error", labels: ["address-issues", "auto-address-issue"], reasons: ["wrong address"], subject: /wrong address|falsche adresse|adress[äe]nder|fel adress/i },
  { category: "cancellation", labels: ["auto-cancel-return", "cancel-order"], reasons: ["changed mind"], subject: /cancel|stornier|avbest[aä]ll|annuler/i },
];
const WISMO = { labels: ["auto-where-is-my-order", "where-is-my-order"], reasons: ["tracking"], subject: /where is my (order|parcel|package)|wo (ist|bleibt) meine|nicht erhalten|not received|inte f[aå]tt|var [aä]r min|waar is mijn|niet ontvangen|sendungsverfolgung|tracking/i };
const REFUND = { labels: ["refund-request", "partial-refund", "auto-refund-request"], reasons: ["refund request"], subject: /refund|r[uü]ckerstattung|erstattung|geld zur[uü]ck|[aå]terbetal|terugbetal|money back/i };

/** Rule-based classification from labels, contact reason and subject (EN/DE/SV/NL). */
export function classifyConversation(conversation: CommslayerConversation) {
  const labels = (conversation.labels ?? []).map((label) => label.toLowerCase());
  const reason = conversation.contact_reason?.name.toLowerCase() ?? "";
  const subject = conversation.subject ?? "";
  const matches = (rule: { labels: string[]; reasons: string[]; subject: RegExp }) => has(labels, rule.labels) || rule.reasons.includes(reason) || rule.subject.test(subject);
  const excluded = conversation.spam === true || conversation.status === "merged" || EXCLUDED_REASONS.includes(reason)
    || labels.includes("tp-reviews") || /left a \d star review/i.test(subject);
  return {
    excluded,
    category: CATEGORY_RULES.find(matches)?.category ?? null,
    refundRequested: matches(REFUND),
    wismo: matches(WISMO),
  };
}

async function request<T>(token: string, path: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    // ponytail: one global pace for all tokens; per-token pacing only matters if accounts sync in parallel.
    const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();

    const response = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (response.ok) return (await response.json()) as T;

    const body = (await response.json().catch(() => null)) as { error?: { message?: string; details?: { retry_after?: number } } } | null;
    if (response.status === 429 && attempt < 3) {
      const seconds = Number(body?.error?.details?.retry_after) || 60;
      await new Promise((resolve) => setTimeout(resolve, (seconds + 2) * 1000));
      continue;
    }
    if (response.status === 401) throw new Error("Commslayer rejected the token (revoked or expired).");
    if (response.status === 403) throw new Error(`The token is missing a permission for ${path.split("?")[0]} (needs conversations:read and messages:read).`);
    if (response.status === 404) throw new NotFoundError(path);
    throw new Error(`Commslayer API error (${response.status}): ${body?.error?.message ?? "no details"}`);
  }
  throw new Error("Commslayer rate limit: gave up after 3 attempts.");
}

/** Checks a token and returns the Commslayer account it belongs to. */
export async function inspectToken(token: string) {
  const { data } = await request<AccountInfo>(token, "/account");
  const scopes = data.token?.scopes ?? [];
  if (!scopes.includes("conversations:read")) throw new Error("The token needs the conversations:read permission.");
  return { id: data.id, name: data.name, expiresAt: data.token?.expires_at ? new Date(data.token.expires_at) : null };
}

export function ticketFields(conversation: CommslayerConversation) {
  return {
    displayId: conversation.display_id ?? null,
    status: conversation.status,
    subject: conversation.subject ?? null,
    inboxId: conversation.inbox_id ?? null,
    contactId: conversation.contact_id ?? null,
    labels: conversation.labels ?? [],
    contactReason: conversation.contact_reason?.name ?? null,
    contactReasonId: conversation.contact_reason?.id ?? null,
    ticketCreatedAt: new Date(conversation.created_at),
    ticketUpdatedAt: conversation.updated_at ? new Date(conversation.updated_at) : null,
    lastActivityAt: conversation.last_activity_at ? new Date(conversation.last_activity_at) : null,
    raw: conversation as unknown as Prisma.InputJsonValue,
    subjectNumbers: extractNumbers(conversation.subject),
    ...classifyConversation(conversation),
  };
}

/** A page is past the import window only when every conversation on it is older than the cutoff. */
export const isPageBeforeCutoff = (conversations: CommslayerConversation[], cutoff: Date) =>
  conversations.length > 0 && conversations.every((conversation) => new Date(conversation.created_at) < cutoff);

type SyncProgress = { startedAt: Date; imported: number };
const running: Map<string, SyncProgress> = ((globalThis as { supportSyncProgress?: Map<string, SyncProgress> }).supportSyncProgress ??= new Map());
export const getSupportSyncProgress = (accountId: string) => running.get(accountId);

/**
 * The API can't filter by "updated since", so every sync walks newest → oldest down to the import date and
 * upserts what it sees. That also refreshes status/label changes on older tickets. Upserts make reruns safe.
 */
export async function syncSupportAccount(accountId: string) {
  if (running.has(accountId)) return { imported: 0, skipped: true };
  const progress: SyncProgress = { startedAt: new Date(), imported: 0 };
  running.set(accountId, progress);
  const prisma = getPrisma();
  try {
    const account = await prisma.supportAccount.findUniqueOrThrow({ where: { id: accountId } });
    const token = decrypt(account.token);
    const startedAt = new Date();
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ "page[limit]": String(PAGE_LIMIT), ...(cursor && { "page[after]": cursor }) });
      const page: Page<CommslayerConversation> = await request<Page<CommslayerConversation>>(token, `/conversations?${query}`);
      const inWindow = page.data.filter((conversation) => new Date(conversation.created_at) >= account.importFrom);
      await runInBatches(inWindow, (conversation) => {
        const fields = ticketFields(conversation);
        return prisma.supportTicket.upsert({
          where: { accountId_externalId: { accountId, externalId: conversation.id } },
          create: { ...fields, accountId, externalId: conversation.id },
          update: fields,
        });
      });
      progress.imported += inWindow.length;
      cursor = isPageBeforeCutoff(page.data, account.importFrom) ? null : page.meta?.next_cursor ?? null;
    } while (cursor);
    await checkMessages(accountId, token);
    await prisma.supportAccount.update({ where: { id: accountId }, data: { lastSyncedAt: startedAt, lastSyncError: null } });
    await linkTickets();
    return { imported: progress.imported, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.supportAccount.update({ where: { id: accountId }, data: { lastSyncError: message.slice(0, 500) } }).catch(() => {});
    throw error;
  } finally {
    running.delete(accountId);
  }
}

/**
 * For unlinked tickets with no number in the subject (e.g. contact forms), read the customer's messages once
 * and keep the numbers found, so later re-matching never needs the API again.
 */
async function checkMessages(accountId: string, token: string) {
  const prisma = getPrisma();
  const pending = await prisma.supportTicket.findMany({
    where: { accountId, excluded: false, orderId: null, messagesCheckedAt: null, subjectNumbers: { isEmpty: true } },
    select: { id: true, externalId: true },
    orderBy: { ticketCreatedAt: "desc" },
    take: MESSAGE_CHECKS_PER_SYNC,
  });
  for (const ticket of pending) {
    let numbers: string[] = [];
    try {
      const page = await request<Page<CommslayerMessage>>(token, `/conversations/${ticket.externalId}/messages?page%5Blimit%5D=10`);
      const fromCustomer = page.data.filter((message) => message.message_type === "incoming" && !message.private);
      numbers = extractNumbers(fromCustomer.map((message) => message.content ?? "").join(" "));
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error; // deleted conversation: mark as checked
    }
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { messageNumbers: numbers, messagesCheckedAt: new Date() } });
  }
}

export async function syncAllSupportAccounts() {
  const accounts = await getPrisma().supportAccount.findMany({ select: { id: true, name: true } });
  for (const account of accounts) {
    try {
      const result = await syncSupportAccount(account.id);
      console.log(`[commslayer] ${account.name}: ${result.skipped ? "already syncing" : `${result.imported} conversations synced`}`);
    } catch (error) {
      console.error(`[commslayer] ${account.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
