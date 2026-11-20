import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kantemba", template: "%s · Kantemba" },
  description: "Stock, sales, suppliers and profit for small Zambian businesses.",
};

export const viewport: Viewport = { themeColor: "#c2410c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
