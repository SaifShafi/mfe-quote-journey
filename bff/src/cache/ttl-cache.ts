/**
 * A cache with exactly one feature: entries expire. No LRU, no size limit, no
 * persistence across a restart. That is the right amount of cache for one
 * process holding one aggregated response per session, and anything more is
 * solving a scaling problem this BFF does not have yet.
 *
 * In-memory also means the cache does not survive a restart or scale past one
 * instance, which is the honest cost of not reaching for Redis here. Written
 * down because the next stage that needs a second BFF instance will hit it.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>()

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  /** Drops a key early. Used after a mutation that invalidates the cached read. */
  delete(key: string): void {
    this.store.delete(key)
  }

  get size(): number {
    return this.store.size
  }
}
