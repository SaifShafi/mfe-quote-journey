import { Suspense, lazy, useState } from 'react'
import { RemoteBoundary } from './RemoteBoundary'
import { RemoteUnavailable } from './RemoteUnavailable'

/**
 * A remote can fail in two different phases, and they need different handling.
 *
 * 1. While LOADING. The host fetches remoteEntry.js and initialises the remote's
 *    container to negotiate shared modules. If the remote is unreachable this
 *    throws a ScriptExternalLoadError inside webpack's shared-scope init, which
 *    is a promise rejection and not a React render error. An error boundary
 *    alone does not reliably cover it, and it surfaces as an unhandled runtime
 *    error. So the rejection is caught here, at the import, and turned into a
 *    component.
 *
 * 2. While RENDERING, once loaded. That is what RemoteBoundary is for.
 *
 * Handling only the second case is the mistake worth recording: the dev server
 * overlay makes a dead remote look like a crashed page even when the fallback
 * rendered correctly underneath it.
 */
const VehicleDetails = lazy(() =>
  import('remote_quote/VehicleDetails')
    .then((m) => ({ default: m.VehicleDetails }))
    .catch((error: unknown) => {
      console.error('[shell] remote "remote_quote" failed to load', error)
      return { default: () => <RemoteUnavailable name="remote_quote" /> }
    }),
)

export function App() {
  const [submitted, setSubmitted] = useState<string | null>(null)

  return (
    <>
      <header>
        <strong>Quote journey</strong>
        <nav aria-label="Quote steps">
          <ol>
            <li>Vehicle</li>
            <li>Driver</li>
            <li>Cover</li>
          </ol>
        </nav>
      </header>

      <main>
        <h1>Get a quote</h1>

        <RemoteBoundary name="remote_quote">
          <Suspense fallback={<p>Loading vehicle details…</p>}>
            <VehicleDetails
              onSubmit={(vehicle) => setSubmitted(vehicle.registration)}
            />
          </Suspense>
        </RemoteBoundary>

        {submitted && <p role="status">Captured registration: {submitted}</p>}
      </main>
    </>
  )
}
