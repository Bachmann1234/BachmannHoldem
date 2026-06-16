import { describe, expect, it } from 'vitest'
import { DEFAULT_KIND, DEFAULT_PRICE_MODE, resolveConfig } from './config.js'

describe('resolveConfig', () => {
  it('applies both defaults when given nothing', () => {
    expect(resolveConfig()).toEqual({ kind: DEFAULT_KIND, priceMode: DEFAULT_PRICE_MODE })
  })

  it('applies both defaults for an empty config', () => {
    expect(resolveConfig({})).toEqual({ kind: DEFAULT_KIND, priceMode: DEFAULT_PRICE_MODE })
  })

  it('honours an explicit kind, defaulting the price mode', () => {
    expect(resolveConfig({ kind: 'preflop' })).toEqual({
      kind: 'preflop',
      priceMode: DEFAULT_PRICE_MODE,
    })
  })

  it('honours an explicit price mode, defaulting the kind', () => {
    expect(resolveConfig({ priceMode: 'priced' })).toEqual({
      kind: DEFAULT_KIND,
      priceMode: 'priced',
    })
  })

  it('honours a fully-specified config', () => {
    expect(resolveConfig({ kind: 'coach', priceMode: 'priced' })).toEqual({
      kind: 'coach',
      priceMode: 'priced',
    })
  })
})
