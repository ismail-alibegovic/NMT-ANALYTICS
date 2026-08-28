import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_VARIABLES,
  SMS_MAX_LENGTH,
  renderTemplate,
  extractPlaceholders,
  hasUnsupportedPlaceholder,
} from '../lib/templateVariables';

describe('TEMPLATE_VARIABLES', () => {
  it('supports all ten required placeholders', () => {
    const keys = TEMPLATE_VARIABLES.map((v) => v.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'customerName',
        'customerPhone',
        'customerEmail',
        'reservationId',
        'reservationStatus',
        'packageName',
        'destination',
        'departureDate',
        'returnDate',
        'agencyName',
      ]),
    );
  });

  it('has placeholder tokens in the exact {{key}} shape', () => {
    for (const v of TEMPLATE_VARIABLES) {
      expect(v.placeholder).toBe(`{{${v.key}}}`);
    }
  });
});

describe('renderTemplate', () => {
  it('replaces supported placeholders with sample values', () => {
    const rendered = renderTemplate('Hello {{customerName}}, welcome to {{agencyName}}');
    expect(rendered).toBe('Hello Amina Kovačević, welcome to Travelmania d.o.o.');
  });

  it('leaves unknown placeholders untouched', () => {
    const rendered = renderTemplate('Hi {{notReal}}');
    expect(rendered).toBe('Hi {{notReal}}');
  });
});

describe('extractPlaceholders', () => {
  it('returns every placeholder key', () => {
    const keys = extractPlaceholders('{{a}} and {{b}} and {{a}}');
    expect(keys).toEqual(['a', 'b', 'a']);
  });

  it('returns an empty array when there are none', () => {
    expect(extractPlaceholders('plain text')).toEqual([]);
  });
});

describe('hasUnsupportedPlaceholder', () => {
  it('accepts supported placeholders', () => {
    expect(hasUnsupportedPlaceholder('Hi {{customerName}}')).toBe(false);
  });

  it('rejects unknown placeholders', () => {
    expect(hasUnsupportedPlaceholder('Hi {{totallyUnknown}}')).toBe(true);
  });

  it('rejects unknown keys in valid token shape', () => {
    expect(hasUnsupportedPlaceholder('{{unknownKey}}')).toBe(true);
  });

  it('accepts plain text without placeholders', () => {
    expect(hasUnsupportedPlaceholder('No variables here')).toBe(false);
  });
});

describe('SMS_MAX_LENGTH', () => {
  it('is 320', () => {
    expect(SMS_MAX_LENGTH).toBe(320);
  });
});
