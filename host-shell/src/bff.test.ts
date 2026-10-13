import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VEHICLE = { registration: 'AB12 CDE', year: '2019', mileage: '8000' }
const POLICY = { reference: 'QJ-4417-02', cover: 'Comprehensive', renewal: '14 March 2027', excess: '250' }
const JOURNEY = { vehicle: VEHICLE, policy: POLICY }

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 401, json: async () => body } as Response
}

/**
 * bff.ts reads BFF_MODE and LAZY_MODE from process.env once, at import time
 * (see the module itself for why: process.env rather than a bare webpack
 * global, specifically so this file can do exactly this). Each test that
 * needs a different mode sets the env var and re-imports with
 * vi.resetModules(), which also resets the module's own session and
 * eager-journey memoisation, since that state lives in the fresh module
 * instance the re-import creates.
 */
async function importBff() {
  vi.resetModules()
  return import('./bff')
}

describe('bff.ts', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.BFF_MODE
    delete process.env.LAZY_MODE
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('lazy mode (the default)', () => {
    it('fetches only the vehicle resource for fetchVehicle', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' })) // /auth/session
        .mockResolvedValueOnce(jsonResponse(VEHICLE)) // /downstream/vehicle

      const { fetchVehicle } = await importBff()
      const result = await fetchVehicle()

      expect(result).toEqual(VEHICLE)
      const urls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(urls).toEqual([
        'http://localhost:4000/auth/session',
        'http://localhost:4000/downstream/vehicle',
      ])
    })

    it('shares one session between fetchVehicle and fetchPolicy', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' })) // one session
        .mockResolvedValueOnce(jsonResponse(VEHICLE))
        .mockResolvedValueOnce(jsonResponse(POLICY))

      const { fetchVehicle, fetchPolicy } = await importBff()
      await Promise.all([fetchVehicle(), fetchPolicy()])

      const sessionCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).endsWith('/auth/session'),
      )
      expect(sessionCalls).toHaveLength(1)
    })

    it('retries once after a refresh if the first attempt fails', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'stale' })) // session
        .mockResolvedValueOnce(jsonResponse(null, false)) // vehicle fails
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh' })) // refresh
        .mockResolvedValueOnce(jsonResponse(VEHICLE)) // vehicle retry

      const { fetchVehicle } = await importBff()
      const result = await fetchVehicle()

      expect(result).toEqual(VEHICLE)
      const urls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(urls).toEqual([
        'http://localhost:4000/auth/session',
        'http://localhost:4000/downstream/vehicle',
        'http://localhost:4000/auth/refresh',
        'http://localhost:4000/downstream/vehicle',
      ])
    })

    it('propagates a second, post-refresh failure rather than retrying forever', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'stale' }))
        .mockResolvedValueOnce(jsonResponse(null, false))
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh' }))
        .mockResolvedValueOnce(jsonResponse(null, false))

      const { fetchVehicle } = await importBff()
      await expect(fetchVehicle()).rejects.toThrow()
      expect(fetchMock).toHaveBeenCalledTimes(4)
    })
  })

  describe('eager mode', () => {
    beforeEach(() => {
      process.env.LAZY_MODE = 'eager'
    })

    it('fetches the aggregated journey, not the per-resource endpoint', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' }))
        .mockResolvedValueOnce(jsonResponse(JOURNEY))

      const { fetchVehicle } = await importBff()
      const result = await fetchVehicle()

      expect(result).toEqual(VEHICLE)
      const urls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(urls).toEqual([
        'http://localhost:4000/auth/session',
        'http://localhost:4000/journey',
      ])
    })

    // The whole point of 'eager': asking for just the vehicle still costs
    // the account service too, because one call fetches both.
    it('makes fetchVehicle and fetchPolicy share one journey call', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' }))
        .mockResolvedValueOnce(jsonResponse(JOURNEY))

      const { fetchVehicle, fetchPolicy } = await importBff()
      const [vehicle, policy] = await Promise.all([fetchVehicle(), fetchPolicy()])

      expect(vehicle).toEqual(VEHICLE)
      expect(policy).toEqual(POLICY)
      const journeyCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).endsWith('/journey'),
      )
      expect(journeyCalls).toHaveLength(1)
    })

    it('respects BFF_MODE=split, calling both downstream endpoints instead of /journey', async () => {
      process.env.BFF_MODE = 'split'
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' }))
        .mockResolvedValueOnce(jsonResponse(VEHICLE))
        .mockResolvedValueOnce(jsonResponse(POLICY))

      const { fetchVehicle } = await importBff()
      const result = await fetchVehicle()

      expect(result).toEqual(VEHICLE)
      const urls = fetchMock.mock.calls.map((c) => String(c[0])).sort()
      expect(urls).toEqual(
        [
          'http://localhost:4000/auth/session',
          'http://localhost:4000/downstream/account',
          'http://localhost:4000/downstream/vehicle',
        ].sort(),
      )
    })
  })
})
