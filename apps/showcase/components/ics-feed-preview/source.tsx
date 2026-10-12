import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { Fragment } from "react";

import { currentPreviewFeed } from "./feed";

/** The ICS text the preview parsed, in the docs' code block. */
export default function IcsFeedSource() {
  const lines = currentPreviewFeed().trimEnd().split("\r\n");
  return (
    <CodeBlock className="my-0" title="team.ics">
      <Pre>
        <code>
          {lines.map((line, index) => (
            // Fumadocs pads and highlights code by line, as it does for highlighted blocks.
            <Fragment key={index}>
              <span className="line">{line}</span>
              {index < lines.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </code>
      </Pre>
    </CodeBlock>
  );
}
