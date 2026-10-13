import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PolicySummary } from './PolicySummary'

describe('PolicySummary', () => {
  it('names its region, so a user can tell which surface they are in', () => {
    render(<PolicySummary />)
    expect(
      screen.getByRole('region', { name: 'Your current policy' }),
    ).toBeInTheDocument()
  })

  it('labels the one editable field', () => {
    render(<PolicySummary />)
    const excess = screen.getByLabelText('Voluntary excess')
    expect(excess).toHaveAccessibleName('Voluntary excess')
    expect(excess).toHaveAccessibleDescription(
      'A higher excess usually lowers the premium',
    )
  })

  it('hands the chosen excess to its consumer on submit', async () => {
    const onExcessChange = vi.fn()
    render(<PolicySummary onExcessChange={onExcessChange} />)

    const excess = screen.getByLabelText('Voluntary excess')
    await userEvent.clear(excess)
    await userEvent.type(excess, '500')
    await userEvent.click(screen.getByRole('button', { name: 'Update excess' }))

    expect(onExcessChange).toHaveBeenCalledWith('500')
  })

  it('renders its heading at the level the consumer was mounted under', () => {
    render(<PolicySummary headingLevel={3} />)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Your current policy' }),
    ).toBeInTheDocument()
  })

  // Stage 3: this is what the shell's BFF call populates, including the
  // read-only facts, which the earlier stub data never varied.
  it('displays the BFF-sourced policy when one is given, including the read-only facts', () => {
    render(
      <PolicySummary
        initialPolicy={{
          reference: 'ZZ-0001-00',
          cover: 'Third party, fire and theft',
          renewal: '1 January 2028',
          excess: '400',
        }}
      />,
    )
    expect(screen.getByText('ZZ-0001-00')).toBeInTheDocument()
    expect(screen.getByText('Third party, fire and theft')).toBeInTheDocument()
    expect(screen.getByText('1 January 2028')).toBeInTheDocument()
    expect(screen.getByLabelText('Voluntary excess')).toHaveValue('400')
  })

  it('still reports an edit made on top of the initial excess', async () => {
    const onExcessChange = vi.fn()
    render(
      <PolicySummary
        initialPolicy={{
          reference: 'ZZ-0001-00',
          cover: 'Third party, fire and theft',
          renewal: '1 January 2028',
          excess: '400',
        }}
        onExcessChange={onExcessChange}
      />,
    )

    const excess = screen.getByLabelText('Voluntary excess')
    await userEvent.clear(excess)
    await userEvent.type(excess, '600')
    await userEvent.click(screen.getByRole('button', { name: 'Update excess' }))

    expect(onExcessChange).toHaveBeenCalledWith('600')
  })
})
