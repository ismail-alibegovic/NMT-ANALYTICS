# NMT Analytics — Role System

## Role Hierarchy

```
super_admin    ─── Platform administrator (vidi sve organizacije)
    ↓
director       ─── Direktor agencije (pun pristup + finansije + postavke)
    ↓
manager        ─── Menadžer/operativa (sve osim postavki organizacije)
    ↓
agent          ─── Agent na terenu (klijenti + rezervacije + polasci)
    ↓
viewer         ─── Read-only (samo pregled podataka)
```

## Backwards Compatibility

Stare role (`admin`, `user`) su zadržane za backwards compatibility:
- `admin` — ekvivalent `director`
- `user` — ekvivalent `agent`

## Permission Checks

### Backend (API)

```typescript
import { requireRole } from './middleware/requireRole';

// Single role
router.get('/settings', requireRole(['director']), getSettings);

// Multiple roles (OR logic)
router.get('/customers', requireRole(['director', 'manager', 'agent']), getCustomers);
```

### Frontend

```typescript
import { hasAccess, canAccessFinances } from './types/roles';
import { useAuth } from './context/AuthContext';

function MyComponent() {
  const { user } = useAuth();
  
  if (!hasAccess('manager', user.role)) {
    return <AccessDenied />;
  }
  
  return (
    <div>
      {canAccessFinances(user.role) && <FinancialSection />}
    </div>
  );
}
```

## Role Capabilities

| Feature | super_admin | director | manager | agent | viewer |
|---------|:-----------:|:--------:|:-------:|:-----:|:------:|
| Dashboard | ✅ (all orgs) | ✅ | ✅ | ✅ | ✅ (read) |
| Customers CRUD | ✅ | ✅ | ✅ | ✅ | ✅ (read) |
| Packages CRUD | ✅ | ✅ | ✅ | ❌ (read) | ❌ (read) |
| Departures CRUD | ✅ | ✅ | ✅ | ❌ (read) | ❌ (read) |
| Reservations CRUD | ✅ | ✅ | ✅ | ✅ | ✅ (read) |
| Payments | ✅ | ✅ | ✅ (read) | ❌ | ❌ |
| Financial Dashboard | ✅ | ✅ | ✅ (read) | ❌ | ❌ |
| Reports & Export | ✅ | ✅ | ✅ | ❌ | ❌ |
| Integrations | ✅ | ✅ | ✅ | ❌ | ❌ |
| Organization Settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| User Management | ✅ | ✅ | ❌ | ❌ | ❌ |
| Audit Log | ✅ | ✅ | ❌ | ❌ | ❌ |

## Migrations

Run migrations in order:
```bash
psql $DATABASE_URL < supabase/sql/002_fix_roles.sql
psql $DATABASE_URL < supabase/sql/003_role_permissions.sql
```
