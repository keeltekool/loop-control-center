import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loop Control Center",
  description: "Manage recurring Claude Code loops across all projects",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
