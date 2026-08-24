ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS itinerary_id UUID
  REFERENCES itineraries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packages_itinerary_id ON packages(itinerary_id);

COMMENT ON COLUMN packages.itinerary_id IS 'Optional traceability to source itinerary; NULL for standalone packages.';
