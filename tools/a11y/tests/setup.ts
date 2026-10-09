import "./styles.css";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The demo's page declares its language; axe checks the test page the same way.
document.documentElement.lang = "en";
