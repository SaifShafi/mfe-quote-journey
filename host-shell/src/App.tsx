import { Suspense, lazy, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './tokens.css'
import './shell.css'

// Each route's own code, including its loadRemote() call, is a separate
// chunk: visiting /vehicle does not download the JS that knows how to load
// remote_account, and vice versa. Combined with Stage 4's per-route bff
// fetches (see VehicleStep.tsx, CoverStep.tsx), neither route's time to
// interactive depends on anything the other route needs.
const VehicleStep = lazy(() =>
  import('./VehicleStep').then((m) => ({ default: m.VehicleStep })),
)
const CoverStep = lazy(() => import('./CoverStep').then((m) => ({ default: m.CoverStep })))

const STEPS = [
  { label: 'Vehicle', to: '/vehicle' },
  { label: 'Driver', to: null },
  { label: 'Cover', to: '/cover' },
] as const

export function App() {
  const [excess, setExcess] = useState<string | null>(null)
  const location = useLocation()

  return (
    <>
      <header className="shell-header">
        <div className="shell-brand">
          Quote <span>journey</span>
        </div>
        <nav className="shell-steps" aria-label="Quote steps">
          <ol>
            {STEPS.map((step) =>
              step.to ? (
                <li
                  key={step.label}
                  aria-current={location.pathname === step.to ? 'step' : undefined}
                >
                  <Link to={step.to}>{step.label}</Link>
                </li>
              ) : (
                // No remote owns this step yet. Not a link: a disabled control
                // that goes nowhere is worse for a screen reader user than a
                // plain label, since it promises an action that does nothing.
                <li key={step.label} aria-disabled="true">
                  {step.label}
                </li>
              ),
            )}
          </ol>
        </nav>
      </header>

      <main className="shell-main">
        {/* One h1 for the whole journey, not one per step: the step below
            already has its own heading (shared-ui's Panel), and a shell h1
            repeating that same text would be two headings announcing the
            same thing at different levels for no reason. */}
        <h1>Get a quote</h1>

        <Suspense fallback={<p className="loading">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Navigate to="/vehicle" replace />} />
            <Route
              path="/vehicle"
              element={
                <>
                  <p className="shell-lede">
                    The shell owns this page. The form below is served by a
                    separate application and composed in at runtime.
                  </p>
                  <VehicleStep />
                </>
              }
            />
            <Route
              path="/cover"
              element={
                <>
                  <p className="shell-lede">
                    The shell owns this page too. It carried your vehicle
                    forward from the last step in the URL, not in memory.
                  </p>
                  <CoverStep onExcessChange={setExcess} />
                </>
              }
            />
          </Routes>
        </Suspense>

        {excess && (
          <p className="result" role="status">
            Voluntary excess: <strong>{excess}</strong>.
          </p>
        )}
      </main>
    </>
  )
}
