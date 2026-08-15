import IntervalTree, { IntervalBase } from "@flatten-js/interval-tree";

export interface IntervalIndexEntry<TValue> {
  readonly end: bigint;
  readonly order: number;
  readonly start: bigint;
  readonly value: TValue;
}

export interface IntervalIndex<TValue> {
  readonly size: number;
  query(start: bigint, end: bigint): readonly TValue[];
}

interface StoredEntry<TValue> extends IntervalIndexEntry<TValue> {}

function assertNonEmptyInterval(start: bigint, end: bigint): void {
  if (start >= end) {
    throw new RangeError("start-not-before-end");
  }
}

class BigIntInterval extends IntervalBase {
  declare high: bigint;
  declare low: bigint;

  constructor(low: bigint, high: bigint) {
    super(low, high);
  }

  clone(): BigIntInterval {
    return new BigIntInterval(this.low as bigint, this.high as bigint);
  }

  // The tree invokes merge on a key clone while recalculating subtree maxima.
  // Mutating that private clone avoids allocating another interval per ancestor.
  merge(other: IntervalBase): BigIntInterval {
    const otherLow = other.low as bigint;
    const otherHigh = other.high as bigint;
    if (otherLow < this.low) this.low = otherLow;
    if (otherHigh > this.high) this.high = otherHigh;
    return this;
  }
}

function treeInterval(start: bigint, end: bigint): BigIntInterval {
  return new BigIntInterval(start, end);
}

class FlattenIntervalIndex<TValue> implements IntervalIndex<TValue> {
  readonly #tree = new IntervalTree<StoredEntry<TValue>>();

  constructor(entries: readonly IntervalIndexEntry<TValue>[]) {
    for (const entry of entries) {
      assertNonEmptyInterval(entry.start, entry.end);
      this.#tree.insert(treeInterval(entry.start, entry.end), entry);
    }
  }

  get size(): number {
    return this.#tree.size;
  }

  query(start: bigint, end: bigint): readonly TValue[] {
    assertNonEmptyInterval(start, end);
    const candidates = this.#tree.search(treeInterval(start, end)) as StoredEntry<TValue>[];

    // The dependency searches closed intervals. The final filter restores Time's
    // [start, end) contract, and the sort preserves immutable input order.
    return candidates
      .filter((entry) => entry.start < end && entry.end > start)
      .sort((left, right) => left.order - right.order)
      .map((entry) => entry.value);
  }
}

export function createIntervalIndex<TValue>(
  entries: readonly IntervalIndexEntry<TValue>[],
): IntervalIndex<TValue> {
  return new FlattenIntervalIndex(entries);
}
