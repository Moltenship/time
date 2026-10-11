import type { ResourceAvailability } from "./availability/types";
import type { ResourceId } from "./ids";

export interface CalendarResource<TData = unknown, TResourceId extends ResourceId = string> {
  /** When the resource can be booked; the calendar's `availability` by default. */
  readonly availability?: ResourceAvailability;
  readonly data: TData;
  readonly id: TResourceId;
  readonly parentId?: TResourceId;
  /**
   * The IANA time zone the resource keeps, such as a person's home zone. Its hours follow it, and
   * views show its local time; events still show in the display time zone.
   */
  readonly timeZone?: string;
  readonly title: string;
}
