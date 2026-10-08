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
})
