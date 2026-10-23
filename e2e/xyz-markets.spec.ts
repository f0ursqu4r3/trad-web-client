import { expect, test, type Page } from '@playwright/test'
import { openWorkspace, type Json } from './support/workspaceWire'

// Hyperliquid HIP-3 "xyz" markets: Trad symbols are upper case (XYZ:GOLD),
// the exchange spells them xyz:GOLD.

function catalogRow(
  symbol: string,
  venue: string,
  group: string,
  terms: { multipliers: [string, string, string]; margin?: string; tradable?: string },
) {
  const xyz = group === 'xyz'
  return {
    symbol,
    venue_symbol: venue,
    group,
    price_rule: { kind: 'hyperliquid_perpetual', size_decimals: 4 },
    quantity_step: '0.0001',
    minimum_order_quantity: '0.0001',
    maximum_order_quantity: null,
    minimum_order_notional: '10',
    maximum_leverage: 20,
    tradable: terms.tradable === undefined,
    not_tradable_reason: terms.tradable ?? null,
    hyperliquid: {
      dex: xyz ? 'xyz' : null,
      dex_index: xyz ? 1 : 0,
      asset_id: xyz ? 110003 : 0,
      margin_mode: terms.margin ?? 'cross',
      delisted: false,
      deployer_fee_scale: xyz ? '1' : null,
      growth_mode: false,
      taker_fee_multiplier: terms.multipliers[0],
      maker_fee_multiplier: terms.multipliers[1],
      maker_rebate_multiplier: terms.multipliers[2],
    },
  }
}

const main = ['1', '1', '1'] as [string, string, string]
const catalogRows = [
  catalogRow('BTC', 'BTC', 'main', { multipliers: main }),
  catalogRow('ETH', 'ETH', 'main', { multipliers: main }),
  catalogRow('SOL', 'SOL', 'main', { multipliers: main }),
  catalogRow('XYZ:GOLD', 'xyz:GOLD', 'xyz', { multipliers: ['2', '2', '1'] }),
  catalogRow('XYZ:HOOD', 'xyz:HOOD', 'xyz', {
    multipliers: ['2', '2', '1'],
    margin: 'isolated_only',
    tradable:
      'xyz:HOOD is isolated-margin only on Hyperliquid; Trad trades cross-margin xyz markets only for now',
  }),
]

// Standard account mode: the xyz dex holds its own, empty, collateral row.
function emptyXyzCollateral(snapshot: Json): void {
  snapshot.balances.push({
    asset: 'USDC-XYZ',
    latest_event_id: 'balance-xyz',
    latest_revision: 77,
    wallet: '0',
    equity: '0',
    available: '0',
  })
  snapshot.checkpoint.summary.balances = snapshot.balances.length
}

function ticketParts(page: Page) {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  return { ticket, market: ticket.getByRole('combobox', { name: /market/i }).first() }
}

test('an xyz market is found, selected, priced and submitted with Trad symbols', async ({
  page,
}) => {
  const wire = await openWorkspace(page, { catalogRows, editSnapshot: emptyXyzCollateral })
  const { ticket, market } = ticketParts(page)
  await expect.poll(() => [...wire.subscribes].sort()).toEqual(['BTC', 'ETH', 'SOL'])

  // Grouped list: Hyperliquid main markets, then xyz.
  await market.click()
  const list = ticket.getByRole('listbox')
  await expect(list.getByText('Hyperliquid', { exact: true })).toBeVisible()
  await expect(list.getByText('xyz', { exact: true }).first()).toBeVisible()

  // Isolated-only xyz markets are listed but cannot be picked for a new trade.
  await market.fill('hood')
  const hood = ticket.getByRole('option', { name: /xyz:HOOD/ })
  await expect(hood).toHaveAttribute('aria-disabled', 'true')
  await expect(hood).toContainText('isolated-margin only')
  await hood.click({ force: true })
  await expect(market).toHaveValue('hood')
  await market.press('Enter')
  await market.press('Escape')
  await expect(market).toHaveValue('BTC')

  // "gold" finds xyz:GOLD; Enter selects it and the field shows Hyperliquid's spelling.
  await market.fill('gold')
  await expect(ticket.getByRole('option', { name: /xyz:GOLD/ })).toBeVisible()
  await market.press('Enter')
  await expect(market).toHaveValue('xyz:GOLD')
  await expect(ticket.getByTestId('ticket-market-terms')).toHaveText('xyz dex · cross margin')
  await expect.poll(() => wire.subscribes.slice(3)).toEqual(['XYZ:GOLD'])

  // Fees: tier-1 taker 4.0 bps × 2 on GOLD passes the account's target.
  await expect(ticket.getByTestId('market-exchange-fee')).toHaveText('taker 8.0 · maker 2.4 bps')
  await expect(ticket.getByTestId('market-fee-note')).toHaveText(
    /^xyz:GOLD taker fee is 8\.0 bps, above the 5\.2 target; Trad adds no builder fee to taker fills$/,
  )

  await ticket.getByLabel('Stop-loss price (USDC)').fill('2000')
  await expect(ticket.getByTestId('collateral-notice')).toHaveText(
    "XYZ:GOLD needs collateral on Hyperliquid's xyz dex: in Standard mode each dex has its own balance. Move USDC to the xyz dex, or switch the account to Unified Account mode",
  )
  await expect(ticket.getByText('Ready', { exact: true })).toBeVisible()
  // With 0 xyz collateral the preview first estimates "insufficient margin"
  // and shows "Submit anyway"; Hyperliquid's activeAssetData (fixture: 10
  // max) then clears it. Wait for that settled state instead of racing the
  // transient button.
  await expect(ticket.getByRole('button', { name: 'Submit anyway' })).toBeHidden()
  await ticket.getByRole('button', { name: /^Buy XYZ:GOLD / }).click()
  await expect(ticket.getByText(/accepted by Trad/)).toBeVisible()

  const evidence = JSON.parse((await page.getByTestId('submitted-command-evidence').textContent())!)
  expect(evidence.intent.parameters.symbol).toBe('XYZ:GOLD')
  expect(wire.subscribes.filter((symbol) => symbol.toLowerCase() === 'xyz:gold')).toEqual([
    'XYZ:GOLD',
  ])
})

test('typing the exchange spelling and leaving the field selects the xyz market', async ({
  page,
}) => {
  const wire = await openWorkspace(page, { catalogRows })
  const { ticket, market } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)
  await market.fill('xyz:gold')
  await market.press('Tab')
  await expect(market).toHaveValue('xyz:GOLD')
  await expect.poll(() => wire.subscribes.slice(3)).toEqual(['XYZ:GOLD'])
  // With funded or unified collateral there is no notice.
  await expect(ticket.getByTestId('collateral-notice')).toHaveCount(0)
})

test('without Trad catalog the picker still offers the main Hyperliquid markets', async ({
  page,
}) => {
  const wire = await openWorkspace(page)
  const { ticket, market } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)
  await market.fill('ze')
  await expect(ticket.getByRole('option', { name: /ZEC/ })).toBeVisible()
  await expect(ticket.getByText('xyz', { exact: true })).toHaveCount(0)
})
