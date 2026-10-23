import { describe, expect, it } from 'vitest'
import { en } from '../lib/i18n/en'
import { bs } from '../lib/i18n/bs'

// Dictionaries use {name} tokens. Reordering or repeating a token is valid
// translation grammar; adding/removing a distinct interpolation input is not.
function tokens(value: string): string[] {
  return [...new Set(Array.from(value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g), match => match[1]))].sort()
}

function kind(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function translationErrors(english: unknown, bosnian: unknown, path = '<root>'): string[] {
  const englishKind = kind(english)
  const bosnianKind = kind(bosnian)
  if (englishKind !== bosnianKind) return [`${path}: EN ${englishKind} / BS ${bosnianKind}`]
  if (typeof english === 'string' && typeof bosnian === 'string') {
    const errors: string[] = []
    if (!english.trim()) errors.push(`${path}: empty EN translation`)
    if (!bosnian.trim()) errors.push(`${path}: empty BS translation`)
    if (JSON.stringify(tokens(english)) !== JSON.stringify(tokens(bosnian))) {
      errors.push(`${path}: interpolation tokens differ`)
    }
    return errors
  }
  // One existing translation is a count formatter. Keep that public API and
  // require explicit probes before accepting any additional callable leaf.
  if (typeof english === 'function' && typeof bosnian === 'function') {
    if (path !== 'operations.rooming.applySuccess') return [`${path}: unregistered callable translation`]
    return [0, 1, 1234].flatMap(count => {
      try {
        return translationErrors(english(count), bosnian(count), `${path}(${count})`)
      } catch { return [`${path}(${count}): callable translation failed`] }
    })
  }
  if (english === null || typeof english !== 'object' || bosnian === null || typeof bosnian !== 'object') {
    return [`${path}: expected translated text or a nested dictionary`]
  }
  const enObject = english as Record<string, unknown>
  const bsObject = bosnian as Record<string, unknown>
  const keys = [...new Set([...Object.keys(enObject), ...Object.keys(bsObject)])].sort()
  if (keys.length === 0) return [`${path}: empty translation structure`]
  return keys.flatMap(key => {
    const childPath = path === '<root>' ? key : `${path}.${key}`
    if (!Object.prototype.hasOwnProperty.call(enObject, key)) return [`${childPath}: missing EN translation`]
    if (!Object.prototype.hasOwnProperty.call(bsObject, key)) return [`${childPath}: missing BS translation`]
    return translationErrors(enObject[key], bsObject[key], childPath)
  })
}

describe('i18n EN/BS coverage contract', () => {
  it('all dictionary paths, value structures, nonempty strings and interpolation inputs agree', () => {
    expect(translationErrors(en, bs)).toEqual([])
  })

  it('reports missing and extra nested keys with their exact paths', () => {
    expect(translationErrors(
      { sales: { save: 'Save', cancel: 'Cancel' } },
      { sales: { save: 'Sačuvaj', retry: 'Pokušaj ponovo' } },
    )).toEqual(['sales.cancel: missing BS translation', 'sales.retry: missing EN translation'])
  })

  it('rejects empty translations anywhere, including positional array entries', () => {
    expect(translationErrors(
      { months: ['Jan', ' '], other: 'Ready' },
      { months: ['', 'feb'], other: '\n' },
    )).toEqual(['months.0: empty BS translation', 'months.1: empty EN translation', 'other: empty BS translation'])
  })

  it('rejects swapped dictionary/array shapes even when their leaf paths match', () => {
    expect(translationErrors({ months: ['Jan'] }, { months: { 0: 'jan' } }))
      .toEqual(['months: EN array / BS object'])
  })

  it.each([null, 0, false, undefined])('rejects non-text leaf %s even when both languages agree', value => {
    expect(translationErrors({ label: value }, { label: value }))
      .toEqual(['label: expected translated text or a nested dictionary'])
  })

  it('rejects value type drift and empty structures', () => {
    expect(translationErrors({ label: 'Ready' }, { label: { nested: 'Spremno' } }))
      .toEqual(['label: EN string / BS object'])
    expect(translationErrors({ label: {} }, { label: {} })).toEqual(['label: empty translation structure'])
    expect(translationErrors({ months: [] }, { months: [] })).toEqual(['months: empty translation structure'])
  })

  it('checks array length and positional entries', () => {
    expect(translationErrors({ months: ['Jan', 'Feb'] }, { months: ['jan'] }))
      .toEqual(['months.1: missing BS translation'])
  })

  it('rejects dropped or renamed interpolation inputs', () => {
    expect(translationErrors(
      { summary: '{count} bookings for {name}', time: 'Updated {date}' },
      { summary: '{total} rezervacija za {name}', time: 'Ažurirano' },
    )).toEqual(['summary: interpolation tokens differ', 'time: interpolation tokens differ'])
  })

  it('validates existing rooming formatter outputs and rejects unregistered callables', () => {
    expect(translationErrors({ custom: () => 'Ready' }, { custom: () => 'Spremno' }))
      .toEqual(['custom: unregistered callable translation'])
    expect(translationErrors(() => 'Ready', () => '', 'operations.rooming.applySuccess'))
      .toEqual([0, 1, 1234].map(count => `operations.rooming.applySuccess(${count}): empty BS translation`))
    expect(translationErrors(() => 'Ready', () => { throw new Error('invalid formatter') }, 'operations.rooming.applySuccess'))
      .toEqual([0, 1, 1234].map(count => `operations.rooming.applySuccess(${count}): callable translation failed`))
  })

  it.each([0, 1, 1234])('existing rooming translation preserves count %i in both languages', count => {
    expect(en.operations.rooming.applySuccess(count)).toContain(String(count))
    expect(bs.operations.rooming.applySuccess(count)).toContain(String(count))
  })

  it('accepts token reordering/repetition, diacritics, punctuation and shared labels', () => {
    expect(translationErrors(
      { summary: '{name}: {count} passengers', status: 'Status', money: '{amount} / {currency}' },
      { summary: '{count} putnika za {name}; ukupno {count}', status: 'Status', money: '{currency}: {amount}' },
    )).toEqual([])
  })
})
