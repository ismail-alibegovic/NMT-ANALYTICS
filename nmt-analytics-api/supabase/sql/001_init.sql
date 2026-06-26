-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLES

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles (matching auth.users.id)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_phone_per_org UNIQUE (org_id, phone)
);

-- Packages
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    description TEXT,
    duration_days INT NOT NULL DEFAULT 1,
    max_participants INT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Departures
CREATE TABLE IF NOT EXISTS departures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
    depart_at TIMESTAMPTZ NOT NULL,
    return_at TIMESTAMPTZ NOT NULL,
    capacity INT NOT NULL DEFAULT 0,
    booked INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT booked_lte_capacity CHECK (booked <= capacity),
    CONSTRAINT booked_non_negative CHECK (booked >= 0)
);

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    departure_id UUID REFERENCES departures(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    party_size INT NOT NULL DEFAULT 1 CHECK (party_size > 0),
    reservation_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT CHECK (source IN ('web', 'phone', 'agent', 'walk-in', 'other')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('payment', 'refund')),
    note TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_id_created_at ON customers(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_packages_org_id_created_at ON packages(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_departures_org_id_depart_at ON departures(org_id, depart_at);
CREATE INDEX IF NOT EXISTS idx_departures_package_id ON departures(package_id);
CREATE INDEX IF NOT EXISTS idx_reservations_org_id_reservation_at ON reservations(org_id, reservation_at);
CREATE INDEX IF NOT EXISTS idx_reservations_departure_id ON reservations(departure_id);
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_org_id_occurred_at ON transactions(org_id, occurred_at);

-- 4. RPC FUNCTIONS

-- Atomic increment for departures.booked
CREATE OR REPLACE FUNCTION increment_booked(row_id UUID, amount INT)
RETURNS VOID AS $$
BEGIN
    UPDATE departures
    SET booked = booked + amount
    WHERE id = row_id
      AND booked + amount >= 0
      AND booked + amount <= capacity;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Update failed: capacity exceeded or departure not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. ROW LEVEL SECURITY (RLS)

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Helper function to get the current user's org_id
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID AS $$
    SELECT org_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- POLICIES

-- Organizations
CREATE POLICY "Users can read their own organization" ON organizations
    FOR SELECT USING (id = get_my_org_id());

-- Profiles
CREATE POLICY "Users can read own profile" ON profiles
    FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admins can read all profiles in their org" ON profiles
    FOR SELECT USING (org_id = get_my_org_id() AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Multi-tenant tables
-- We use a generic approach for all tables that have an org_id column

-- Customers
CREATE POLICY "Tenant access - Customers" ON customers
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

-- Packages
CREATE POLICY "Tenant access - Packages" ON packages
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

-- Departures
CREATE POLICY "Tenant access - Departures" ON departures
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

-- Reservations
CREATE POLICY "Tenant access - Reservations" ON reservations
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

-- Transactions
CREATE POLICY "Tenant access - Transactions" ON transactions
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());
