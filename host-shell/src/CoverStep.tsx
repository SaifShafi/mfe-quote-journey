import { Suspense } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RemoteBoundary } from './RemoteBoundary'
import { loadRemote } from './loadRemote'
import type { Policy } from 'remote_account/PolicySummary'

const PolicySummary = loadRemote<{
  headingLevel?: 2 | 3 | 4
  initialPolicy?: Policy
  onExcessChange?: (excess: string) => void
}>('remote_account', () => import('remote_account/PolicySummary'), 'PolicySummary')

/**
 * The route for remote_account, and the other end of the boundary VehicleStep
 * writes into the URL. The registration is read from the query string, not
 * from any component state the Vehicle step held, which is what makes both of
 * these true at once: a link straight to this URL works without visiting
 * /vehicle first, and reloading this page does not lose it.
 *
 * remote_account itself does not need the registration for anything it does,
 * so it is shown here as shell-owned context above the panel rather than
 * threaded into a remote prop that would exist only to be displayed.
 */
export function CoverStep({
  initialPolicy,
  onExcessChange,
}: {
  initialPolicy?: Policy
  onExcessChange?: (excess: string) => void
}) {
  const [params] = useSearchParams()
  const registration = params.get('registration')
  const year = params.get('year')

  return (
    <>
      {registration ? (
        <p className="journey-context">
          Quoting cover for <strong>{registration}</strong>
          {year && `, ${year}`}.
        </p>
      ) : (
        <p className="journey-context journey-context--empty">
          No vehicle on this quote yet. <Link to="/vehicle">Add one</Link> or continue
          without it.
        </p>
      )}

      <RemoteBoundary name="remote_account">
        <Suspense fallback={<p className="loading">Loading your policy…</p>}>
          <PolicySummary
            headingLevel={2}
            initialPolicy={initialPolicy}
            onExcessChange={onExcessChange}
          />
        </Suspense>
      </RemoteBoundary>
    </>
  )
}
