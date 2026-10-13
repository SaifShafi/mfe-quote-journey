import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import { Input } from './Input'
import { Panel } from './Panel'

// Accessibility is a gate here, not a review item: every primitive asserts its
// accessible name. These are the guard tests for the whole design system, so a
// regression in one of them is a regression in every remote at once.

describe('Input', () => {
  it('is reachable by its label', () => {
    render(<Input label="Registration" />)
    expect(screen.getByLabelText('Registration')).toBeInTheDocument()
  })

  it('exposes the hint as a description, not as part of the name', () => {
    render(<Input label="Annual mileage" hint="Approximate is fine" />)
    const input = screen.getByLabelText('Annual mileage')
    expect(input).toHaveAccessibleName('Annual mileage')
    expect(input).toHaveAccessibleDescription('Approximate is fine')
  })

  it('generates a unique id per instance, so two remotes cannot collide', () => {
    render(
      <>
        <Input label="Year" />
        <Input label="Mileage" />
      </>,
    )
    const first = screen.getByLabelText('Year')
    const second = screen.getByLabelText('Mileage')
    expect(first.id).not.toBe('')
    expect(first.id).not.toBe(second.id)
  })
})

describe('Button', () => {
  it('is reachable by its accessible name', () => {
    render(<Button>Continue</Button>)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it('defaults to type="button", so it cannot submit a form by surprise', () => {
    render(<Button>Continue</Button>)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute(
      'type',
      'button',
    )
  })
})

describe('Panel', () => {
  it('names its region with the heading', () => {
    render(<Panel heading="Your policy">body</Panel>)
    expect(
      screen.getByRole('region', { name: 'Your policy' }),
    ).toBeInTheDocument()
  })

  it('lets the consumer choose the heading level it is mounted under', () => {
    render(
      <Panel heading="Your policy" headingLevel={3}>
        body
      </Panel>,
    )
    expect(
      screen.getByRole('heading', { level: 3, name: 'Your policy' }),
    ).toBeInTheDocument()
  })
})
