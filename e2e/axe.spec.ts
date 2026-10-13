import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * The CI gate version of scripts/measure-axe.mjs. That script reports the
 * numbers for the README; this asserts them, so a regression fails a pull
 * request instead of waiting to be noticed in a README nobody reread.
 *
 * The baseline is zero on every target, which is not obviously what this
 * stage expected: CLAUDE.md's own Stage 2 notes predicted composing would
 * introduce violations isolated remotes do not have, on the theory that
 * duplicate landmarks and heading order across a boundary are hard to avoid
 * by accident. Measured here, that did not happen. See the README for why:
 * in short, the accessibility work from Stages 0 and 1 (useId, a
 * shell-supplied headingLevel, aria-labelledby panels) was structural rather
 * than incidental, and Stage 2 put exactly one remote on any given page
 * instead of two, which removes the cross-remote collision this stage set
 * out to go looking for.
 *
 * If this ever goes red, that is the finding: report it in the README rather
 * than loosening the assertion to make the suite pass again.
 */
test.describe('accessibility, composed vs isolated', () => {
  test('remote-quote has no violations standing alone', async ({ page }) => {
    await page.goto('http://localhost:3001/')
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(violations).toEqual([])
  })

  test('remote-quote has no violations composed into the shell', async ({ page }) => {
    await page.goto('/vehicle')
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(violations).toEqual([])
  })

  test('remote-account has no violations standing alone', async ({ page }) => {
    await page.goto('http://localhost:3002/')
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(violations).toEqual([])
  })

  test('remote-account has no violations composed into the shell', async ({ page }) => {
    await page.goto('/cover?registration=AB12CDE&year=2019')
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(violations).toEqual([])
  })
})
