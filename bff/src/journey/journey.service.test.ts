import { describe, expect, it, vi } from 'vitest'
import type { AccountService } from '../downstream/account.service'
import type { VehicleService } from '../downstream/vehicle.service'
import { JourneyService } from './journey.service'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fakeDownstream() {
  const vehicle = {
    fetchVehicle: vi.fn(async () => {
      await delay(30)
      return { registration: 'AB12 CDE', year: '2019', mileage: '8000' }
    }),
  } as unknown as VehicleService

  const account = {
    fetchPolicy: vi.fn(async () => {
      await delay(40)
      return {
        reference: 'QJ-4417-02',
        cover: 'Comprehensive',
        renewal: '14 March 2027',
        excess: '250',
      }
    }),
  } as unknown as AccountService

  return { vehicle, account }
}

describe('JourneyService', () => {
  it('aggregates both downstream records under their own keys', async () => {
    const { vehicle, account } = fakeDownstream()
    const journey = new JourneyService(vehicle, account)

    const { data } = await journey.getJourney('demo-user')

    expect(data.vehicle.registration).toBe('AB12 CDE')
    expect(data.policy.reference).toBe('QJ-4417-02')
  })

  it('reports a cache miss on the first call and a hit on the second', async () => {
    const { vehicle, account } = fakeDownstream()
    const journey = new JourneyService(vehicle, account)

    const first = await journey.getJourney('demo-user')
    const second = await journey.getJourney('demo-user')

    expect(first.cache).toBe('MISS')
    expect(second.cache).toBe('HIT')
  })

  it('does not call either downstream service again on a cache hit', async () => {
    const { vehicle, account } = fakeDownstream()
    const journey = new JourneyService(vehicle, account)

    await journey.getJourney('demo-user')
    await journey.getJourney('demo-user')

    expect(vehicle.fetchVehicle).toHaveBeenCalledTimes(1)
    expect(account.fetchPolicy).toHaveBeenCalledTimes(1)
  })

  it('keeps the cache separate per subject', async () => {
    const { vehicle, account } = fakeDownstream()
    const journey = new JourneyService(vehicle, account)

    await journey.getJourney('user-a')
    const result = await journey.getJourney('user-b')

    expect(result.cache).toBe('MISS')
    expect(vehicle.fetchVehicle).toHaveBeenCalledTimes(2)
  })

  // The reason the aggregator calls Promise.all and not two awaits: fetching
  // sequentially would cost 30ms + 40ms per request on the server, which is
  // exactly the per-remote-round-trip cost this stage exists to remove, just
  // moved from the browser to the BFF instead of eliminated.
  it('fetches both downstream services concurrently, not sequentially', async () => {
    const { vehicle, account } = fakeDownstream()
    const journey = new JourneyService(vehicle, account)

    const started = Date.now()
    await journey.getJourney('demo-user')
    const elapsed = Date.now() - started

    // Sequential would be >= 70ms (30 + 40). Concurrent is close to 40ms, the
    // slower of the two. The margin allows for test-runner scheduling jitter.
    expect(elapsed).toBeLessThan(65)
  })

  it('refetches once the cached entry has expired', async () => {
    vi.useFakeTimers()
    const { vehicle, account } = fakeDownstream()
    const journey = new JourneyService(vehicle, account)

    // advanceTimersByTimeAsync both advances the clock and flushes the
    // microtask queue in a loop, which is what lets the fakes' own
    // setTimeout-based delay() resolve while time is frozen.
    const first = journey.getJourney('demo-user')
    await vi.advanceTimersByTimeAsync(40)
    await first

    await vi.advanceTimersByTimeAsync(5000)

    const second = journey.getJourney('demo-user')
    await vi.advanceTimersByTimeAsync(40)
    const result = await second

    expect(result.cache).toBe('MISS')
    expect(vehicle.fetchVehicle).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
