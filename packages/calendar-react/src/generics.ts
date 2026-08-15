import type { EventId, ResourceId } from "@moltenship/calendar-core";

export type InferEventId<TEvent> = TEvent extends { readonly id: infer TId }
  ? TId extends EventId
    ? TId
    : EventId
  : EventId;

export type InferResourceId<TResource> = TResource extends { readonly id: infer TId }
  ? TId extends ResourceId
    ? TId
    : ResourceId
  : ResourceId;
