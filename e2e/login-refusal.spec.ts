import { expect, test } from './support/test'
import { mockGateway } from './support/mockGateway'

// The Gateway refuses logins that are not invited or not verified: the
// callback redirects to /login?reason=<code> and /api/me answers 403.

test('the login page explains a refused login calmly', async ({ page }) => {
  await mockGateway(page, { authenticated: false })

  await page.goto('/login?reason=not_invited')
  const refusal = page.getByTestId('login-refusal')
  await expect(refusal).toHaveText(
    "This login isn't on Trad yet. Ask your Trad contact for an invite.",
  )
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  await page.screenshot({ path: 'test-results/login-not-invited.png', fullPage: true })

  await page.goto('/login?reason=email_unverified')
  await expect(refusal).toHaveText('Verify your email with your login provider, then try again.')
  await page.screenshot({ path: 'test-results/login-email-unverified.png', fullPage: true })

  await page.goto('/login?reason=something_else')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(refusal).toHaveCount(0)
})

for (const code of ['not_invited', 'email_unverified'] as const) {
  test(`a 403 ${code} from /api/me ends the session once and shows the reason`, async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await mockGateway(page, { authenticated: true })
    let meRequests = 0
    await page.route('**/api/me', (route) => {
      meRequests += 1
      return route.fulfill({ status: 403, json: { error: 'refused', code } })
    })

    await page.goto('/terminal')
    await expect(page).toHaveURL(new RegExp(`/login\\?reason=${code}$`))
    await expect(page.getByTestId('login-refusal')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    const settled = meRequests
    await page.waitForTimeout(1_500)
    expect(meRequests).toBe(settled)
    expect(meRequests).toBeLessThanOrEqual(2)
    expect(pageErrors).toEqual([])
  })
}
