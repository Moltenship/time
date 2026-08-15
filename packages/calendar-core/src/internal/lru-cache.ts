export interface LruCacheStatistics {
  readonly capacity: number;
  readonly evictions: number;
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}

export class BoundedLruCache<TValue> {
  readonly #capacity: number;
  readonly #values = new Map<string, TValue>();
  #evictions = 0;
  #hits = 0;
  #misses = 0;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 0) {
      throw new RangeError("query-cache-size-must-be-a-non-negative-safe-integer");
    }
    this.#capacity = capacity;
  }

  get(key: string): TValue | undefined {
    const value = this.#values.get(key);
    if (value === undefined) {
      this.#misses += 1;
      return undefined;
    }

    this.#hits += 1;
    this.#values.delete(key);
    this.#values.set(key, value);
    return value;
  }

  set(key: string, value: TValue): void {
    if (this.#capacity === 0) return;

    this.#values.delete(key);
    this.#values.set(key, value);
    if (this.#values.size <= this.#capacity) return;

    const oldestKey = this.#values.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      this.#values.delete(oldestKey);
      this.#evictions += 1;
    }
  }

  statistics(): LruCacheStatistics {
    return Object.freeze({
      capacity: this.#capacity,
      evictions: this.#evictions,
      hits: this.#hits,
      misses: this.#misses,
      size: this.#values.size,
    });
  }
}
