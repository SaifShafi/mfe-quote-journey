import { Suspense, lazy, useState } from 'react'
import { RemoteBoundary } from './RemoteBoundary'
import { RemoteUnavailable } from './RemoteUnavailable'
import './tokens.css'
import './shell.css'

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
 */
const VehicleDetails = lazy(() =>
  import('remote_quote/VehicleDetails')
    .then((m) => ({ default: m.VehicleDetails }))
    .catch((error: unknown) => {
      console.error('[shell] remote "remote_quote" failed to load', error)
      return { default: () => <RemoteUnavailable name="remote_quote" /> }
    }),
)

const STEPS = ['Vehicle', 'Driver', 'Cover'] as const

export function App() {
  const [submitted, setSubmitted] = useState<string | null>(null)

  return (
    <>
      <header className="shell-header">
        <div className="shell-brand">
          Quote <span>journey</span>
        </div>
        <nav className="shell-steps" aria-label="Quote steps">
          <ol>
            {STEPS.map((step, i) => (
              <li key={step} aria-current={i === 0 ? 'step' : undefined}>
                {step}
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <main className="shell-main">
        <h1>Get a quote</h1>
        <p className="shell-lede">
          The shell owns this page. The form below is served by a separate
          application and composed in at runtime.
        </p>

        <RemoteBoundary name="remote_quote">
          <Suspense
            fallback={<p className="loading">Loading vehicle details…</p>}
          >
            <VehicleDetails
              onSubmit={(vehicle) => setSubmitted(vehicle.registration)}
            />
          </Suspense>
        </RemoteBoundary>

        {submitted && (
          <p className="result" role="status">
            Captured registration: <strong>{submitted || '—'}</strong>
          </p>
        )}
      </main>
    </>
  )
}
