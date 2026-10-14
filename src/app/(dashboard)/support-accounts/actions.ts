"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";
import { getSupportSyncProgress, inspectToken, syncSupportAccount } from "@/lib/commslayer";
import { encrypt } from "@/lib/encryption";
import { getPrisma } from "@/lib/prisma";
import { linkTickets } from "@/lib/support-matching";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const fail = (message: string): ActionResult => ({ ok: false, message });

export async function addSupportAccount(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = field(formData, "name");
  const token = field(formData, "token");
  const importInput = field(formData, "importFrom");
  if (!name || name.length > 100) return fail("Enter a name (up to 100 characters).");
  if (token.length < 10 || token.length > 500) return fail("Paste the Commslayer integration token.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(importInput) || Number.isNaN(Date.parse(importInput))) return fail("Choose the date to import conversations from.");

  let info;
  try {
    info = await inspectToken(token);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Couldn't verify the token.");
  }

  let id: string;
  try {
    ({ id } = await getPrisma().supportAccount.create({
      data: {
        name,
        externalAccountId: info.id,
        externalAccountName: info.name,
        token: encrypt(token),
        tokenExpiresAt: info.expiresAt,
        importFrom: new Date(`${importInput}T00:00:00Z`),
      },
      select: { id: true },
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail(`Commslayer account "${info.name}" is already connected.`);
    throw error;
  }
  // First import runs in the background; the row shows live progress.
  void syncSupportAccount(id).catch((error) => console.error(`[commslayer] first sync ${name}: ${error instanceof Error ? error.message : error}`));
  revalidatePath("/support-accounts");
  return { ok: true, message: `Connected "${info.name}". Importing conversations…` };
}

export async function syncSupportNow(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const accountId = field(formData, "accountId");
  if (getSupportSyncProgress(accountId)) return { ok: true, message: "A sync is already running." };
  void syncSupportAccount(accountId).catch((error) => console.error(`[commslayer] sync ${accountId}: ${error instanceof Error ? error.message : error}`));
  revalidatePath("/support-accounts");
  return undefined;
}

export async function deleteSupportAccount(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  // Imported tickets go with the account (they can be re-imported from Commslayer).
  await getPrisma().supportAccount.deleteMany({ where: { id: field(formData, "accountId") } });
  revalidatePath("/support-accounts");
  return { ok: true, message: "Account and its imported tickets deleted." };
}

export async function setInboxStore(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const accountId = field(formData, "accountId");
  const externalInboxId = Number(field(formData, "inboxId"));
  const storeInput = field(formData, "storeId");
  if (!Number.isInteger(externalInboxId)) return fail("Unknown inbox.");
  const storeId = storeInput ? (await getPrisma().shopifyStore.findUnique({ where: { id: storeInput }, select: { id: true } }))?.id : null;
  if (storeInput && !storeId) return fail("Store not found.");
  await getPrisma().supportInbox.upsert({
    where: { accountId_externalInboxId: { accountId, externalInboxId } },
    create: { accountId, externalInboxId, storeId },
    update: { storeId },
  });
  await linkTickets(); // applies the store to this inbox's unlinked tickets
  revalidatePath("/support-accounts");
  return { ok: true, message: "Saved." };
}
