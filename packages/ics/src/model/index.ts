// Component layer: the typed calendar model, extensions and the parser. Owned by the model work
// package.

import type { StandardSchemaV1 } from "../standard-schema";
import type {
  IcsDateValue,
  IcsEvent,
  IcsExtension,
  IcsExtensionInput,
  IcsExtensionsConfig,
  IcsParseOptions,
  IcsParseResult,
  IcsParser,
  IcsValueType,
} from "../types";

export interface IcsExtensionOptions<
  TType extends IcsValueType,
  TSchema extends StandardSchemaV1 | undefined,
  TMultiple extends boolean,
> {
  /** Collect every occurrence, and every comma-separated value, into an array. Default `false`. */
  readonly multiple?: TMultiple;
  /** A Standard Schema (Zod, Valibot, ArkType…) applied to each decoded value. */
  readonly schema?: TSchema;
  /** How to decode the raw value. Default `TEXT`. */
  readonly type?: TType;
}

type IcsExtensionItem<
  TType extends IcsValueType,
  TSchema extends StandardSchemaV1 | undefined,
> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TSchema>
  : IcsExtensionInput<TType>;

export type IcsExtensionOutput<
  TType extends IcsValueType,
  TSchema extends StandardSchemaV1 | undefined,
  TMultiple extends boolean,
> = TMultiple extends true
  ? readonly IcsExtensionItem<TType, TSchema>[]
  : IcsExtensionItem<TType, TSchema> | undefined;

/** Declares a typed extension property, such as `X-RESOURCE-ID`, for `IcsParseOptions.extensions`. */
export function icsExtension<
  TType extends IcsValueType = "TEXT",
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TMultiple extends boolean = false,
>(
  name: string,
  options?: IcsExtensionOptions<TType, TSchema, TMultiple>,
): IcsExtension<IcsExtensionOutput<TType, TSchema, TMultiple>> {
  void name;
  void options;
  throw new Error("not implemented: icsExtension");
}

/** Builds a reusable parser. The parser is also a Standard Schema for ICS text. */
export function createIcsParser<TExtensions extends IcsExtensionsConfig = {}>(
  options?: IcsParseOptions<TExtensions>,
): IcsParser<TExtensions> {
  void options;
  throw new Error("not implemented: createIcsParser");
}

/** Parses iCalendar text into typed calendars. */
export function parseIcs<TExtensions extends IcsExtensionsConfig = {}>(
  text: string,
  options?: IcsParseOptions<TExtensions>,
): IcsParseResult<TExtensions> {
  return createIcsParser(options).parse(text);
}

/**
 * The event's effective end: DTEND, else DTSTART + DURATION, else RFC 5545's default (the next day
 * for a date, the start itself for a date-time). Always the same kind as the start.
 */
export function getEventEnd(event: Pick<IcsEvent, "duration" | "end" | "start">): IcsDateValue {
  void event;
  throw new Error("not implemented: getEventEnd");
}
