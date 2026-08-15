# ADR 0004: Native Temporal runtime boundary

- Status: Accepted
- Date: 2026-08-15

## Context

Calendar arithmetic needs explicit instants, local dates, local date-times, time zones, and DST
disambiguation. Legacy date objects collapse these distinctions. The current TypeScript standard
library ships the ambient Temporal declarations in `ESNext`, and the supported Node.js runtime
provides the corresponding native global.

## Decision

Public time contracts use native Temporal types exclusively. Production code reads `globalThis.Temporal`
only at the clock and type-specific comparison boundaries. It does not feature-detect, mutate the
global, accept legacy date objects, or bundle a fallback.

Node.js support starts at 26, where the production and test suites use the unflagged native
`globalThis.Temporal` implementation. Browser and SSR consumers outside that runtime floor remain
responsible for meeting the same native-global contract before importing the calendar.

The project and its consumers compile with current TypeScript and `compilerOptions.lib` set to
`ESNext`. Production code and public declarations use the ambient `Temporal.*` namespace directly.
The calendar does not depend on a declaration package or re-export the platform's Temporal
namespace. Applications remain responsible for providing native Temporal or installing a global
polyfill before loading the calendar.

## Consequences

The public model preserves temporal meaning and avoids two runtime implementations in an application.
Unsupported runtimes fail at the first operation that needs the missing global, and consumers of the
declarations opt into the same modern standard-library surface as the calendar. The Temporal utility
package has no production dependencies.

## Reversal trigger

Revisit the current-compiler policy if it prevents supported consumer adoption.
Revisit the runtime policy only if the supported-runtime matrix cannot provide Temporal and product
adoption evidence outweighs the bundle and semantic cost of a library-owned fallback.
