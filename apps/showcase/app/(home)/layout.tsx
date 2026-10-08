import { homeOptions } from "@/lib/layout";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";

export default function LandingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <HomeLayout {...homeOptions()}>{children}</HomeLayout>;
}
