import { describe, expect, test } from "vite-plus/test";

import { releaseNotes, releaseTag } from "../src/github-release";

describe("the GitHub release", () => {
  test("is tagged v<version>", () => {
    expect(releaseTag("1.0.0-rc.1")).toBe("v1.0.0-rc.1");
  });

  test("notes put each paragraph and list item on one line, since GitHub shows line breaks", () => {
    const section = `The first release, wrapped at
a hundred characters.

- An item that
  goes on, with \`code
  across lines\`.
  - A nested item
    that wraps.
- Another item.
1. A numbered item
   that wraps.

### A heading
A paragraph under it.

\`\`\`sh
vp run release:publish
  --version 1.0.0
\`\`\`
After the fence.
`;

    expect(releaseNotes(section)).toBe(`The first release, wrapped at a hundred characters.

- An item that goes on, with \`code across lines\`.
  - A nested item that wraps.
- Another item.
1. A numbered item that wraps.

### A heading
A paragraph under it.

\`\`\`sh
vp run release:publish
  --version 1.0.0
\`\`\`
After the fence.
`);
  });
});
