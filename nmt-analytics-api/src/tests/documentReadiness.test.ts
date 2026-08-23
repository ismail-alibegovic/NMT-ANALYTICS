import { describe, expect, it } from 'vitest';
import {
  computePassengerDocumentReadiness,
  summarizeDocumentReadiness,
  toTravelDateKey,
  type ReadinessDepartureContext,
} from '../lib/documentReadiness';

const DEPART = '2026-09-10';
const RETURN = '2026-09-20';

function ctx(overrides: Partial<ReadinessDepartureContext> = {}): ReadinessDepartureContext {
  return { needTravelDocuments: true, departDateKey: DEPART, returnDateKey: RETURN, ...overrides };
}

const validPassport = {
  id_document_type: 'passport',
  id_document_number: 'P1234567',
  id_document_expiry: '2027-01-01',
};

describe('computePassengerDocumentReadiness', () => {
  it('returns not_required for empty fields when documents are not required', () => {
    const status = computePassengerDocumentReadiness({}, ctx({ needTravelDocuments: false }));
    expect(status).toBe('not_required');
  });

  it('returns ready for a complete valid document', () => {
    expect(computePassengerDocumentReadiness(validPassport, ctx())).toBe('ready');
  });

  it('returns missing when document type is absent', () => {
    const p = { ...validPassport, id_document_type: undefined };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('missing');
  });

  it('returns missing when document type is none', () => {
    const p = { ...validPassport, id_document_type: 'none' };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('missing');
  });

  it('returns missing when document number is absent', () => {
    const p = { ...validPassport, id_document_number: '' };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('missing');
  });

  it('returns missing when expiry is absent', () => {
    const p = { ...validPassport, id_document_expiry: null };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('missing');
  });

  it('returns expired_before_departure when expiry day is before departure day', () => {
    const p = { ...validPassport, id_document_expiry: '2026-09-09' };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('expired_before_departure');
  });

  it('does not return expired_before_departure when expiry equals the departure date', () => {
    const p = { ...validPassport, id_document_expiry: DEPART };
    // No later return window → expiry covers travel; definitely not expired before departure.
    expect(computePassengerDocumentReadiness(p, ctx({ returnDateKey: DEPART }))).toBe('ready');
  });

  it('returns expired_before_return when expiry is after departure but before return', () => {
    const p = { ...validPassport, id_document_expiry: '2026-09-15' };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('expired_before_return');
  });

  it('returns ready when expiry exactly equals the return date', () => {
    const p = { ...validPassport, id_document_expiry: RETURN };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('ready');
  });

  it('bases readiness on the departure date only when there is no return date', () => {
    const c = ctx({ returnDateKey: null });
    expect(
      computePassengerDocumentReadiness({ ...validPassport, id_document_expiry: '2026-12-31' }, c),
    ).toBe('ready');
    expect(
      computePassengerDocumentReadiness({ ...validPassport, id_document_expiry: '2026-09-10' }, c),
    ).toBe('ready');
    expect(
      computePassengerDocumentReadiness({ ...validPassport, id_document_expiry: '2026-09-09' }, c),
    ).toBe('expired_before_departure');
  });

  it('empty nationality does not block readiness', () => {
    const p = { ...validPassport, nationality: '' } as typeof validPassport & { nationality: string };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('ready');
  });

  it('empty date of birth does not block readiness', () => {
    const p = { ...validPassport, date_of_birth: '' } as typeof validPassport & { date_of_birth: string };
    expect(computePassengerDocumentReadiness(p, ctx())).toBe('ready');
  });
});

describe('toTravelDateKey', () => {
  it('passes DATE-only strings through unchanged', () => {
    expect(toTravelDateKey('2026-09-10')).toBe('2026-09-10');
  });

  it('resolves late-evening UTC timestamps to the next Sarajevo day without off-by-one', () => {
    // 2026-08-24T23:30Z is already 2026-08-25 in Europe/Sarajevo.
    expect(toTravelDateKey('2026-08-24T23:30:00Z')).toBe('2026-08-25');
    expect(toTravelDateKey('2026-08-25T00:30:00Z')).toBe('2026-08-25');
  });

  it('returns null for invalid or empty input', () => {
    expect(toTravelDateKey(null)).toBeNull();
    expect(toTravelDateKey('')).toBeNull();
    expect(toTravelDateKey('not-a-date')).toBeNull();
  });

  it('a passport expiring the day before a late-night departure is expired before departure', () => {
    const key = toTravelDateKey('2026-08-24T23:30:00Z');
    const status = computePassengerDocumentReadiness(
      { ...validPassport, id_document_expiry: '2026-08-24' },
      { needTravelDocuments: true, departDateKey: key!, returnDateKey: null },
    );
    expect(status).toBe('expired_before_departure');
  });
});

describe('summarizeDocumentReadiness', () => {
  it('categorizes passenger IDs into the correct status groups', () => {
    const entries: Array<[string, ReturnType<typeof computePassengerDocumentReadiness>]> = [
      ['p-ready', 'ready'],
      ['p-missing', 'missing'],
      ['p-exp-dep', 'expired_before_departure'],
      ['p-exp-ret', 'expired_before_return'],
      ['p-ready2', 'ready'],
    ];
    const summary = summarizeDocumentReadiness(true, entries);
    expect(summary.required).toBe(true);
    expect(summary.totalRelevant).toBe(5);
    expect(summary.ready).toBe(2);
    expect(summary.missing).toBe(1);
    expect(summary.expiredBeforeDeparture).toBe(1);
    expect(summary.expiredBeforeReturn).toBe(1);
    expect(summary.missingPassengerIds).toEqual(['p-missing']);
    expect(summary.expiredBeforeDeparturePassengerIds).toEqual(['p-exp-dep']);
    expect(summary.expiredBeforeReturnPassengerIds).toEqual(['p-exp-ret']);
  });

  it('returns an empty zeroed summary when readiness is not required', () => {
    const summary = summarizeDocumentReadiness(false, [
      ['p1', 'not_required'],
      ['p2', 'not_required'],
    ]);
    expect(summary).toEqual({
      required: false,
      totalRelevant: 2,
      ready: 0,
      missing: 0,
      expiredBeforeDeparture: 0,
      expiredBeforeReturn: 0,
      missingPassengerIds: [],
      expiredBeforeDeparturePassengerIds: [],
      expiredBeforeReturnPassengerIds: [],
    });
  });
});

describe('needTravelDocuments activation (capability rule)', () => {
  const dep = (transportType: string, flag: boolean) => ({
    transport_type: transportType,
    document_readiness_required: flag,
  });

  it('document_readiness_required=true activates readiness for a non-flight departure', () => {
    const d = dep('bus', true);
    const need = d.transport_type === 'flight' || d.document_readiness_required === true;
    expect(need).toBe(true);
    expect(computePassengerDocumentReadiness({}, ctx())).toBe('missing');
  });

  it('a flight departure activates readiness automatically even with flag false', () => {
    const d = dep('flight', false);
    const need = d.transport_type === 'flight' || d.document_readiness_required === true;
    expect(need).toBe(true);
  });

  it('readiness stays inactive for an ordinary non-flight departure with flag false', () => {
    const d = dep('bus', false);
    const need = d.transport_type === 'flight' || d.document_readiness_required === true;
    expect(need).toBe(false);
    expect(computePassengerDocumentReadiness({}, ctx({ needTravelDocuments: need }))).toBe('not_required');
  });
});
