import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "YADEA CRM", template: "%s · YADEA CRM" },
  description: "YADEA customer, lead and dealership management platform",
  icons: { icon: "/brand/yadea-mark.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f07400" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
