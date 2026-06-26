# Security Model

This document outlines the security measures implemented to prevent cross-organization data leakage and ensure proper access control.

## Organization Scoping

All data operations are organization-scoped to prevent users from accessing data from other organizations.

### Authentication Flow

1. **JWT Token Verification**: All API requests require a valid JWT token
2. **User Profile Lookup**: Token is used to fetch user profile from `profiles` table
3. **Organization Context**: Profile contains `org_id` which scopes all subsequent operations
4. **Middleware Enforcement**: `attachOrgContext` middleware ensures `req.orgId` is set on all requests

### Database Security

#### Row Level Security (RLS)

All tables with organization-scoped data have RLS enabled:

```sql
-- Example RLS policy
CREATE POLICY "Users can read customers for their org" ON customers
    FOR SELECT USING (org_id = get_my_org_id());
```

#### Organization ID Columns

All organization-scoped tables include an `org_id` column:

- `customers` - Customer data
- `packages` - Travel packages
- `departures` - Departure schedules
- `reservations` - Booking records
- `transactions` - Payment records
- `document_templates` - PDF templates
- `documents` - Generated documents

### API Route Security

#### Middleware Chain

All protected routes use this middleware chain:

```typescript
router.get('/customers', authenticateToken, attachOrgContext, async (req, res) => {
  const orgId = req.orgId!; // Guaranteed to be set by middleware
  // All queries must include .eq('org_id', orgId)
});
```

#### Query Building

Every database query must include organization filtering:

```typescript
// ✅ Correct - org-scoped query
const { data } = await supabase
  .from('customers')
  .select('*')
  .eq('org_id', orgId)  // Required!
  .eq('id', customerId);

// ❌ Incorrect - no org scoping
const { data } = await supabase
  .from('customers')
  .select('*')
  .eq('id', customerId);  // Missing org_id filter!
```

### Helper Functions

#### `requireOrgScope()`

A type-safe helper to ensure queries are org-scoped:

```typescript
import { requireOrgScope } from '../lib/auth-helpers';

const query = requireOrgScope(
  supabase.from('customers').select('*'),
  orgId
);
// Must still call .eq('org_id', orgId) on the returned query
```

### Route Audit Results

All API routes have been audited and confirmed to include proper org scoping:

#### ✅ Secure Routes
- `GET /api/customers` - Filters by `org_id`
- `POST /api/customers` - Sets `org_id` on insert
- `PATCH /api/customers/:id` - Verifies ownership via `org_id`
- `DELETE /api/customers/:id` - Filters by `org_id`

- `GET /api/packages` - Filters by `org_id`
- `POST /api/packages` - Sets `org_id` on insert
- `PATCH /api/packages/:id` - Verifies ownership via `org_id`

- `GET /api/departures` - Filters by `org_id`
- `POST /api/departures` - Sets `org_id` on insert
- `PATCH /api/departures/:id` - Verifies ownership via `org_id`

- `GET /api/reservations` - Filters by `org_id`
- `POST /api/reservations` - Sets `org_id` on insert
- `PATCH /api/reservations/:id` - Verifies ownership via `org_id`
- `DELETE /api/reservations/:id` - Filters by `org_id`

- `GET /api/transactions` - Filters by `org_id`
- `POST /api/transactions` - Sets `org_id` on insert
- `PATCH /api/transactions/:id` - Verifies ownership via `org_id`
- `DELETE /api/transactions/:id` - Filters by `org_id`

- `GET /api/metrics/*` - All metrics queries filter by `org_id`
- `GET /api/reports/*` - All report queries filter by `org_id`

- `POST /api/documents/generate` - Filters templates and entities by `org_id`

#### ✅ Admin Routes
- `GET /api/admin/orgs` - Requires `super_admin` role (no org scoping needed)

### Testing Cross-Org Access

To test for cross-organization data leakage:

```bash
# 1. Create test organizations and users
# 2. Generate data for each org
# 3. Attempt to access data with tokens from different orgs
# 4. Verify 404 responses for unauthorized access

# Example test script (requires setup)
npm run test:security
```

### Security Best Practices

1. **Always use `req.orgId`** - Never trust client-provided org IDs
2. **Validate ownership** - Check `org_id` before updates/deletes
3. **Use RLS policies** - Database-level protection as backup
4. **Log security events** - Monitor failed access attempts
5. **Regular audits** - Review code for org scoping compliance

### Common Vulnerabilities Prevented

1. **IDOR (Insecure Direct Object References)**: Users cannot access objects from other orgs by guessing IDs
2. **Mass Assignment**: All inserts include proper `org_id` assignment
3. **Privilege Escalation**: Role-based access prevents unauthorized operations
4. **Data Leakage**: All queries are automatically scoped to user's organization

### Monitoring

Security events are logged with structured logging:

```json
{
  "level": "warn",
  "requestId": "req-123",
  "method": "GET",
  "path": "/api/customers/foreign-id",
  "status": 404,
  "error": "NOT_FOUND",
  "org_id": "user-org-id"
}
```

### Incident Response

If a security vulnerability is discovered:

1. **Immediate**: Disable affected endpoints
2. **Investigation**: Review logs and code
3. **Fix**: Implement proper org scoping
4. **Testing**: Verify fix with cross-org access tests
5. **Monitoring**: Add additional logging if needed
