import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACTION_SET,
  DEFAULT_KIND,
  DEFAULT_PRICE_MODE,
  DEFAULT_QUANTITY,
  DEFAULT_STREET,
  resolveConfig,
} from './config.js'

/** The fully-defaulted resolved config — the shape every `resolveConfig` result must fill. */
const ALL_DEFAULTS = {
  kind: DEFAULT_KIND,
  priceMode: DEFAULT_PRICE_MODE,
  quantity: DEFAULT_QUANTITY,
  street: DEFAULT_STREET,
  actions: DEFAULT_ACTION_SET,
}

describe('resolveConfig', () => {
  it('applies all defaults when given nothing', () => {
    expect(resolveConfig()).toEqual(ALL_DEFAULTS)
  })

  it('applies all defaults for an empty config', () => {
    expect(resolveConfig({})).toEqual(ALL_DEFAULTS)
  })

  it('honours an explicit kind, defaulting the rest', () => {
    expect(resolveConfig({ kind: 'preflop' })).toEqual({ ...ALL_DEFAULTS, kind: 'preflop' })
  })

  it('honours an explicit price mode, defaulting the rest', () => {
    expect(resolveConfig({ priceMode: 'priced' })).toEqual({ ...ALL_DEFAULTS, priceMode: 'priced' })
  })

  it('honours an explicit calculation quantity, defaulting the rest', () => {
    expect(resolveConfig({ kind: 'calculation', quantity: 'equity' })).toEqual({
      ...ALL_DEFAULTS,
      kind: 'calculation',
      quantity: 'equity',
    })
  })

  it('honours an explicit street, defaulting the rest (ticket 0078)', () => {
    expect(resolveConfig({ kind: 'coach', street: 'turn' })).toEqual({
      ...ALL_DEFAULTS,
      kind: 'coach',
      street: 'turn',
    })
  })

  it('honours an explicit action set, defaulting the rest (ticket 0078)', () => {
    expect(resolveConfig({ kind: 'coach', actions: 'call-raise-fold' })).toEqual({
      ...ALL_DEFAULTS,
      kind: 'coach',
      actions: 'call-raise-fold',
    })
  })

  it('honours a fully-specified config', () => {
    expect(
      resolveConfig({
        kind: 'coach',
        priceMode: 'priced',
        quantity: 'required-equity',
        street: 'river',
        actions: 'call-raise-fold',
      }),
    ).toEqual({
      kind: 'coach',
      priceMode: 'priced',
      quantity: 'required-equity',
      street: 'river',
      actions: 'call-raise-fold',
    })
  })

  it('the flop / call-fold defaults preserve the pre-0078 behaviour', () => {
    // The byte-identical-existing-callers contract: when a caller omits street/actions, they resolve to
    // the flop and the Call/Fold binary the generator dealt before ticket 0078.
    expect(DEFAULT_STREET).toBe('flop')
    expect(DEFAULT_ACTION_SET).toBe('call-fold')
  })

  it("rejects a 'preflop' street with a RangeError (the postflop-board well-posedness guard)", () => {
    // DrillConfig.street is typed PostflopStreet, so a typed caller CANNOT pass 'preflop' — this pins the
    // belt-and-braces runtime guard for any path that smuggles it past the compiler (a JS caller, a
    // deserialised config). A 'preflop' (0-card) board makes a postflop spot incoherent and would throw
    // in evaluate7 downstream; resolveConfig fails loudly here instead. (`as never` bypasses the very
    // type narrowing that makes this state unrepresentable, to exercise the runtime path.)
    expect(() => resolveConfig({ street: 'preflop' as never })).toThrow(RangeError)
    // And the legal postflop streets all resolve cleanly.
    for (const street of ['flop', 'turn', 'river'] as const) {
      expect(() => resolveConfig({ street })).not.toThrow()
    }
  })
})
