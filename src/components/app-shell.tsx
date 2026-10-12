"use client";

import { ClipboardList, LayoutDashboard, LogOut, PackageCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/users", label: "Users", icon: Users },
];

type ShellUser = { name: string; email: string; role: string };

export function AppShell({ children, isDemoMode, user }: { children: ReactNode; isDemoMode: boolean; user: ShellUser }) {
  const pathname = usePathname();
  const currentPage = navigation.findLast(({ href }) => href === "/" ? pathname === "/" : pathname.startsWith(href))?.label ?? "Overview";
  const initials = user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark"><PackageCheck size={17} strokeWidth={1.8} /></span>
          <span>parcel</span>
        </Link>
        <div className="workspace-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.filter(({ href }) => !(isDemoMode && href === "/users")).map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link className={`nav-link${active ? " active" : ""}`} href={href} key={href} aria-current={active ? "page" : undefined}>
                <Icon size={15} strokeWidth={1.8} />{label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="source-note">
            <div className="source-note-label"><span className="source-dot" />Data sources</div>
            <p>{isDemoMode ? "Sample preview · No database required" : "PostgreSQL · Imports not connected"}</p>
          </div>
          <div className="profile">
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div><div className="profile-name">{user.name}</div><div className="profile-role">{user.email || "No sign-in required"}</div></div>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span aria-hidden="true">/</span> <strong>{currentPage}</strong></div>
          <div className="topbar-right"><span className="source-dot" />Operations reporting
            {!isDemoMode && <form action={logout}><button className="secondary-button" type="submit"><LogOut size={12} />Sign out</button></form>}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
