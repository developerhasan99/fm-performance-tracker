"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, undefined);
  return (
    <form className="auth-form" action={action}>
      <label className="field">Email<input name="email" type="email" autoComplete="username" required autoFocus /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="search-button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
