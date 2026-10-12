import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDemoMode, requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dashboard";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import { ActionForm } from "./action-form";
import { createUser, deleteUser, resetPassword } from "./actions";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  if (isDemoMode()) redirect("/");
  const admin = await requireAdmin();
  const users = await getPrisma().user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>Users</h1><p className="page-subtitle">Everyone listed here can sign in and see the dashboard.</p></div></div>

      <section className="panel users-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Add user</h2><p className="panel-description">Share the password with them directly. At least {MIN_PASSWORD_LENGTH} characters.</p></div></div>
        <ActionForm action={createUser} className="inline-form">
          <input className="text-input" name="name" placeholder="Name" aria-label="Name" required maxLength={100} />
          <input className="text-input" name="email" type="email" placeholder="Email" aria-label="Email" required />
          <input className="text-input" name="password" type="password" placeholder="Password" aria-label="Password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
          <button className="search-button" type="submit">Add user</button>
        </ActionForm>
      </section>

      <section className="panel table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th><th>Set new password</th><th /></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="customer-cell">{user.name}{user.id === admin.id && " (you)"}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <ActionForm action={resetPassword} className="inline-form">
                      <input type="hidden" name="userId" value={user.id} />
                      <input className="text-input" name="password" type="password" placeholder="New password" aria-label={`New password for ${user.email}`} autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
                      <button className="secondary-button" type="submit">Save</button>
                    </ActionForm>
                  </td>
                  <td>
                    {user.id !== admin.id && (
                      <ActionForm action={deleteUser} confirmMessage={`Delete ${user.email}? They will be signed out immediately.`}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button className="danger-button" type="submit">Delete</button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
