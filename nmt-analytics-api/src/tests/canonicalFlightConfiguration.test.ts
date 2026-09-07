import { describe, it, expect } from 'vitest';
import { resolveDepartureCapabilities } from '../utils/business';

describe('M13.2 — canonical flight configuration state', () => {
  it('FLIGHT departure: flight_id null, canonical segment exists → flightConfigured = true', () => {
    const caps = resolveDepartureCapabilities(
      {
        transport_type: 'flight',
        package_id: null,
        accommodations: [],
        departure_id: 'd1',
      } as any,
      null,
      false,
      [{ id: 's1', departure_id: 'd1', segmentOrder: 0, direction: 'outbound' }] as any,
    );
    expect(caps.flightConfigured).toBe(true);
  });

  it('FLIGHT departure: legacy flight_id exists, but canonical departure_flights empty → flightConfigured = false', () => {
    const caps = resolveDepartureCapabilities(
      {
        transport_type: 'flight',
        package_id: null,
        accommodations: [],
        departure_id: 'd2',
        flight_id: 'some-legacy-flight',
      } as any,
      null,
      false,
      [],
    );
    expect(caps.flightConfigured).toBe(false);
  });

  it('FLIGHT departure: no flightSegments param and no flight_id → flightConfigured = false', () => {
    const caps = resolveDepartureCapabilities(
      {
        transport_type: 'flight',
        package_id: null,
        accommodations: [],
        departure_id: 'd3',
      } as any,
      null,
      false,
    );
    expect(caps.flightConfigured).toBe(false);
  });

  it('BUS departure → flightConfigured is null (not applicable)', () => {
    const caps = resolveDepartureCapabilities(
      {
        transport_type: 'bus',
        package_id: null,
        accommodations: [],
        departure_id: 'd4',
      } as any,
      null,
      false,
    );
    expect(caps.flightConfigured).toBeNull();
  });

  it('FLIGHT departure: no flightSegments param but legacy flight_id → falls back to legacy truth', () => {
    const caps = resolveDepartureCapabilities(
      {
        transport_type: 'flight',
        package_id: null,
        accommodations: [],
        departure_id: 'd5',
        flight_id: 'legacy-flight',
      } as any,
      null,
      false,
    );
    expect(caps.flightConfigured).toBe(true);
  });

  it('FLIGHT departure: multiple canonical segments → flightConfigured = true', () => {
    const caps = resolveDepartureCapabilities(
      {
        transport_type: 'flight',
        package_id: null,
        accommodations: [],
        departure_id: 'd6',
      } as any,
      null,
      false,
      [
        { id: 's1', departure_id: 'd6', segmentOrder: 0, direction: 'outbound' },
        { id: 's2', departure_id: 'd6', segmentOrder: 1, direction: 'return' },
        { id: 's3', departure_id: 'd6', segmentOrder: 2, direction: 'other' },
      ] as any,
    );
    expect(caps.flightConfigured).toBe(true);
  });
});
