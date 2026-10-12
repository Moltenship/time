import type { IcsComponent, IcsProperty } from "../../src/types";

type Observance = readonly ["DAYLIGHT" | "STANDARD", string];

function property(name: string, value: string): IcsProperty {
  return { name, parameters: {}, value };
}

/**
 * A VTIMEZONE with one observance per `[kind, TZOFFSETTO]`. Each observance comes from the offset
 * of the one before it, cyclically, as a yearly DST pair does.
 */
export function vtimezone(
  tzid: string,
  observances: readonly Observance[],
  location?: string,
): IcsComponent {
  return {
    components: observances.map(([name, offsetTo], index) => ({
      components: [],
      name,
      properties: [
        property("DTSTART", "19700101T000000"),
        property("TZOFFSETFROM", observances.at(index - 1)?.[1] ?? offsetTo),
        property("TZOFFSETTO", offsetTo),
      ],
    })),
    name: "VTIMEZONE",
    properties: [
      property("TZID", tzid),
      ...(location === undefined ? [] : [property("X-LIC-LOCATION", location)]),
    ],
  };
}

/** Definitions keyed by their TZID, as the parser hands them to the resolver. */
export function definitionsOf(...components: IcsComponent[]): ReadonlyMap<string, IcsComponent> {
  return new Map(
    components.map((component) => [
      component.properties.find((entry) => entry.name === "TZID")?.value ?? "",
      component,
    ]),
  );
}
