import { AppShell } from "@/components/app-shell";
import { isDemoMode, requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell isDemoMode={isDemoMode()} user={{ name: user.name, email: user.email, role: user.role }}>{children}</AppShell>;
}
