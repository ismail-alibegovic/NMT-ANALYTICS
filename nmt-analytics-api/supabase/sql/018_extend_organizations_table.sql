-- Extend organizations table with phone, email, address, currency, and timezone fields
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BAM',
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Sarajevo';

-- Ensure existing rows have defaults for currency and timezone
UPDATE organizations SET currency = 'BAM' WHERE currency IS NULL;
UPDATE organizations SET timezone = 'Europe/Sarajevo' WHERE timezone IS NULL;
