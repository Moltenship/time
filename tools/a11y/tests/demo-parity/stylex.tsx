import "./prepare";
import "../../../../apps/demo/src/stylex/styles.css";
import { StylexApp } from "../../../../apps/demo/src/stylex/app";
import { mountDemoPage } from "./screen";

await mountDemoPage(<StylexApp />);
