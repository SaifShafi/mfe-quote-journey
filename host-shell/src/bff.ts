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

export interface JourneyData {
  vehicle: Vehicle
  policy: Policy
}

const BFF_ORIGIN = 'http://localhost:4000'

/**
 * BFF_MODE is baked in at build time by webpack's DefinePlugin, the same
 * pattern MFE_SHARED uses for Stage 1. 'aggregated' calls /journey once.
 * 'split' calls the two downstream endpoints directly, which is what the
 * host would have to do if there were no BFF: one request per remote's data.
 * scripts/measure-bff.mjs rebuilds the host in both modes to count the
 * difference in round trips.
 */
declare const BFF_MODE: 'aggregated' | 'split'

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

  const res = await authedFetch('/journey', accessToken)
  if (!res.ok) throw new Error(`journey fetch failed: ${res.status}`)
  return res.json() as Promise<JourneyData>
}

/**
 * The only function the rest of host-shell calls. The access token lives in
 * this function's own call stack and nowhere else: it is never put in state,
 * never passed to a remote, never written to storage. A remote receives the
 * resolved vehicle and policy data as plain props, never the credential that
 * fetched them. See the README composition check that greps the built
 * remotes for the token and finds nothing.
 *
 * Retries once, after a refresh, if the first attempt fails. In practice the
 * access token's 10 second ttl is longer than this call takes, so the normal
 * path never exercises the retry; it exists for the session to survive past
 * that window, and the refresh flow itself is covered by bff's own e2e tests.
 */
export async function fetchJourney(): Promise<JourneyData> {
  const accessToken = await startSession()
  try {
    return await fetchJourneyWith(accessToken)
  } catch {
    const refreshed = await refreshSession()
    return await fetchJourneyWith(refreshed)
  }
}
