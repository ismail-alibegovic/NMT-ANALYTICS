import { describe, expect, it } from 'vitest'
import { en } from '../lib/i18n/en'
import { bs } from '../lib/i18n/bs'

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    collectKeys(v, prefix ? `${prefix}.${k}` : k),
  )
}

const enKeys = collectKeys(en)
const bsKeys = collectKeys(bs)

describe('i18n EN/BS parity', () => {
  it('every EN key exists in BS', () => {
    const missing = enKeys.filter((k) => !bsKeys.includes(k))
    expect(missing).toEqual([])
  })

  it('every BS key exists in EN', () => {
    const extra = bsKeys.filter((k) => !enKeys.includes(k))
    expect(extra).toEqual([])
  })

  it('no empty user-facing strings in flights or departure itinerary keys', () => {
    const sections = [en.operations.flights, bs.operations.flights]
    for (const section of sections) {
      for (const [k, v] of Object.entries(section)) {
        if (typeof v === 'string') expect(v.trim().length, `${k}`).toBeGreaterThan(0)
      }
    }
  })
})