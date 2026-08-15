"use client";

import type {
  CalendarEnvironment,
  CalendarViewStrategy,
  EventId,
  ResourceId,
  ViewNavigationDirection,
} from "@moltenship/calendar-core";
import { createElement, type ComponentType, type ReactNode } from "react";

import type { CalendarCapability } from "./capabilities.js";
import type { CalendarContextValue } from "./calendar-types.js";
import type { InferEventId, InferResourceId } from "./generics.js";

export interface CalendarViewRendererProps<
  TEvent,
  TResource,
  TView extends string,
  TOptions,
  TStrategy,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly calendar: CalendarContextValue<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  readonly options: TOptions;
  readonly strategy: TStrategy;
}

export interface CalendarViewDefinitionInput<
  TEvent,
  TResource,
  TName extends string,
  TOptions,
  TProjectionInput,
  TProjection,
  TSpatialNavigationInput,
  TSpatialNavigationResult,
  TInteractionGeometryInput,
  TInteractionGeometry,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly Renderer: ComponentType<
    CalendarViewRendererProps<
      TEvent,
      TResource,
      TName,
      TOptions,
      CalendarViewStrategy<
        TName,
        TOptions,
        TProjectionInput,
        TProjection,
        TSpatialNavigationInput,
        TSpatialNavigationResult,
        TInteractionGeometryInput,
        TInteractionGeometry
      >,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >
  >;
  readonly capabilities?: readonly CalendarCapability[];
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

export interface CalendarViewRegistration<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly capabilities: readonly CalendarCapability[];
  readonly name: TView;
  getTitle(anchor: Temporal.PlainDate, environment: CalendarEnvironment): string;
  navigate(
    anchor: Temporal.PlainDate,
    direction: ViewNavigationDirection,
    environment: CalendarEnvironment,
  ): Temporal.PlainDate;
  render(
    calendar: CalendarContextValue<
      TEvent,
      TResource,
      TView,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  ): ReactNode;
}

export type CalendarDefinedView<
  TEvent,
  TResource,
  TName extends string,
  TOptions,
  TProjectionInput,
  TProjection,
  TSpatialNavigationInput,
  TSpatialNavigationResult,
  TInteractionGeometryInput,
  TInteractionGeometry,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> = CalendarViewRegistration<TEvent, TResource, TName, TSelection, TFocus, TEventId, TResourceId> &
  Readonly<
    CalendarViewDefinitionInput<
      TEvent,
      TResource,
      TName,
      TOptions,
      TProjectionInput,
      TProjection,
      TSpatialNavigationInput,
      TSpatialNavigationResult,
      TInteractionGeometryInput,
      TInteractionGeometry,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >
  >;

export interface CalendarViewRegistryDiagnostic {
  readonly code: "duplicate-view-name";
  readonly viewName: string;
}

export interface CalendarViewRegistry<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly diagnostics: readonly CalendarViewRegistryDiagnostic[];
  readonly names: readonly TView[];
  readonly size: number;
  readonly values: readonly CalendarViewRegistration<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >[];
  get(
    name: string,
  ):
    | CalendarViewRegistration<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>
    | undefined;
  has(name: string): boolean;
}

export function bindCalendarView<
  TEvent,
  TResource,
  const TName extends string,
  TOptions,
  TProjectionInput,
  TProjection,
  TSpatialNavigationInput,
  TSpatialNavigationResult,
  TInteractionGeometryInput,
  TInteractionGeometry,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
>(
  definition: CalendarViewDefinitionInput<
    TEvent,
    TResource,
    TName,
    TOptions,
    TProjectionInput,
    TProjection,
    TSpatialNavigationInput,
    TSpatialNavigationResult,
    TInteractionGeometryInput,
    TInteractionGeometry,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >,
): CalendarDefinedView<
  TEvent,
  TResource,
  TName,
  TOptions,
  TProjectionInput,
  TProjection,
  TSpatialNavigationInput,
  TSpatialNavigationResult,
  TInteractionGeometryInput,
  TInteractionGeometry,
  TSelection,
  TFocus,
  TEventId,
  TResourceId
> {
  const { Renderer, defaultOptions, strategy } = definition;
  const capabilities = Object.freeze([...(definition.capabilities ?? [])]);

  return Object.freeze({
    Renderer,
    capabilities,
    defaultOptions,
    getTitle(anchor: Temporal.PlainDate, environment: CalendarEnvironment) {
      const range = strategy.getRange(anchor, environment, defaultOptions);
      return strategy.getTitle(range, environment, defaultOptions);
    },
    name: strategy.name,
    navigate(
      anchor: Temporal.PlainDate,
      direction: ViewNavigationDirection,
      environment: CalendarEnvironment,
    ) {
      return strategy.navigate(anchor, direction, environment, defaultOptions);
    },
    render(
      calendar: CalendarContextValue<
        TEvent,
        TResource,
        TName,
        TSelection,
        TFocus,
        TEventId,
        TResourceId
      >,
    ) {
      return createElement(Renderer, { calendar, options: defaultOptions, strategy });
    },
    strategy,
  });
}

export interface CalendarViewDefinitionBuilder<
  TEvent,
  TResource,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  <
    const TName extends string,
    TOptions,
    TProjectionInput,
    TProjection,
    TSpatialNavigationInput,
    TSpatialNavigationResult,
    TInteractionGeometryInput,
    TInteractionGeometry,
  >(
    definition: CalendarViewDefinitionInput<
      TEvent,
      TResource,
      TName,
      TOptions,
      TProjectionInput,
      TProjection,
      TSpatialNavigationInput,
      TSpatialNavigationResult,
      TInteractionGeometryInput,
      TInteractionGeometry,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  ): CalendarDefinedView<
    TEvent,
    TResource,
    TName,
    TOptions,
    TProjectionInput,
    TProjection,
    TSpatialNavigationInput,
    TSpatialNavigationResult,
    TInteractionGeometryInput,
    TInteractionGeometry,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
}

export function defineCalendarView<
  TEvent,
  TResource,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
>(): CalendarViewDefinitionBuilder<TEvent, TResource, TSelection, TFocus, TEventId, TResourceId> {
  return <
    const TName extends string,
    TOptions,
    TProjectionInput,
    TProjection,
    TSpatialNavigationInput,
    TSpatialNavigationResult,
    TInteractionGeometryInput,
    TInteractionGeometry,
  >(
    definition: CalendarViewDefinitionInput<
      TEvent,
      TResource,
      TName,
      TOptions,
      TProjectionInput,
      TProjection,
      TSpatialNavigationInput,
      TSpatialNavigationResult,
      TInteractionGeometryInput,
      TInteractionGeometry,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  ): CalendarDefinedView<
    TEvent,
    TResource,
    TName,
    TOptions,
    TProjectionInput,
    TProjection,
    TSpatialNavigationInput,
    TSpatialNavigationResult,
    TInteractionGeometryInput,
    TInteractionGeometry,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  > => bindCalendarView(definition);
}

export function createCalendarViewRegistry<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
>(
  views: readonly CalendarViewRegistration<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >[] = [],
): CalendarViewRegistry<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId> {
  const byName = new Map<
    string,
    CalendarViewRegistration<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>
  >();
  const diagnostics: CalendarViewRegistryDiagnostic[] = [];

  for (const view of views) {
    if (byName.has(view.name)) {
      diagnostics.push(Object.freeze({ code: "duplicate-view-name", viewName: view.name }));
    }
    byName.set(view.name, view);
  }

  const values = Object.freeze([...byName.values()]);
  const names = Object.freeze(values.map((view) => view.name));
  const frozenDiagnostics = Object.freeze(diagnostics);

  return Object.freeze({
    diagnostics: frozenDiagnostics,
    get: (name: string) => byName.get(name),
    has: (name: string) => byName.has(name),
    names,
    size: values.length,
    values,
  });
}
