/**
 * Sprint 5 — Critical path tests (admin)
 *
 * Covers the pure client-side financial calculations that the
 * PortalDashboard KPIs, Reservations page, and Invoices page all
 * depend on. These are the financial-correctness invariants:
 *
 *   - normalizeMoney defends against NaN / null / undefined
 *   - outstanding never goes negative
 *   - floating point drift is absorbed (sub-1¢ tolerance)
 *   - payment badge transitions cleanly between paid/partial/unpaid
 *   - departure buckets flip at the documented 0.5 / 0.8 / 1.0 ratios
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeMoney,
  calculateOutstandingAmount,
  calculateRemainingAmount,
  getDepartureStatus,
  OccupancyStatus,
  formatCurrency,
  formatDate,
  getPaymentStatusBadge,
} from '../utils/business'

describe('normalizeMoney', () => {
  it('returns 0 for non-numeric input', () => {
    expect(normalizeMoney(null)).toBe(0)
    expect(normalizeMoney(undefined)).toBe(0)
    expect(normalizeMoney('not a number')).toBe(0)
    expect(normalizeMoney(NaN)).toBe(0)
  })

  it('coerces numeric strings', () => {
    expect(normalizeMoney('123.45')).toBe(123.45)
    expect(normalizeMoney('9600')).toBe(9600)
  })

  it('passes through real numbers', () => {
    expect(normalizeMoney(100)).toBe(100)
    expect(normalizeMoney(-50)).toBe(-50)
  })
})

describe('calculateOutstandingAmount', () => {
  it('returns total minus paid', () => {
    expect(calculateOutstandingAmount(9600, 1500)).toBe(8100)
    expect(calculateOutstandingAmount(1000, 1000)).toBe(0)
  })

  it('never goes negative (overpaid edge case)', () => {
    expect(calculateOutstandingAmount(1000, 1500)).toBe(0)
  })

  it('treats floating-point drift under 1¢ as fully paid', () => {
    // Total: 100.00, paid: 100.001 → diff 0.001 → must read as 0
    expect(calculateOutstandingAmount(100, 100.001)).toBe(0)
    expect(calculateOutstandingAmount(100.005, 100)).toBe(0)
  })

  it('handles missing inputs as zero', () => {
    expect(calculateOutstandingAmount(null, undefined)).toBe(0)
    expect(calculateOutstandingAmount('1000', null)).toBe(1000)
  })

  it('calculateRemainingAmount is a stable alias', () => {
    expect(calculateRemainingAmount(9600, 1500)).toBe(8100)
    expect(calculateRemainingAmount(1000, 1500)).toBe(0)
  })
})

describe('getPaymentStatusBadge', () => {
  it('returns "Potpuno plaćeno" for fully paid reservations', () => {
    const badge = getPaymentStatusBadge(9600, 9600)
    expect(badge.text).toBe('Potpuno plaćeno')
    expect(badge.color).toBe('success')
  })

  it('falls back to fully-paid when total is 0 (avoids "Neplaćeno" on a 0 reservation)', () => {
    // total == 0 branch: paidAmount(0) >= totalAmount(0) → Potpuno
    const badge = getPaymentStatusBadge(0, 0)
    expect(badge.text).toBe('Potpuno plaćeno')
  })

  it('returns "Djelimično plaćeno" for partial payments', () => {
    const badge = getPaymentStatusBadge(9600, 1500)
    expect(badge.text).toBe('Djelimično plaćeno')
    expect(badge.color).toBe('warning')
  })

  it('returns "Neplaćeno" when nothing has been paid', () => {
    const badge = getPaymentStatusBadge(9600, 0)
    expect(badge.text).toBe('Neplaćeno')
    expect(badge.color).toBe('error')
  })

  it('handles fractional drift at the "fully paid" boundary', () => {
    // paid slightly over total still reads as Potpuno (success)
    const badge = getPaymentStatusBadge(9600, 9600.005)
    expect(badge.color).toBe('success')
  })
})

describe('getDepartureStatus', () => {
  it('returns FULL when capacity <= 0 (null-capacity guard)', () => {
    const result = getDepartureStatus(0, 0)
    expect(result.status).toBe(OccupancyStatus.FULL)
    expect(result.level).toBe('neutral')
  })

  it('returns AVAILABLE when occupancy < 50%', () => {
    const result = getDepartureStatus(20, 100)
    expect(result.status).toBe(OccupancyStatus.AVAILABLE)
    expect(result.level).toBe('success')
  })

  it('returns FILLING at 50%–79%', () => {
    const result = getDepartureStatus(50, 100)
    expect(result.status).toBe(OccupancyStatus.FILLING)
    expect(result.level).toBe('warning')
  })

  it('returns ALMOST_FULL at 80%–99%', () => {
    const result = getDepartureStatus(80, 100)
    expect(result.status).toBe(OccupancyStatus.ALMOST_FULL)
    expect(result.level).toBe('error')
  })

  it('returns FULL at 100% and beyond (oversold detection)', () => {
    const result = getDepartureStatus(100, 100)
    expect(result.status).toBe(OccupancyStatus.FULL)
    expect(result.level).toBe('error')
    const oversold = getDepartureStatus(150, 100)
    expect(oversold.status).toBe(OccupancyStatus.FULL)
    expect(oversold.level).toBe('error')
  })
})

describe('formatCurrency', () => {
  it('formats BAM currency (Bosnian Mark) using bs-BA locale', () => {
    // bs-BA currency formatting uses KM suffix; the exact spacing
    // depends on runtime ICU data; we assert prefix + currency code.
    const formatted = formatCurrency(9600)
    expect(formatted).toMatch(/9.600/)
    expect(formatted).toMatch(/KM/) // BAM → "KM" in Bosnian locale
  })

  it('returns a 0-formatted string when amount is 0 or NaN', () => {
    expect(formatCurrency(0)).toContain('0')
  })
})

describe('formatDate', () => {
  it('returns a dash for empty input', () => {
    expect(formatDate('')).toBe('-')
    expect(formatDate(null as unknown as string)).toBe('-')
  })

  it('formats a valid ISO date', () => {
    const formatted = formatDate('2026-07-18T10:00:00Z')
    // bs-BA formatter → day.month.year.
    expect(formatted).toMatch(/^\d{1,2}\. \d{1,2}\. \d{4}\.$/)
  })
})
