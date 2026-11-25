import { type Framework, frameworkCookie, isFramework } from "@/lib/frameworks";

/** A year: the choice is a preference, and the cookie holds nothing else. */
const rememberFor = 60 * 60 * 24 * 365;

/**
 * Remembers the framework a reader is reading, in a cookie, because the server reads it: an
 * address that names no framework, such as `/docs`, redirects to the remembered one
 * (`docs-redirects.mjs`). Browser only.
 */
export function rememberFramework(framework: Framework): void {
  document.cookie = `${frameworkCookie}=${framework}; path=/; max-age=${rememberFor}; samesite=lax`;
}

/** The remembered framework, if the reader has read either set of docs in this browser. */
export function rememberedFramework(): Framework | undefined {
  const value = new RegExp(`(?:^|;\\s*)${frameworkCookie}=([^;]*)`, "u").exec(document.cookie)?.[1];
  return isFramework(value) ? value : undefined;
}
