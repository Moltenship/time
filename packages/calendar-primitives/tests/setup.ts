declare global {
  var __UI_SDK_STRICT__: boolean | undefined;
}

// ui-sdk's development warnings fail the test that causes them.
globalThis.__UI_SDK_STRICT__ = true;
