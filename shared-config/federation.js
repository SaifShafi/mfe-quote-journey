/**
 * The shared-module map, in one place because all three applications must agree
 * on it. A singleton that only one side declares is not a singleton: webpack
 * negotiates per module name, so a mismatch silently gives you two copies.
 *
 * MFE_SHARED exists to make Stage 1's measurements reproducible from the command
 * line instead of by hand-editing three configs. It is a measurement switch, not
 * a feature flag, and every mode except "all" is a deliberately broken build.
 *
 *   all        everything a singleton. The real configuration.
 *   no-ui      shared-ui removed from the shared map, so each remote bundles and
 *              fetches its own copy. Measures what the shared package buys.
 *   dup-react  React still shared, but singleton: false, so webpack is allowed
 *              to load a second copy. This is the classic duplicate-React
 *              misconfiguration and it produces the classic hook error.
 *   none       nothing shared at all. A DIFFERENT failure from dup-react, and
 *              the more confusing one: webpack puts React in the remote's own
 *              entry chunk group, which a host consuming the container never
 *              loads, so the React import inside the exposed module resolves to
 *              null. See the README.
 */
const MODES = ['all', 'no-ui', 'dup-react', 'none']

function sharedModules(deps) {
  const mode = process.env.MFE_SHARED ?? 'all'
  if (!MODES.includes(mode)) {
    throw new Error(
      `MFE_SHARED must be one of ${MODES.join(', ')}, received "${mode}"`,
    )
  }

  const shared = {}

  if (mode !== 'none') {
    const singleton = mode !== 'dup-react'
    shared.react = { singleton, requiredVersion: deps.react }
    shared['react-dom'] = { singleton, requiredVersion: deps['react-dom'] }
  }

  // The host declares shared-ui even though it renders only one control from it,
  // so that whichever remote loads first finds a copy already in the shared
  // scope and both remotes resolve to the same instance.
  if (mode !== 'no-ui' && mode !== 'none' && deps['shared-ui']) {
    shared['shared-ui'] = {
      singleton: true,
      requiredVersion: deps['shared-ui'],
    }
  }

  return shared
}

module.exports = { sharedModules, MODES }
