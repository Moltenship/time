import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";

import {
  demoFrameworks,
  demoUis,
  frameworkHref,
  uiHref,
  type DemoFramework,
  type DemoUi,
} from "../../ui-switch";

/** The demo's two UIs. Picking the other one loads its page, which has its own global CSS. */
export function UiSwitch() {
  return (
    <SegmentedControl
      label="UI"
      onChange={(next) => window.location.assign(uiHref(next as DemoUi))}
      size="sm"
      value="stylex"
    >
      {demoUis.map(({ label, value }) => (
        <SegmentedControlItem key={value} label={label} value={value} />
      ))}
    </SegmentedControl>
  );
}

/** React, this demo, and Solid. Picking Solid loads the Solid demo's page. */
export function FrameworkSwitch() {
  return (
    <SegmentedControl
      label="Framework"
      onChange={(next) => window.location.assign(frameworkHref(next as DemoFramework))}
      size="sm"
      value="react"
    >
      {demoFrameworks.map(({ label, value }) => (
        <SegmentedControlItem key={value} label={label} value={value} />
      ))}
    </SegmentedControl>
  );
}
