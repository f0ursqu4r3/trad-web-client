import { expect, test } from '@playwright/test'

test('legacy authorization route redirects to detached connection maintenance', async ({
  page,
}) => {
  const userAddress = '0x1111111111111111111111111111111111111111'
  await page.route('**/api/accounts', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/hyperliquid/agent-wallets', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          credential_id: '81818181-8181-4818-8818-818181818181',
          network: 'mainnet',
          user_address: userAddress,
          agent_name: 'trad-local',
          agent_address: '0x2222222222222222222222222222222222222222',
          approved: false,
          attached_accounts: 0,
          preferred_name: 'trad-local',
          remote_agents: [],
        },
      ]),
    })
  })
  await page.goto('/auth/test-login?email=dev%40trad.local&return_to=%2Fsettings%2Fauthorization')
  await expect(page).toHaveURL(/\/settings\/accounts$/)
  await expect(page.getByRole('heading', { name: 'Trading accounts' })).toBeVisible()
  await expect(page.getByText('Saved wallet connections', { exact: true })).toBeVisible()
  await expect(page.getByText(userAddress, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Forget local key' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Use this slot' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reconnect account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Account' })
  await expect(dialog.getByPlaceholder('0x...')).toHaveValue(userAddress)
  await page.screenshot({ path: 'test-results/agent-connections.png', fullPage: true })
})

test('settings and administrator control plane are navigable', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/auth/test-login?email=668es218pur%40gmail.com&return_to=%2Fsettings%2Fprofile')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  const areaNav = page.getByRole('navigation', { name: 'Trad areas' })
  await expect(areaNav.getByRole('link', { name: 'Terminal' })).toBeVisible()
  await expect(areaNav.getByRole('link', { name: 'Settings' })).toHaveClass(/active/)
  await expect(areaNav.getByRole('link', { name: 'Admin' })).toBeVisible()
  await expect(page.getByRole('main').getByText('668es218pur@gmail.com')).toBeVisible()
  await page.getByRole('button', { name: 'Account and settings' }).click()
  await expect(page.getByRole('menuitem', { name: 'Trading accounts' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Trading accounts' }).click()
  await expect(page.getByRole('heading', { name: 'Trading accounts' })).toBeVisible()
  await expect(page.getByText('tester', { exact: true })).toBeVisible()
  const accountRow = page
    .getByTestId('account-settings-index')
    .getByRole('row')
    .filter({ hasText: 'tester' })
  await expect(accountRow).toHaveCSS('--account-context-color', /.+/)
  await expect(accountRow.getByRole('cell').first()).toHaveCSS('vertical-align', 'middle')
  await accountRow.getByRole('link', { name: /Manage|Set up/ }).click()
  await expect(page).toHaveURL(/\/settings\/accounts\/[^/]+\/(overview|setup)$/)
  await expect(page.getByRole('navigation', { name: 'Account management' })).toBeVisible()
  await page.getByRole('link', { name: 'Setup', exact: true }).click()
  await expect(page.getByText('Guided account setup', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Authorization', exact: true }).click()
  await expect(page).toHaveURL(/\/authorization$/)
  await expect(page.getByText('Builder Address', { exact: true })).toBeVisible()
  await expect(page.getByText('Wallet approval ceiling', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve 10.0 bps' })).toBeVisible()
  await expect(page.getByText(/Current Trad target total:/)).toBeVisible()
  await page.getByRole('link', { name: 'All accounts' }).click()

  await expect(page.getByRole('link', { name: 'Authorization & fees' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Billing', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  await expect(page.getByText('Private beta', { exact: true })).toBeVisible()
  await expect(page.getByText('Invoices', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Users & access' }).click()
  await expect(page.getByRole('heading', { name: 'Users & access' })).toBeVisible()
  await expect(page.getByText('kriocrypto@gmail.com')).toBeVisible()

  await page.getByRole('link', { name: 'Execution policy' }).click()
  await expect(page.getByRole('heading', { name: 'Execution policy' })).toBeVisible()
  await expect(page.getByText('10.0 bps / 0.100%')).toBeVisible()

  await page.getByRole('link', { name: 'Plans & billing' }).click()
  await expect(page.getByRole('heading', { name: 'Plans & billing' })).toBeVisible()
  await expect(areaNav.getByRole('link', { name: 'Admin' })).toHaveClass(/active/)
  await expect(page.getByRole('cell', { name: 'Private beta' })).toBeVisible()

  await page.screenshot({ path: 'test-results/settings-control-plane.png', fullPage: true })
  expect(pageErrors).toEqual([])
})

test('profile icon choice is saved with user preferences', async ({ page }) => {
  let savedProfile: { meta?: { preferences?: { profile_icon?: unknown } } } | null = null
  await page.route('**/api/me', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    savedProfile = route.request().postDataJSON() as typeof savedProfile
    await route.fulfill({ status: 204, body: '' })
  })

  await page.goto('/auth/test-login?email=668es218pur%40gmail.com&return_to=%2Fsettings%2Fprofile')
  await page.getByText('Bolt', { exact: true }).click()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect.poll(() => savedProfile?.meta?.preferences?.profile_icon).toBe('bolt')
})

test('custom profile image is prepared and saved with user preferences', async ({ page }) => {
  let savedProfile: { meta?: { preferences?: { profile_image?: unknown } } } | null = null
  await page.route('**/api/me', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    savedProfile = route.request().postDataJSON() as typeof savedProfile
    await route.fulfill({ status: 204, body: '' })
  })

  await page.goto('/auth/test-login?email=668es218pur%40gmail.com&return_to=%2Fsettings%2Fprofile')
  const imageBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.fillStyle = '#58a6ff'
    context.fillRect(0, 0, 8, 8)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('PNG unavailable')
    return [...new Uint8Array(await blob.arrayBuffer())]
  })
  await page.getByTestId('profile-image-input').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageBytes),
  })
  await expect(page.getByRole('button', { name: 'Replace image' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Account and settings' }).locator('img'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect
    .poll(() => savedProfile?.meta?.preferences?.profile_image)
    .toMatch(/^data:image\/webp;base64,/)
})

test('terminal account rail exposes its address and animation state', async ({ page }) => {
  await page.goto('/auth/test-login?email=668es218pur%40gmail.com&return_to=%2Fterminal')
  const rail = page.getByTestId('account-identity-rail')
  await expect(rail).toHaveAttribute('aria-label', /Switch trading account.*0x/i)
  await expect(rail.locator('.account-rail-track')).toHaveCount(1)
  await expect(rail).toContainText(/tester.*hyperliquid.*mainnet/i)
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Switch trading account: tester' }),
  ).toBeVisible()
  await expect(page.getByText('Execution workspace')).toHaveCount(0)

  await rail.click()
  await expect(page.getByRole('menuitem', { name: /Copy selected address/i })).toBeVisible()
  await page.keyboard.press('Escape')

  const headerHeights = await Promise.all(
    ['terminal-command-header', 'terminal-device-header', 'terminal-detail-header'].map(
      async (id) => (await page.getByTestId(id).boundingBox())?.height,
    ),
  )
  expect(new Set(headerHeights).size).toBe(1)
  expect(headerHeights[0]).toBe(34)

  await expect(page.getByTestId('projection-entity-tree')).toHaveCSS('display', 'flex')
  await expect(page.getByTestId('projection-entity-tree')).toHaveCSS('flex-direction', 'column')
  await page.screenshot({ path: 'test-results/terminal-account-header.png', fullPage: true })

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Preferences' }).click()
  await page.getByRole('checkbox', { name: 'Animate account identity rail' }).uncheck()
  await page.getByRole('link', { name: 'Terminal', exact: true }).click()
  await expect(
    page.getByTestId('account-identity-rail').locator('.account-rail-static'),
  ).toHaveCount(1)
})

test('authenticated navigation keeps one Gateway connection alive', async ({ page }) => {
  let opened = 0
  let closed = 0
  page.on('websocket', (socket) => {
    if (!new URL(socket.url()).pathname.endsWith('/ws')) return
    opened += 1
    socket.on('close', () => {
      closed += 1
    })
  })

  await page.goto('/auth/test-login?email=668es218pur%40gmail.com&return_to=%2Fterminal')
  await expect(page.getByLabel(/^Trad connection ready/)).toBeVisible()
  await expect.poll(() => opened).toBe(1)

  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await page.getByRole('link', { name: 'Terminal', exact: true }).click()
  await expect(page.getByLabel(/^Trad connection ready/)).toBeVisible()

  expect(opened).toBe(1)
  expect(closed).toBe(0)
})

test('ready first account hands off directly to the command palette', async ({ page }) => {
  const accountId = '71717171-7171-4717-8717-717171717171'
  const userAddress = '0x1111111111111111111111111111111111111111'
  await page.route('**/api/accounts**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: accountId,
          label: 'First account',
          key: 'redacted',
          network: 'mainnet',
          exchange: 'hyperliquid',
          exchange_metadata: {
            product: 'usdc_perp',
            user_address: userAddress,
            agent_address: '0x2222222222222222222222222222222222222222',
            agent_approved: true,
            agent_approval_verified_at_ms: Date.now(),
            builder_address: '0x9585dc2df331106464f56e73d57cecda7d226510',
            builder_config_version: 'v1',
            builder_target_total_tenths_bps: 52,
            builder_approved: true,
            builder_approval_network: 'mainnet',
            builder_approval_user_address: userAddress,
            builder_approval_verified_at_ms: Date.now(),
            max_builder_fee_tenths_bps: 100,
          },
        },
      ]),
    })
  })
  await page.goto(
    `/auth/test-login?email=668es218pur%40gmail.com&return_to=${encodeURIComponent(`/settings/accounts/${accountId}/setup`)}`,
  )
  await expect(page.getByText('Nice — you’re ready to trade.')).toBeVisible()
  await page.screenshot({ path: 'test-results/first-account-handoff.png', fullPage: true })
  await page.getByRole('link', { name: 'Create first command' }).click()
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible()
  await expect(page).not.toHaveURL(/commands=open/)
})

test('super-admin role controls are capability-scoped', async ({ page }) => {
  await page.goto('/auth/test-login?email=668es218pur%40gmail.com&return_to=%2Fadmin%2Fusers')
  const table = page.getByTestId('admin-user-table')
  const owner = table.getByRole('row').filter({ hasText: '668es218pur@gmail.com' })
  const delegatedAdmin = table.getByRole('row').filter({ hasText: 'kriocrypto@gmail.com' })
  await expect(owner.locator('select').first()).toHaveValue('super_admin')
  await expect(owner.locator('select').first()).toBeDisabled()
  await expect(delegatedAdmin.locator('select').first()).toHaveValue('admin')
  await expect(
    delegatedAdmin.locator('select').first().locator('option[value="super_admin"]'),
  ).toHaveCount(1)

  await page.goto('/auth/test-login?email=kriocrypto%40gmail.com&return_to=%2Fadmin%2Fusers')
  const adminTable = page.getByTestId('admin-user-table')
  const protectedOwner = adminTable.getByRole('row').filter({ hasText: '668es218pur@gmail.com' })
  const ordinaryUser = adminTable.getByRole('row').filter({ hasText: 'client-test@trad.local' })
  await expect(protectedOwner.locator('select').first()).toHaveValue('super_admin')
  await expect(protectedOwner.locator('select').first()).toBeDisabled()
  await expect(protectedOwner.getByRole('button', { name: 'Save' })).toBeDisabled()
  await expect(
    ordinaryUser.locator('select').first().locator('option[value="super_admin"]'),
  ).toHaveCount(0)
})

test('zero-account onboarding tours through the real settings controls', async ({ page }) => {
  const visited: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname)
  })
  await page.route('**/api/accounts', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await route.continue()
  })

  await page.goto('/auth/test-login?email=dev%40trad.local&return_to=%2Fterminal')
  await expect(page.getByRole('button', { name: 'Account and settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Add trading account' }).click()

  await expect(page.getByRole('dialog', { name: 'Create Account' })).toBeVisible({
    timeout: 6_000,
  })
  expect(visited).toContain('/settings/profile')
  expect(visited).toContain('/settings/accounts')
})

test('adding an existing Hyperliquid identity opens its configured account', async ({ page }) => {
  const accountId = '61616161-6161-4616-8616-616161616161'
  const userAddress = '0x1111111111111111111111111111111111111111'
  let accountWrites = 0
  await page.route('**/api/hyperliquid/agent-wallets', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/accounts**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST' && request.url().includes('/api/accounts/validate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          skipped: false,
          exchange: 'hyperliquid',
          network: 'mainnet',
          present_permissions: ['User wallet address valid'],
          missing_requirements: [],
          warnings: [],
        }),
      })
      return
    }
    if (request.method() === 'PUT') accountWrites += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: accountId,
          label: 'Existing wallet',
          key: 'redacted',
          network: 'mainnet',
          exchange: 'hyperliquid',
          exchange_metadata: {
            product: 'usdc_perp',
            user_address: userAddress,
            agent_approved: false,
            builder_approved: false,
          },
        },
      ]),
    })
  })

  await page.goto(
    '/auth/test-login?email=dev%40trad.local&return_to=%2Fsettings%2Faccounts%3Fcreate%3D1',
  )
  const dialog = page.getByRole('dialog', { name: 'Create Account' })
  await dialog.locator('select').nth(1).selectOption('hyperliquid')
  await dialog.getByPlaceholder('Account alias').fill('Accidental duplicate')
  await dialog.getByPlaceholder('0x...').fill(userAddress)
  await dialog.getByRole('button', { name: 'Check permissions', exact: true }).click()
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(`/settings/accounts/${accountId}/setup`)
  expect(accountWrites).toBe(0)
})

test('account deletion shows retryable owner-node rejection details', async ({ page }) => {
  await page.route('**/api/hyperliquid/agent-wallets', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/accounts**', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Trading account deletion was rejected by its owner node.',
          rejection: {
            kind: 'account_unavailable',
            reason: 'authoritative reconciliation timed out',
            retryable: true,
          },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: '51515151-5151-4515-8515-515151515151',
          label: 'Timeout QA',
          key: 'redacted',
          network: 'testnet',
          exchange: 'bifake',
          exchange_metadata: null,
        },
      ]),
    })
  })

  await page.goto('/auth/test-login?email=dev%40trad.local&return_to=%2Fsettings%2Faccounts')
  await page.getByRole('button', { name: 'Delete Timeout QA' }).click()
  await page
    .getByRole('dialog', { name: 'Delete trading account' })
    .getByRole('button', {
      name: 'Check and delete',
    })
    .click()

  await expect(
    page.getByText(/Authoritative reconciliation timed out\. Retry the deletion\./),
  ).toBeVisible()
})

test('new accounts continue into required setup instead of stopping at the directory', async ({
  page,
}) => {
  const accountId = '71717171-7171-4717-8717-717171717171'
  const userAddress = '0x1111111111111111111111111111111111111111'
  const agentAddress = '0x2222222222222222222222222222222222222222'
  const occupiedAddress = '0x3333333333333333333333333333333333333333'
  let created = false
  await page.route('**/api/hyperliquid/agent-wallets**', async (route) => {
    const connection = {
      credential_id: '81818181-8181-4818-8818-818181818181',
      network: 'mainnet',
      user_address: userAddress,
      agent_name: 'trad-local',
      agent_address: agentAddress,
      approved: false,
      attached_accounts: 1,
      preferred_name: 'trad-local',
      remote_agents: [{ name: 'trad-local', address: occupiedAddress }],
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().method() === 'GET' ? [connection] : connection),
    })
  })
  await page.route('**/api/accounts**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST' && request.url().includes('/api/accounts/validate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          skipped: false,
          exchange: 'hyperliquid',
          network: 'mainnet',
          present_permissions: ['User wallet address valid', 'Read-only account state reachable'],
          missing_requirements: [],
          warnings: ['Approve the generated agent wallet before trading.'],
        }),
      })
      return
    }
    if (request.method() === 'PUT') {
      created = true
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        created
          ? [
              {
                id: accountId,
                label: 'Setup Route QA',
                key: 'redacted',
                network: 'mainnet',
                exchange: 'hyperliquid',
                exchange_metadata: {
                  product: 'usdc_perp',
                  user_address: userAddress,
                  agent_name: 'trad-local',
                  agent_address: agentAddress,
                  agent_approved: false,
                  builder_approved: false,
                },
              },
            ]
          : [],
      ),
    })
  })

  await page.goto(
    '/auth/test-login?email=dev%40trad.local&return_to=%2Fsettings%2Faccounts%3Fcreate%3D1',
  )
  const dialog = page.getByRole('dialog', { name: 'Create Account' })
  await dialog.locator('select').nth(1).selectOption('hyperliquid')
  await dialog.getByPlaceholder('Account alias').fill('Setup Route QA')
  await dialog.getByPlaceholder('0x...').fill(userAddress)
  await dialog.getByRole('button', { name: 'Check permissions', exact: true }).click()
  await expect(dialog.getByText('Wallet and read-only account access are valid.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(`/settings/accounts/${accountId}/setup`)
  await expect(page.getByRole('heading', { name: 'Setup Route QA' })).toBeVisible()
  await expect(page.getByText('Guided account setup', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Choose and approve Trad’s signing connection' }),
  ).toBeVisible()
  await expect(page.getByText(agentAddress, { exact: true })).toBeVisible()
  await expect(page.getByText(occupiedAddress, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replace this slot' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve agent' })).toBeDisabled()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByRole('button', { name: 'Replace this slot' }).click()
  await expect(page.getByText('selected', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve agent' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Authorize the Trad builder' })).toBeVisible()
  await page.screenshot({ path: 'test-results/signing-connection-setup.png', fullPage: true })
})
