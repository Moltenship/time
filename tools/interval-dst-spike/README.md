# Interval index and native Temporal spike

This private workspace is disposable evidence for issue #16. It is not a
production package and must not become an alternate package topology.

The interval candidate is hidden behind `IntervalIndex`; its closed-range
search results are filtered to preserve Time's half-open semantics. The scan
implementation is the correctness oracle and benchmark reference.

The DST prototype imports no polyfill. Its committed evidence was recorded on
the earlier Vite+ Node.js 24 runtime, where native V8 Temporal was absent by
default and available only with the `--harmony-temporal` flag. The production
repository now targets Node.js 26+ and verifies unflagged Temporal separately;
this historical spike is not that runtime evidence.

From the repository root:

```sh
vp run @moltenship/interval-dst-spike#test
vp run @moltenship/interval-dst-spike#fixtures
vp run --no-cache @moltenship/interval-dst-spike#benchmark
vp run @moltenship/interval-dst-spike#build
```
