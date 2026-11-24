// The Solid integration reaching for React, the React integration, the facade and ui-sdk's
// internals: the boundary test expects every import but the first three to fail.
import "@moltenship/calendar-primitives";
import "@ui-sdk/solid";
import "solid-js";
import "@moltenship/calendar-react";
import "@moltenship/calendar";
import "react";
import "@ui-sdk/core/internal/store";
