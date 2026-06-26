-- Create packages table (aranžmani)
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BAM',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create departures table (polasci)
CREATE TABLE IF NOT EXISTS departures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    depart_at TIMESTAMP WITH TIME ZONE NOT NULL,
    return_at TIMESTAMP WITH TIME ZONE NOT NULL,
    capacity INTEGER NOT NULL,
    booked INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_dates CHECK (return_at > depart_at),
    CONSTRAINT valid_capacity CHECK (capacity > 0),
    CONSTRAINT valid_booked CHECK (booked >= 0 AND booked <= capacity)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_packages_org_id_is_active ON packages(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_departures_org_id_depart_at ON departures(org_id, depart_at);
CREATE INDEX IF NOT EXISTS idx_departures_package_id_depart_at ON departures(package_id, depart_at);

-- Enable Row Level Security
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE departures ENABLE ROW LEVEL SECURITY;

-- RLS Policies for packages
CREATE POLICY "Organizations can view their own packages" ON packages
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can insert their own packages" ON packages
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can update their own packages" ON packages
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can delete their own packages" ON packages
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for departures
CREATE POLICY "Organizations can view their own departures" ON departures
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can insert their own departures" ON departures
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can update their own departures" ON departures
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can delete their own departures" ON departures
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Super admin policies
CREATE POLICY "Super admins can view all packages" ON packages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can view all departures" ON departures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );
