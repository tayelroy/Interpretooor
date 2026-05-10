import type { Metadata } from "next";
import { Be_Vietnam_Pro, EB_Garamond } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const ebGaramond = EB_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Interpretooor Protocol",
  description:
    "A verifiable, nuance-aware protocol for culturally accurate global content interpretation powered by Gemini.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${beVietnamPro.variable} ${ebGaramond.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
