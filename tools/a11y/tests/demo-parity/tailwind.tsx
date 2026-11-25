import "./prepare";
import "./tailwind.css";
import { App } from "../../../../apps/demo/src/app";
import { mountDemoPage } from "./screen";

await mountDemoPage(<App />);
