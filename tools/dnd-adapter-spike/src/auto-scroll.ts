import type { CalendarAutoScrollConfiguration } from "./contracts";
import type { CalendarPoint } from "./geometry";

export interface AnimationFrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

const browserScheduler: AnimationFrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

function axisVelocity(
  coordinate: number,
  start: number,
  end: number,
  configuration: CalendarAutoScrollConfiguration,
): number {
  const { edgeThreshold, maximumPixelsPerFrame } = configuration;

  if (coordinate < start + edgeThreshold) {
    const intensity = Math.min(1, (start + edgeThreshold - coordinate) / edgeThreshold);
    return -maximumPixelsPerFrame * intensity;
  }
  if (coordinate > end - edgeThreshold) {
    const intensity = Math.min(1, (coordinate - (end - edgeThreshold)) / edgeThreshold);
    return maximumPixelsPerFrame * intensity;
  }
  return 0;
}

/** Adapter-local rAF scroller: pointer bursts collapse to one DOM read per frame. */
export class CalendarRafAutoScroller {
  #frame: number | null = null;
  #latestPoint: CalendarPoint | null = null;
  readonly #getSurface: () => HTMLElement | null;
  readonly #configuration: CalendarAutoScrollConfiguration;
  readonly #scheduler: AnimationFrameScheduler;

  constructor(
    getSurface: () => HTMLElement | null,
    configuration: CalendarAutoScrollConfiguration,
    scheduler: AnimationFrameScheduler = browserScheduler,
  ) {
    this.#getSurface = getSurface;
    this.#configuration = configuration;
    this.#scheduler = scheduler;
  }

  update(point: CalendarPoint): void {
    this.#latestPoint = point;
    if (this.#frame !== null) return;
    this.#frame = this.#scheduler.request(() => this.#flush());
  }

  cancel(): void {
    if (this.#frame !== null) {
      this.#scheduler.cancel(this.#frame);
    }
    this.#frame = null;
    this.#latestPoint = null;
  }

  #flush(): void {
    this.#frame = null;
    const point = this.#latestPoint;
    const surface = this.#getSurface();
    if (!point || !surface) return;

    const rectangle = surface.getBoundingClientRect();
    const x = axisVelocity(point.x, rectangle.left, rectangle.right, this.#configuration);
    const y = axisVelocity(point.y, rectangle.top, rectangle.bottom, this.#configuration);

    if (x !== 0 || y !== 0) {
      surface.scrollBy({ left: x, top: y, behavior: "auto" });
      this.#frame = this.#scheduler.request(() => this.#flush());
    }
  }
}
