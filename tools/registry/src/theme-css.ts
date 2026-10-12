import postcss, { type AtRule, type ChildNode, type Container, type Rule } from "postcss";

import { standardCssVariables } from "./validation";

type Declarations = Record<string, string>;
type CssBlock = Record<string, Declarations | Record<string, Declarations>>;

export interface ThemeRegistryCss {
  readonly cssVars: { readonly theme: Declarations };
  readonly css: CssBlock;
}

/** Theme mappings a stock shadcn app already has in its `@theme inline` block. */
function isStandardThemeMapping(property: string): boolean {
  const name = property.slice(2);
  return (
    (name.startsWith("color-") && standardCssVariables.has(name.slice("color-".length))) ||
    /^radius-(?:sm|md|lg|xl|2xl|3xl|4xl)$/u.test(name) ||
    name === "font-heading" ||
    name === "font-sans"
  );
}

function compact(value: string): string {
  return value.replaceAll(/\s+/gu, " ").replaceAll("( ", "(").replaceAll(" )", ")").trim();
}

function selectorOf(rule: Rule): string {
  return rule.selectors.join(", ");
}

function declarationsOf(container: Container<ChildNode>, where: string): Declarations {
  const declarations: Declarations = {};
  for (const node of container.nodes ?? []) {
    if (node.type === "comment") continue;
    if (node.type !== "decl") throw new Error(`${where}: expected only declarations`);
    declarations[node.prop] = compact(node.value);
  }
  return declarations;
}

/** `:root` and `.dark` hold tokens: the calendar's ones ship, the stock shadcn ones are the app's. */
function calendarTokens(rule: Rule): Declarations {
  const tokens: Declarations = {};
  for (const [property, value] of Object.entries(declarationsOf(rule, selectorOf(rule)))) {
    if (property.startsWith("--calendar-")) {
      tokens[property] = value;
    } else if (!standardCssVariables.has(property.slice(2))) {
      throw new Error(
        `${selectorOf(rule)} sets ${property}, which is neither a calendar token nor a stock shadcn one`,
      );
    }
  }
  return tokens;
}

function readRules(container: AtRule, where: string): Record<string, Declarations> {
  const rules: Record<string, Declarations> = {};
  for (const node of container.nodes ?? []) {
    if (node.type === "comment") continue;
    if (node.type !== "rule") throw new Error(`${where}: expected only rules`);
    rules[selectorOf(node)] = declarationsOf(node, `${where} ${selectorOf(node)}`);
  }
  return rules;
}

/**
 * Turns `calendar-theme.css` into the `cssVars` and `css` of the theme item, so `shadcn add`
 * merges it into the app's own stylesheet with the file's structure: the `@theme inline` mappings,
 * and the tokens and rules inside `@layer base`, where the app's own unlayered rules win over them
 * as they do over the file. The stock shadcn tokens the file also sets, for apps without them, are
 * left out: a shadcn app defines its own.
 *
 * The tokens go in `css`, not in `cssVars.light` and `cssVars.dark`: shadcn writes those to the
 * app's unlayered `:root` and `.dark`, where CSS pasted from the theme builder couldn't override
 * them.
 */
export function themeCssToRegistry(source: string, from: string): ThemeRegistryCss {
  const root = postcss.parse(source, { from });
  const theme: Declarations = {};
  const css: CssBlock = {};

  for (const node of root.nodes) {
    if (node.type === "comment") continue;
    if (node.type === "atrule" && node.name === "theme") {
      for (const [property, value] of Object.entries(declarationsOf(node, "@theme"))) {
        if (property.startsWith("--color-calendar-")) {
          theme[property.slice(2)] = value;
        } else if (!isStandardThemeMapping(property)) {
          throw new Error(
            `@theme sets ${property}, which is neither a calendar mapping nor a stock one`,
          );
        }
      }
    } else if (node.type === "atrule" && node.name === "layer") {
      const key = `@layer ${node.params}`;
      const rules: Record<string, Declarations> = {};
      for (const child of node.nodes ?? []) {
        if (child.type === "comment") continue;
        if (child.type !== "rule") throw new Error(`${key}: expected only rules`);
        const selector = selectorOf(child);
        rules[selector] =
          selector === ":root" || selector === ".dark"
            ? calendarTokens(child)
            : declarationsOf(child, `${key} ${selector}`);
      }
      if (Object.keys(rules).length > 0) css[key] = rules;
    } else if (node.type === "atrule") {
      const key = `@${node.name} ${node.params}`;
      css[key] = readRules(node, key);
    } else if (node.type === "rule") {
      css[selectorOf(node)] = declarationsOf(node, selectorOf(node));
    } else {
      throw new Error(`${from}: unexpected ${node.type} at the top level`);
    }
  }

  return { cssVars: { theme }, css };
}
