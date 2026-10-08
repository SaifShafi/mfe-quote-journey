/**
 * The degraded panel shown in place of a remote that could not be loaded.
 * Shared by the error boundary and by the import rejection handler, because a
 * remote can fail in two different phases and both need the same outcome.
 */
export function RemoteUnavailable({ name }: { name: string }) {
  return (
    <section aria-live="polite">
      <h2>This step is unavailable</h2>
      <p>
        The <code>{name}</code> module could not be loaded. The rest of the page
        is unaffected.
      </p>
    </section>
  )
}
