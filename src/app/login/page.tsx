import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="auth-page">
      <section className="panel auth-card">
        <div className="brand"><span className="brand-mark"><PackageCheck size={17} strokeWidth={1.8} /></span><span>parcel</span></div>
        <h1>Sign in</h1>
        <p className="page-subtitle">Use the account an administrator created for you.</p>
        <LoginForm />
      </section>
    </main>
  );
}
