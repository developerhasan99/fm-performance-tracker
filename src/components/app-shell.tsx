"use client";

import { ArrowUpRight, ClipboardList, LayoutDashboard, PackageCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ClipboardList },
];

export function AppShell({ children, isDemoMode }: { children: ReactNode; isDemoMode: boolean }) {
  const pathname = usePathname();
  const currentPage = pathname.startsWith("/orders") ? "Orders" : "Overview";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark"><PackageCheck size={17} strokeWidth={1.8} /></span>
          <span>parcel</span>
        </Link>
        <div className="workspace-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
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
            <div className="avatar" aria-hidden="true">OP</div>
            <div><div className="profile-name">Operations team</div><div className="profile-role">Reporting workspace</div></div>
            <ArrowUpRight size={13} color="#a3aaa6" style={{ marginLeft: "auto" }} />
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span aria-hidden="true">/</span> <strong>{currentPage}</strong></div>
          <div className="topbar-right"><span className="source-dot" />Operations reporting</div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
