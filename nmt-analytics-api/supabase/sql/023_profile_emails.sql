-- NMT Analytics: Add email column to profiles and sync
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Sync existing emails from auth.users
UPDATE profiles p
SET email = au.email
FROM auth.users au
WHERE p.id = au.id AND p.email IS NULL;
