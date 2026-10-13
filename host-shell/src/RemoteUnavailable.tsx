import { Button } from 'shared-ui'

/**
 * The degraded panel shown in place of a remote that could not be loaded.
 * Shared by the error boundary and by the import rejection handler, because a
 * remote can fail in two different phases and both need the same outcome.
 *
 * The retry is a full page load on purpose. Webpack caches the failed remote
 * container for the life of the page, so re-rendering the lazy component does
 * not re-fetch remoteEntry.js and a softer retry would always fail.
 */
export function RemoteUnavailable({ name }: { name: string }) {
  return (
    <section className="panel panel--notice" aria-live="polite">
      <h2>This step is unavailable</h2>
      <p>
        The <code>{name}</code> module could not be loaded. The rest of the page
        is unaffected.
      </p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Reload the page
      </Button>
    </section>
  )
}
