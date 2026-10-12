// Component layer: the typed calendar model, extensions and the parser.

export { getEventEnd } from "./event-end";
export { icsExtension } from "./extensions";
export type { IcsExtensionOptions, IcsExtensionOutput } from "./extensions";
export { createIcsParser, parseIcs } from "./parser";
