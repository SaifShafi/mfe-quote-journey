import { useState } from 'react'

export interface Vehicle {
  registration: string
  year: string
  mileage: string
}

const EMPTY: Vehicle = { registration: '', year: '', mileage: '' }

/**
 * Deliberately trivial. The form is not the point of this build; the
 * composition boundary is. Local state lives here because it never needs to
 * cross a remote boundary (see README on where state belongs).
 */
export function VehicleDetails({
  onSubmit,
}: {
  onSubmit?: (vehicle: Vehicle) => void
}) {
  const [vehicle, setVehicle] = useState<Vehicle>(EMPTY)

  const set = (key: keyof Vehicle) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setVehicle((v) => ({ ...v, [key]: e.target.value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(vehicle)
      }}
      aria-labelledby="vehicle-details-heading"
    >
      <h2 id="vehicle-details-heading">Vehicle details</h2>

      <label htmlFor="registration">Registration</label>
      <input
        id="registration"
        name="registration"
        value={vehicle.registration}
        onChange={set('registration')}
        autoComplete="off"
      />

      <label htmlFor="year">Year of manufacture</label>
      <input
        id="year"
        name="year"
        inputMode="numeric"
        value={vehicle.year}
        onChange={set('year')}
      />

      <label htmlFor="mileage">Annual mileage</label>
      <input
        id="mileage"
        name="mileage"
        inputMode="numeric"
        value={vehicle.mileage}
        onChange={set('mileage')}
      />

      <button type="submit">Continue</button>
    </form>
  )
}
