-- Optional: Role permissions mapping table
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    allowed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role, resource, action)
);

-- Seed default permissions
INSERT INTO role_permissions (role, resource, action, allowed) VALUES
('super_admin', '*', '*', true),
('director', 'customers', 'create', true),
('director', 'customers', 'read', true),
('director', 'customers', 'update', true),
('director', 'customers', 'delete', true),
('director', 'packages', 'create', true),
('director', 'packages', 'read', true),
('director', 'packages', 'update', true),
('director', 'packages', 'delete', true),
('director', 'departures', 'create', true),
('director', 'departures', 'read', true),
('director', 'departures', 'update', true),
('director', 'departures', 'delete', true),
('director', 'reservations', 'create', true),
('director', 'reservations', 'read', true),
('director', 'reservations', 'update', true),
('director', 'reservations', 'delete', true),
('director', 'payments', 'create', true),
('director', 'payments', 'read', true),
('director', 'payments', 'update', true),
('director', 'payments', 'delete', true),
('director', 'reports', 'read', true),
('director', 'reports', 'export', true),
('director', 'settings', 'update', true),
('director', 'users', 'manage', true),
('director', 'audit_log', 'read', true),
('manager', 'customers', 'create', true),
('manager', 'customers', 'read', true),
('manager', 'customers', 'update', true),
('manager', 'customers', 'delete', true),
('manager', 'packages', 'create', true),
('manager', 'packages', 'read', true),
('manager', 'packages', 'update', true),
('manager', 'packages', 'delete', true),
('manager', 'departures', 'create', true),
('manager', 'departures', 'read', true),
('manager', 'departures', 'update', true),
('manager', 'departures', 'delete', true),
('manager', 'reservations', 'create', true),
('manager', 'reservations', 'read', true),
('manager', 'reservations', 'update', true),
('manager', 'reservations', 'delete', true),
('manager', 'payments', 'read', true),
('manager', 'reports', 'read', true),
('manager', 'reports', 'export', true),
('agent', 'customers', 'create', true),
('agent', 'customers', 'read', true),
('agent', 'customers', 'update', true),
('agent', 'customers', 'delete', true),
('agent', 'packages', 'read', true),
('agent', 'departures', 'read', true),
('agent', 'reservations', 'create', true),
('agent', 'reservations', 'read', true),
('agent', 'reservations', 'update', true),
('agent', 'reservations', 'delete', true),
('viewer', 'customers', 'read', true),
('viewer', 'packages', 'read', true),
('viewer', 'departures', 'read', true),
('viewer', 'reservations', 'read', true)
ON CONFLICT (role, resource, action) DO NOTHING;

CREATE OR REPLACE FUNCTION has_permission(
    user_role TEXT,
    check_resource TEXT,
    check_action TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    IF user_role = 'super_admin' THEN
        RETURN true;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 FROM role_permissions
        WHERE role = user_role
        AND (resource = check_resource OR resource = '*')
        AND (action = check_action OR action = '*')
        AND allowed = true
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
