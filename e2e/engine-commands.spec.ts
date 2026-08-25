import { expect, test, type Locator } from '@playwright/test'

async function completeDefaultStop(modal: Locator): Promise<void> {
  await expect(modal.getByLabel(/Protective stop/)).toBeChecked()
  await expect(modal.getByText('Stop market', { exact: true })).toBeVisible()
  await modal.getByLabel('SL Trigger').fill('49000')
}

test.beforeEach(async ({ page }) => {
  await page.route('https://api.hyperliquid.xyz/info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ universe: [{ name: 'BTC' }, { name: 'ETH' }, { name: 'SOL' }] }),
    })
  })
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
  const modal = page.getByRole('dialog', { name: 'Market Order' })
  await expect(modal).toBeVisible()
  await completeDefaultStop(modal)
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
          protection: {
            take_profits: [],
            stop_loss: {
              trigger_price: '49000',
              trigger_source: 'mark_price',
              execution: { kind: 'market' },
            },
          },
          shape: { kind: 'single' },
        },
      },
    }),
  )
})

test('automatically replans order edits without submitting a command', async ({ page }) => {
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByRole('button', { name: /Market Order/ }).click()
  const modal = page.getByRole('dialog', { name: 'Market Order' })

  await expect(modal.getByText('Execution Preview')).toBeVisible()
  await completeDefaultStop(modal)
  await modal.getByLabel('Quote Amount').fill('75')

  await expect(modal.getByText('0.001 BTC', { exact: true })).toBeVisible()
  await expect(modal.getByText('50.001', { exact: true })).toBeVisible()
  await modal.getByText('Exchange rules', { exact: true }).click()
  await expect(modal.getByText('Hyperliquid · size decimals 3', { exact: true })).toBeVisible()
  await expect(page.getByTestId('latest-preview-intent')).toContainText('"amount":"75"')
  await expect(page.getByTestId('latest-command-intent')).toHaveText('none')
})

test('keeps a rejected limit command open with the authoritative reason', async ({ page }) => {
  await page.getByRole('button', { name: 'Reject next' }).click()
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByRole('button', { name: /Limit Order/ }).click()
  const modal = page.getByRole('dialog', { name: 'Limit Order' })
  await modal.getByLabel('Limit Price').fill('63000.125')
  await completeDefaultStop(modal)
  await modal.getByRole('button', { name: 'Submit' }).click()

  await expect(modal).toBeVisible()
  await expect(modal.getByText('fixture planning rejection')).toBeVisible()
  await expect(page.getByTestId('latest-command-intent')).toContainText('"kind":"place_order"')
  await expect(page.getByTestId('latest-command-intent')).toContainText('"price":"63000.125"')
})

test('guides a builder approval preview rejection to the affected account setup', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Require builder approval' }).click()
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByRole('button', { name: /Market Order/ }).click()
  const modal = page.getByRole('dialog', { name: 'Market Order' })
  await completeDefaultStop(modal)

  await expect(modal.getByText('Builder approval required', { exact: true })).toBeVisible()
  await expect(modal.getByRole('link', { name: 'Review authorization' })).toHaveAttribute(
    'href',
    '/settings/accounts/50000000-0000-4000-8000-000000000001/setup',
  )
  await expect(
    modal.getByText('command planning failed: Hyperliquid builder approval does not cover'),
  ).toBeHidden()
  await modal.getByText('Technical detail', { exact: true }).click()
  await expect(
    modal.getByText('command planning failed: Hyperliquid builder approval does not cover'),
  ).toBeVisible()
})

test('opens chase and trailing-entry forms from their aliases', async ({ page }) => {
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByPlaceholder('Search commands').fill('chase')
  await page.keyboard.press('Enter')
  const chase = page.getByRole('dialog', { name: 'Chase Order' })
  await expect(chase).toBeVisible()
  await expect(chase.getByLabel('Maximum Chase Distance')).toHaveValue('none')
  await expect(chase.getByLabel('Boundary Basis Points')).toHaveCount(0)
  await expect(chase.getByLabel(/Protective stop/)).toBeChecked()
  await expect(chase.getByText('Stop market', { exact: true })).toBeVisible()
  await chase.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByPlaceholder('Search commands').fill('te')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Trailing Entry' })).toBeVisible()
})

test('identifies required and invalid command fields beside their controls', async ({ page }) => {
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByRole('button', { name: /Limit Order/ }).click()
  const modal = page.getByRole('dialog', { name: 'Limit Order' })

  await expect(modal.getByText('Symbol is required')).toHaveCount(0)
  await modal.getByLabel('Symbol').fill('')
  await modal.getByLabel('Limit Price').fill('not-a-price')
  await modal.getByLabel('Limit Price').press('Tab')

  await expect(modal.getByText('Symbol is required')).toBeVisible()
  await expect(modal.getByText('Limit price must be a plain decimal number')).toBeVisible()
  await expect(modal.getByText('Fix the highlighted fields to continue.')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Submit' })).toBeDisabled()
  await expect(
    modal.locator(
      '.form-field-help[title="The exact exchange price for the resting limit order."]',
    ),
  ).toBeVisible()
})

test('remembers quantity mode across Market, Chase, Limit, and reload', async ({ page }) => {
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByRole('button', { name: /Market Order/ }).click()
  const market = page.getByRole('dialog', { name: 'Market Order' })
  await market.getByLabel('Amount Type').selectOption('base')
  await market.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByPlaceholder('Search commands').fill('chase')
  await page.keyboard.press('Enter')
  const chase = page.getByRole('dialog', { name: 'Chase Order' })
  await expect(chase.getByLabel('Amount Type')).toHaveValue('base')
  await chase.getByLabel('Amount Type').selectOption('risk_at_stop')
  await chase.getByRole('button', { name: 'Cancel' }).click()

  await page.reload()
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByPlaceholder('Search commands').fill('lo')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('dialog', { name: 'Limit Order' }).getByLabel('Amount Type'),
  ).toHaveValue('risk_at_stop')
})

test('cancel entry work is distinct from flatten and submits an account target', async ({
  page,
}) => {
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
  await completeDefaultStop(modal)
  await modal.getByRole('button', { name: 'Submit' }).click()

  await expect(modal).toBeVisible()
  await expect(modal.getByText(/outcome is unknown/)).toBeVisible()
  await expect(modal.getByText(/Do not resubmit until/)).toBeVisible()
})
