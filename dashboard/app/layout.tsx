import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Operation HQ — Command Centre",
  description: "A private, cross-device command centre for study, planning, focus and browser intelligence.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
