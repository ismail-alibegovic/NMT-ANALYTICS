import { describe, it, expect, vi } from 'vitest'
import {
  normalizeMoney,
  calculateOutstandingAmount,
  calculateRemainingAmount,
  getDepartureStatus,
  OccupancyStatus,
  formatCurrency,
  getPaymentStatusBadge,
} from '../utils/business'

describe('normalizeMoney', () => {
  it('returns 0 for non-numeric input', () => {
    expect(normalizeMoney(undefined)).toBe(0)
    expect(normalizeMoney(null)).toBe(0)
    expect(normalizeMoney('abc')).toBe(0)
    expect(normalizeMoney(NaN)).toBe(0)
  })

  it('coerces numeric strings and numbers', () => {
    expect(normalizeMoney(1500)).toBe(1500)
    expect(normalizeMoney('9600')).toBe(9600)
    expect(normalizeMoney('9600.50')).toBe(9600.5)
  })
})

describe('calculateOutstandingAmount', () => {
  it('returns total when nothing paid', () => {
    expect(calculateOutstandingAmount(9600, 0)).toBe(9600)
  })

  it('returns the difference when partially paid', () => {
    expect(calculateOutstandingAmount(9600, 1500)).toBe(8100)
  })

  it('returns 0 when fully paid', () => {
    expect(calculateOutstandingAmount(9600, 9600)).toBe(0)
  })

  it('clamps to 0 on overpayment', () => {
    expect(calculateOutstandingAmount(9600, 10000)).toBe(0)
  })

  it('treats sub-cent differences as settled (floating point tolerance)', () => {
    expect(calculateOutstandingAmount(100, 99.999)).toBe(0)
  })

  it('is aliased by calculateRemainingAmount', () => {
    expect(calculateRemainingAmount(9600, 1500)).toBe(8100)
  })
})

describe('getPaymentStatusBadge', () => {
  it('flags fully-paid reservations', () => {
    expect(getPaymentStatusBadge(9600, 9600)).toEqual({
      text: 'Potpuno plaćeno',
      color: 'success',
    })
  })

  it('flags partial payments', () => {
    expect(getPaymentStatusBadge(9600, 1500)).toEqual({
      text: 'Djelimično plaćeno',
      color: 'warning',
    })
  })

  it('flags unpaid reservations', () => {
    expect(getPaymentStatusBadge(9600, 0)).toEqual({
      text: 'Neplaćeno',
      color: 'error',
    })
  })
})

describe('getDepartureStatus', () => {
  it('marks full departures as error', () => {
    expect(getDepartureStatus(50, 50).status).toBe(OccupancyStatus.FULL)
    expect(getDepartureStatus(50, 50).level).toBe('error')
  })

  it('marks 80%+ booked as ALMOST_FULL', () => {
    expect(getDepartureStatus(40, 50).status).toBe(OccupancyStatus.ALMOST_FULL)
  })

  it('marks 50-79% booked as FILLING', () => {
    expect(getDepartureStatus(25, 50).status).toBe(OccupancyStatus.FILLING)
    expect(getDepartureStatus(39, 50).status).toBe(OccupancyStatus.FILLING)
  })

  it('marks under 50% as AVAILABLE', () => {
    expect(getDepartureStatus(10, 50).status).toBe(OccupancyStatus.AVAILABLE)
  })

  it('handles zero capacity gracefully', () => {
    expect(getDepartureStatus(0, 0).level).toBe('neutral')
  })
})

describe('formatCurrency', () => {
  it('formats using bs-BA locale and BAM currency', () => {
    expect(formatCurrency(9600)).toMatch(/9.600,/)
    expect(formatCurrency(9600)).toContain('KM')
  })

  it('treats null/undefined as 0', () => {
    expect(formatCurrency(0)).toContain('0,00')
  })

  it('formats explicit EUR and USD without relabeling them as BAM', () => {
    expect(formatCurrency(100, 'EUR')).toContain('€')
    expect(formatCurrency(100, 'USD')).toContain('USD')
    expect(formatCurrency(100, 'EUR')).not.toContain('KM')
    expect(formatCurrency(100, 'USD')).not.toContain('KM')
  })
})


describe('explicit currency locale', () => {
  for (const locale of ['bs-BA', 'en-GB']) {
    for (const currency of ['BAM', 'EUR']) {
      for (const amount of [0, 1234567.89, -42.5, null, undefined]) {
        it(`formats ${amount} ${currency} with ${locale}`, () => {
          expect(formatCurrency(amount, currency, locale)).toBe(
            new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount ?? 0),
          );
        });
      }
    }
  }
});

it('keeps explicit Bosnian monetary formatting when browser locale data falls back to root', () => {
  const NativeNumberFormat = Intl.NumberFormat;
  const mock = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (locale, options) {
    return new NativeNumberFormat(locale === 'bs-BA' ? 'en-US' : locale, options);
  } as typeof Intl.NumberFormat);
  try {
    expect(formatCurrency(1234567.89, 'BAM', 'bs-BA')).toBe('1.234.567,89\u00a0KM');
    expect(formatCurrency(-1234.5, 'EUR', 'bs-BA')).toBe('-1.234,50\u00a0€');
    expect(formatCurrency(1234.5, 'eur', 'bs-BA')).toBe('1.234,50\u00a0€');
    expect(formatCurrency(1234.5, 'USD', 'bs-BA')).toBe('1.234,50\u00a0USD');
    expect(formatCurrency(0, 'JPY', 'bs-BA')).toBe('0\u00a0JPY');
    expect(formatCurrency(1234.5, 'EUR', 'en-GB')).toBe('€1,234.50');
  } finally { mock.mockRestore(); }
});
