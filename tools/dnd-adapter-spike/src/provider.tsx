import {
  Accessibility,
  Cursor,
  type Draggable as DndDraggable,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  PreventSelection,
} from "@dnd-kit/dom";
import { RestrictToElement } from "@dnd-kit/dom/modifiers";
import { DragDropProvider, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import { CalendarRafAutoScroller } from "./auto-scroll";
import {
  defaultCalendarDragConfiguration,
  type CalendarDragConfiguration,
  type CalendarDragMessages,
  type CalendarDragOverlayRenderer,
  type CalendarDragSource,
  type CalendarDraggableRenderProps,
  type CalendarEntityId,
  type CalendarEventChange,
  type CalendarEventPlacement,
  type CalendarInteractionInput,
} from "./contracts";
import {
  CalendarViewRegionGeometry,
  rectangleFromElement,
  type CalendarPoint,
  type CalendarViewRegionDefinition,
} from "./geometry";
import { CalendarSemanticDragSession } from "./semantic-session";

interface InternalDragData<TEvent, TResourceId extends CalendarEntityId> extends Record<
  string,
  unknown
> {
  readonly kind: "calendar-event";
  readonly source: CalendarDragSource<TEvent, TResourceId>;
}

interface InternalAnnouncementOperation {
  readonly source: { readonly data: Record<string, unknown> } | null;
  readonly position: {
    readonly initial: CalendarPoint;
    readonly current: CalendarPoint;
  };
}

interface InternalDragMoveEvent {
  readonly operation: InternalAnnouncementOperation;
  readonly nativeEvent?: Event;
  readonly to?: CalendarPoint;
}

function isInternalDragData<TEvent, TResourceId extends CalendarEntityId>(
  data: Record<string, unknown> | undefined,
): data is InternalDragData<TEvent, TResourceId> {
  return data?.kind === "calendar-event" && typeof data.source === "object" && data.source !== null;
}

function inputFromEvent(event: Event | null | undefined): CalendarInteractionInput {
  if (event instanceof KeyboardEvent) return "keyboard";
  if (event instanceof PointerEvent && event.pointerType === "touch") return "touch";
  return "pointer";
}

class CalendarDragController<TEvent, TResourceId extends CalendarEntityId> {
  #surface: HTMLElement | null = null;
  #geometry: CalendarViewRegionGeometry<TResourceId> | null = null;
  #onEventChange: (change: CalendarEventChange<TEvent, TResourceId>) => void = () => {};
  #messages: CalendarDragMessages<TEvent, TResourceId> | null = null;
  readonly #session = new CalendarSemanticDragSession<TEvent, TResourceId>(() => this.#geometry);
  readonly #autoScroller: CalendarRafAutoScroller;

  constructor(configuration: CalendarDragConfiguration) {
    this.#autoScroller = new CalendarRafAutoScroller(() => this.#surface, configuration.autoScroll);
  }

  get surface(): HTMLElement | null {
    return this.#surface;
  }

  configure(
    messages: CalendarDragMessages<TEvent, TResourceId>,
    onEventChange: (change: CalendarEventChange<TEvent, TResourceId>) => void,
  ): void {
    this.#messages = messages;
    this.#onEventChange = onEventChange;
  }

  attachRegion(
    element: HTMLElement | null,
    definition: CalendarViewRegionDefinition<TResourceId>,
  ): void {
    this.#surface = element;
    this.#geometry = element
      ? new CalendarViewRegionGeometry(definition, rectangleFromElement(element))
      : null;
  }

  start(
    source: CalendarDragSource<TEvent, TResourceId>,
    input: CalendarInteractionInput,
    point: CalendarPoint,
  ): void {
    this.#session.start(source, input, point);
  }

  move(event: InternalDragMoveEvent): void {
    const { nativeEvent, operation, to } = event;
    if (this.#session.input === "keyboard") {
      if (nativeEvent instanceof KeyboardEvent) {
        this.#session.moveKeyboard(nativeEvent.code);
      }
      return;
    }

    const point = to ?? operation.position.current;
    this.#session.movePointer(point);
    this.#autoScroller.update(point);
  }

  finish(canceled: boolean): void {
    this.#autoScroller.cancel();
    if (canceled) {
      this.#session.cancel();
      return;
    }

    const change = this.#session.finish();
    if (change) this.#onEventChange(change);
  }

  cancel(): void {
    this.#autoScroller.cancel();
    this.#session.cancel();
  }

  announcement(
    kind: "started" | "moved" | "completed" | "canceled",
    source: CalendarDragSource<TEvent, TResourceId> | null,
    change: CalendarEventChange<TEvent, TResourceId> | null = this.#session.currentChange(),
  ): string | undefined {
    const activeSource = source ?? this.#session.activeSource;
    const messages = this.#messages;
    if (!activeSource || !messages) return undefined;
    return messages[kind]({
      source: activeSource,
      change,
    });
  }

  movedAnnouncement(event: InternalDragMoveEvent): string | undefined {
    const { nativeEvent, operation, to } = event;
    const change =
      this.#session.input === "keyboard" && nativeEvent instanceof KeyboardEvent
        ? this.#session.previewKeyboard(nativeEvent.code)
        : this.#session.previewPointer(to ?? operation.position.current);
    return this.announcement("moved", null, change);
  }
}

const CalendarDragContext = createContext<CalendarDragController<unknown, CalendarEntityId> | null>(
  null,
);

function useCalendarDragController<
  TEvent,
  TResourceId extends CalendarEntityId,
>(): CalendarDragController<TEvent, TResourceId> {
  const controller = useContext(CalendarDragContext);
  if (!controller) throw new Error("Calendar drag components require CalendarDragProvider");
  return controller as unknown as CalendarDragController<TEvent, TResourceId>;
}

export interface CalendarDragProviderProps<
  TEvent,
  TResourceId extends CalendarEntityId = string,
> extends PropsWithChildren {
  readonly configuration?: CalendarDragConfiguration;
  readonly messages: CalendarDragMessages<TEvent, TResourceId>;
  readonly onEventChange: (change: CalendarEventChange<TEvent, TResourceId>) => void;
}

export function CalendarDragProvider<TEvent, TResourceId extends CalendarEntityId = string>({
  children,
  configuration = defaultCalendarDragConfiguration,
  messages,
  onEventChange,
}: CalendarDragProviderProps<TEvent, TResourceId>): ReactNode {
  const controller = useMemo(
    () => new CalendarDragController<TEvent, TResourceId>(configuration),
    [configuration],
  );
  controller.configure(messages, onEventChange);

  useEffect(() => () => controller.cancel(), [controller]);

  const sensors = useMemo(
    () => [
      PointerSensor.configure({
        activationConstraints(event) {
          return event.pointerType === "touch"
            ? [
                new PointerActivationConstraints.Delay({
                  value: configuration.pointer.touchDelayMs,
                  tolerance: configuration.pointer.touchTolerance,
                }),
              ]
            : [
                new PointerActivationConstraints.Distance({
                  value: configuration.pointer.mouseDistance,
                }),
              ];
        },
      }),
      KeyboardSensor.configure({
        offset: { x: 1, y: 1 },
        keyboardCodes: {
          start: ["Space", "Enter"],
          cancel: ["Escape"],
          end: ["Space", "Enter", "Tab"],
          up: ["ArrowUp"],
          down: ["ArrowDown"],
          left: ["ArrowLeft"],
          right: ["ArrowRight"],
        },
      }),
    ],
    [configuration.pointer],
  );
  const modifiers = useMemo(
    () => [RestrictToElement.configure({ element: () => controller.surface })],
    [controller],
  );
  const plugins = useMemo(
    () => [
      Accessibility.configure({
        screenReaderInstructions: { draggable: messages.instructions },
        announcements: {
          dragstart: ({ operation }: { readonly operation: InternalAnnouncementOperation }) => {
            const data = operation.source?.data;
            return controller.announcement(
              "started",
              isInternalDragData<TEvent, TResourceId>(data) ? data.source : null,
            );
          },
          dragmove: (event: InternalDragMoveEvent) => controller.movedAnnouncement(event),
          dragend: ({
            operation,
            canceled,
          }: {
            readonly operation: InternalAnnouncementOperation;
            readonly canceled: boolean;
          }) => {
            const data = operation.source?.data;
            return controller.announcement(
              canceled ? "canceled" : "completed",
              isInternalDragData<TEvent, TResourceId>(data) ? data.source : null,
            );
          },
        },
      }),
      Cursor,
      Feedback,
      PreventSelection,
    ],
    [controller, messages.instructions],
  );

  return (
    <CalendarDragContext.Provider
      value={controller as unknown as CalendarDragController<unknown, CalendarEntityId>}
    >
      <DragDropProvider<InternalDragData<TEvent, TResourceId>>
        sensors={sensors}
        modifiers={modifiers}
        plugins={plugins}
        onDragStart={({ operation, nativeEvent }) => {
          const data = operation.source?.data;
          if (!isInternalDragData<TEvent, TResourceId>(data)) return;
          controller.start(
            data.source,
            inputFromEvent(nativeEvent ?? operation.activatorEvent),
            operation.position.initial,
          );
        }}
        onDragMove={(event) => controller.move(event)}
        onDragEnd={({ canceled }) => controller.finish(canceled)}
      >
        {children}
      </DragDropProvider>
    </CalendarDragContext.Provider>
  );
}

export interface CalendarDraggableProps<TEvent, TResourceId extends CalendarEntityId = string> {
  readonly eventId: CalendarEntityId;
  readonly title: string;
  readonly event: TEvent;
  readonly placement: CalendarEventPlacement<TResourceId>;
  readonly sourceView: string;
  readonly children: (props: CalendarDraggableRenderProps) => ReactNode;
}

export function CalendarDraggable<TEvent, TResourceId extends CalendarEntityId = string>({
  eventId,
  title,
  event,
  placement,
  sourceView,
  children,
}: CalendarDraggableProps<TEvent, TResourceId>): ReactNode {
  const source = useMemo<CalendarDragSource<TEvent, TResourceId>>(
    () => ({ eventId, title, event, placement, sourceView }),
    [eventId, title, event, placement, sourceView],
  );
  const { ref, handleRef } = useDraggable<InternalDragData<TEvent, TResourceId>>({
    id: eventId,
    data: { kind: "calendar-event", source },
    plugins: [Feedback.configure({ feedback: "clone" })],
  });

  return children({ ref, handleRef });
}

export interface CalendarViewRegionProps<
  TResourceId extends CalendarEntityId = string,
> extends PropsWithChildren {
  readonly id: CalendarEntityId;
  readonly geometry: CalendarViewRegionDefinition<TResourceId>;
  readonly className?: string;
}

export function CalendarViewRegion<TResourceId extends CalendarEntityId = string>({
  id,
  geometry,
  className,
  children,
}: CalendarViewRegionProps<TResourceId>): ReactNode {
  const controller = useCalendarDragController<unknown, TResourceId>();
  const { ref } = useDroppable({ id, data: { kind: "calendar-view-region" } });
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const attach = useCallback(
    (element: Element | null) => {
      ref(element);
      controller.attachRegion(element instanceof HTMLElement ? element : null, geometryRef.current);
    },
    [controller, ref],
  );

  return (
    <div ref={attach} className={className} data-calendar-view-region={String(id)}>
      {children}
    </div>
  );
}

export interface CalendarDragOverlayProps<TEvent, TResourceId extends CalendarEntityId = string> {
  readonly children: CalendarDragOverlayRenderer<TEvent, TResourceId>;
}

export function CalendarDragOverlay<TEvent, TResourceId extends CalendarEntityId = string>({
  children,
}: CalendarDragOverlayProps<TEvent, TResourceId>): ReactNode {
  return (
    <DragOverlay<
      InternalDragData<TEvent, TResourceId>,
      DndDraggable<InternalDragData<TEvent, TResourceId>>
    >>
      {(draggable) => {
        const data = draggable.data;
        if (!isInternalDragData<TEvent, TResourceId>(data)) return null;
        return <div data-calendar-drag-overlay>{children({ source: data.source })}</div>;
      }}
    </DragOverlay>
  );
}
