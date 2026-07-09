-- 1. Grant permissions to authenticated role
GRANT ALL ON customers TO authenticated;
GRANT ALL ON packages TO authenticated;
GRANT ALL ON reservations TO authenticated;

-- 2. Create emergency insert policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'customers' AND policyname = 'Allow Insert for Authenticated'
    ) THEN
        CREATE POLICY "Allow Insert for Authenticated" ON customers 
        FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'packages' AND policyname = 'Allow Insert for Authenticated'
    ) THEN
        CREATE POLICY "Allow Insert for Authenticated" ON packages 
        FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'reservations' AND policyname = 'Allow Insert for Authenticated'
    ) THEN
        CREATE POLICY "Allow Insert for Authenticated" ON reservations 
        FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    END IF;
END
$$;
