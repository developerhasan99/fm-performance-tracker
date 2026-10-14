import { Prisma } from "@prisma/client";
import { decrypt } from "@/lib/encryption";
import { getPrisma } from "@/lib/prisma";

const BASE_URL = "https://app.commslayer.com/api/integration/v1";
const PAGE_LIMIT = 100;
// Commslayer allows 60 requests/minute per token; stay comfortably under it.
const REQUEST_INTERVAL_MS = 1200;

export type CommslayerConversation = {
  id: number;
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

type Page<T> = { data: T[]; meta?: { next_cursor?: string | null } };
type AccountInfo = { data: { id: number; name: string; token?: { scopes?: string[]; expires_at?: string | null } } };

let lastRequestAt = 0;

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
    if (response.status === 403) throw new Error("The token is missing a permission (needs conversations:read).");
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
      await prisma.$transaction(inWindow.map((conversation) => {
        const fields = ticketFields(conversation);
        return prisma.supportTicket.upsert({
          where: { accountId_externalId: { accountId, externalId: conversation.id } },
          create: { ...fields, accountId, externalId: conversation.id },
          update: fields,
        });
      }));
      progress.imported += inWindow.length;
      cursor = isPageBeforeCutoff(page.data, account.importFrom) ? null : page.meta?.next_cursor ?? null;
    } while (cursor);
    await prisma.supportAccount.update({ where: { id: accountId }, data: { lastSyncedAt: startedAt, lastSyncError: null } });
    return { imported: progress.imported, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.supportAccount.update({ where: { id: accountId }, data: { lastSyncError: message.slice(0, 500) } }).catch(() => {});
    throw error;
  } finally {
    running.delete(accountId);
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
