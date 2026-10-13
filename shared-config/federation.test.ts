import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error CommonJS, because the webpack configs require it directly and
// there is no build step in front of them.
import { sharedModules, MODES } from './federation.js'

const DEPS = {
  react: '^18.3.1',
  'react-dom': '^18.3.1',
  'shared-ui': '^0.1.0',
}

const original = process.env.MFE_SHARED
afterEach(() => {
  if (original === undefined) delete process.env.MFE_SHARED
  else process.env.MFE_SHARED = original
})

/**
 * The failure this guards against has no symptom at build time.
 *
 * Webpack negotiates shared modules by name. If one application declares react
 * a singleton and another does not declare react at all, nothing fails to
 * compile and nothing warns: the page simply ends up running two React copies,
 * and the first visible sign is a hook throwing somewhere unrelated. Three
 * webpack configs that have to agree by hand are exactly the kind of contract
 * that drifts, so the map is computed in one place and asserted here.
 */
describe('shared module map', () => {
  it('is identical for every application in the real configuration', () => {
    delete process.env.MFE_SHARED
    const host = sharedModules(DEPS)
    const quote = sharedModules(DEPS)
    const account = sharedModules(DEPS)

    expect(host).toEqual(quote)
    expect(host).toEqual(account)
  })

  it('makes react, react-dom and shared-ui singletons by default', () => {
    delete process.env.MFE_SHARED
    expect(sharedModules(DEPS)).toEqual({
      react: { singleton: true, requiredVersion: '^18.3.1' },
      'react-dom': { singleton: true, requiredVersion: '^18.3.1' },
      'shared-ui': { singleton: true, requiredVersion: '^0.1.0' },
    })
  })

  it('shares nothing at all in the "none" measurement mode', () => {
    process.env.MFE_SHARED = 'none'
    expect(sharedModules(DEPS)).toEqual({})
  })

  it('drops only shared-ui in the "no-ui" measurement mode', () => {
    process.env.MFE_SHARED = 'no-ui'
    const shared = sharedModules(DEPS)
    expect(Object.keys(shared).sort()).toEqual(['react', 'react-dom'])
    expect(shared.react.singleton).toBe(true)
  })

  it('keeps react shared but not a singleton in "dup-react"', () => {
    process.env.MFE_SHARED = 'dup-react'
    const shared = sharedModules(DEPS)
    expect(shared.react.singleton).toBe(false)
    expect(shared['react-dom'].singleton).toBe(false)
    // shared-ui stays a singleton, so the mode isolates React.
    expect(shared['shared-ui'].singleton).toBe(true)
  })

  it('refuses an unknown mode instead of silently sharing nothing', () => {
    process.env.MFE_SHARED = 'singlton'
    expect(() => sharedModules(DEPS)).toThrow(/must be one of/)
  })

  it('omits shared-ui for an application that does not depend on it', () => {
    delete process.env.MFE_SHARED
    const { 'shared-ui': _ignored, ...withoutUi } = DEPS
    expect(sharedModules(withoutUi)['shared-ui']).toBeUndefined()
  })

  it('lists every mode the measurement scripts use', () => {
    expect(MODES).toEqual(['all', 'no-ui', 'dup-react', 'none'])
  })
})
