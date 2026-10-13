import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { VehicleStep } from './VehicleStep'
import { CoverStep } from './CoverStep'
import { fetchJourney, type JourneyData } from './bff'
import './tokens.css'
import './shell.css'

const STEPS = [
  { label: 'Vehicle', to: '/vehicle' },
  { label: 'Driver', to: null },
  { label: 'Cover', to: '/cover' },
] as const

// 'pending' while the BFF call is in flight. null once it has failed: the
// remotes still mount, with no initial props, and fall back to the same
// defaults they would use standalone. A BFF outage costs this stage's
// enhancement, not the page, the same shape as a dead remote in Stage 0.
type JourneyState = JourneyData | null | 'pending'

export function App() {
  const [excess, setExcess] = useState<string | null>(null)
  const [journey, setJourney] = useState<JourneyState>('pending')
  const location = useLocation()

  useEffect(() => {
    let cancelled = false
    fetchJourney()
      .then((data) => {
        if (!cancelled) setJourney(data)
      })
      .catch((error: unknown) => {
        console.error(
          '[shell] bff journey fetch failed, remotes will use their own defaults',
          error,
        )
        if (!cancelled) setJourney(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

        {journey === 'pending' ? (
          <p className="loading">Fetching your journey…</p>
        ) : (
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
                  <VehicleStep initialVehicle={journey?.vehicle} />
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
                  <CoverStep initialPolicy={journey?.policy} onExcessChange={setExcess} />
                </>
              }
            />
          </Routes>
        )}

        {excess && (
          <p className="result" role="status">
            Voluntary excess: <strong>{excess}</strong>.
          </p>
        )}
      </main>
    </>
  )
}
