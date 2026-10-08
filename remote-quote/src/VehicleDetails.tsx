import { useState } from 'react'
import './quote.css'

export interface Vehicle {
  registration: string
  year: string
  mileage: string
}

const EMPTY: Vehicle = { registration: '', year: '', mileage: '' }

/**
 * Deliberately simple. The form is not the point of this build; the composition
 * boundary is. Local state lives here because it never needs to cross a remote
 * boundary (see README on where state belongs).
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
      className="quote-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(vehicle)
      }}
      aria-labelledby="vehicle-details-heading"
    >
      <span className="origin-tag">served by remote_quote</span>

      <h2 id="vehicle-details-heading">Vehicle details</h2>

      <div className="quote-field">
        <label htmlFor="registration">Registration</label>
        <input
          id="registration"
          name="registration"
          value={vehicle.registration}
          onChange={set('registration')}
          placeholder="AB12 CDE"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="quote-row">
        <div className="quote-field">
          <label htmlFor="year">Year of manufacture</label>
          <input
            id="year"
            name="year"
            inputMode="numeric"
            value={vehicle.year}
            onChange={set('year')}
            placeholder="2019"
          />
        </div>

        <div className="quote-field">
          <label htmlFor="mileage">Annual mileage</label>
          {/* The hint is a DESCRIPTION, not part of the name. Putting it inside
              the label makes the input's accessible name "Annual mileage
              (approximate)", which is noise for a screen reader user and broke
              the test that asserts the name. aria-describedby keeps the name
              clean and still announces the hint. */}
          <input
            id="mileage"
            name="mileage"
            inputMode="numeric"
            value={vehicle.mileage}
            onChange={set('mileage')}
            placeholder="8000"
            aria-describedby="mileage-hint"
          />
          <span className="hint" id="mileage-hint">
            Approximate is fine
          </span>
        </div>
      </div>

      <button className="quote-submit" type="submit">
        Continue
      </button>
    </form>
  )
}
