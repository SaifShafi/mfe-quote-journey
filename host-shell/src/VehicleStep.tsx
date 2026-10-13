import { Suspense, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RemoteBoundary } from './RemoteBoundary'
import { loadRemote } from './loadRemote'
import { fetchVehicle, type Vehicle as VehicleData } from './bff'
import type { Vehicle } from 'remote_quote/VehicleDetails'

const VehicleDetails = loadRemote<{
  headingLevel?: 2 | 3 | 4
  initialVehicle?: Vehicle
  onSubmit?: (vehicle: Vehicle) => void
}>('remote_quote', () => import('remote_quote/VehicleDetails'), 'VehicleDetails')

// 'pending' while this route's own bff call is in flight. null once it has
// failed: the remote still mounts, with no initial prop, and falls back to
// the same default it would use standalone. Fetched here, not by App, so
// this route's time to interactive depends only on the one resource it
// actually needs, not on whatever /cover also happens to need.
type VehicleState = VehicleData | null | 'pending'

/**
 * The route for remote_quote. Submitting the form is the one place vehicle
 * data crosses from a remote into the shell, and the shell's only use for it
 * is to carry it forward in the URL to /cover: a query string, not component
 * state, so the Cover step survives a refresh and a direct link.
 */
export function VehicleStep() {
  const navigate = useNavigate()
  const [vehicle, setVehicle] = useState<VehicleState>('pending')

  useEffect(() => {
    let cancelled = false
    fetchVehicle()
      .then((data) => {
        if (!cancelled) setVehicle(data)
      })
      .catch((error: unknown) => {
        console.error(
          '[shell] bff vehicle fetch failed, remote will use its own defaults',
          error,
        )
        if (!cancelled) setVehicle(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (vehicle === 'pending') {
    return <p className="loading">Fetching your vehicle…</p>
  }

  return (
    <RemoteBoundary name="remote_quote">
      <Suspense fallback={<p className="loading">Loading vehicle details…</p>}>
        <VehicleDetails
          headingLevel={2}
          initialVehicle={vehicle ?? undefined}
          onSubmit={(v) => {
            const params = new URLSearchParams({
              registration: v.registration,
              year: v.year,
              mileage: v.mileage,
            })
            navigate(`/cover?${params.toString()}`)
          }}
        />
      </Suspense>
    </RemoteBoundary>
  )
}
