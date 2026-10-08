import { homeOptions } from "@/lib/layout";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { DefaultNotFound } from "fumadocs-ui/layouts/home/not-found";

export default function NotFound() {
  return (
    <HomeLayout {...homeOptions()}>
      <DefaultNotFound />
    </HomeLayout>
  );
}
