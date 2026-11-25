export interface SolidExampleProps {
  /** An example of `content/examples/solid/live`: `agenda` is `agenda.example.tsx`. */
  readonly name: string;
  /** The frame's accessible name, such as "The agenda, running". */
  readonly title: string;
  /** Tailwind classes for the frame's size; replaces the default height. */
  readonly size?: string;
  /** The line under the frame. */
  readonly caption?: string;
}

/** Where the docs site serves the example, from the build of `content/examples/solid/live`. */
export function solidExampleUrl(name: string): string {
  return `/examples/solid/index.html?example=${encodeURIComponent(name)}`;
}

/**
 * A sample of Solid's docs, running. This site renders React, so the sample runs in a page of its
 * own, built by `node --run examples`, inside the frame the React previews use. The frame has its
 * size before the example loads, so the page around it doesn't move, and the example takes the
 * site's theme from this page (`content/examples/solid/live/index.html`).
 */
export function SolidExample({
  caption = "Live.",
  name,
  size = "h-[30rem]",
  title,
}: SolidExampleProps) {
  return (
    <figure className="not-prose my-6">
      <div
        className={`overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm ${size}`}
      >
        <iframe
          className="block size-full border-0"
          loading="lazy"
          src={solidExampleUrl(name)}
          title={title}
        />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
