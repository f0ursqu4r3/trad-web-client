import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHyperliquidFeeTier } from '../hyperliquidFeeTier.ts'
import {
  aboveTargetNote,
  balanceLabel,
  collateralAsset,
  collateralNotice,
  leverageMarginMode,
  marketDex,
  marketFees,
  marketSymbolParts,
  rateBps,
  venueSymbolFallback,
} from '../../hyperliquidMarkets.ts'
import { parseHyperliquidMid } from '../../hyperliquidMid.ts'
import { parseTradMarketCatalog } from '../../marketCatalog.ts'
import {
  bestOptionIndex,
  filterMarketOptions,
  marketPickerCommit,
  marketPickerValidity,
  type MarketPickerOption,
} from '../../marketPicker.ts'

// MarketCatalogResponse rows as the gateway serves them.
const catalogResponse = {
  exchange: 'hyperliquid',
  network: 'mainnet',
  observed_at: 1,
  instruments: [
    row('BTC', 'BTC', 'main', 5, { dex: null, asset_id: 0, multipliers: ['1', '1', '1'] }),
    row('KPEPE', 'kPEPE', 'main', 0, { dex: null, asset_id: 7, multipliers: ['1', '1', '1'] }),
    row('XYZ:GOLD', 'xyz:GOLD', 'xyz', 4, {
      dex: 'xyz',
      asset_id: 110003,
      multipliers: ['2', '2', '1'],
    }),
    row('XYZ:SP500', 'xyz:SP500', 'xyz', 3, {
      dex: 'xyz',
      asset_id: 110052,
      growth: true,
      multipliers: ['0.2', '0.2', '0.1'],
    }),
    {
      ...row('XYZ:HOOD', 'xyz:HOOD', 'xyz', 2, {
        dex: 'xyz',
        asset_id: 110011,
        margin: 'isolated_only',
        multipliers: ['2', '2', '1'],
      }),
      tradable: false,
      not_tradable_reason:
        'xyz:HOOD is isolated-margin only on Hyperliquid; Trad trades cross-margin xyz markets only for now',
    },
  ],
}

test('the gateway catalog keeps Trad symbols, exchange spellings, groups and terms', () => {
  const catalog = parseTradMarketCatalog(catalogResponse)
  assert.deepEqual(catalog.symbols, ['BTC', 'KPEPE', 'XYZ:GOLD', 'XYZ:SP500', 'XYZ:HOOD'])
  const gold = catalog.instruments['XYZ:GOLD']!
  assert.equal(gold.venueSymbol, 'xyz:GOLD')
  assert.equal(gold.group, 'xyz')
  assert.equal(gold.tradable, true)
  assert.equal(gold.hyperliquid?.dex, 'xyz')
  assert.equal(gold.hyperliquid?.assetId, 110003)
  assert.equal(gold.hyperliquid?.takerFeeMultiplier, '2')
  assert.equal(catalog.instruments.KPEPE?.venueSymbol, 'kPEPE')
  assert.equal(catalog.instruments.BTC?.hyperliquid?.dex, null)
  assert.deepEqual(catalog.priceRules['XYZ:GOLD'], {
    kind: 'hyperliquid_perpetual',
    sizeDecimals: 4,
  })
  const hood = catalog.instruments['XYZ:HOOD']!
  assert.equal(hood.tradable, false)
  assert.match(hood.notTradableReason ?? '', /isolated-margin only/)
  assert.equal(hood.hyperliquid?.marginMode, 'isolated_only')
  assert.throws(() => parseTradMarketCatalog({ instruments: 'nope' }), /invalid/)
})

test('"gold" finds xyz:GOLD and untradable rows cannot be selected for new trades', () => {
  const catalog = parseTradMarketCatalog(catalogResponse)
  const options: MarketPickerOption[] = catalog.symbols.map((symbol) => {
    const instrument = catalog.instruments[symbol]!
    return {
      symbol,
      venueSymbol: instrument.venueSymbol,
      group: instrument.group,
      selectable: instrument.tradable,
      note: instrument.notTradableReason,
    }
  })
  const gold = filterMarketOptions(options, 'gold')
  assert.deepEqual(
    gold.map(({ venueSymbol }) => venueSymbol),
    ['xyz:GOLD'],
  )
  // Main markets first, then xyz, best matches first within each group.
  assert.deepEqual(
    filterMarketOptions(options, '').map(({ group }) => group),
    ['main', 'main', 'xyz', 'xyz', 'xyz'],
  )
  assert.deepEqual(
    filterMarketOptions(options, 'xyz:').map(({ symbol }) => symbol),
    ['XYZ:GOLD', 'XYZ:HOOD', 'XYZ:SP500'],
  )
  // The first highlighted option skips the untradable HOOD.
  const hoodFirst = filterMarketOptions(options, 'hood')
  assert.equal(hoodFirst[0]?.symbol, 'XYZ:HOOD')
  assert.equal(bestOptionIndex(hoodFirst, 'hood'), -1)
  assert.equal(bestOptionIndex(filterMarketOptions(options, 'xyz:'), 'xyz:'), 0)

  const selectable = {
    status: 'ready' as const,
    symbols: options.filter((option) => option.selectable).map((option) => option.symbol),
  }
  const listed = { status: 'ready' as const, symbols: catalog.symbols }
  // Typing the exchange spelling selects Trad's symbol.
  assert.equal(marketPickerCommit('xyz:gold', 'BTC', selectable, { kind: 'blur' }), 'XYZ:GOLD')
  assert.equal(marketPickerCommit('xyz:HOOD', 'BTC', selectable, { kind: 'blur' }), null)
  const refusals = { 'XYZ:HOOD': hoodFirst[0]!.note! }
  assert.match(
    marketPickerValidity('xyz:HOOD', 'BTC', listed, false, refusals) ?? '',
    /isolated-margin only/,
  )
  assert.equal(marketPickerValidity('xyz:GOLD', 'XYZ:GOLD', listed, false, refusals), null)
})

test('symbols keep Trad case while screens use the exchange spelling', () => {
  assert.equal(marketDex('XYZ:GOLD'), 'xyz')
  assert.equal(marketDex('BTC'), null)
  assert.equal(venueSymbolFallback('XYZ:GOLD'), 'xyz:GOLD')
  assert.equal(venueSymbolFallback('BTC'), 'BTC')
  assert.deepEqual(marketSymbolParts('XYZ:GOLD'), { dex: 'xyz', coin: 'GOLD', venue: 'xyz:GOLD' })
  assert.deepEqual(marketSymbolParts('KPEPE', 'kPEPE'), {
    dex: null,
    coin: 'kPEPE',
    venue: 'kPEPE',
  })
})

test('xyz leverage is cross whatever the account mode', () => {
  assert.equal(leverageMarginMode('XYZ:GOLD', 'isolated'), 'cross')
  assert.equal(leverageMarginMode('BTC', 'isolated'), 'isolated')
})

test('market fees are the tier rates times the market multipliers', () => {
  // Tier 1: taker 4.0 bps, maker 1.2 bps; target 5.5 bps.
  const tier = { takerRate: 0.0004, makerRate: 0.00012 }
  const terms = (taker: string, maker: string, rebate: string) => ({
    takerFeeMultiplier: taker,
    makerFeeMultiplier: maker,
    makerRebateMultiplier: rebate,
  })
  const main = marketFees(tier, null, 55, 100)
  assert.deepEqual([main.takerBuilderBps, main.makerBuilderBps], [1.5, 4.3])
  const gold = marketFees(tier, terms('2', '2', '1'), 55, 100)
  assert.deepEqual([gold.takerBps, gold.makerBps], [8, 2.4])
  assert.deepEqual([gold.takerBuilderBps, gold.makerBuilderBps], [0, 3.1])
  assert.equal(gold.takerAboveTarget, true)
  assert.equal(gold.makerAboveTarget, false)
  assert.equal(
    aboveTargetNote('xyz:GOLD', gold, 55),
    'xyz:GOLD taker fee is 8.0 bps, above the 5.5 target; Trad adds no builder fee to taker fills',
  )
  const growth = marketFees(tier, terms('0.2', '0.2', '0.1'), 55, 100)
  assert.deepEqual([growth.takerBuilderBps, growth.makerBuilderBps], [4.7, 5.2])
  assert.equal(aboveTargetNote('xyz:SP500', growth, 55), null)
  // A maker rebate scales by the rebate multiplier; the approval caps the builder.
  const rebate = marketFees(
    { takerRate: 0.0004, makerRate: -0.00003 },
    terms('2', '2', '1'),
    55,
    40,
  )
  assert.equal(rebate.makerBps, -0.3)
  assert.equal(rebate.makerBuilderBps, 4)
  assert.equal(rateBps('0.0009'), 9)
})

test('Standard-mode xyz collateral is its own balance row', () => {
  assert.equal(collateralAsset('XYZ:GOLD'), 'USDC-XYZ')
  assert.equal(collateralAsset('BTC'), 'USDC')
  const empty = [
    { asset: 'USDC', equity: '100', available: '90' },
    { asset: 'USDC-XYZ', equity: '0', available: '0' },
  ]
  assert.equal(
    collateralNotice('XYZ:GOLD', empty),
    "XYZ:GOLD needs collateral on Hyperliquid's xyz dex: in Standard mode each dex has its own balance. Move USDC to the xyz dex, or switch the account to Unified Account mode",
  )
  assert.equal(collateralNotice('BTC', empty), null)
  // Funded, or Unified Account mode (no per-dex row).
  assert.equal(
    collateralNotice('XYZ:GOLD', [{ asset: 'USDC-XYZ', equity: '25', available: '0' }]),
    null,
  )
  assert.equal(collateralNotice('XYZ:GOLD', [{ asset: 'USDC', equity: '25' }]), null)
  assert.equal(balanceLabel('USDC-XYZ'), 'USDC · xyz dex collateral')
  assert.equal(balanceLabel('USDC'), 'USDC')
})

test('mid prices and fee tiers parse Hyperliquid responses', () => {
  assert.equal(parseHyperliquidMid({ 'xyz:GOLD': '4012.5' }, 'xyz:GOLD', 'XYZ:GOLD'), 4012.5)
  assert.throws(() => parseHyperliquidMid({ GOLD: '1' }, 'xyz:GOLD', 'XYZ:GOLD'), /No midpoint/)
  assert.deepEqual(parseHyperliquidFeeTier({ userCrossRate: '0.0004', userAddRate: '0.00012' }), {
    takerRate: 0.0004,
    makerRate: 0.00012,
  })
  assert.throws(() => parseHyperliquidFeeTier({ userCrossRate: 4 }), /invalid/)
})

function row(
  symbol: string,
  venue: string,
  group: string,
  sizeDecimals: number,
  terms: {
    dex: string | null
    asset_id: number
    margin?: string
    growth?: boolean
    multipliers: [string, string, string]
  },
) {
  return {
    symbol,
    venue_symbol: venue,
    group,
    price_rule: { kind: 'hyperliquid_perpetual', size_decimals: sizeDecimals },
    quantity_step: '0.0001',
    minimum_order_quantity: '0.0001',
    maximum_order_quantity: null,
    minimum_order_notional: '10',
    maximum_leverage: 20,
    tradable: true,
    not_tradable_reason: null,
    hyperliquid: {
      dex: terms.dex,
      dex_index: terms.dex === null ? 0 : 1,
      asset_id: terms.asset_id,
      margin_mode: terms.margin ?? 'cross',
      delisted: false,
      deployer_fee_scale: terms.dex === null ? null : '1',
      growth_mode: terms.growth ?? false,
      taker_fee_multiplier: terms.multipliers[0],
      maker_fee_multiplier: terms.multipliers[1],
      maker_rebate_multiplier: terms.multipliers[2],
    },
  }
}
