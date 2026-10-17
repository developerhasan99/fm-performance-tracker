"use client";

import { useActionState, type ReactNode } from "react";

export type ActionResult = { ok: boolean; message: string } | undefined;

export function ActionForm({ action, children, className, confirmMessage, id }: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
  /** Lets inputs elsewhere (e.g. other table cells) join this form via their `form` attribute. */
  id?: string;
}) {
  const [result, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      id={id}
      className={className}
      action={formAction}
      onSubmit={confirmMessage ? (event) => { if (!confirm(confirmMessage)) event.preventDefault(); } : undefined}
    >
      <fieldset disabled={pending}>{children}</fieldset>
      {result && <p className={result.ok ? "form-success" : "form-error"} role="status">{result.message}</p>}
    </form>
  );
}
