export type CalendarCapability = string;

export interface CalendarCapabilitySet {
  readonly values: readonly CalendarCapability[];
  has(capability: CalendarCapability): boolean;
}

export function createCalendarCapabilitySet(
  capabilities: Iterable<CalendarCapability>,
): CalendarCapabilitySet {
  const values = Object.freeze([...new Set(capabilities)]);
  const valueSet = new Set(values);

  return Object.freeze({
    values,
    has: (capability: CalendarCapability) => valueSet.has(capability),
  });
}
