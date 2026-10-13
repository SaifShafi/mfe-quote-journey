import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TtlCache } from './ttl-cache'

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns what was set before the ttl elapses', () => {
    const cache = new TtlCache<string>(1000)
    cache.set('a', 'value')
    expect(cache.get('a')).toBe('value')
  })

  it('expires an entry once its ttl has elapsed', () => {
    const cache = new TtlCache<string>(1000)
    cache.set('a', 'value')
    vi.advanceTimersByTime(1000)
    expect(cache.get('a')).toBeUndefined()
  })

  it('removes the expired entry from storage rather than just hiding it', () => {
    const cache = new TtlCache<string>(1000)
    cache.set('a', 'value')
    vi.advanceTimersByTime(1000)
    cache.get('a')
    expect(cache.size).toBe(0)
  })

  it('keeps keys independent', () => {
    const cache = new TtlCache<string>(1000)
    cache.set('a', 'one')
    vi.advanceTimersByTime(500)
    cache.set('b', 'two')
    vi.advanceTimersByTime(600)
    // 'a' is 1100ms old and expired; 'b' is 600ms old and is not.
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe('two')
  })

  it('lets a key be dropped early', () => {
    const cache = new TtlCache<string>(1000)
    cache.set('a', 'value')
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
  })
})
