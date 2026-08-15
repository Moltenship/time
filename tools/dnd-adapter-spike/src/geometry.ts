import type { CalendarEntityId, CalendarEventPlacement } from "./contracts";

export interface CalendarPoint {
  readonly x: number;
  readonly y: number;
}

export interface CalendarRegionRectangle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CalendarViewRegionDefinition<TResourceId extends CalendarEntityId = string> {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly snapMinutes: number;
  readonly resources: readonly TResourceId[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertDefinition<TResourceId extends CalendarEntityId>(
  definition: CalendarViewRegionDefinition<TResourceId>,
): void {
  if (
    !Number.isFinite(definition.startMinute) ||
    !Number.isFinite(definition.endMinute) ||
    definition.startMinute >= definition.endMinute ||
    !Number.isInteger(definition.snapMinutes) ||
    definition.snapMinutes <= 0 ||
    definition.resources.length === 0
  ) {
    throw new RangeError("Invalid calendar view-region geometry definition");
  }
}

export class CalendarViewRegionGeometry<TResourceId extends CalendarEntityId = string> {
  readonly #resourceIndexes: ReadonlyMap<TResourceId, number>;
  readonly definition: CalendarViewRegionDefinition<TResourceId>;
  readonly rectangle: CalendarRegionRectangle;

  constructor(
    definition: CalendarViewRegionDefinition<TResourceId>,
    rectangle: CalendarRegionRectangle,
  ) {
    assertDefinition(definition);
    if (rectangle.width <= 0 || rectangle.height <= 0) {
      throw new RangeError("Calendar view-region rectangle must have positive dimensions");
    }
    this.definition = definition;
    this.rectangle = rectangle;
    this.#resourceIndexes = new Map(
      definition.resources.map((resourceId, index) => [resourceId, index]),
    );
  }

  get pixelsPerSnap(): number {
    const wallMinutes = this.definition.endMinute - this.definition.startMinute;
    return (this.rectangle.height * this.definition.snapMinutes) / wallMinutes;
  }

  placementFromPointer(
    original: CalendarEventPlacement<TResourceId>,
    initial: CalendarPoint,
    current: CalendarPoint,
  ): CalendarEventPlacement<TResourceId> {
    const duration = original.endMinute - original.startMinute;
    const rawDeltaMinutes =
      ((current.y - initial.y) / this.rectangle.height) *
      (this.definition.endMinute - this.definition.startMinute);
    const snappedDelta =
      Math.round(rawDeltaMinutes / this.definition.snapMinutes) * this.definition.snapMinutes;
    const maximumStart = this.definition.endMinute - duration;
    const startMinute = clamp(
      original.startMinute + snappedDelta,
      this.definition.startMinute,
      maximumStart,
    );

    return {
      startMinute,
      endMinute: startMinute + duration,
      resourceId: this.resourceAt(current.x),
    };
  }

  placementFromKeyboard(
    current: CalendarEventPlacement<TResourceId>,
    code: string,
  ): CalendarEventPlacement<TResourceId> {
    const duration = current.endMinute - current.startMinute;
    const maximumStart = this.definition.endMinute - duration;
    const resourceIndex = this.#resourceIndexes.get(current.resourceId) ?? 0;

    switch (code) {
      case "ArrowUp": {
        const startMinute = clamp(
          current.startMinute - this.definition.snapMinutes,
          this.definition.startMinute,
          maximumStart,
        );
        return { ...current, startMinute, endMinute: startMinute + duration };
      }
      case "ArrowDown": {
        const startMinute = clamp(
          current.startMinute + this.definition.snapMinutes,
          this.definition.startMinute,
          maximumStart,
        );
        return { ...current, startMinute, endMinute: startMinute + duration };
      }
      case "ArrowLeft":
        return {
          ...current,
          resourceId:
            this.definition.resources[Math.max(0, resourceIndex - 1)] ?? current.resourceId,
        };
      case "ArrowRight":
        return {
          ...current,
          resourceId:
            this.definition.resources[
              Math.min(this.definition.resources.length - 1, resourceIndex + 1)
            ] ?? current.resourceId,
        };
      default:
        return current;
    }
  }

  private resourceAt(clientX: number): TResourceId {
    const relativeX = clamp(clientX - this.rectangle.left, 0, this.rectangle.width - 1);
    const columnWidth = this.rectangle.width / this.definition.resources.length;
    const index = Math.floor(relativeX / columnWidth);
    return this.definition.resources[index] ?? this.definition.resources[0]!;
  }
}

export function rectangleFromElement(element: Element): CalendarRegionRectangle {
  const rectangle = element.getBoundingClientRect();
  return {
    left: rectangle.left,
    top: rectangle.top,
    width: rectangle.width,
    height: rectangle.height,
  };
}
