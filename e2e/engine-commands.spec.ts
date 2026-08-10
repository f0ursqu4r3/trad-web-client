import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
  await page.goto('/e2e/engine-commands')
})

test('submits an exact protocol-3 market intent and closes only after acceptance', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByRole('button', { name: /Market Order/ }).click()
  await expect(page.getByRole('dialog', { name: 'Market Order' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit' }).click()

  await expect(page.getByRole('dialog', { name: 'Market Order' })).not.toBeVisible()
  await expect(page.getByTestId('latest-command-intent')).toHaveText(
    JSON.stringify({
      accountId: '50000000-0000-4000-8000-000000000001',
      intent: {
        kind: 'place_order',
        parameters: {
          symbol: 'BTC',
          position_side: 'long',
          sizing: { kind: 'quote_notional', amount: '50' },
          execution: { kind: 'market' },
          shape: { kind: 'single' },
        },
      },
    }),
  )
})

test('keeps a rejected limit command open with the authoritative reason', async ({ page }) => {
  await page.getByRole('button', { name: 'Reject next' }).click()
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByRole('button', { name: /Limit Order/ }).click()
  const modal = page.getByRole('dialog', { name: 'Limit Order' })
  await modal.getByLabel('Limit Price').fill('63000.125')
  await modal.getByRole('button', { name: 'Submit' }).click()

  await expect(modal).toBeVisible()
  await expect(modal.getByText('fixture planning rejection')).toBeVisible()
  await expect(page.getByTestId('latest-command-intent')).toContainText('"kind":"place_order"')
  await expect(page.getByTestId('latest-command-intent')).toContainText('"price":"63000.125"')
})

test('opens chase and trailing-entry forms from their aliases', async ({ page }) => {
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByPlaceholder('Search commands').fill('chase')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Chase Order' })).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Chase Order' })
    .getByRole('button', { name: 'Cancel' })
    .click()

  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByPlaceholder('Search commands').fill('te')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Trailing Entry' })).toBeVisible()
})

test('cancel entry work is distinct from flatten and submits an account target', async ({ page }) => {
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByPlaceholder('Search commands').fill('ca')
  await page.keyboard.press('Enter')
  const modal = page.getByRole('dialog', { name: 'Cancel Entry Work' })
  await expect(modal.getByText(/Existing exposure and its active protection remain/)).toBeVisible()
  await modal.getByLabel('Target').selectOption('account')
  await modal.getByText(/Confirm cancellation/).click()
  await modal.getByRole('button', { name: 'Cancel Entry Work' }).click()

  await expect(page.getByTestId('latest-command-intent')).toHaveText(
    JSON.stringify({
      accountId: '50000000-0000-4000-8000-000000000001',
      intent: {
        kind: 'cancel_entry_work',
        parameters: { target: { kind: 'account' } },
      },
    }),
  )
})

test('keeps an unknown-outcome command open and forbids blind resubmission', async ({ page }) => {
  await page.getByRole('button', { name: 'Lose next outcome' }).click()
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByRole('button', { name: /Market Order/ }).click()
  const modal = page.getByRole('dialog', { name: 'Market Order' })
  await modal.getByRole('button', { name: 'Submit' }).click()

  await expect(modal).toBeVisible()
  await expect(modal.getByText(/outcome is unknown/)).toBeVisible()
  await expect(modal.getByText(/Do not resubmit until/)).toBeVisible()
})
