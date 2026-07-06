-- 027_voucher_enhancement.sql
-- Adds hotel stay details + tour guide reference to reservations so vouchers
-- and invoices can show hotel name, room type, check-in/check-out, and the
-- assigned guide. All columns are nullable — backward compatible.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS hotel_name TEXT,
  ADD COLUMN IF NOT EXISTS room_type TEXT,
  ADD COLUMN IF NOT EXISTS check_in DATE,
  ADD COLUMN IF NOT EXISTS check_out DATE,
  ADD COLUMN IF NOT EXISTS tour_guide TEXT;

COMMENT ON COLUMN reservations.hotel_name IS 'Accommodation name for this reservation (voucher display)';
COMMENT ON COLUMN reservations.room_type IS 'Room type: single | double | triple | apartment';
COMMENT ON COLUMN reservations.check_in IS 'Hotel check-in date';
COMMENT ON COLUMN reservations.check_out IS 'Hotel check-out date';
COMMENT ON COLUMN reservations.tour_guide IS 'Assigned tour guide name for the trip';
