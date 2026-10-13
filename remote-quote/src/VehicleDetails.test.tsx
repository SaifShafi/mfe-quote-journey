import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VehicleDetails } from './VehicleDetails'

describe('VehicleDetails', () => {
  it('labels every input, so the form is reachable by name', () => {
    render(<VehicleDetails />)
    expect(screen.getByLabelText('Registration')).toBeInTheDocument()
    expect(screen.getByLabelText('Year of manufacture')).toBeInTheDocument()
    expect(screen.getByLabelText('Annual mileage')).toBeInTheDocument()
  })

  it('exposes the mileage hint as a description, not as part of the name', () => {
    render(<VehicleDetails />)
    const mileage = screen.getByLabelText('Annual mileage')
    expect(mileage).toHaveAccessibleDescription('Approximate is fine')
  })

  it('hands the captured vehicle to its consumer on submit', async () => {
    const onSubmit = vi.fn()
    render(<VehicleDetails onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Registration'), 'AB12CDE')
    await userEvent.type(screen.getByLabelText('Annual mileage'), '8000')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onSubmit).toHaveBeenCalledWith({
      registration: 'AB12CDE',
      year: '',
      mileage: '8000',
    })
  })

  // Stage 3: this is the field the shell's BFF call populates. The guard is
  // that it is a genuine initial value, editable afterwards, not a display
  // the remote re-renders from the prop on every keystroke.
  it('starts from the BFF-sourced vehicle when one is given', () => {
    render(
      <VehicleDetails
        initialVehicle={{ registration: 'XY99 ZZZ', year: '2021', mileage: '4000' }}
      />,
    )
    expect(screen.getByLabelText('Registration')).toHaveValue('XY99 ZZZ')
    expect(screen.getByLabelText('Year of manufacture')).toHaveValue('2021')
    expect(screen.getByLabelText('Annual mileage')).toHaveValue('4000')
  })

  it('still submits edits made on top of the initial vehicle', async () => {
    const onSubmit = vi.fn()
    render(
      <VehicleDetails
        initialVehicle={{ registration: 'XY99 ZZZ', year: '2021', mileage: '4000' }}
        onSubmit={onSubmit}
      />,
    )

    const mileage = screen.getByLabelText('Annual mileage')
    await userEvent.clear(mileage)
    await userEvent.type(mileage, '5500')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onSubmit).toHaveBeenCalledWith({
      registration: 'XY99 ZZZ',
      year: '2021',
      mileage: '5500',
    })
  })
})
