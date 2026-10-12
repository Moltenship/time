// Reads one component's properties into typed fields. Properties are grouped by name once, so a
// feed of many components stays linear; every property a field reads is claimed, and what nobody
// claims ends up in `otherProperties`.

import type {
  IcsComponent,
  IcsDateValue,
  IcsDecodedValueMap,
  IcsIssue,
  IcsIssueCode,
  IcsIssueSeverity,
  IcsProperty,
  IcsValueType,
} from "../types";
import {
  decodeIcsDateValue,
  decodeIcsValue,
  icsValueTypeOf,
  splitIcsValues,
  type IcsDecodeResult,
  type IcsValueContext,
} from "../values";
import { quote } from "../values/result";

export type Path = readonly (number | string)[];

/** A path relative to the component: a field, or a field and what lies below it. */
export type At = Path | string;

/** What the components of one VCALENDAR share. */
export interface CalendarScope {
  readonly issues: IcsIssue[];
  readonly resolveTimeZone: (tzid: string) => string | undefined;
  /** Where each unknown TZID's issue is in `issues`: it's reported once, at its first line. */
  readonly unknownTimeZones: Map<string, number>;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const NO_PROPERTIES: readonly IcsProperty[] = [];

// The fields that have a value, so absent properties stay absent keys.
export function defined<T extends object>(fields: T): T {
  const result = {} as Mutable<T>;
  for (const key in fields) {
    if (fields[key] !== undefined) result[key] = fields[key];
  }
  return result;
}

export function upper(value: string | undefined): string | undefined {
  return value?.toUpperCase();
}

// A single-valued parameter. Unquoted commas split it into values; they're joined back.
export function parameter(property: IcsProperty, name: string): string | undefined {
  return property.parameters[name]?.join(",");
}

// Whether a decoded value holds a wall time whose TZID resolved to nothing: a date-time, or the
// start or end of a period.
function isUnresolved(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if ("kind" in value) return value.kind === "unresolved";
  return (
    ("start" in value && isUnresolved(value.start)) || ("end" in value && isUnresolved(value.end))
  );
}

// DATE when the VALUE parameter says so, else DATE-TIME; the value's shape decides in the end.
export function declaredDateType(property: IcsProperty): "DATE" | "DATE-TIME" {
  return icsValueTypeOf(property) === "DATE" ? "DATE" : "DATE-TIME";
}

export class ComponentReader {
  readonly #byName = new Map<string, IcsProperty[]>();
  readonly #claimed = new Set<IcsProperty>();

  // The collection the component lands in, where the issues that skip it point.
  readonly collection: Path;
  readonly component: IcsComponent;
  // Where the component lands in the result.
  readonly path: Path;
  readonly scope: CalendarScope;

  constructor(component: IcsComponent, scope: CalendarScope, path: Path, collection: Path) {
    this.collection = collection;
    this.component = component;
    this.path = path;
    this.scope = scope;
    for (const property of component.properties) {
      const same = this.#byName.get(property.name);
      if (same === undefined) this.#byName.set(property.name, [property]);
      else same.push(property);
    }
  }

  // A reader for a subcomponent that lands at `field[index]`.
  child(component: IcsComponent, field: string, index: number): ComponentReader {
    return new ComponentReader(
      component,
      this.scope,
      [...this.path, field, index],
      [...this.path, field],
    );
  }

  report(
    severity: IcsIssueSeverity,
    code: IcsIssueCode,
    message: string,
    property: IcsProperty | undefined,
    at: At,
  ): void {
    this.scope.issues.push(
      defined<IcsIssue>({
        code,
        component: this.component.name,
        line: property?.line ?? this.component.line,
        message,
        path: [...this.path, ...(typeof at === "string" ? [at] : at)],
        property: property?.name,
        severity,
      }),
    );
  }

  // An error that skips the component: it points at the collection the component would be in.
  skip(code: IcsIssueCode, message: string, property: string, line = this.component.line): void {
    this.scope.issues.push(
      defined<IcsIssue>({
        code,
        component: this.component.name,
        line,
        message,
        path: this.collection,
        property,
        severity: "error",
      }),
    );
  }

  // Reports each property that is absent or empty; whether all of them are there.
  require(...names: string[]): boolean {
    let complete = true;
    for (const name of names) {
      const value = this.#byName.get(name)?.[0]?.value;
      if (value !== undefined && value.trim() !== "") continue;
      complete = false;
      const what = value === undefined ? "no" : "an empty";
      this.skip("missing-property", `${this.component.name} has ${what} ${name}; skipped`, name);
    }
    return complete;
  }

  // Every occurrence of `name`, claimed.
  all(name: string): readonly IcsProperty[] {
    const properties = this.#byName.get(name) ?? NO_PROPERTIES;
    for (const property of properties) this.#claimed.add(property);
    return properties;
  }

  // The first occurrence of `name`. Later ones are reported and dropped, unless the RFC lets the
  // property repeat (`repeatable`), such as NAME once per language: they stay unclaimed then.
  one(name: string, at: At, repeatable = false): IcsProperty | undefined {
    const properties = this.#byName.get(name);
    if (properties === undefined) return undefined;
    const [first] = properties;
    this.#claimed.add(first);
    for (let index = 1; !repeatable && index < properties.length; index += 1) {
      const duplicate = properties[index];
      this.#claimed.add(duplicate);
      const message = `${name} occurs more than once; the first one wins`;
      this.report("warning", "duplicate-property", message, duplicate, at);
    }
    return first;
  }

  // Properties nothing claimed, in source order. Read every field before calling it.
  others(): IcsProperty[] {
    const others: IcsProperty[] = [];
    for (const property of this.component.properties) {
      if (this.#claimed.has(property)) continue;
      if (property.name === "EXRULE") {
        const message = "EXRULE was removed in RFC 5545 and isn't applied; kept as written";
        this.report("warning", "unsupported", message, property, [
          "otherProperties",
          others.length,
        ]);
      }
      others.push(property);
    }
    return others;
  }

  context(property: IcsProperty): IcsValueContext {
    return { resolveTimeZone: this.scope.resolveTimeZone, tzid: parameter(property, "TZID") };
  }

  // Reports a decode result: a failure as an error at `dropAt`, warnings at `at`, and a TZID that
  // resolved to nothing, once per calendar. The value, or `undefined` when decoding failed.
  decode<T>(property: IcsProperty, result: IcsDecodeResult<T>, at: At, dropAt = at): T | undefined {
    if (!result.ok) {
      this.report(
        "error",
        "invalid-value",
        `${property.name}: ${result.message}`,
        property,
        dropAt,
      );
      return undefined;
    }
    for (const { code, message } of result.warnings ?? []) {
      this.report("warning", code, `${property.name}: ${message}`, property, at);
    }
    const tzid = parameter(property, "TZID");
    if (tzid !== undefined && isUnresolved(result.value)) this.unknownTimeZone(tzid, property, at);
    return result.value;
  }

  // `decode` for a value the component can't do without: a failure skips the component.
  required<T>(property: IcsProperty, result: IcsDecodeResult<T>, at: At): T | undefined {
    if (result.ok) return this.decode(property, result, at);
    const message = `${property.name}: ${result.message}; the ${this.component.name} is skipped`;
    this.skip("invalid-value", message, property.name, property.line);
    return undefined;
  }

  // Fields aren't read in source order, so a later use can come from an earlier line; it then
  // takes the reported issue's place.
  unknownTimeZone(tzid: string, property: IcsProperty, at: At): void {
    const { issues, unknownTimeZones } = this.scope;
    const reported = unknownTimeZones.get(tzid);
    const line = property.line ?? this.component.line ?? 0;
    if (reported !== undefined && (issues[reported]?.line ?? 0) <= line) return;
    const message = `TZID ${quote(tzid)} resolves to no time zone; its times stay unresolved`;
    this.report("warning", "unknown-time-zone", message, property, at);
    if (reported === undefined) {
      unknownTimeZones.set(tzid, issues.length - 1);
    } else {
      issues[reported] = issues.pop()!;
    }
  }

  // The first `name`, decoded as `type`.
  value<TType extends IcsValueType>(
    name: string,
    at: At,
    type: TType,
    repeatable = false,
  ): IcsDecodedValueMap[TType] | undefined {
    const property = this.one(name, at, repeatable);
    if (property === undefined) return undefined;
    return this.decode(property, decodeIcsValue(type, property.value, this.context(property)), at);
  }

  text(name: string, at: At, repeatable = false): string | undefined {
    return this.value(name, at, "TEXT", repeatable);
  }

  // An enumerated TEXT value, such as STATUS. RFC 5545 makes them case-insensitive.
  enumerated(name: string, at: At): string | undefined {
    return upper(this.text(name, at));
  }

  dateResult(property: IcsProperty, raw: string): IcsDecodeResult<IcsDateValue> {
    return decodeIcsDateValue(raw, declaredDateType(property), this.context(property));
  }

  // The first `name` as a DATE or DATE-TIME, by its shape.
  date(name: string, at: At): IcsDateValue | undefined {
    const property = this.one(name, at);
    return property && this.decode(property, this.dateResult(property, property.value), at);
  }

  // A DATE-TIME as an instant: zoned ones through their instant, floating and unresolved ones read
  // as UTC with a warning. A DATE has no instant: `"date"`, for the caller to report.
  instant(property: IcsProperty, at: At, required = false): Temporal.Instant | "date" | undefined {
    const result = decodeIcsValue("DATE-TIME", property.value, this.context(property));
    if (!result.ok && decodeIcsValue("DATE", property.value).ok) return "date";
    const value = required
      ? this.required(property, result, at)
      : this.decode(property, result, at);
    if (value === undefined) return undefined;
    if (value.kind === "utc") return value.instant;
    if (value.kind === "zoned") return value.zoned.toInstant();
    const message = `${property.name} should be in UTC; read the ${value.kind} time as UTC`;
    this.report("warning", "invalid-value", message, property, at);
    return value.wallTime.toZonedDateTime("UTC").toInstant();
  }

  // The first `name` as a UTC timestamp, such as DTSTAMP. A DATE is dropped with a warning.
  timestamp(name: string, at: At): Temporal.Instant | undefined {
    const property = this.one(name, at);
    if (property === undefined) return undefined;
    const instant = this.instant(property, at);
    if (instant !== "date") return instant;
    const message = `${name} is a DATE where a UTC DATE-TIME belongs; dropped`;
    this.report("warning", "invalid-value", message, property, at);
    return undefined;
  }

  // Every occurrence of `name`, mapped; what the mapper drops (`undefined`) leaves no gap.
  list<T>(
    name: string,
    field: string,
    map: (property: IcsProperty, at: Path, field: string) => T | undefined,
  ): T[] {
    const items: T[] = [];
    for (const property of this.all(name)) {
      const item = map(property, [field, items.length], field);
      if (item !== undefined) items.push(item);
    }
    return items;
  }

  // Every occurrence of `name`, split on separating commas, each item decoded.
  items<T>(
    name: string,
    field: string,
    decode: (property: IcsProperty, raw: string, type: IcsValueType) => IcsDecodeResult<T>,
  ): T[] {
    const items: T[] = [];
    for (const property of this.all(name)) {
      const type = icsValueTypeOf(property);
      for (const raw of splitIcsValues(type, property.value)) {
        // An empty item, such as after a trailing comma, holds nothing to lose.
        if (raw === "") continue;
        const item = this.decode(
          property,
          decode(property, raw, type),
          [field, items.length],
          field,
        );
        if (item !== undefined) items.push(item);
      }
    }
    return items;
  }
}
