import { createMDX } from "fumadocs-mdx/next";

import { docsRedirects, docsRewrites } from "#docs-redirects";

const withMDX = createMDX();

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // The docs' old addresses, and the ones that pick a framework. See `docs-redirects.mjs`.
  async redirects() {
    return docsRedirects();
  },
  // Every docs page has a Markdown version for agents at its own address with `.md` added.
  // `app/llms.mdx` renders it; `/llms.txt` links to these addresses.
  async rewrites() {
    return docsRewrites();
  },
};

export default withMDX(config);
