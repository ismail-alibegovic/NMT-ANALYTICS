import { describe, expect, it } from 'vitest';
import { computePassengerDocumentReadiness } from '../lib/documentReadiness';
import { resolveTravelerRequirements } from '../lib/travelerRequirements';
import { resolveDepartureCapabilities } from '../utils/business';

const departDateKey = '2026-09-10';
const returnDateKey = '2026-09-20';

describe('traveler requirements resolver', () => {
  it('resolves explicit domestic bus package requirements as no travel documents', () => {
    const travelerRequirements = resolveTravelerRequirements({
      packageTravelerRequirements: {
        travel_scope: 'domestic',
        document_type: 'none',
      },
      effectiveTransportType: 'bus',
      documentReadinessRequired: false,
    });

    const capabilities = resolveDepartureCapabilities(
      { transport_type: 'bus', document_readiness_required: false },
      {
        transport_type: 'bus',
        traveler_requirements: {
          travel_scope: 'domestic',
          document_type: 'none',
        },
      },
    );

    expect(travelerRequirements).toMatchObject({
      travelScope: 'domestic',
      documentType: 'none',
      allowFillLater: true,
      requireExpiry: false,
    });
    expect(capabilities.needTravelDocuments).toBe(false);
    expect(
      computePassengerDocumentReadiness(
        { id_document_type: null, id_document_number: null },
        { needTravelDocuments: capabilities.needTravelDocuments, travelerRequirements, departDateKey, returnDateKey },
      ),
    ).toBe('not_required');
  });

  it('resolves international bus passport requirements without blocking fill-in-later semantics', () => {
    const travelerRequirements = resolveTravelerRequirements({
      packageTravelerRequirements: {
        travel_scope: 'international',
        document_type: 'passport',
        allow_fill_later: true,
        require_expiry: true,
      },
      effectiveTransportType: 'bus',
      documentReadinessRequired: false,
    });

    expect(travelerRequirements).toMatchObject({
      travelScope: 'international',
      documentType: 'passport',
      allowFillLater: true,
      requireExpiry: true,
    });
    expect(
      computePassengerDocumentReadiness(
        {},
        { needTravelDocuments: true, travelerRequirements, departDateKey, returnDateKey },
      ),
    ).toBe('missing');
  });

  it('preserves flight fallback as passport with expiry and fill-later allowed', () => {
    expect(resolveTravelerRequirements({
      effectiveTransportType: 'flight',
      documentReadinessRequired: false,
    })).toEqual({
      travelScope: 'unspecified',
      documentType: 'passport',
      allowFillLater: true,
      requireExpiry: true,
      requireNationality: false,
      requireDateOfBirth: false,
    });
  });

  it('preserves legacy non-flight document_readiness_required fallback', () => {
    expect(resolveTravelerRequirements({
      effectiveTransportType: 'bus',
      documentReadinessRequired: true,
    })).toMatchObject({
      documentType: 'passport',
      allowFillLater: true,
      requireExpiry: true,
    });
  });

  it('lets a departure override package passport requirements with no documents', () => {
    const capabilities = resolveDepartureCapabilities(
      {
        transport_type: 'bus',
        document_readiness_required: true,
        traveler_requirements: {
          travel_scope: 'domestic',
          document_type: 'none',
        },
      },
      {
        transport_type: 'bus',
        traveler_requirements: {
          travel_scope: 'international',
          document_type: 'passport',
          require_expiry: true,
        },
      },
    );

    expect(capabilities.needTravelDocuments).toBe(false);
    expect(capabilities.travelerRequirements).toMatchObject({
      travelScope: 'domestic',
      documentType: 'none',
    });
  });

  it('supports selective required fields', () => {
    const travelerRequirements = resolveTravelerRequirements({
      packageTravelerRequirements: {
        document_type: 'passport',
        require_expiry: true,
        require_nationality: true,
        require_date_of_birth: false,
      },
      effectiveTransportType: 'bus',
    });

    expect(
      computePassengerDocumentReadiness(
        {
          id_document_type: 'passport',
          id_document_number: 'P123',
          id_document_expiry: '2027-01-01',
          date_of_birth: null,
          nationality: null,
        },
        { needTravelDocuments: true, travelerRequirements, departDateKey, returnDateKey },
      ),
    ).toBe('missing');
    expect(
      computePassengerDocumentReadiness(
        {
          id_document_type: 'passport',
          id_document_number: 'P123',
          id_document_expiry: '2027-01-01',
          date_of_birth: null,
          nationality: 'BA',
        },
        { needTravelDocuments: true, travelerRequirements, departDateKey, returnDateKey },
      ),
    ).toBe('ready');
  });

  it('keeps expiry status semantics when expiry is required', () => {
    const travelerRequirements = resolveTravelerRequirements({
      packageTravelerRequirements: {
        document_type: 'passport',
        require_expiry: true,
      },
      effectiveTransportType: 'bus',
    });

    expect(
      computePassengerDocumentReadiness(
        { id_document_type: 'passport', id_document_number: 'P123', id_document_expiry: '2026-09-09' },
        { needTravelDocuments: true, travelerRequirements, departDateKey, returnDateKey },
      ),
    ).toBe('expired_before_departure');
    expect(
      computePassengerDocumentReadiness(
        { id_document_type: 'passport', id_document_number: 'P123', id_document_expiry: '2026-09-15' },
        { needTravelDocuments: true, travelerRequirements, departDateKey, returnDateKey },
      ),
    ).toBe('expired_before_return');
  });
});
