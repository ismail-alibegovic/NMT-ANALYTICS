# CRUD Flow Audit - Precise Analysis
**Date:** 2026-01-11  
**Method:** Line-by-line trace from UI → API → Database

---

## Database Schema (ACTUAL - from 001_init.sql)

### Customers Table (lines 24-33)
```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ
);
```
**Missing:** `status` column

### Packages Table (lines 36-49)
```sql
CREATE TABLE packages (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    description TEXT,
    duration_days INT NOT NULL DEFAULT 1,
    max_participants INT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ
);
```
**Missing:** `is_active` column

### Reservations Table (lines 67-81)
```sql
CREATE TABLE reservations (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL,
    customer_id UUID,
    departure_id UUID,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    party_size INT NOT NULL DEFAULT 1,
    reservation_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT,
    created_at TIMESTAMPTZ
);
```
**Missing:** `paid_amount` column  
**Incomplete:** status constraint (missing 'completed')

---

## 1. CUSTOMERS CRUD Flow

### CREATE Flow Trace

#### Step 1: UI Form (Customers.tsx:198-213)
```typescript
const formFields = [
  { name: 'full_name', label: 'Full Name', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'status', label: 'Status', type: 'select', required: true,
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Lead', value: 'lead' },
      { label: 'Archived', value: 'archived' }
    ]
  },
];
```
**Issue:** Sends `status` field that doesn't exist in DB

#### Step 2: Form Submit (Customers.tsx:116-149)
```typescript
const handleSubmit = async (data: any) => {
  const payload = {
    ...data,
    email: data.email || undefined,
    phone: data.phone || undefined
  };
  
  if (editingCustomer) {
    await updateCustomer(editingCustomer.id, payload);
  } else {
    await createCustomer(payload);  // ← Sends { full_name, email, phone, status }
  }
}
```

#### Step 3: API Client (customers.ts:70-73)
```typescript
export async function createCustomer(customerData: CreateCustomerData): Promise<Customer> {
  const { data } = await post<Customer>('/customers', customerData);
  return data;
}
```

#### Step 4: Backend Route (routes/customers.ts:38-103)
```typescript
router.post('/customers', authenticateToken, requireOrgContext, async (req: any, res) => {
  const { full_name, phone, email, status, notes } = req.body;  // ← Accepts status
  const orgId = req.orgId;  // ✅ Server-side injection

  if (!orgId) {
    return res.status(400).json({
      message: 'Organization ID missing',
      code: 'ORG_MISSING'
    });
  }

  if (!full_name) {
    return res.status(400).json({
      message: 'Full name is required',
      code: 'VALIDATION_ERROR'
    });
  }

  // Duplicate check
  if (phone) {
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('org_id', orgId)
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        message: 'Customer with this phone already exists',
        code: 'DUPLICATE_ENTRY'
      });
    }
  }

  // Insert
  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({
      org_id: orgId,  // ✅ Server-side
      full_name,
      phone,
      email: email || null,
      status: status || 'active',  // ❌ Column doesn't exist
      notes: notes || null
    })
    .select()
    .single();

  if (error) {
    return handleSupabaseError(res, error, "Failed to create customer");
  }

  res.status(201).json(data);
});
```

#### Step 5: Database Insert
```sql
INSERT INTO customers (org_id, full_name, phone, email, status, notes)
VALUES (?, ?, ?, ?, ?, ?);
-- ❌ ERROR: column "status" does not exist
```

### VERDICT: 🔴 **BROKEN**

**Why:** Backend tries to insert `status` column that doesn't exist in database.

**Fix Required:**
```sql
-- File: supabase/sql/002_crud_fixes.sql (already created)
ALTER TABLE customers ADD COLUMN status TEXT DEFAULT 'active' 
  CHECK (status IN ('active', 'lead', 'archived'));
```

---

### READ Flow Trace

#### Step 1: UI Fetch (Customers.tsx:42-56)
```typescript
const fetchCustomers = async (page = 1, search = '') => {
  const response = await getCustomers({ page, limit: ITEMS_PER_PAGE, search });
  setCustomers(response.data || []);
};
```

#### Step 2: API Client (customers.ts:44-63)
```typescript
export async function getCustomers(filters: CustomerFilters = {}): Promise<CustomerListResponse> {
  const { data } = await get<CustomerListResponse>('/customers', { params });
  return data;
}
```

#### Step 3: Backend Route (routes/customers.ts:9-35)
```typescript
router.get('/customers', authenticateToken, requireOrgContext, async (req: any, res) => {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('org_id', req.orgId)  // ✅ Server-side filter
    .order('created_at', { ascending: false });

  if (error) throw error;

  res.json({
    data: data || [],
    total: (data || []).length,
    page: 1,
    limit: 100
  });
});
```

#### Step 4: UI Display (Customers.tsx:164-176)
```typescript
render: (_, customer) => (
  <div>
    <span>{customer.firstName} {customer.lastName}</span>  // ❌ These don't exist
    <span>{customer.email}</span>  // ⚠️ No null check
  </div>
)
```

### VERDICT: ⚠️ **PARTIALLY WORKS**

**Why:** 
- Data fetches successfully
- But UI expects `firstName`/`lastName` (DB has `full_name`)
- Email displayed without null check

**Fix Required:**
```typescript
// File: src/pages/admin/Customers.tsx, line 171
// Change from:
{customer.firstName} {customer.lastName}

// To:
{customer.full_name || customer.fullName || '-'}

// Line 173:
{customer.email || 'No email'}
```

---

### UPDATE Flow Trace

#### Backend Route (routes/customers.ts:106-130)
```typescript
router.patch('/customers/:id', authenticateToken, requireOrgContext, async (req: any, res) => {
  const { id } = req.params;
  const { full_name, phone, email, status, notes } = req.body;

  const { data, error } = await supabaseAdmin
    .from('customers')
    .update({
      full_name,
      phone,
      email,
      status,  // ❌ Column doesn't exist
      notes
    })
    .eq('id', id)
    .eq('org_id', req.orgId)  // ✅ Multi-tenant safe
    .select()
    .single();

  if (error) throw error;
  res.json(data);
});
```

### VERDICT: 🔴 **BROKEN**

**Why:** Tries to update `status` column that doesn't exist.

---

### DELETE Flow Trace

#### Backend Route (routes/customers.ts:133-146)
```typescript
router.delete('/customers/:id', authenticateToken, requireOrgContext, async (req: any, res) => {
  const { error } = await supabaseAdmin
    .from('customers')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', req.orgId);  // ✅ Multi-tenant safe

  if (error) throw error;
  res.json({ success: true });
});
```

### VERDICT: ✅ **WORKS**

**Why:** No column mismatches, proper org_id filtering.

---

## 2. PACKAGES CRUD Flow

### CREATE Flow Trace

#### Step 1: UI Form (Packages.tsx:189-200)
```typescript
const formFields = [
  { name: 'name', label: 'Package Name', type: 'text', required: true },
  { name: 'destination', label: 'Destination', type: 'text', required: true },
  { name: 'price', label: 'Price', type: 'number', required: true },
  { name: 'currency', label: 'Currency', type: 'text', required: true },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'durationDays', label: 'Duration (days)', type: 'number' },
  { name: 'maxParticipants', label: 'Max Participants', type: 'number' },
  { name: 'startDate', label: 'Start Date', type: 'date' },
  { name: 'endDate', label: 'End Date', type: 'date' },
  { name: 'active', label: 'Active', type: 'checkbox' },  // ← Sends 'active'
];
```

#### Step 2: Form Submit (Packages.tsx:119-143)
```typescript
const handleSubmit = async (data: any) => {
  const payload = {
    ...data,
    price: Number(data.price),
    durationDays: data.durationDays ? Number(data.durationDays) : undefined,
    maxParticipants: data.maxParticipants ? Number(data.maxParticipants) : undefined,
  };

  if (editingPackage) {
    await updatePackage(editingPackage.id, payload);
  } else {
    await createPackage(payload);  // ← Sends { name, destination, price, active, ... }
  }
}
```

#### Step 3: Backend Route (routes/packages.ts:97-137)
```typescript
router.post('/packages', authenticateToken, requireOrgContext, async (req: any, res: Response, next) => {
  const validationResult = createPackageSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: validationResult.error.issues
    });
  }

  const validated = validationResult.data;
  const orgId = req.orgId!;

  const { data: packageData, error } = await supabaseAdmin
    .from('packages')
    .insert({
      org_id: orgId,  // ✅ Server-side
      name: validated.name,
      destination: validated.destination,
      base_price: validated.price,  // ✅ Correctly mapped
      currency: validated.currency,
      is_active: validated.active,  // ❌ Column doesn't exist
      description: validated.description,
      duration_days: validated.durationDays,  // ✅ Correctly mapped
      max_participants: validated.maxParticipants,  // ✅ Correctly mapped
      start_date: validated.startDate,
      end_date: validated.endDate,
    })
    .select()
    .single();

  if (error) return handleSupabaseError(res, error, "Failed to create package");

  return res.status(201).json(packageData);
});
```

#### Step 4: Database Insert
```sql
INSERT INTO packages (org_id, name, destination, base_price, currency, is_active, ...)
VALUES (?, ?, ?, ?, ?, ?, ...);
-- ❌ ERROR: column "is_active" does not exist
```

### VERDICT: 🔴 **BROKEN**

**Why:** Backend tries to insert `is_active` column that doesn't exist in database.

**Fix Required:**
```sql
-- File: supabase/sql/002_crud_fixes.sql (already created)
ALTER TABLE packages ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
```

---

### READ Flow Trace

#### Backend Route (routes/packages.ts:50-92)
```typescript
router.get('/packages', authenticateToken, requireOrgContext, async (req: any, res: Response, next) => {
  const { data: packages, error, count } = await supabaseAdmin
    .from('packages')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)  // ✅ Server-side filter
    .order(orderBy as string || 'created_at', { ascending: orderDir === 'asc' })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return res.json(formatListResponse(packages || [], count || 0, page, limit));
});
```

### VERDICT: ✅ **WORKS**

**Why:** No column mismatches, proper org_id filtering.

---

### UPDATE Flow Trace

#### Backend Route (routes/packages.ts:185-224)
```typescript
router.patch('/packages/:id', authenticateToken, requireOrgContext, async (req: any, res: Response, next) => {
  const updateData: any = {};

  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.destination !== undefined) updateData.destination = validated.destination;
  if (validated.price !== undefined) updateData.base_price = validated.price;  // ✅ Mapped
  if (validated.currency !== undefined) updateData.currency = validated.currency;
  if (validated.active !== undefined) updateData.is_active = validated.active;  // ❌ Column doesn't exist
  if (validated.description !== undefined) updateData.description = validated.description;
  if (validated.durationDays !== undefined) updateData.duration_days = validated.durationDays;  // ✅ Mapped
  if (validated.maxParticipants !== undefined) updateData.max_participants = validated.maxParticipants;  // ✅ Mapped
  if (validated.startDate !== undefined) updateData.start_date = validated.startDate;
  if (validated.endDate !== undefined) updateData.end_date = validated.endDate;

  const { data: packageData, error } = await supabaseAdmin
    .from('packages')
    .update(updateData)
    .eq('id', id)
    .eq('org_id', orgId)  // ✅ Multi-tenant safe
    .select()
    .single();

  if (error) return handleSupabaseError(res, error, "Failed to update package");

  return res.json(packageData);
});
```

### VERDICT: 🔴 **BROKEN**

**Why:** Tries to update `is_active` column that doesn't exist.

---

### DELETE Flow Trace

#### Backend Route (routes/packages.ts:229-247)
```typescript
router.delete('/packages/:id', authenticateToken, requireOrgContext, async (req: any, res: Response, next) => {
  // Soft delete by setting is_active = false
  const { error } = await supabaseAdmin
    .from('packages')
    .update({ is_active: false })  // ❌ Column doesn't exist
    .eq('id', id)
    .eq('org_id', orgId);  // ✅ Multi-tenant safe

  if (error) return handleSupabaseError(res, error, "Failed to delete package");

  return res.status(204).send();
});
```

### VERDICT: 🔴 **BROKEN**

**Why:** Tries to update `is_active` column that doesn't exist.

**Alternative:** Hard delete would work:
```typescript
const { error } = await supabaseAdmin
  .from('packages')
  .delete()
  .eq('id', id)
  .eq('org_id', orgId);
```

---

## 3. RESERVATIONS CRUD Flow

### CREATE Flow Trace

#### Backend Route (routes/reservations.ts:158-225)
```typescript
router.post('/reservations', authenticateToken, requireOrgContext, async (req, res: Response) => {
  const validationResult = createReservationSchema.safeParse(req.body);
  if (!validationResult.success) {
    res.status(400).json({
      message: 'Invalid request body',
      code: 'VALIDATION_ERROR',
      details: validationResult.error.issues
    });
    return;
  }

  const { departureId, status, partySize, customerId, upsert, ...rest } = validationResult.data;
  const orgId = req.orgId!;  // ✅ Server-side

  // Validate customer if provided
  if (customerId) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('org_id', orgId)  // ✅ Multi-tenant safe
      .single();
    if (!customer) {
      res.status(404).json({
        message: 'Customer not found',
        code: 'CUSTOMER_NOT_FOUND'
      });
      return;
    }
  }

  // Call atomic RPC function
  const { data: reservation, error } = await supabaseAdmin
    .rpc('create_reservation_atomic', {
      p_org_id: orgId,  // ✅ Server-side
      p_departure_id: departureId || null,
      p_customer_data: { ...rest, customerId },
      p_party_size: partySize,
      p_status: status
    });

  if (error) {
    if (error.message === 'CAPACITY_FULL') {
      return res.status(400).json({
        message: 'Departure capacity is full',
        code: 'CAPACITY_FULL'
      });
    }
    if (error.message === 'DEPARTURE_NOT_FOUND') {
      return res.status(404).json({
        message: 'Departure not found',
        code: 'DEPARTURE_NOT_FOUND'
      });
    }
    return handleSupabaseError(res, error, "Failed to create reservation");
  }

  res.status(201).json(reservation);
});
```

### VERDICT: ✅ **WORKS** (via RPC)

**Why:** Uses RPC function, doesn't directly insert. RPC handles org_id.

---

### READ Flow Trace

#### Backend Route (routes/reservations.ts:91-153)
```typescript
router.get('/reservations', authenticateToken, requireOrgContext, async (req, res, next) => {
  let query = supabaseAdmin
    .from('reservations')
    .select(`
      *,
      customers (id, full_name, phone, email),
      departures (
        id,
        depart_at,
        return_at,
        packages (id, name, destination)
      )
    `, { count: 'exact' })
    .eq('org_id', orgId)  // ✅ Server-side filter
    .gte('reservation_at', dateFrom)
    .lte('reservation_at', dateTo)
    .order(orderBy as string || 'reservation_at', { ascending: orderDir === 'asc' })
    .range(offset, offset + limit - 1);

  const { data: reservations, error, count } = await query;
  if (error) throw error;

  // Transform data
  const transformedData = (reservations || []).map(transformReservation);

  return res.json(formatListResponse(transformedData, count || 0, page, limit));
});
```

#### Transform Function (routes/reservations.ts:66-86)
```typescript
function transformReservation(reservation: any) {
  const customer = reservation.customers;
  const departure = reservation.departures;
  const pkg = departure?.packages;

  const totalAmount = Number(reservation.total_amount || 0);
  const paidAmount = Number(reservation.paid_amount || 0);  // ❌ Column doesn't exist
  const remainingAmount = calculateRemainingAmount(totalAmount, paidAmount);

  return {
    ...reservation,
    customerName: reservation.customer_name || customer?.full_name || '-',
    packageName: pkg?.name || '-',
    bookingDate: reservation.reservation_at,
    totalAmount: totalAmount,
    paidAmount: paidAmount,  // Will be 0 or NaN
    remainingAmount: remainingAmount,
    participants: reservation.party_size || 0,
    status: reservation.status
  };
}
```

### VERDICT: ⚠️ **PARTIALLY WORKS**

**Why:** 
- Data fetches successfully
- But `paid_amount` column doesn't exist, so it's always 0
- `remainingAmount` calculation is wrong

**Fix Required:**
```sql
-- File: supabase/sql/002_crud_fixes.sql (already created)
ALTER TABLE reservations ADD COLUMN paid_amount NUMERIC(12, 2) DEFAULT 0;
```

---

### UPDATE Flow Trace

#### Backend Route (routes/reservations.ts:230-384)
```typescript
router.patch('/reservations/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  const { id } = req.params;
  const validationResult = updateReservationSchema.safeParse(req.body);
  
  const updates = validationResult.data;
  const orgId = req.orgId!;

  // Fetch current reservation
  const { data: reservation, error: fetchErr } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)  // ✅ Multi-tenant safe
    .single();

  if (fetchErr || !reservation) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reservation not found' } });
    return;
  }

  // ... capacity management logic ...

  // Apply updates
  const updateData: any = {
    status: updates.status,
    departure_id: updates.departureId === undefined ? reservation.departure_id : (updates.departureId === null ? null : updates.departureId),
    customer_id: updates.customerId === undefined ? reservation.customer_id : (updates.customerId === null ? null : updates.customerId),
    total_amount: updates.totalAmount,
    reservation_at: updates.reservationAt,
    party_size: updates.partySize,
    customer_name: updates.customerName,
    customer_phone: updates.customerPhone,
    currency: updates.currency,
    source: updates.source
  };

  const { data: updatedReservation, error: updateErr } = await supabaseAdmin
    .from('reservations')
    .update(updateData)
    .eq('id', id)
    .eq('org_id', orgId)  // ✅ Multi-tenant safe
    .select()
    .single();

  if (updateErr) return handleSupabaseError(res, updateErr, "Failed to update reservation");

  res.json(updatedReservation);
});
```

### VERDICT: ✅ **WORKS**

**Why:** 
- Doesn't try to update `paid_amount`
- All fields exist in DB
- Proper org_id filtering

---

### DELETE Flow Trace

#### Backend Route (routes/reservations.ts:389-448)
```typescript
router.delete('/reservations/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  const { id } = req.params;
  const orgId = req.orgId!;

  // Fetch current reservation to handle capacity
  const { data: reservation, error: fetchErr } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)  // ✅ Multi-tenant safe
    .single();

  if (fetchErr || !reservation) {
    res.status(404).json({
      message: 'Reservation not found',
      code: 'NOT_FOUND'
    });
    return;
  }

  // Decrement booked count if confirmed
  if (reservation.departure_id && reservation.status === 'confirmed') {
    const { data: departure } = await supabaseAdmin
      .from('departures')
      .select('booked')
      .eq('id', reservation.departure_id)
      .single();
    if (departure) {
      await supabaseAdmin
        .from('departures')
        .update({ booked: Math.max(0, departure.booked - reservation.party_size) })
        .eq('id', reservation.departure_id);
    }
  }

  // Delete reservation
  const { error } = await supabaseAdmin
    .from('reservations')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);  // ✅ Multi-tenant safe

  if (error) return handleSupabaseError(res, error, "Failed to delete reservation");

  res.status(204).send();
});
```

### VERDICT: ✅ **WORKS**

**Why:** No column mismatches, proper org_id filtering, handles capacity correctly.

---

## Summary Table

| Entity | CREATE | READ | UPDATE | DELETE | Overall |
|--------|:------:|:----:|:------:|:------:|:-------:|
| **Customers** | 🔴 BROKEN | ⚠️ PARTIAL | 🔴 BROKEN | ✅ WORKS | 🔴 **BROKEN** |
| **Packages** | 🔴 BROKEN | ✅ WORKS | 🔴 BROKEN | 🔴 BROKEN | 🔴 **BROKEN** |
| **Reservations** | ✅ WORKS | ⚠️ PARTIAL | ✅ WORKS | ✅ WORKS | ⚠️ **PARTIAL** |

---

## Exact Files and Lines to Fix

### 1. Database Schema (CRITICAL)

**File:** `supabase/sql/002_crud_fixes.sql` (already created)

Run this migration to add missing columns:
```sql
ALTER TABLE customers ADD COLUMN status TEXT DEFAULT 'active' 
  CHECK (status IN ('active', 'lead', 'archived'));

ALTER TABLE packages ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

ALTER TABLE reservations ADD COLUMN paid_amount NUMERIC(12, 2) DEFAULT 0;
```

### 2. Frontend Display Issues

**File:** `src/pages/admin/Customers.tsx`

**Line 171:** Fix name display
```typescript
// Change from:
{customer.firstName} {customer.lastName}

// To:
{customer.full_name || customer.fullName || '-'}
```

**Line 173:** Fix email null check
```typescript
// Change from:
{customer.email}

// To:
{customer.email || 'No email'}
```

### 3. Error Response Format (MINOR)

**File:** `src/routes/reservations.ts`

**Line 255:** Standardize error format
```typescript
// Change from:
res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reservation not found' } });

// To:
return res.status(404).json({
  message: 'Reservation not found',
  code: 'NOT_FOUND'
});
```

**Line 566:** Same fix
**Line 583:** Same fix

---

## Validation Status

### ✅ org_id Injection (ALL ROUTES)

**Verified:** All routes use `req.orgId` from middleware, never from client.

Examples:
- `routes/customers.ts:79` - `org_id: orgId`
- `routes/packages.ts:115` - `org_id: orgId`
- `routes/reservations.ts:192` - `p_org_id: orgId`

### ✅ Required Field Validation

**Customers:**
- `routes/customers.ts:51-56` - Validates `full_name` required
- `routes/customers.ts:59-73` - Validates phone uniqueness

**Packages:**
- `routes/packages.ts:21-32` - Zod schema validates all required fields
- `routes/packages.ts:99-107` - Returns validation errors

**Reservations:**
- `routes/reservations.ts:29-42` - Zod schema validates all required fields
- `routes/reservations.ts:160-168` - Returns validation errors

### ✅ Error Response Format

**Mostly Correct:**
- Most routes return `{ message, code, details }`
- A few routes use nested `{ error: { code, message } }` (lines identified above)

---

## Minimal Fixes Required

### Priority 1: Database Migration (5 minutes)
```bash
# Run the migration
psql -h <host> -U <user> -d <database> -f supabase/sql/002_crud_fixes.sql
```

### Priority 2: Frontend Display (2 minutes)
```typescript
// File: src/pages/admin/Customers.tsx
// Line 171: {customer.full_name || '-'}
// Line 173: {customer.email || 'No email'}
```

### Priority 3: Error Format (5 minutes)
```typescript
// File: src/routes/reservations.ts
// Lines 255, 566, 583: Use { message, code } instead of { error: { code, message } }
```

---

## Conclusion

**Current State:** 2/3 entities broken, 1 partial

**After Minimal Fixes:** All 3 entities working

**Estimated Fix Time:** 15 minutes

**Risk:** LOW - Changes are minimal and isolated

---

**END OF AUDIT**
