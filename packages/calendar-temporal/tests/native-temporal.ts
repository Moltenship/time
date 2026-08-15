import type { Temporal } from "../src/index.ts";

interface NativeTemporalNamespace {
  readonly Instant: {
    from(value: Temporal.InstantLike): Temporal.Instant;
    fromEpochMilliseconds(value: number): Temporal.Instant;
  };
  readonly PlainDate: {
    from(value: Temporal.PlainDateLike): Temporal.PlainDate;
  };
  readonly PlainDateTime: {
    from(value: Temporal.PlainDateTimeLike): Temporal.PlainDateTime;
  };
  readonly PlainTime: {
    from(value: Temporal.PlainTimeLike): Temporal.PlainTime;
  };
}

export const NativeTemporal = (
  globalThis as typeof globalThis & { readonly Temporal: NativeTemporalNamespace }
).Temporal;
