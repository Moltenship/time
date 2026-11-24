// The React integration's tests reaching for the Solid integration: the boundary test expects
// every import but the first two to fail.
import "@moltenship/calendar-react";
import "@ui-sdk/react/agent";
import "@moltenship/calendar-solid";
import "@ui-sdk/solid";
