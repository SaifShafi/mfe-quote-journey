import { Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { RemoteBoundary } from './RemoteBoundary'
import { loadRemote } from './loadRemote'
import type { Vehicle } from 'remote_quote/VehicleDetails'

const VehicleDetails = loadRemote<{
  headingLevel?: 2 | 3 | 4
  initialVehicle?: Vehicle
  onSubmit?: (vehicle: Vehicle) => void
}>('remote_quote', () => import('remote_quote/VehicleDetails'), 'VehicleDetails')

/**
 * The route for remote_quote. Submitting the form is the one place vehicle
 * data crosses from a remote into the shell, and the shell's only use for it
 * is to carry it forward in the URL to /cover: a query string, not component
 * state, so the Cover step survives a refresh and a direct link.
 */
export function VehicleStep({ initialVehicle }: { initialVehicle?: Vehicle }) {
  const navigate = useNavigate()

  return (
    <RemoteBoundary name="remote_quote">
      <Suspense fallback={<p className="loading">Loading vehicle details…</p>}>
        <VehicleDetails
          headingLevel={2}
          initialVehicle={initialVehicle}
          onSubmit={(vehicle) => {
            const params = new URLSearchParams({
              registration: vehicle.registration,
              year: vehicle.year,
              mileage: vehicle.mileage,
            })
            navigate(`/cover?${params.toString()}`)
          }}
        />
      </Suspense>
    </RemoteBoundary>
  )
}
