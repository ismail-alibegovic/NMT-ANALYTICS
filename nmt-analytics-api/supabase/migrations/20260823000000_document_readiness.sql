-- Phase 7 — Travel-Document Readiness
-- Adds id_document_expiry to departure_passengers
-- Adds document_readiness_required to departures
-- flight_id already exists from 20260809010000_trip_type_hotel_specs_flights.sql

-- Document expiry for passengers
ALTER TABLE departure_passengers
  ADD COLUMN IF NOT EXISTS id_document_expiry DATE;

COMMENT ON COLUMN departure_passengers.id_document_expiry
  IS 'Travel document expiry date (passport, ID card, etc.)';

-- Opt-in flag for non-flight departures that require document readiness
ALTER TABLE departures
  ADD COLUMN IF NOT EXISTS document_readiness_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN departures.document_readiness_required
  IS 'When true, departure requires travel-document readiness even if it is not a flight';
