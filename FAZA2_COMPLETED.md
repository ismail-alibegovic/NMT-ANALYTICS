# Faza 2 — Role System ✅

## Završeno

### 1. Role Types & Helpers
- **Frontend**: `nmt-analytics-admin/src/types/roles.ts`
- **Backend**: `nmt-analytics-api/src/types/roles.ts`
- **Hijerarhija**: `viewer → agent → manager → director → super_admin`
- **Legacy support**: `admin` i `user` role zadržane

### 2. Helper Functions
- `hasAccess(requiredRole, userRole)` — provjerava hijerarhiju
- `canAccessFinances(role)` — manager+
- `canAccessSettings(role)` — director+
- `canManageUsers(role)` — director+
- `canAccessAuditLog(role)` — director+
- `canAccessIntegrations(role)` — manager+
- `canAccessReports(role)` — manager+
- `canCreateEditPackages(role)` — manager+
- `canCreateEditDepartures(role)` — manager+
- `canAccessPayments(role)` — manager+

### 3. DB Permission System
- **Migration**: `003_role_permissions.sql`
- **Tabela**: `role_permissions` — mapira role na resource/action
- **Function**: `has_permission(role, resource, action)` — SQL helper

### 4. Dokumentacija
- **ROLES.md** — kompletna dokumentacija sistema

## Sljedeći Korak: Implementacija u UI

**Potrebno**:
1. Primijeniti migracije (002, 003)
2. Ažurirati AuthGuard za role checks
3. Ažurirati Sidebar za conditional rendering
4. Dodati role checks u pojedinačne stranice
5. Implementirati read-only mode za viewer/agent role
