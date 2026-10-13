import { useState } from 'react'
import { Button, Input, Panel } from 'shared-ui'
import './account.css'

export interface Policy {
  reference: string
  cover: string
  renewal: string
  excess: string
}

// Stub data, now specifically the FALLBACK: what this remote shows if it is
// ever mounted standalone, or if the shell's call to the BFF failed and it
// was mounted with no initialPolicy at all. The real Stage 3 data comes from
// one aggregated call to the BFF, made by the shell; see initialPolicy below
// and host-shell/src/bff.ts for the round-trip measurement that call enables.
const DEFAULT_POLICY: Omit<Policy, 'excess'> = {
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
  // Stage 3: seeded by the shell from the BFF's aggregated response. Read
  // once via useState's initializer, same reasoning as VehicleDetails: the
  // shell only mounts this component after its fetch has settled, so there
  // is never a later value for a render to miss.
  initialPolicy,
  onExcessChange,
}: {
  headingLevel?: 2 | 3 | 4
  initialPolicy?: Policy
  onExcessChange?: (excess: string) => void
}) {
  const policy = initialPolicy ?? DEFAULT_POLICY
  const [excess, setExcess] = useState(initialPolicy?.excess ?? DEFAULT_EXCESS)

  return (
    <Panel heading="Your current policy" headingLevel={headingLevel}>
      <span className="origin-tag">served by remote_account</span>

      <dl className="account-facts">
        <dt>Policy reference</dt>
        <dd>{policy.reference}</dd>
        <dt>Cover level</dt>
        <dd>{policy.cover}</dd>
        <dt>Renews</dt>
        <dd>{policy.renewal}</dd>
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
