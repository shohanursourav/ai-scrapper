import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Lead CRM",
  description: "Lead generation and personalized outreach for US home service businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
