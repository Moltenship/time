"use client";

import { type Framework, defaultFramework, parseDocsUrl } from "@/lib/frameworks";
import { rememberedFramework } from "@/lib/remembered-framework";
import { usePathname } from "fumadocs-core/framework";
import { useDocsSearch } from "fumadocs-core/search/client";
import { staticClient } from "fumadocs-core/search/client/orama-static";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import { useEffect, useState } from "react";

/**
 * The framework whose docs a search looks in: the one the reader is in, and outside the docs the
 * one they last read. The index holds both sets (`app/api/search`).
 */
function useSearchFramework(): Framework {
  const here = parseDocsUrl(usePathname())?.framework;
  const [remembered, setRemembered] = useState<Framework>(defaultFramework);
  useEffect(() => {
    setRemembered(rememberedFramework() ?? defaultFramework);
  }, [here]);
  return here ?? remembered;
}

export default function StaticSearchDialog(props: SharedProps) {
  const { locale } = useI18n();
  const framework = useSearchFramework();
  const { search, setSearch, query } = useDocsSearch({
    client: staticClient({ locale, tag: framework }),
  });

  return (
    <SearchDialog isLoading={query.isLoading} onSearchChange={setSearch} search={search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== "empty" ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
