import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VehicleDetails } from '../../remote-quote/src/VehicleDetails'
import { PolicySummary } from '../../remote-account/src/PolicySummary'

/**
 * The cheap half of the composition problem.
 *
 * This test imports both remotes' SOURCE directly, which is exactly what the
 * real composed page does not do: in the browser these arrive over the network
 * as separate builds. So this proves nothing about federation, and it is not a
 * substitute for the Stage 2 Playwright run against the composed page.
 *
 * What it does catch is the class of bug that only exists once two
 * independently built surfaces share one document, and it catches it in
 * milliseconds instead of in CI. Duplicate IDs are the first one, because each
 * remote's own test suite renders alone and cannot see them by construction.
 */
describe('two remotes in one document', () => {
  it('produces no duplicate element ids', () => {
    const { container } = render(
      <>
        <VehicleDetails />
        <PolicySummary />
      </>,
    )

    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)

    expect(duplicates).toEqual([])
    // Guard against the assertion passing because nothing rendered an id at all.
    expect(ids.length).toBeGreaterThan(0)
  })

  it('produces exactly one heading per remote surface', () => {
    const { container } = render(
      <>
        <VehicleDetails headingLevel={2} />
        <PolicySummary headingLevel={2} />
      </>,
    )

    const headings = [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    expect(headings.map((h) => [h.tagName, h.textContent])).toEqual([
      ['H2', 'Vehicle details'],
      ['H2', 'Your current policy'],
    ])
  })
})
