import "./stylex.css";
import * as flavour from "./flavour-stylex";
import { mountParityPage, type Flavour } from "./screen";

// The StyleX controls take `xstyle` beside the props the screens pass.
await mountParityPage(flavour as unknown as Flavour);
