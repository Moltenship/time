// The primitives reaching for an npm package and a Node built-in: the boundary test expects every
// import but the first two to fail.
import "@moltenship/calendar-temporal";
import "@ui-sdk/core/agent";
import "lodash";
import "node:fs";
