import { expect, test } from '@playwright/test'

/**
 * Against the composed page: the shell with a real remote mounted through
 * module federation, not a remote rendered from its own source like
 * host-shell/src/composition.test.tsx does. This is the suite that would
 * have caught a federation wiring mistake the unit tests cannot see.
 */

test('/ redirects to the first step', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/vehicle$/)
  await expect(page.getByRole('heading', { name: 'Vehicle details', level: 2 })).toBeVisible()
})

test('submitting the vehicle step carries its data into the URL, not just memory', async ({
  page,
}) => {
  await page.goto('/vehicle')
  await page.getByLabel('Registration').fill('ZZ99 XYZ')
  await page.getByLabel('Annual mileage').fill('12000')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL(/\/cover\?/)
  const url = new URL(page.url())
  expect(url.searchParams.get('registration')).toBe('ZZ99 XYZ')
  expect(url.searchParams.get('mileage')).toBe('12000')
  await expect(page.getByText('Quoting cover for ZZ99 XYZ')).toBeVisible()
})

test('a direct link to the cover step works without visiting vehicle first', async ({
  page,
}) => {
  await page.goto('/cover?registration=AB12CDE&year=2019')
  await expect(page.getByText('Quoting cover for AB12CDE, 2019')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Your current policy', level: 2 }),
  ).toBeVisible()
})

test('reloading the cover step does not lose the vehicle it was quoting for', async ({
  page,
}) => {
  await page.goto('/cover?registration=AB12CDE&year=2019')
  await page.reload()
  await expect(page.getByText('Quoting cover for AB12CDE, 2019')).toBeVisible()
})

test('visiting cover with no vehicle degrades to a link back, not a crash', async ({
  page,
}) => {
  await page.goto('/cover')
  await expect(page.getByText('No vehicle on this quote yet.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Your current policy', level: 2 }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Add one' }).click()
  await expect(page).toHaveURL(/\/vehicle$/)
})

test('the step nav marks the current step, and only the current step', async ({ page }) => {
  await page.goto('/vehicle')
  await expect(page.getByRole('listitem').filter({ hasText: 'Vehicle' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByRole('listitem').filter({ hasText: 'Cover' })).not.toHaveAttribute(
    'aria-current',
    'step',
  )

  await page.getByRole('link', { name: 'Cover' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Cover' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByRole('listitem').filter({ hasText: 'Vehicle' })).not.toHaveAttribute(
    'aria-current',
    'step',
  )
})
