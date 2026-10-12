import PlaygroundIsland from "./island";

/**
 * Editable ICS text and what `parseIcs` makes of it, parsed in the browser as you type. The frame
 * is sized on the server, so the playground loading into it never shifts the page. It stacks the
 * two panes when the docs column is narrow.
 */
export function IcsPlayground() {
  return (
    <figure className="not-prose @container my-6">
      <div className="h-[46rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm @2xl:h-[36rem]">
        <PlaygroundIsland />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        Live, in your browser. Edit the text and the issues and result follow; select a line number
        to find it.
      </figcaption>
    </figure>
  );
}
