# ADR 0001: Hybrid package and source distribution

- Status: Accepted, amended by [ADR 0275](./0275-ui-sdk-primitives.md). The split stands. 2.0 adds
  a SolidJS integration beside the React one; the registry's source is still React, and how Solid
  presentation source is distributed isn't decided.
- Date: 2026-08-15

## Context

Calendar consumers need stable scheduling algorithms and types, but they also need to own the
presentation source that carries product-specific styling and composition.

## Decision

Publish versioned, headless engine and integration packages to npm. Distribute editable React
presentation through a shadcn-compatible registry. `@moltenship/calendar` is the supported npm
facade; registry items depend on public package entry points and never on package source trees.

## Consequences

Algorithms and public contracts receive normal semantic-versioning guarantees while consumers can
edit presentation without forking the engine. Releases must verify both npm artifacts and registry
compatibility, and compatible package versions must be recorded by registry items.

## Reversal trigger

Revisit this split if registry installation cannot preserve upgrades and dependency provenance, or
if consumer research shows that editable presentation source is not materially used.
