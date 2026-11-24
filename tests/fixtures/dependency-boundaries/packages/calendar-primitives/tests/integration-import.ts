// The primitives' tests reaching for the test tooling, then an integration and another npm
// package: the boundary test expects the last three imports to fail.
import "vite-plus/test";
import "@ui-sdk/core/testing";
import "jsdom";
import "node:url";
import "@moltenship/calendar-primitives";
import "@moltenship/calendar-react";
import "react";
import "lodash";
