import { Suspense, lazy, useState } from 'react'
import { RemoteBoundary } from './RemoteBoundary'

// lazy + dynamic import is what actually triggers the network fetch of the
// remote's chunk. Nothing from remote_quote is in the shell's bundle.
const VehicleDetails = lazy(() =>
  import('remote_quote/VehicleDetails').then((m) => ({
    default: m.VehicleDetails,
  })),
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
