# ADR 0004: Native Temporal runtime boundary

- Status: Accepted
- Date: 2026-08-15

## Context

Calendar arithmetic needs explicit instants, local dates, local date-times, time zones, and DST
disambiguation. Legacy date objects collapse these distinctions. The current TypeScript library does
not yet ship ambient declarations for the runtime Temporal global.

## Decision

Public time contracts use native Temporal types exclusively. Production code reads `globalThis.Temporal`
only at the clock and type-specific comparison boundaries. It does not feature-detect, mutate the
global, accept legacy date objects, or bundle a fallback.

Node.js support starts at 26, where the production and test suites use the unflagged native
`globalThis.Temporal` implementation. Browser and SSR consumers outside that runtime floor remain
responsible for meeting the same native-global contract before importing the calendar.

Pin `temporal-spec@1.0.1` as declaration-only infrastructure. Its JavaScript entry points are empty;
the package supplies the standards-aligned namespace used in emitted declarations and never installs
or executes a Temporal implementation. Applications remain responsible for providing native
Temporal or installing a global polyfill before loading the calendar.

## Consequences

The public model preserves temporal meaning and avoids two runtime implementations in an application.
Unsupported runtimes fail at the first operation that needs the missing global, and consumers of the
declarations can resolve the exact type package transitively.

## Reversal trigger

Remove `temporal-spec` when TypeScript ships compatible native Temporal declarations. Revisit the
runtime policy only if the supported-runtime matrix cannot provide Temporal and product adoption
evidence outweighs the bundle and semantic cost of a library-owned fallback.
