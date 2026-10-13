export interface Vehicle {
  registration: string
  year: string
  mileage: string
}

export interface Policy {
  reference: string
  cover: string
  renewal: string
  excess: string
}

interface JourneyData {
  vehicle: Vehicle
  policy: Policy
}

const BFF_ORIGIN = 'http://localhost:4000'

/**
 * Both switches are read from process.env rather than a bare DefinePlugin
 * global, specifically so this file can be imported under Vitest (bff.test.ts)
 * without a ReferenceError: process.env.X on an undefined key is just
 * undefined, a bare undeclared identifier throws. Webpack's DefinePlugin
 * still inlines these as string literals at build time, same as always; the
 * difference only matters to whatever imports this file without webpack.
 *
 * BFF_MODE, Stage 1's pattern: 'aggregated' calls /journey once. 'split'
 * calls the two downstream endpoints directly. See scripts/measure-bff.mjs.
 * It only has an effect when LAZY_MODE is 'eager'; see below.
 *
 * LAZY_MODE, Stage 4's: 'lazy' (the real configuration) fetches each route's
 * resource independently, only once that route is actually visited. 'eager'
 * reproduces Stage 2/3's original behaviour, where the first route visited
 * waits on BOTH resources because one aggregated call fetched both before
 * either route could render. scripts/measure-lazy.mjs rebuilds the host in
 * both to measure the difference.
 */
const BFF_MODE: 'aggregated' | 'split' = process.env.BFF_MODE === 'split' ? 'split' : 'aggregated'
const LAZY_MODE: 'eager' | 'lazy' = process.env.LAZY_MODE === 'eager' ? 'eager' : 'lazy'

async function startSession(): Promise<string> {
  const res = await fetch(`${BFF_ORIGIN}/auth/session`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`bff session failed: ${res.status}`)
  const body = (await res.json()) as { accessToken: string }
  return body.accessToken
}

async function refreshSession(): Promise<string> {
  const res = await fetch(`${BFF_ORIGIN}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`bff refresh failed: ${res.status}`)
  const body = (await res.json()) as { accessToken: string }
  return body.accessToken
}

function authedFetch(path: string, accessToken: string): Promise<Response> {
  // credentials: 'include' is harmless here even though these routes do not
  // read a cookie. It is the refresh cookie's own Path that keeps it off
  // these requests, not the caller choosing not to send cookies.
  return fetch(`${BFF_ORIGIN}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
}

/**
 * One session for the whole app, however many independent routes end up
 * asking for data. Memoised rather than re-fetched per call: VehicleStep and
 * CoverStep each call their own fetch function with no knowledge of each
 * other, and without this they would each start their own session, doubling
 * `POST /auth/session` calls for no reason.
 */
let sessionPromise: Promise<string> | null = null

function getAccessToken(): Promise<string> {
  if (!sessionPromise) sessionPromise = startSession()
  return sessionPromise
}

async function fetchJson<T>(path: string, accessToken: string): Promise<T> {
  const res = await authedFetch(path, accessToken)
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Fetches one authed resource, retrying once after a refresh if the first
 * attempt fails for any reason (expired token, or any other failure: the
 * retry is the same whichever it was, since refreshing is cheap and a second
 * genuine failure propagates either way). Also updates the shared session so
 * a refresh triggered by one route benefits whichever route asks next.
 */
async function fetchAuthed<T>(path: string): Promise<T> {
  const token = await getAccessToken()
  try {
    return await fetchJson<T>(path, token)
  } catch {
    const refreshed = await refreshSession()
    sessionPromise = Promise.resolve(refreshed)
    return await fetchJson<T>(path, refreshed)
  }
}

async function fetchJourneyWith(accessToken: string): Promise<JourneyData> {
  if (BFF_MODE === 'split') {
    const [vehicleRes, policyRes] = await Promise.all([
      authedFetch('/downstream/vehicle', accessToken),
      authedFetch('/downstream/account', accessToken),
    ])
    if (!vehicleRes.ok || !policyRes.ok) {
      throw new Error('downstream fetch failed')
    }
    const [vehicle, policy] = await Promise.all([
      vehicleRes.json() as Promise<Vehicle>,
      policyRes.json() as Promise<Policy>,
    ])
    return { vehicle, policy }
  }

  return fetchJson<JourneyData>('/journey', accessToken)
}

// Triggered by whichever route's fetch function is called first, in 'eager'
// mode only. Both fetchVehicle and fetchPolicy await the SAME promise, which
// is the point: visiting /vehicle alone still waits on the account service
// too, because nothing asked for just one.
let eagerJourneyPromise: Promise<JourneyData> | null = null

function eagerJourney(): Promise<JourneyData> {
  if (!eagerJourneyPromise) {
    eagerJourneyPromise = (async () => {
      const token = await getAccessToken()
      try {
        return await fetchJourneyWith(token)
      } catch {
        const refreshed = await refreshSession()
        sessionPromise = Promise.resolve(refreshed)
        return await fetchJourneyWith(refreshed)
      }
    })()
  }
  return eagerJourneyPromise
}

/**
 * The only functions the rest of host-shell calls, one per route. The access
 * token never leaves this module: not put in state, not passed to a remote,
 * not written to storage. A remote receives the resolved data as a plain
 * prop, never the credential that fetched it. See the README composition
 * check that greps the built remotes for the token and finds nothing.
 */
export function fetchVehicle(): Promise<Vehicle> {
  return LAZY_MODE === 'eager'
    ? eagerJourney().then((j) => j.vehicle)
    : fetchAuthed<Vehicle>('/downstream/vehicle')
}

export function fetchPolicy(): Promise<Policy> {
  return LAZY_MODE === 'eager'
    ? eagerJourney().then((j) => j.policy)
    : fetchAuthed<Policy>('/downstream/account')
}
