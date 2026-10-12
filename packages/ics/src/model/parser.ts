import { IcsParseError } from "../issues";
import type { StandardSchemaV1 } from "../standard-schema";
import type {
  IcsExtensionsConfig,
  IcsIssue,
  IcsParseOptions,
  IcsParseResult,
  IcsParser,
} from "../types";
import { parseCalendars, type ParseConfig } from "./calendar";
import { extensionEntries } from "./extensions";

function errorsOf(issues: readonly IcsIssue[]): IcsIssue[] {
  return issues.filter((issue) => issue.severity === "error");
}

/** Builds a reusable parser. The parser is also a Standard Schema for ICS text. */
export function createIcsParser<TExtensions extends IcsExtensionsConfig = {}>(
  options: IcsParseOptions<TExtensions> = {},
): IcsParser<TExtensions> {
  const { resolveTimeZone, strict = false } = options;
  const extensions: IcsExtensionsConfig = options.extensions ?? {};
  const config: ParseConfig = {
    extensions: {
      calendar: extensionEntries(extensions.calendar),
      event: extensionEntries(extensions.event),
      journal: extensionEntries(extensions.journal),
      todo: extensionEntries(extensions.todo),
    },
    resolveTimeZone,
  };
  // The result's extension values are typed by the configuration that read them.
  const parse = (text: string) =>
    parseCalendars(text, config) as unknown as IcsParseResult<TExtensions>;

  return {
    parse(text) {
      const result = parse(text);
      const errors = strict ? errorsOf(result.issues) : [];
      if (errors.length > 0) throw new IcsParseError(errors);
      return result;
    },
    "~standard": {
      validate(value): StandardSchemaV1.Result<IcsParseResult<TExtensions>> {
        if (typeof value !== "string") {
          return {
            issues: [{ message: `Expected iCalendar text, a string; got ${typeof value}` }],
          };
        }
        const result = parse(value);
        const errors = errorsOf(result.issues);
        return errors.length === 0
          ? { value: result }
          : { issues: errors.map(({ message, path }) => ({ message, path })) };
      },
      vendor: "@moltenship/ics",
      version: 1,
    },
  };
}

/** Parses iCalendar text into typed calendars. */
export function parseIcs<TExtensions extends IcsExtensionsConfig = {}>(
  text: string,
  options?: IcsParseOptions<TExtensions>,
): IcsParseResult<TExtensions> {
  return createIcsParser(options).parse(text);
}
