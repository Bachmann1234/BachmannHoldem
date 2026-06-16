import { describe, expect, it } from 'vitest'
import { DEFAULT_KIND, DEFAULT_PRICE_MODE, DEFAULT_QUANTITY, resolveConfig } from './config.js'

describe('resolveConfig', () => {
  it('applies all defaults when given nothing', () => {
    expect(resolveConfig()).toEqual({
      kind: DEFAULT_KIND,
      priceMode: DEFAULT_PRICE_MODE,
      quantity: DEFAULT_QUANTITY,
    })
  })

  it('applies all defaults for an empty config', () => {
    expect(resolveConfig({})).toEqual({
      kind: DEFAULT_KIND,
      priceMode: DEFAULT_PRICE_MODE,
      quantity: DEFAULT_QUANTITY,
    })
  })

  it('honours an explicit kind, defaulting the rest', () => {
    expect(resolveConfig({ kind: 'preflop' })).toEqual({
      kind: 'preflop',
      priceMode: DEFAULT_PRICE_MODE,
      quantity: DEFAULT_QUANTITY,
    })
  })

  it('honours an explicit price mode, defaulting the rest', () => {
    expect(resolveConfig({ priceMode: 'priced' })).toEqual({
      kind: DEFAULT_KIND,
      priceMode: 'priced',
      quantity: DEFAULT_QUANTITY,
    })
  })

  it('honours an explicit calculation quantity, defaulting the rest', () => {
    expect(resolveConfig({ kind: 'calculation', quantity: 'equity' })).toEqual({
      kind: 'calculation',
      priceMode: DEFAULT_PRICE_MODE,
      quantity: 'equity',
    })
  })

  it('honours a fully-specified config', () => {
    expect(
      resolveConfig({ kind: 'coach', priceMode: 'priced', quantity: 'required-equity' }),
    ).toEqual({
      kind: 'coach',
      priceMode: 'priced',
      quantity: 'required-equity',
    })
  })
})
