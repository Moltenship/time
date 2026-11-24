# ADR 0005: One-way package dependency law

- Status: Accepted, amended by [ADR 0275](./0275-ui-sdk-primitives.md). The law stands. 2.0 adds a
  primitives plane between the engine and the framework integrations, and rules for it, for ui-sdk
  and for Solid (`architecture.md` §2); the engine stays free of every framework and of ui-sdk.
- Date: 2026-08-15

## Context

The system has engine, framework integration, optional interaction, consumer-owned presentation,
and verification planes. Deep imports or upward dependencies would make implementation details part
of the public API and pull browser concerns into deterministic code.

## Decision

Workspace imports follow the direction documented in `docs/internal/package-topology.md` and use intentional
package entry points only. Temporal and core packages remain free of React, Jotai, dnd-kit, DOM, and
Tailwind contracts. Framework and application packages may depend downward; engine packages never
depend upward. Automated boundary checks include a deliberately invalid deep-import fixture that
must fail for the expected rules.

## Consequences

Core contracts compile with an ES-only library surface, optional integrations remain removable, and
package internals can change without consumer breakage. New cross-package APIs require an explicit
public export and manifest dependency rather than a convenient source import.

## Reversal trigger

Revisit a single edge only when a concrete feature cannot be expressed through the lower plane's
semantic contract and an alternative package split has been benchmarked and documented. Never waive
the law for test convenience.
