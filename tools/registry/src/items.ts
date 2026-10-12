/** The item and every item it installs, transitively. */
export function itemClosure<T extends { readonly name: string }>(
  name: string,
  byName: ReadonlyMap<string, T>,
  itemsOf: (item: T) => readonly string[],
): T[] {
  const closure: T[] = [];
  const queue = [name];
  while (queue.length > 0) {
    const item = byName.get(queue.shift()!);
    if (!item || closure.includes(item)) continue;
    closure.push(item);
    queue.push(...itemsOf(item));
  }
  return closure;
}

/** `@moltenship/calendar@^1.0.0` → `@moltenship/calendar`; `cn` → `cn`. */
export function dependencyName(dependency: string): string {
  const at = dependency.indexOf("@", 1);
  return at === -1 ? dependency : dependency.slice(0, at);
}
