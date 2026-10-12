// #region loading
// The first visit's fallback. Later navigations keep the calendar on screen instead.
export default function Loading() {
  return (
    <div className="flex h-full flex-col" role="status">
      <span className="sr-only">Loading calendar</span>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <span className="h-8 w-20 rounded-full bg-fd-muted" />
        <span className="h-5 w-40 rounded-md bg-fd-muted" />
      </div>
      <div className="flex-1 bg-[linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] bg-size-[100%_3rem]" />
    </div>
  );
}
// #endregion loading
