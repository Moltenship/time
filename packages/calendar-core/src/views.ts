import type { PlainDateInterval } from "@moltenship/calendar-temporal";

import type { CalendarEnvironment } from "./environment.ts";

export type ViewNavigationDirection = -1 | 1;

export interface CalendarViewStrategy<
  TName extends string,
  TOptions,
  TProjectionInput,
  TProjection,
  TSpatialNavigationInput,
  TSpatialNavigationResult,
  TInteractionGeometryInput,
  TInteractionGeometry,
> {
  readonly name: TName;
  getInteractionGeometry(input: TInteractionGeometryInput): TInteractionGeometry;
  getRange(
    anchor: Temporal.PlainDate,
    environment: CalendarEnvironment,
    options: TOptions,
  ): PlainDateInterval;
  getSpatialNavigation(input: TSpatialNavigationInput): TSpatialNavigationResult;
  getTitle(range: PlainDateInterval, environment: CalendarEnvironment, options: TOptions): string;
  navigate(
    anchor: Temporal.PlainDate,
    direction: ViewNavigationDirection,
    environment: CalendarEnvironment,
    options: TOptions,
  ): Temporal.PlainDate;
  project(input: TProjectionInput, options: TOptions): TProjection;
}

export interface CalendarViewDefinition<
  TName extends string,
  TOptions,
  TProjectionInput,
  TProjection,
  TSpatialNavigationInput,
  TSpatialNavigationResult,
  TInteractionGeometryInput,
  TInteractionGeometry,
  TRenderer,
> {
  readonly Renderer: TRenderer;
  readonly defaultOptions: TOptions;
  readonly strategy: CalendarViewStrategy<
    TName,
    TOptions,
    TProjectionInput,
    TProjection,
    TSpatialNavigationInput,
    TSpatialNavigationResult,
    TInteractionGeometryInput,
    TInteractionGeometry
  >;
}
