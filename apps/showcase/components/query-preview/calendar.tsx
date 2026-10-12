import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";

import { createFakeEventsApi } from "@/content/examples/query-api";
import { EventsCalendar } from "@/content/examples/query-calendar";

import { Checkbox } from "@registry/ui/checkbox";
import { TooltipProvider } from "@registry/ui/tooltip";

import { createSampleEvents } from "./events";

/** How long the pretend server takes, so loading and saving show. */
export const PREVIEW_LATENCY_MS = 700;

/**
 * The guide's calendar over a pretend server in the visitor's time zone, with a switch that makes
 * its requests fail.
 */
export default function QueryPreviewCalendar({
  latency = PREVIEW_LATENCY_MS,
}: {
  readonly latency?: number;
}) {
  const failId = useId();
  const [failing, setFailing] = useState(false);
  // Read by the server as each request starts, so a switch only affects requests after it.
  const failingRef = useRef(false);
  const [timeZone] = useState(() => Temporal.Now.timeZoneId());
  const [api] = useState(() =>
    createFakeEventsApi(createSampleEvents(Temporal.Now.plainDateISO(timeZone), timeZone), {
      latency,
      shouldFail: () => failingRef.current,
    }),
  );
  // One client per preview; a failed load is tried once more before it shows an error.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 300 } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={400}>
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <EventsCalendar api={api} timeZone={timeZone} />
          </div>
          <div className="flex min-h-12 shrink-0 items-center gap-3 border-t px-4 py-2 text-sm">
            <Checkbox
              checked={failing}
              id={failId}
              onCheckedChange={(checked) => {
                failingRef.current = checked;
                setFailing(checked);
              }}
            />
            <label className="font-medium" htmlFor={failId}>
              Make requests fail
            </label>
            <span className="text-muted-foreground max-sm:hidden">
              Then move an event, or go to another month.
            </span>
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
