export class ReadonlyMapView<TKey, TValue> implements ReadonlyMap<TKey, TValue> {
  readonly #map: ReadonlyMap<TKey, TValue>;

  constructor(map: ReadonlyMap<TKey, TValue>) {
    this.#map = map;
    Object.freeze(this);
  }

  get size(): number {
    return this.#map.size;
  }

  [Symbol.iterator](): MapIterator<[TKey, TValue]> {
    return this.#map[Symbol.iterator]();
  }

  entries(): MapIterator<[TKey, TValue]> {
    return this.#map.entries();
  }

  forEach(
    callback: (value: TValue, key: TKey, map: ReadonlyMap<TKey, TValue>) => void,
    thisArgument?: unknown,
  ): void {
    for (const [key, value] of this.#map) {
      callback.call(thisArgument, value, key, this);
    }
  }

  get(key: TKey): TValue | undefined {
    return this.#map.get(key);
  }

  has(key: TKey): boolean {
    return this.#map.has(key);
  }

  keys(): MapIterator<TKey> {
    return this.#map.keys();
  }

  values(): MapIterator<TValue> {
    return this.#map.values();
  }
}
