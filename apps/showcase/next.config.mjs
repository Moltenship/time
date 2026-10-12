import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: [
    "@moltenship/calendar",
    "@moltenship/calendar-core",
    "@moltenship/calendar-react",
    "@moltenship/calendar-temporal",
    "@moltenship/ics",
  ],
};

export default withMDX(config);
