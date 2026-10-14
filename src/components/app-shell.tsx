"use client";

import { ClipboardList, Headset, LayoutDashboard, LifeBuoy, LogOut, PackageCheck, Store, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { TopLoader } from "@/components/top-loader";
import type { DataSourceStatus } from "@/lib/data-sources";

// Day-to-day reporting vs admin setup. `needsDatabase` items are hidden in sample mode.
const navigationGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, needsDatabase: false },
      { href: "/orders", label: "Orders", icon: ClipboardList, needsDatabase: false },
      { href: "/tickets", label: "Tickets", icon: LifeBuoy, needsDatabase: true },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/stores", label: "Stores", icon: Store, needsDatabase: true },
      { href: "/support-accounts", label: "Support", icon: Headset, needsDatabase: true },
      { href: "/users", label: "Users", icon: Users, needsDatabase: true },
    ],
  },
];
const navigation = navigationGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));

type ShellUser = { name: string; email: string; role: string };

export function AppShell({ children, isDemoMode, sources, user }: { children: ReactNode; isDemoMode: boolean; sources: DataSourceStatus; user: ShellUser }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const current = navigation.findLast(({ href }) => isActive(href)) ?? navigation[0];
  const sourceCard = (
    <>
      <div className="source-note-label"><span className={`source-dot ${sources.tone}`} />Data sources</div>
      {sources.lines.map((line) => <p key={line}>{line}</p>)}
    </>
  );
  const initials = user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <Suspense><TopLoader /></Suspense>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark"><PackageCheck size={17} strokeWidth={1.8} /></span>
          <span>parcel</span>
        </Link>
        <nav aria-label="Main navigation">
          {navigationGroups.map((group) => {
            const items = group.items.filter((item) => !(isDemoMode && item.needsDatabase));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group.label}>
                <div className="workspace-label" id={`nav-${group.label}`}>{group.label}</div>
                <div className="nav-list" role="list" aria-labelledby={`nav-${group.label}`}>
                  {items.map(({ href, label, icon: Icon }) => (
                    <Link className={`nav-link${isActive(href) ? " active" : ""}`} href={href} key={href} role="listitem" aria-current={isActive(href) ? "page" : undefined}>
                      <Icon size={15} strokeWidth={1.8} />{label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          {isDemoMode
            ? <div className="source-note">{sourceCard}</div>
            : <Link className="source-note source-note-link" href="/stores" aria-label={`Data sources: ${sources.lines.join(". ")}. Manage stores`}>{sourceCard}</Link>}
          <div className="profile">
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div><div className="profile-name">{user.name}</div><div className="profile-role">{user.email || "No sign-in required"}</div></div>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">{current.group} <span aria-hidden="true">/</span> <strong>{current.label}</strong></div>
          <div className="topbar-right"><span className="source-dot" />Operations reporting
            {!isDemoMode && <form action={logout}><button className="secondary-button" type="submit"><LogOut size={12} />Sign out</button></form>}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
