import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Fulfilment overview | Parcel",
    template: "%s | Parcel",
  },
  description: "A clear view of order fulfilment, delivery performance and customer impact.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell isDemoMode={process.env.DASHBOARD_DEMO_MODE === "true"}>{children}</AppShell>
      </body>
    </html>
  );
}
