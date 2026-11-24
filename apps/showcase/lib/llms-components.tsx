import { asMarkdown, md } from "fumadocs-core/server";
import type { MDXComponents } from "mdx/types";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * The Markdown form of each MDX component the docs use, for `/llms.txt`, the `.md` pages and the
 * docs packaged with `@moltenship/calendar`. A page's Markdown is a component (`output: "function"`
 * in `source.config.ts`): prose and code samples stay as authored, and every JSX element resolves
 * here. A component with no entry is a live example, which becomes a link to the page that runs it.
 */
export function llmsComponents(liveUrl: string): MDXComponents {
  // Some of these are async, which MDX's own component type has no word for.
  const known: Record<string, unknown> = {
    Callout,
    Card,
    Cards,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
  };

  return new Proxy(known, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      return (target[key] ??= onTheSite(key, liveUrl));
    },
  }) as MDXComponents;
}

/** What stands in for a component that only runs in a browser: a preview, a diagram, a tool. */
function onTheSite(name: string, liveUrl: string) {
  return function OnTheSite({ view }: { readonly view?: unknown }) {
    asMarkdown();
    const what = name.endsWith("Anatomy")
      ? "Diagram"
      : typeof view === "string"
        ? `Live example of the \`${view}\` view`
        : "Live example";
    return md.linePrefix("> ")`${what}: see it at ${liveUrl}`;
  };
}

interface CalloutProps {
  readonly children?: ReactNode;
  readonly title?: ReactNode;
  readonly type?: string;
}

async function Callout({ children, title, type }: CalloutProps) {
  asMarkdown();
  const label = title ?? (type === "warn" || type === "warning" ? "Warning" : "Note");
  const body = (await md`${children}`).trim();
  return md.linePrefix("> ")`**${label}**\n\n${body}`;
}

interface CardProps {
  readonly children?: ReactNode;
  readonly description?: ReactNode;
  readonly href?: string;
  readonly title?: ReactNode;
}

function Card({ children, description, href, title }: CardProps) {
  asMarkdown();
  const text = description ?? children;
  const name = href === undefined ? md`${title}` : md`[${title}](${href})`;
  return md`- ${name}${text === undefined || text === null ? "" : md`: ${text}`}\n`;
}

async function Cards({ children }: { readonly children?: ReactNode }) {
  asMarkdown();
  const cards = await Promise.all(elements(children).map((card) => md`${card}`));
  return `\n${cards.map((card) => card.trim()).join("\n")}\n\n`;
}

function elements(children: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(children).filter(
    (child): child is ReactElement<Record<string, unknown>> => isValidElement(child),
  );
}

/** Numbers its steps, since the site draws the numbers and the source has none. */
function Steps({ children }: { readonly children?: ReactNode }) {
  asMarkdown();
  return elements(children).map(
    (step, index) =>
      md`\n**Step ${String(index + 1)}**\n\n${step.props["children"] as ReactNode}\n\n`,
  );
}

function Step({ children }: { readonly children?: ReactNode }) {
  asMarkdown();
  return md`\n${children}\n\n`;
}

interface TabsProps {
  readonly children?: ReactNode;
  readonly items?: readonly string[];
}

/** Every tab, one after the other, each under its name. */
function Tabs({ children, items }: TabsProps) {
  asMarkdown();
  return elements(children).map((tab, index) => {
    const value = tab.props["value"];
    const name = typeof value === "string" ? value : items?.[index];
    const body = tab.props["children"] as ReactNode;
    return name === undefined ? md`\n${body}\n\n` : md`\n**${name}**\n\n${body}\n\n`;
  });
}

function Tab({ children }: { readonly children?: ReactNode }) {
  asMarkdown();
  return md`\n${children}\n\n`;
}

interface TypeTableField {
  readonly default?: ReactNode;
  readonly description?: ReactNode;
  readonly parameters?: readonly { readonly description?: ReactNode; readonly name: string }[];
  readonly required?: boolean;
  readonly returns?: ReactNode;
  readonly type: ReactNode;
}

/** A table: name, type, default and description, with `required` said in words. */
function TypeTable({ type }: { readonly type?: Readonly<Record<string, TypeTableField>> }) {
  asMarkdown();
  const fields = Object.entries(type ?? {});
  if (fields.length === 0) return null;
  const hasDefault = fields.some(([, field]) => field.default !== undefined);

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          {hasDefault ? <th>Default</th> : null}
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {fields.map(([name, field]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
            </td>
            <td>{inlineCode(field.type)}</td>
            {hasDefault ? <td>{inlineCode(field.default)}</td> : null}
            <td>
              {field.required === true ? "Required. " : null}
              {field.description}
              {field.parameters?.map((parameter) => (
                <span key={parameter.name}>
                  {" "}
                  <code>{parameter.name}</code>: {parameter.description}
                </span>
              ))}
              {field.returns === undefined ? null : <span> Returns {field.returns}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function inlineCode(value: ReactNode): ReactNode {
  return typeof value === "string" || typeof value === "number" ? <code>{value}</code> : value;
}
