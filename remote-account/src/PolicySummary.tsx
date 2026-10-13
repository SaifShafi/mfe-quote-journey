import { useState } from 'react'
import { Button, Input, Panel } from 'shared-ui'
import './account.css'

export interface Policy {
  reference: string
  cover: string
  renewal: string
  excess: string
}

// Stub data. Stage 3 replaces this with one aggregated call to the BFF, which
// is where the round-trip measurement comes from.
const POLICY: Omit<Policy, 'excess'> = {
  reference: 'QJ-4417-02',
  cover: 'Comprehensive',
  renewal: '14 March 2027',
}

const DEFAULT_EXCESS = '250'

/**
 * The account surface: what the customer already holds, plus the one field on
 * this step they can change.
 *
 * Every visual element here comes from shared-ui. This remote owns no button,
 * input or panel styling of its own, which is the whole point of the package:
 * two independently deployed remotes look like one product without either team
 * copying the other's CSS.
 */
export function PolicySummary({
  headingLevel = 2,
  onExcessChange,
}: {
  headingLevel?: 2 | 3 | 4
  onExcessChange?: (excess: string) => void
}) {
  const [excess, setExcess] = useState(DEFAULT_EXCESS)

  return (
    <Panel heading="Your current policy" headingLevel={headingLevel}>
      <span className="origin-tag">served by remote_account</span>

      <dl className="account-facts">
        <dt>Policy reference</dt>
        <dd>{POLICY.reference}</dd>
        <dt>Cover level</dt>
        <dd>{POLICY.cover}</dd>
        <dt>Renews</dt>
        <dd>{POLICY.renewal}</dd>
      </dl>

      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault()
          onExcessChange?.(excess)
        }}
      >
        <Input
          label="Voluntary excess"
          hint="A higher excess usually lowers the premium"
          inputMode="numeric"
          value={excess}
          onChange={(e) => setExcess(e.target.value)}
        />
        {/* type="submit" is explicit because shared-ui's Button defaults to
            "button", which is the safe default for a shared primitive. */}
        <Button type="submit">Update excess</Button>
      </form>
    </Panel>
  )
}
