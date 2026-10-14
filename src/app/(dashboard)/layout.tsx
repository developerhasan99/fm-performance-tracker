import { AppShell } from "@/components/app-shell";
import { isDemoMode, requireUser } from "@/lib/auth";
import { getDataSourceStatus } from "@/lib/data-sources";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sources = await getDataSourceStatus();
  return <AppShell isDemoMode={isDemoMode()} sources={sources} user={{ name: user.name, email: user.email, role: user.role }}>{children}</AppShell>;
}
