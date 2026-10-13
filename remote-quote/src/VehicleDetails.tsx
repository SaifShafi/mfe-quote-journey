import { useState } from 'react'
import { Button, Input, Panel } from 'shared-ui'
import './quote.css'

export interface Vehicle {
  registration: string
  year: string
  mileage: string
}

const EMPTY: Vehicle = { registration: '', year: '', mileage: '' }

/**
 * Vehicle-details stub. Local state stays here because it does not need to
 * cross a remote boundary.
 *
 * Every control comes from shared-ui. Before the package existed this file
 * owned its own label, input and button markup, and quote.css owned their
 * styling. Both have gone, which is what the singleton is for: the other remote
 * gets the same controls without either team copying the other's CSS.
 */
export function VehicleDetails({
  headingLevel = 2,
  onSubmit,
}: {
  headingLevel?: 2 | 3 | 4
  onSubmit?: (vehicle: Vehicle) => void
}) {
  const [vehicle, setVehicle] = useState<Vehicle>(EMPTY)

  const set = (key: keyof Vehicle) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setVehicle((v) => ({ ...v, [key]: e.target.value }))

  return (
    <Panel heading="Vehicle details" headingLevel={headingLevel}>
      <span className="origin-tag">served by remote_quote</span>

      <form
        className="quote-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit?.(vehicle)
        }}
      >
        <Input
          label="Registration"
          value={vehicle.registration}
          onChange={set('registration')}
          placeholder="AB12 CDE"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="quote-row">
          <Input
            label="Year of manufacture"
            inputMode="numeric"
            value={vehicle.year}
            onChange={set('year')}
            placeholder="2019"
          />

          {/* The hint is a description, not part of the accessible name. That
              rule now lives inside shared-ui's Input, so this remote cannot get
              it wrong and neither can the next one. */}
          <Input
            label="Annual mileage"
            hint="Approximate is fine"
            inputMode="numeric"
            value={vehicle.mileage}
            onChange={set('mileage')}
            placeholder="8000"
          />
        </div>

        {/* shared-ui's Button defaults to type="button", so a submit is explicit. */}
        <Button type="submit">Continue</Button>
      </form>
    </Panel>
  )
}
