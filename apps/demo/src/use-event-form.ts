import { useState, type FormEvent } from "react";

import { intervalFromDraft, type EventDraft } from "./event-draft";
import { submitEventDraft, type EventFormOptions } from "./event-form";

/** The event editor's draft, and what saving it does; each UI draws the fields. */
export function useEventForm(options: EventFormOptions) {
  const { initial, timeZone } = options;
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const update = (next: Partial<EventDraft>) => setDraft((current) => ({ ...current, ...next }));
  const interval = intervalFromDraft(draft, timeZone);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(await submitEventDraft(options, draft, setSaving));
  }

  return { draft, error, interval, saving, setDraft, submit, update };
}
