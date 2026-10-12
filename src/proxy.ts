import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only (cookie present). Real session validation happens in requireUser().
export function proxy(request: NextRequest) {
  if (process.env.DASHBOARD_DEMO_MODE === "true") return NextResponse.next();
  const hasSession = request.cookies.has("session");
  const isLogin = request.nextUrl.pathname === "/login";
  if (!hasSession && !isLogin) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
