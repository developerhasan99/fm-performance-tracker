"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "./actions";

export function ActionForm({ action, children, className, confirmMessage }: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
}) {
  const [result, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      className={className}
      action={formAction}
      onSubmit={confirmMessage ? (event) => { if (!confirm(confirmMessage)) event.preventDefault(); } : undefined}
    >
      <fieldset disabled={pending}>{children}</fieldset>
      {result && <p className={result.ok ? "form-success" : "form-error"} role="status">{result.message}</p>}
    </form>
  );
}
