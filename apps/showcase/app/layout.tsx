import StaticSearchDialog from "@/components/search";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";

export const metadata: Metadata = {
  title: {
    default: "Moltenship Time",
    template: "%s · Moltenship Time",
  },
  description:
    "Typed, headless calendar contracts for applications that own their data, rendering, and design system.",
  metadataBase: new URL("https://time.moltenship.com"),
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider search={{ SearchDialog: StaticSearchDialog }}>{children}</RootProvider>
      </body>
    </html>
  );
}
