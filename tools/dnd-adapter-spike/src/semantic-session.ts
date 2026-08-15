import type {
  CalendarDragSource,
  CalendarEntityId,
  CalendarEventChange,
  CalendarEventPlacement,
  CalendarInteractionInput,
} from "./contracts";
import type { CalendarPoint, CalendarViewRegionGeometry } from "./geometry";

interface ActiveSession<TEvent, TResourceId extends CalendarEntityId> {
  readonly sequence: number;
  readonly source: CalendarDragSource<TEvent, TResourceId>;
  readonly input: CalendarInteractionInput;
  readonly initialPoint: CalendarPoint;
  proposed: CalendarEventPlacement<TResourceId>;
}

export class CalendarSemanticDragSession<TEvent, TResourceId extends CalendarEntityId = string> {
  #active: ActiveSession<TEvent, TResourceId> | null = null;
  #nextSequence = 1;
  readonly #getGeometry: () => CalendarViewRegionGeometry<TResourceId> | null;

  constructor(getGeometry: () => CalendarViewRegionGeometry<TResourceId> | null) {
    this.#getGeometry = getGeometry;
  }

  get activeSource(): CalendarDragSource<TEvent, TResourceId> | null {
    return this.#active?.source ?? null;
  }

  get input(): CalendarInteractionInput | null {
    return this.#active?.input ?? null;
  }

  start(
    source: CalendarDragSource<TEvent, TResourceId>,
    input: CalendarInteractionInput,
    point: CalendarPoint,
  ): void {
    if (!this.#getGeometry()) {
      throw new Error("Cannot start a calendar drag before view-region geometry is registered");
    }

    this.#active = {
      sequence: this.#nextSequence,
      source,
      input,
      initialPoint: point,
      proposed: source.placement,
    };
    this.#nextSequence += 1;
  }

  movePointer(point: CalendarPoint): CalendarEventChange<TEvent, TResourceId> | null {
    const active = this.#active;
    const geometry = this.#getGeometry();
    if (!active || !geometry) return null;

    active.proposed = geometry.placementFromPointer(
      active.source.placement,
      active.initialPoint,
      point,
    );
    return this.#change(active);
  }

  previewPointer(point: CalendarPoint): CalendarEventChange<TEvent, TResourceId> | null {
    const active = this.#active;
    const geometry = this.#getGeometry();
    if (!active || !geometry) return null;

    return this.#change(
      active,
      geometry.placementFromPointer(active.source.placement, active.initialPoint, point),
    );
  }

  moveKeyboard(code: string): CalendarEventChange<TEvent, TResourceId> | null {
    const active = this.#active;
    const geometry = this.#getGeometry();
    if (!active || !geometry) return null;

    active.proposed = geometry.placementFromKeyboard(active.proposed, code);
    return this.#change(active);
  }

  previewKeyboard(code: string): CalendarEventChange<TEvent, TResourceId> | null {
    const active = this.#active;
    const geometry = this.#getGeometry();
    if (!active || !geometry) return null;

    return this.#change(active, geometry.placementFromKeyboard(active.proposed, code));
  }

  currentChange(): CalendarEventChange<TEvent, TResourceId> | null {
    return this.#active ? this.#change(this.#active) : null;
  }

  finish(): CalendarEventChange<TEvent, TResourceId> | null {
    const active = this.#active;
    this.#active = null;
    return active ? this.#change(active) : null;
  }

  cancel(): void {
    this.#active = null;
  }

  #change(
    active: ActiveSession<TEvent, TResourceId>,
    proposed = active.proposed,
  ): CalendarEventChange<TEvent, TResourceId> {
    return {
      id: `${String(active.source.eventId)}:${active.sequence}`,
      cause: active.input === "keyboard" ? "keyboard" : "move",
      input: active.input,
      event: active.source.event,
      original: active.source.placement,
      proposed,
      validation: { status: "valid", reasons: [] },
      sourceView: active.source.sourceView,
    };
  }
}
