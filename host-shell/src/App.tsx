import { Suspense, useState } from 'react'
import { RemoteBoundary } from './RemoteBoundary'
import { loadRemote } from './loadRemote'
import type { Vehicle } from 'remote_quote/VehicleDetails'
import './tokens.css'
import './shell.css'

// One lazy component per remote, each with its own load-failure handling. See
// loadRemote for why the rejection is caught at the import and not only in a
// boundary.
const VehicleDetails = loadRemote<{
  headingLevel?: 2 | 3 | 4
  onSubmit?: (vehicle: Vehicle) => void
}>('remote_quote', () => import('remote_quote/VehicleDetails'), 'VehicleDetails')

const PolicySummary = loadRemote<{
  headingLevel?: 2 | 3 | 4
  onExcessChange?: (excess: string) => void
}>('remote_account', () => import('remote_account/PolicySummary'), 'PolicySummary')

const STEPS = ['Vehicle', 'Driver', 'Cover'] as const

export function App() {
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [excess, setExcess] = useState<string | null>(null)

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
          The shell owns this page. Both panels below are served by separate
          applications and composed in at runtime.
        </p>

        <div className="shell-stack">
          {/* The shell owns the h1, so each remote is told what level its own
              heading sits at. A remote cannot know how deep it was mounted. */}
          <RemoteBoundary name="remote_quote">
            <Suspense
              fallback={<p className="loading">Loading vehicle details…</p>}
            >
              <VehicleDetails
                headingLevel={2}
                onSubmit={(vehicle) => setSubmitted(vehicle.registration)}
              />
            </Suspense>
          </RemoteBoundary>

          {/* A second boundary, not a shared one. One boundary around both
              remotes would mean either remote failing costs you both panels. */}
          <RemoteBoundary name="remote_account">
            <Suspense
              fallback={<p className="loading">Loading your policy…</p>}
            >
              <PolicySummary headingLevel={2} onExcessChange={setExcess} />
            </Suspense>
          </RemoteBoundary>
        </div>

        {(submitted || excess) && (
          <p className="result" role="status">
            {submitted && (
              <>
                Captured registration: <strong>{submitted}</strong>.{' '}
              </>
            )}
            {excess && (
              <>
                Voluntary excess: <strong>{excess}</strong>.
              </>
            )}
          </p>
        )}
      </main>
    </>
  )
}
