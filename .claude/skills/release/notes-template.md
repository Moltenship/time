<!--
The shape of a GitHub release's notes, for /release (SKILL.md, step 5). Keep the sections that
have something in them and drop the rest; keep their order. Replace every <…>.
-->

<One to three sentences: what this release is and who should upgrade. For a release candidate,
what it's a candidate for, and that the API can still change before it. For a stable release,
the line from the last one.>

## Highlights

- **<What a user can do now, in their words.>** <One or two sentences: the API or registry item,
  in code, and when to reach for it. Link the guide on https://time.molten.sh/docs when there is
  one.> (#<PR>)

## Breaking changes

- **<What breaks, from the user's side.>** <Why, in a sentence.> (#<PR>)

  Migrate:

  ```ts
  // Before
  <old code>
  // After
  <new code>
  ```

## Features

### `@moltenship/<package>`

- <A feature, as one sentence.> (#<PR>)

## Fixes

### `@moltenship/<package>`

- <What was wrong, and what happens now.> (#<PR>)

## Performance

- <What's faster or smaller, with the number when the PR has one.> (#<PR>)

## Registry

- <Changes to the shadcn registry's source, which apps own after `shadcn add`: say what to add
  again, or what to change by hand.> (#<PR>)

## Contributors

<@login>, <@login> and <Co-author name>.

**Full changelog:** https://github.com/Moltenship/time/compare/<previous tag>...v<version>
