declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  var __UI_SDK_STRICT__: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// ui-sdk's development warnings fail the test that causes them, as an agent action the calendar
// lists but hides would.
globalThis.__UI_SDK_STRICT__ = true;
