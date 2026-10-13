import { lazy, type ComponentType } from 'react'
import { RemoteUnavailable } from './RemoteUnavailable'

/**
 * A remote can fail in two different phases, and they need different handling.
 *
 * 1. While LOADING. The host fetches remoteEntry.js and initialises the remote's
 *    container to negotiate shared modules. If the remote is unreachable this
 *    throws a ScriptExternalLoadError inside webpack's shared-scope init, which
 *    is a promise rejection and not a React render error. An error boundary
 *    alone does not reliably cover it, and it surfaces as an unhandled runtime
 *    error. So the rejection is caught here, at the import, and turned into a
 *    component.
 *
 * 2. While RENDERING, once loaded. That is what RemoteBoundary is for.
 *
 * This was inline in App.tsx while there was one remote. With two it had to be
 * factored out, because the per-remote cost of getting this wrong is a page that
 * dies when any single remote is down, and nobody rereads the comment the second
 * time they copy it.
 */
export function loadRemote<P>(
  name: string,
  load: () => Promise<Record<string, unknown>>,
  exportName: string,
) {
  return lazy(() =>
    load()
      .then((m) => ({ default: m[exportName] as ComponentType<P> }))
      .catch((error: unknown) => {
        console.error(`[shell] remote "${name}" failed to load`, error)
        return { default: (() => <RemoteUnavailable name={name} />) as ComponentType<P> }
      }),
  )
}
