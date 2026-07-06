-- 036_package_options_and_transport.sql
-- Brings together the booking flow:
--   1. Add transport_type to departures so each departure declares bus/flight/none.
--   2. Turn package_services into the canonical "package option" store by linking it
--      to hotels + room types, so an agency can attach multiple hotel tiers to one package.
--   3. Add a uniqueness label (option_key) so the wizard can group options.
-- All additions are nullable/defaulted so existing rows keep working.

-- 1. Departures: transport type ------------------------------------------------
ALTER TABLE departures
  ADD COLUMN IF NOT EXISTS transport_type TEXT NOT NULL DEFAULT 'none'
    CHECK (transport_type IN ('bus', 'flight', 'none'));

COMMENT ON COLUMN departures.transport_type IS 'How travelers reach the destination: bus | flight | none (e.g. local tour)';

-- 1b. Packages: in-package variants + package-level transport type/capacity ----
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS variants JSONB NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS transport_type TEXT NULL
    CHECK (transport_type IS NULL OR transport_type IN ('bus', 'flight', 'none')),
  ADD COLUMN IF NOT EXISTS transport_capacity INTEGER NULL;

COMMENT ON COLUMN packages.variants IS 'Array of {name, tier, accommodation, price, capacity} tiers offered for this package';
COMMENT ON COLUMN packages.transport_type IS 'Default transport mode for this package (bus/flight/none)';
COMMENT ON COLUMN packages.transport_capacity IS 'Default number of seats available per departure for this package';

-- 2. Package services: link to hotel rooms -------------------------------------
ALTER TABLE package_services
  ADD COLUMN IF NOT EXISTS hotel_id UUID NULL REFERENCES hotels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_type TEXT NULL
    CHECK (room_type IS NULL OR room_type IN ('single', 'double', 'triple', 'apartment')),
  ADD COLUMN IF NOT EXISTS option_key TEXT NULL;

-- Index for fast "options of a package" lookups grouped by key
CREATE INDEX IF NOT EXISTS idx_package_services_option
  ON package_services(package_id, option_key);

COMMENT ON COLUMN package_services.hotel_id IS 'When service_type=hotel, the linked hotels row';
COMMENT ON COLUMN package_services.room_type IS 'When service_type=hotel, the room tier offered';
COMMENT ON COLUMN package_services.option_key IS 'Grouping key for bundled options (e.g. accommodation, transport_upgrade)';

-- 3. Reservations: store the chosen option so the sale records what was sold ---
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS package_option_id UUID NULL REFERENCES package_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport_type TEXT NULL
    CHECK (transport_type IS NULL OR transport_type IN ('bus', 'flight', 'none')),
  ADD COLUMN IF NOT EXISTS excursion_ids UUID[] NULL DEFAULT '{}';

COMMENT ON COLUMN reservations.package_option_id IS 'The package_services row chosen as the hotel/tier variant';
COMMENT ON COLUMN reservations.transport_type IS 'Transport mode selected for this booking';
COMMENT ON COLUMN reservations.excursion_ids IS 'Optional excursion IDs attached at booking time';

-- Backfill existing departures transport_type from package_services transport rows so
-- already-entered arrangements are not lost.
UPDATE departures d
  SET transport_type = COALESCE((
    SELECT CASE
      WHEN ps.description ILIKE '%avion%' OR ps.description ILIKE '%flight%' THEN 'flight'
      WHEN ps.description ILIKE '%autobus%' OR ps.description ILIKE '%bus%' THEN 'bus'
      ELSE NULL
    END
    FROM package_services ps
    WHERE ps.package_id = d.package_id
      AND ps.service_type = 'transport'
    LIMIT 1
  ), 'none')
WHERE d.transport_type IS NULL;
