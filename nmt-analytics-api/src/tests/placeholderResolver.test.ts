import { describe, expect, it } from 'vitest';
import { resolveForRecipient, type TemplateContext } from '../lib/placeholderResolver';
import type { ResolvedRecipient } from '../lib/recipientResolver';

const baseRecipient: ResolvedRecipient = {
  contact: 'test@example.com',
  name: 'Jan de Vries',
  email: 'jan@example.com',
  phone: '+31612345678',
  reservationId: 'res-1',
  departureId: 'dep-1',
};

const fullContext: TemplateContext = {
  agencyName: 'Travelmania',
  reservationStatus: 'confirmed',
  packageName: 'Venetië Classics',
  destination: 'Amsterdam',
  departureDate: '15.09.2026',
  returnDate: '22.09.2026',
};

const minimalContext: TemplateContext = {
  agencyName: null,
  reservationStatus: null,
  packageName: null,
  destination: null,
  departureDate: null,
  returnDate: null,
};

describe('resolveForRecipient', () => {
  it('resolves all supported placeholders when context is full', () => {
    const template = 'Dear {{customerName}}, your {{packageName}} to {{destination}} departs {{departureDate}}. Status: {{reservationStatus}}. Agency: {{agencyName}}. ID: {{reservationId}}';
    const { rendered, unresolved } = resolveForRecipient(template, baseRecipient, fullContext);
    expect(unresolved).toEqual([]);
    expect(rendered).toBe(
      'Dear Jan de Vries, your Venetië Classics to Amsterdam departs 15.09.2026. Status: confirmed. Agency: Travelmania. ID: res-1',
    );
  });

  it('reports unresolved when context values are missing', () => {
    const template = '{{customerName}} flies to {{destination}} on {{departureDate}}';
    const { rendered, unresolved } = resolveForRecipient(template, baseRecipient, minimalContext);
    expect(unresolved).toEqual(['destination', 'departureDate']);
    expect(rendered).toBe('Jan de Vries flies to {{destination}} on {{departureDate}}');
  });

  it('resolves customerName, customerPhone, customerEmail from recipient', () => {
    const template = '{{customerName}} | {{customerPhone}} | {{customerEmail}}';
    const { rendered, unresolved } = resolveForRecipient(template, baseRecipient, minimalContext);
    expect(unresolved).toEqual([]);
    expect(rendered).toBe('Jan de Vries | +31612345678 | jan@example.com');
  });

  it('reports unresolved when recipient fields are null', () => {
    const recipient: ResolvedRecipient = {
      contact: 'test@example.com',
      name: null,
      email: null,
      phone: null,
      reservationId: null,
      departureId: null,
    };
    const template = '{{customerName}} {{customerEmail}}';
    const { rendered, unresolved } = resolveForRecipient(template, recipient, fullContext);
    expect(unresolved).toEqual(['customerName', 'customerEmail']);
    expect(rendered).toBe('{{customerName}} {{customerEmail}}');
  });

  it('leaves unsupported placeholders unchanged but does not treat them as unresolved', () => {
    const template = '{{unsupportedThing}} and {{customerName}}';
    const { rendered, unresolved } = resolveForRecipient(template, baseRecipient, fullContext);
    expect(unresolved).toEqual([]);
    // Unsupported placeholder passes through unchanged.
    expect(rendered).toContain('{{unsupportedThing}}');
    expect(rendered).toContain('Jan de Vries');
  });

  it('returns empty unresolved for plain text', () => {
    const { rendered, unresolved } = resolveForRecipient('Hello, no placeholders.', baseRecipient, fullContext);
    expect(unresolved).toEqual([]);
    expect(rendered).toBe('Hello, no placeholders.');
  });
});
