// Typed extension properties: declared with `icsExtension`, read into each component's
// `extensions` and validated by their Standard Schema.

import type { StandardSchemaV1 } from "../standard-schema";
import type {
  IcsExtension,
  IcsExtensionInput,
  IcsExtensionMap,
  IcsExtensionsConfig,
  IcsProperty,
  IcsValueType,
} from "../types";
import {
  decodeIcsDateValue,
  decodeIcsValue,
  splitIcsValues,
  type IcsDecodeResult,
} from "../values";
import type { ComponentReader, Path } from "./reader";

/**
 * Whether a schema whose input type is `TInput` can take `TValue`: an `unknown` input, a wider
 * one, or one that overlaps it, such as a union of string literals for a TEXT value.
 */
type IcsSchemaAccepts<TInput, TValue> = unknown extends TInput
  ? true
  : [TValue] extends [TInput]
    ? true
    : [Extract<TInput, TValue> | Extract<TValue, TInput>] extends [never]
      ? false
      : true;

/**
 * The schema itself when it can take the decoded value; otherwise a schema of the input it would
 * need, so the call fails to type-check.
 */
type IcsCheckedSchema<TType extends IcsValueType, TSchema> = TSchema extends StandardSchemaV1
  ? IcsSchemaAccepts<StandardSchemaV1.InferInput<TSchema>, IcsExtensionInput<TType>> extends true
    ? TSchema
    : StandardSchemaV1<IcsExtensionInput<TType>, StandardSchemaV1.InferOutput<TSchema>>
  : TSchema;

export interface IcsExtensionOptions<
  TType extends IcsValueType,
  TSchema extends StandardSchemaV1 | undefined,
  TMultiple extends boolean,
> {
  /** Collect every occurrence, and every comma-separated value, into an array. Default `false`. */
  readonly multiple?: TMultiple;
  /**
   * A Standard Schema (Zod, Valibot, ArkType…) applied to each decoded value. Its input type must
   * accept the decoded value: `unknown`, the decoded type, or a narrower one.
   */
  readonly schema?: TSchema & NoInfer<IcsCheckedSchema<TType, TSchema>>;
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
  return {
    multiple: Boolean(options?.multiple),
    name: name.toUpperCase(),
    schema: options?.schema,
    type: options?.type ?? "TEXT",
  };
}

/** The configuration the model reads with: whatever was declared, typed as unknown values. */
export type AnyExtensions = Required<IcsExtensionsConfig>;

/** One component kind's extensions: field name and declaration. */
export type ExtensionEntries = readonly (readonly [string, IcsExtension])[];

export function extensionEntries(map: IcsExtensionMap | undefined): ExtensionEntries {
  return map === undefined ? [] : Object.entries(map);
}

function isPromise(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

// Decodes one value as the extension's type, whatever its VALUE parameter says, and runs the
// schema. `undefined` when the value is dropped; the value is boxed because a schema may map it to
// `undefined`.
function extensionValue(
  read: ComponentReader,
  property: IcsProperty,
  raw: string,
  { schema, type }: IcsExtension,
  at: Path,
  dropAt: Path,
): { readonly value: unknown } | undefined {
  const context = read.context(property);
  const result: IcsDecodeResult<unknown> =
    type === "DATE" || type === "DATE-TIME"
      ? decodeIcsDateValue(raw, type, context)
      : decodeIcsValue(type, raw, context);
  const value = read.decode(property, result, at, dropAt);
  if (value === undefined) return undefined;
  if (schema === undefined) return { value };

  const outcome = schema["~standard"].validate(value);
  if (isPromise(outcome)) {
    // Nobody awaits it, so a rejection mustn't go unhandled.
    void Promise.resolve(outcome).catch(() => undefined);
    const message = `${property.name}: asynchronous schemas aren't supported; dropped`;
    read.report("error", "schema", message, property, dropAt);
    return undefined;
  }
  if (outcome.issues) {
    const messages = outcome.issues.map((issue) => issue.message).join("; ");
    read.report("error", "schema", `${property.name}: ${messages}`, property, dropAt);
    return undefined;
  }
  return { value: outcome.value };
}

export function readExtensions(
  read: ComponentReader,
  entries: ExtensionEntries,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [field, extension] of entries) {
    const at = ["extensions", field];
    if (!extension.multiple) {
      const property = read.one(extension.name, at);
      values[field] =
        property && extensionValue(read, property, property.value, extension, at, at)?.value;
      continue;
    }

    const items: unknown[] = [];
    for (const property of read.all(extension.name)) {
      for (const raw of splitIcsValues(extension.type, property.value)) {
        if (raw === "") continue;
        const item = extensionValue(read, property, raw, extension, [...at, items.length], at);
        if (item !== undefined) items.push(item.value);
      }
    }
    values[field] = items;
  }
  return values;
}
