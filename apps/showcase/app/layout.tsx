import StaticSearchDialog from "@/components/search";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import {
  openGraphBase,
  siteDescription,
  siteKeywords,
  siteName,
  siteTitle,
  siteUrl,
} from "@/lib/site";
import "./global.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    template: `%s · ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: siteKeywords,
  authors: [{ name: "Moltenship", url: "https://github.com/Moltenship" }],
  creator: "Moltenship",
  category: "technology",
  metadataBase: new URL(siteUrl),
  openGraph: { ...openGraphBase, type: "website", title: siteTitle },
  twitter: { card: "summary_large_image" },
  robots: {
    googleBot: { "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={`${sans.variable} ${mono.variable}`} lang="en" suppressHydrationWarning>
      <body className="flex min-h-svh flex-col antialiased">
        <RootProvider search={{ SearchDialog: StaticSearchDialog }}>{children}</RootProvider>
      </body>
    </html>
  );
}
