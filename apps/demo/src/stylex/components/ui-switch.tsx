import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";

import { demoUis, uiHref, type DemoUi } from "../../ui-switch";

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
