# CRUD Flow Audit Report
**Date:** 2026-01-11  
**Scope:** Customers, Packages (Tours), Reservations  
**Auditor:** Senior Backend Engineer

---

## Executive Summary

This audit traces CRUD operations from **Frontend → API → Database** for three core entities. Overall, the flows are **functional** but have **critical field mapping issues**, **inconsistent validation**, and **potential silent failures**.

### Risk Level: **MEDIUM-HIGH**
- ✅ org_id scoping is correct (server-side)
- ⚠️ Field name mismatches between frontend/backend
- ⚠️ Inconsistent validation (frontend vs backend)
- ❌ Silent failures in error handling
- ❌ Missing required field validation in some flows

---

## 1. CUSTOMERS CRUD Flow

### 📊 Flow Trace

#### **Frontend → API → DB**

```
Frontend (Customers.tsx)
  ↓ formFields: full_name, email, phone, status
  ↓ handleSubmit() → createCustomer(payload)
  ↓
API Client (customers.ts)
  ↓ POST /customers with { full_name, email, phone, status, notes }
  ↓
API Route (routes/customers.ts)
  ↓ Validates: full_name required
  ↓ Checks duplicate phone
  ↓ Injects org_id server-side ✅
  ↓
Database (customers table)
  ✓ Stores: id, org_id, full_name, phone, email, notes, created_at
```

---

### ✅ **What Works**

1. **org_id Scoping:** ✅ Server-side injection (line 79, routes/customers.ts)
   ```typescript
   org_id: orgId, // ✅ From req.orgId, never from client
   ```

2. **Duplicate Check:** ✅ Checks phone uniqueness per org (lines 59-73)
   ```typescript
   const { data: existing } = await supabaseAdmin
     .from('customers')
     .select('id')
     .eq('org_id', orgId)
     .eq('phone', phone)
     .maybeSingle();
   ```

3. **Error Handling:** ✅ Returns 409 for duplicates
   ```typescript
   if (existing) {
     return res.status(409).json({
       message: 'Customer with this phone already exists',
       code: 'DUPLICATE_ENTRY'
     });
   }
   ```

4. **Frontend Error Display:** ✅ Catches 409 and shows user-friendly message
   ```typescript
   if (err.status === 409) {
     showError('Customer with this phone already exists');
   }
   ```

---

### ❌ **Critical Issues**

#### **Issue #1: Field Name Mismatch - firstName/lastName vs full_name**

**Problem:**  
- **Frontend** sends `full_name` (single field)
- **Frontend** expects `firstName` and `lastName` (two fields) in response
- **Database** stores `full_name` (single field)
- **No transformation** between frontend and backend

**Evidence:**
```typescript
// Frontend (Customers.tsx:199)
{ name: 'full_name', label: 'Full Name', type: 'text' as const, required: true }

// Frontend display (Customers.tsx:171)
{customer.firstName} {customer.lastName}  // ❌ These fields don't exist!

// Backend stores (routes/customers.ts:80)
full_name,  // ✅ Correct

// Database schema (001_init.sql:27)
full_name TEXT NOT NULL,  // ✅ Correct
```

**Impact:** 🔴 **HIGH**  
- Customer names will display as "undefined undefined" in the UI
- Data is saved correctly but displayed incorrectly

**Fix Required:**
```typescript
// Option A: Frontend transforms full_name → firstName/lastName
const [firstName, lastName] = customer.full_name.split(' ');

// Option B: Backend returns firstName/lastName from full_name
const nameParts = full_name.split(' ');
return {
  ...customer,
  firstName: nameParts[0] || '',
  lastName: nameParts.slice(1).join(' ') || ''
};
```

---

#### **Issue #2: Missing Status Field in Database**

**Problem:**  
- **Frontend** sends `status` field (active/lead/archived)
- **Backend** accepts `status` field
- **Database** has NO `status` column in customers table

**Evidence:**
```typescript
// Frontend (Customers.tsx:203-211)
{
  name: 'status',
  label: 'Status',
  type: 'select' as const,
  options: [
    { label: 'Active', value: 'active' },
    { label: 'Lead', value: 'lead' },
    { label: 'Archived', value: 'archived' }
  ],
  required: true
}

// Backend (routes/customers.ts:84)
status: status || 'active',  // ❌ Inserted but column doesn't exist

// Database schema (001_init.sql:24-33)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,  // ❌ NO STATUS COLUMN
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_phone_per_org UNIQUE (org_id, phone)
);
```

**Impact:** 🔴 **CRITICAL**  
- INSERT will fail with "column does not exist" error
- **Silent failure** if error is swallowed

**Fix Required:**
```sql
-- Add status column to customers table
ALTER TABLE customers ADD COLUMN status TEXT DEFAULT 'active' 
  CHECK (status IN ('active', 'lead', 'archived'));
```

---

#### **Issue #3: Email Not Required but Displayed**

**Problem:**  
- Email is optional in form (no `required: true`)
- Email is displayed in UI without null check
- Could show "undefined" or crash

**Evidence:**
```typescript
// Frontend form (Customers.tsx:200)
{ name: 'email', label: 'Email', type: 'email' as const },  // ❌ No required: true

// Frontend display (Customers.tsx:173)
<span className="text-xs text-gray-500">{customer.email}</span>  // ❌ No null check
```

**Impact:** ⚠️ **MEDIUM**  
- UI shows "undefined" for customers without email

**Fix Required:**
```typescript
<span className="text-xs text-gray-500">{customer.email || 'No email'}</span>
```

---

### 🔍 **CRUD Checklist: Customers**

| Operation | Frontend | API | DB | org_id | Validation | Errors | Status |
|-----------|----------|-----|----|----|------------|--------|--------|
| **CREATE** | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | **BROKEN** |
| **READ** | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | **BROKEN** (display) |
| **UPDATE** | ✅ | ✅ | ❌ | ✅ | ⚠️ | ⚠️ | **BROKEN** |
| **DELETE** | ✅ | ✅ | ✅ | ✅ | N/A | ⚠️ | **WORKS** |

**Overall Status:** 🔴 **BROKEN** - Missing status column, field name mismatch

---

## 2. PACKAGES (TOURS) CRUD Flow

### 📊 Flow Trace

```
Frontend (Packages.tsx)
  ↓ formFields: name, destination, price, currency, description, etc.
  ↓ handleSubmit() → createPackage(payload)
  ↓
API Client (packages.ts)
  ↓ POST /packages with transformed data
  ↓
API Route (routes/packages.ts)
  ↓ Validates with Zod schema
  ↓ Injects org_id server-side ✅
  ↓
Database (packages table)
  ✓ Stores: id, org_id, name, destination, base_price, currency, etc.
```

---

### ✅ **What Works**

1. **org_id Scoping:** ✅ Server-side injection (line 115, routes/packages.ts)
   ```typescript
   org_id: orgId,  // ✅ From req.orgId
   ```

2. **Validation:** ✅ Zod schema validation
   ```typescript
   const createPackageSchema = z.object({
     name: z.string().min(1, 'Name is required'),
     destination: z.string().min(1, 'Destination is required'),
     price: z.number().min(0, 'Price must be non-negative'),
     // ...
   });
   ```

3. **Field Transformation:** ✅ Frontend transforms to numbers
   ```typescript
   const payload = {
     ...data,
     price: Number(data.price),
     durationDays: data.durationDays ? Number(data.durationDays) : undefined,
     maxParticipants: data.maxParticipants ? Number(data.maxParticipants) : undefined,
   };
   ```

---

### ❌ **Critical Issues**

#### **Issue #4: Field Name Mismatch - price vs base_price**

**Problem:**  
- **Frontend** sends `price`
- **Backend** expects `price` in Zod schema
- **Database** has `base_price` column
- **Mapping happens** in backend (line 118) but inconsistent

**Evidence:**
```typescript
// Frontend (Packages.tsx:192)
{ name: 'price', label: 'Price', type: 'number' as const, required: true }

// Backend Zod schema (routes/packages.ts:24)
price: z.number().min(0, 'Price must be non-negative'),

// Backend insert (routes/packages.ts:118)
base_price: validated.price,  // ✅ Correctly mapped

// Database schema (001_init.sql:41)
base_price NUMERIC(12, 2) NOT NULL DEFAULT 0,  // ✅ Correct
```

**Impact:** ✅ **LOW** - Already handled correctly in backend

---

#### **Issue #5: Field Name Mismatch - active vs is_active**

**Problem:**  
- **Frontend** sends `active` (boolean)
- **Backend** expects `active` in Zod schema
- **Database** has NO `is_active` column (missing from schema!)
- **Backend maps** to `is_active` (line 120) but column doesn't exist

**Evidence:**
```typescript
// Frontend (Packages.tsx:199)
{ name: 'active', label: 'Active', type: 'checkbox' as const }

// Backend Zod schema (routes/packages.ts:26)
active: z.boolean().default(true),

// Backend insert (routes/packages.ts:120)
is_active: validated.active,  // ❌ Column doesn't exist!

// Database schema (001_init.sql:36-49)
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
    // ❌ NO is_active COLUMN
);
```

**Impact:** 🔴 **CRITICAL**  
- INSERT will fail with "column does not exist" error

**Fix Required:**
```sql
-- Add is_active column to packages table
ALTER TABLE packages ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
```

---

#### **Issue #6: Missing Error Details in Frontend**

**Problem:**  
- Frontend catches errors but doesn't show details
- Generic error message instead of specific validation errors

**Evidence:**
```typescript
// Frontend (Packages.tsx:138-140)
} catch (err: any) {
  showError(editingPackage ? 'Failed to update package' : 'Failed to create package');
  // ❌ Doesn't use err.message or err.details
}
```

**Impact:** ⚠️ **MEDIUM**  
- Poor developer experience
- Users don't know why creation failed

**Fix Required:**
```typescript
} catch (err: any) {
  const errorMessage = err.message || (editingPackage ? 'Failed to update package' : 'Failed to create package');
  showError(errorMessage);
}
```

---

### 🔍 **CRUD Checklist: Packages**

| Operation | Frontend | API | DB | org_id | Validation | Errors | Status |
|-----------|----------|-----|----|----|------------|--------|--------|
| **CREATE** | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | **BROKEN** |
| **READ** | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | **WORKS** |
| **UPDATE** | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | **BROKEN** |
| **DELETE** | ✅ | ✅ | ✅ | ✅ | N/A | ⚠️ | **WORKS** (soft delete) |

**Overall Status:** 🔴 **BROKEN** - Missing is_active column

---

## 3. RESERVATIONS CRUD Flow

### 📊 Flow Trace

```
Frontend (Reservations.tsx)
  ↓ No create form (read-only view)
  ↓ getReservations(filters)
  ↓
API Client (reservations.ts)
  ↓ GET /reservations with filters
  ↓
API Route (routes/reservations.ts)
  ↓ Validates query params with Zod
  ↓ Filters by org_id ✅
  ↓ Joins customers, departures, packages
  ↓
Database (reservations table)
  ✓ Returns: id, customer_name, total_amount, paid_amount, etc.
```

---

### ✅ **What Works**

1. **org_id Scoping:** ✅ Server-side filtering (line 127, routes/reservations.ts)
   ```typescript
   .eq('org_id', orgId)
   ```

2. **Validation:** ✅ Zod schema for query params and create data

3. **Business Logic:** ✅ Uses shared `calculateRemainingAmount` utility
   ```typescript
   // Frontend (Reservations.tsx:278)
   {formatCurrency(calculateRemainingAmount(reservation.totalAmount, reservation.paidAmount))}
   
   // Backend (routes/reservations.ts:73)
   const remainingAmount = calculateRemainingAmount(totalAmount, paidAmount);
   ```

4. **Joins:** ✅ Properly joins related tables
   ```typescript
   .select(`
     *,
     customers (id, full_name, phone, email),
     departures (
       id,
       depart_at,
       return_at,
       packages (id, name, destination)
     )
   `)
   ```

---

### ❌ **Critical Issues**

#### **Issue #7: Missing paid_amount Column**

**Problem:**  
- **Frontend** expects `paidAmount` field
- **Backend** returns `paid_amount` field
- **Database** has NO `paid_amount` column in reservations table

**Evidence:**
```typescript
// Frontend (Reservations.tsx:12)
paidAmount: number;

// Frontend display (Reservations.tsx:275)
{formatCurrency(reservation.paidAmount)}

// Backend (routes/reservations.ts:72)
const paidAmount = Number(reservation.paid_amount || 0);

// Database schema (001_init.sql:67-81)
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    departure_id UUID REFERENCES departures(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    party_size INT NOT NULL DEFAULT 1 CHECK (party_size \u003e 0),
    reservation_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT CHECK (source IN ('web', 'phone', 'agent', 'walk-in', 'other')),
    created_at TIMESTAMPTZ DEFAULT NOW()
    // ❌ NO paid_amount COLUMN
);
```

**Impact:** 🔴 **CRITICAL**  
- `paidAmount` will always be 0 or undefined
- Remaining amount calculation will be wrong
- Payment tracking is broken

**Fix Required:**
```sql
-- Add paid_amount column to reservations table
ALTER TABLE reservations ADD COLUMN paid_amount NUMERIC(12, 2) DEFAULT 0;
```

---

#### **Issue #8: Missing Status 'completed' in Database Constraint**

**Problem:**  
- **Frontend** expects 'completed' status
- **Backend** allows 'completed' status
- **Database** CHECK constraint only allows 'pending', 'confirmed', 'cancelled'

**Evidence:**
```typescript
// Frontend (Reservations.tsx:3)
status: 'pending' | 'confirmed' | 'cancelled' | 'completed';

// Frontend display (Reservations.tsx:120)
{ value: "completed", label: "Završeno" },

// Backend Zod schema (routes/reservations.ts:58)
status: z.enum(['pending', 'confirmed', 'cancelled', 'completed'], {

// Database schema (001_init.sql:76)
status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
// ❌ Missing 'completed'
```

**Impact:** 🔴 **HIGH**  
- Cannot set reservation status to 'completed'
- Database will reject with CHECK constraint violation

**Fix Required:**
```sql
-- Update CHECK constraint to include 'completed'
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check 
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'));
```

---

#### **Issue #9: No Create Form in Frontend**

**Problem:**  
- Reservations page is read-only
- No way to create reservations from UI
- Only import via CSV

**Evidence:**
```typescript
// Frontend (Reservations.tsx) - No create button, no form modal
// Only has Import CSV button (line 136-143)
```

**Impact:** ⚠️ **MEDIUM**  
- Poor user experience
- Must use CSV import or API directly

**Fix Required:**  
Add create reservation form similar to Customers/Packages

---

### 🔍 **CRUD Checklist: Reservations**

| Operation | Frontend | API | DB | org_id | Validation | Errors | Status |
|-----------|----------|-----|----|----|------------|--------|--------|
| **CREATE** | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | **BROKEN** |
| **READ** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | **BROKEN** |
| **UPDATE** | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | **BROKEN** |
| **DELETE** | ❌ | ✅ | ✅ | ✅ | N/A | ✅ | **WORKS** |

**Overall Status:** 🔴 **BROKEN** - Missing paid_amount column, incomplete status constraint, no UI forms

---

## 4. Cross-Cutting Issues

### ❌ **Issue #10: Inconsistent Error Handling**

**Problem:**  
- Some routes swallow errors silently
- Some routes show generic messages
- Inconsistent error response formats

**Evidence:**
```typescript
// Customers - Good error handling
} catch (err: any) {
  const errorMessage = err.message || 'Failed to create customer';
  if (err.status === 409) {
    showError('Customer with this phone already exists');
  } else {
    showError(errorMessage);
  }
}

// Packages - Poor error handling
} catch (err: any) {
  showError('Failed to create package');  // ❌ Ignores err.message
}

// Reservations - No create form, so no error handling
```

**Impact:** ⚠️ **MEDIUM**  
- Developers can't debug issues
- Users get unhelpful error messages

---

### ❌ **Issue #11: No Frontend Validation**

**Problem:**  
- FormModal doesn't validate before submit
- Relies entirely on backend validation
- Poor user experience (round-trip to see errors)

**Evidence:**
```typescript
// Frontend (Customers.tsx:274-288)
<FormModal
  isOpen={modalOpen}
  onClose={() => setModalOpen(false)}
  title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
  fields={formFields}
  onSubmit={handleSubmit}  // ❌ No validation before submit
  // ...
/>
```

**Impact:** ⚠️ **LOW**  
- Slower user experience
- More API calls

**Fix Required:**  
Add Zod validation in FormModal component

---

## 5. Identified Bugs Summary

| # | Entity | Severity | Issue | Impact |
|---|--------|----------|-------|--------|
| 1 | Customers | 🔴 HIGH | `firstName`/`lastName` vs `full_name` mismatch | Names display as "undefined undefined" |
| 2 | Customers | 🔴 CRITICAL | Missing `status` column in DB | INSERT fails |
| 3 | Customers | ⚠️ MEDIUM | Email displayed without null check | Shows "undefined" |
| 4 | Packages | 🔴 CRITICAL | Missing `is_active` column in DB | INSERT fails |
| 5 | Packages | ⚠️ MEDIUM | Generic error messages | Poor UX |
| 6 | Reservations | 🔴 CRITICAL | Missing `paid_amount` column in DB | Payment tracking broken |
| 7 | Reservations | 🔴 HIGH | Missing 'completed' in status constraint | Cannot complete reservations |
| 8 | Reservations | ⚠️ MEDIUM | No create form in UI | Poor UX |
| 9 | All | ⚠️ MEDIUM | Inconsistent error handling | Poor DX |
| 10 | All | ⚠️ LOW | No frontend validation | Slower UX |

---

## 6. Refactor Proposal: Shared Validation + Insert Pattern

### 🎯 **Golden Pattern for CRUD Operations**

```typescript
// ============================================================================
// 1. SHARED ZOD SCHEMAS (src/shared/schemas.ts)
// ============================================================================

import { z } from 'zod';

// Define once, use in both frontend and backend
export const customerSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  status: z.enum(['active', 'lead', 'archived']).default('active'),
  notes: z.string().optional(),
});

export const packageSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  destination: z.string().min(1, 'Destination is required'),
  price: z.number().min(0, 'Price must be non-negative'),
  currency: z.string().default('BAM'),
  is_active: z.boolean().default(true),
  description: z.string().optional(),
  duration_days: z.number().int().positive().optional(),
  max_participants: z.number().int().positive().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const reservationSchema = z.object({
  customer_id: z.string().uuid('Invalid customer ID'),
  departure_id: z.string().uuid('Invalid departure ID'),
  party_size: z.number().int().min(1, 'Party size must be at least 1'),
  total_amount: z.number().min(0, 'Total amount must be non-negative'),
  paid_amount: z.number().min(0, 'Paid amount must be non-negative').default(0),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).default('pending'),
  notes: z.string().optional(),
});

// ============================================================================
// 2. SHARED FIELD MAPPER (src/shared/mappers.ts)
// ============================================================================

/**
 * Maps frontend field names to database column names
 */
export const fieldMappers = {
  customers: {
    toDb: (data: any) => ({
      full_name: data.full_name,
      phone: data.phone,
      email: data.email || null,
      status: data.status || 'active',
      notes: data.notes || null,
    }),
    fromDb: (row: any) => ({
      id: row.id,
      fullName: row.full_name,
      firstName: row.full_name.split(' ')[0] || '',
      lastName: row.full_name.split(' ').slice(1).join(' ') || '',
      phone: row.phone,
      email: row.email,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  
  packages: {
    toDb: (data: any) => ({
      name: data.name,
      destination: data.destination,
      base_price: data.price,
      currency: data.currency || 'BAM',
      is_active: data.active ?? data.is_active ?? true,
      description: data.description || null,
      duration_days: data.durationDays || data.duration_days || 1,
      max_participants: data.maxParticipants || data.max_participants || null,
      start_date: data.startDate || data.start_date || null,
      end_date: data.endDate || data.end_date || null,
    }),
    fromDb: (row: any) => ({
      id: row.id,
      name: row.name,
      destination: row.destination,
      price: row.base_price,
      currency: row.currency,
      active: row.is_active,
      description: row.description,
      durationDays: row.duration_days,
      maxParticipants: row.max_participants,
      startDate: row.start_date,
      endDate: row.end_date,
      createdAt: row.created_at,
    }),
  },
  
  reservations: {
    toDb: (data: any) => ({
      customer_id: data.customerId || data.customer_id,
      departure_id: data.departureId || data.departure_id,
      customer_name: data.customerName || data.customer_name,
      customer_phone: data.customerPhone || data.customer_phone,
      party_size: data.partySize || data.party_size || 1,
      total_amount: data.totalAmount || data.total_amount || 0,
      paid_amount: data.paidAmount || data.paid_amount || 0,
      status: data.status || 'pending',
      currency: data.currency || 'BAM',
      notes: data.notes || null,
    }),
    fromDb: (row: any) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      departureId: row.departure_id,
      partySize: row.party_size,
      totalAmount: row.total_amount,
      paidAmount: row.paid_amount,
      remainingAmount: Math.max(0, row.total_amount - row.paid_amount),
      status: row.status,
      currency: row.currency,
      bookingDate: row.reservation_at,
      notes: row.notes,
      createdAt: row.created_at,
    }),
  },
};

// ============================================================================
// 3. GENERIC CRUD SERVICE (src/lib/crudService.ts)
// ============================================================================

import { supabaseAdmin } from './supabase';
import { fieldMappers } from '../shared/mappers';

export class CrudService<T> {
  constructor(
    private tableName: string,
    private schema: z.ZodSchema,
    private mapper: typeof fieldMappers[keyof typeof fieldMappers]
  ) {}

  async create(orgId: string, data: any): Promise<T> {
    // 1. Validate
    const validated = this.schema.parse(data);
    
    // 2. Map to DB fields
    const dbData = this.mapper.toDb(validated);
    
    // 3. Insert with org_id
    const { data: result, error } = await supabaseAdmin
      .from(this.tableName)
      .insert({ org_id: orgId, ...dbData })
      .select()
      .single();
    
    if (error) throw error;
    
    // 4. Map from DB fields
    return this.mapper.fromDb(result) as T;
  }

  async list(orgId: string, filters: any = {}): Promise<{ data: T[]; total: number }> {
    let query = supabaseAdmin
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('org_id', orgId);
    
    // Apply filters
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%`);
    }
    
    const { data, error, count } = await query;
    if (error) throw error;
    
    return {
      data: (data || []).map(row => this.mapper.fromDb(row)) as T[],
      total: count || 0,
    };
  }

  async update(orgId: string, id: string, data: any): Promise<T> {
    const validated = this.schema.partial().parse(data);
    const dbData = this.mapper.toDb(validated);
    
    const { data: result, error } = await supabaseAdmin
      .from(this.tableName)
      .update(dbData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    
    if (error) throw error;
    return this.mapper.fromDb(result) as T;
  }

  async delete(orgId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(this.tableName)
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);
    
    if (error) throw error;
  }
}

// ============================================================================
// 4. USAGE IN ROUTES (src/routes/customers.ts)
// ============================================================================

import { CrudService } from '../lib/crudService';
import { customerSchema } from '../shared/schemas';
import { fieldMappers } from '../shared/mappers';
import { Customer } from '../types';

const customerService = new CrudService<Customer>(
  'customers',
  customerSchema,
  fieldMappers.customers
);

router.post('/customers', authenticateToken, requireOrgContext, async (req, res) => {
  try {
    const customer = await customerService.create(req.orgId!, req.body);
    res.status(201).json(customer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      });
    }
    return handleSupabaseError(res, error, 'Failed to create customer');
  }
});

router.get('/customers', authenticateToken, requireOrgContext, async (req, res) => {
  try {
    const result = await customerService.list(req.orgId!, req.query);
    res.json(result);
  } catch (error) {
    return handleSupabaseError(res, error, 'Failed to fetch customers');
  }
});

// ============================================================================
// 5. USAGE IN FRONTEND (src/api/customers.ts)
// ============================================================================

import { customerSchema } from '../shared/schemas';

export async function createCustomer(data: any): Promise<Customer> {
  // Validate on frontend before sending
  const validated = customerSchema.parse(data);
  
  const { data: result } = await post<Customer>('/customers', validated);
  return result;
}
```

---

### ✅ **Benefits of This Pattern**

1. **Single Source of Truth:** Schemas defined once, used everywhere
2. **Type Safety:** TypeScript + Zod = compile-time + runtime safety
3. **Consistent Validation:** Same rules on frontend and backend
4. **Field Mapping:** Automatic conversion between frontend/DB field names
5. **DRY Code:** No duplication of validation logic
6. **Better Errors:** Zod provides detailed, user-friendly error messages
7. **Easier Testing:** Service layer is easily testable
8. **Faster Development:** New entities follow same pattern

---

## 7. Database Migration Required

```sql
-- ============================================================================
-- CRITICAL FIXES - Run these migrations immediately
-- ============================================================================

-- 1. Add missing status column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
  CHECK (status IN ('active', 'lead', 'archived'));

-- 2. Add missing is_active column to packages
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 3. Add missing paid_amount column to reservations
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0;

-- 4. Update reservations status constraint to include 'completed'
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check 
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'));

-- 5. Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(org_id, status);
CREATE INDEX IF NOT EXISTS idx_packages_is_active ON packages(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_reservations_paid_amount ON reservations(org_id, paid_amount);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify customers table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customers' AND column_name IN ('status', 'full_name');

-- Verify packages table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'packages' AND column_name IN ('is_active', 'base_price');

-- Verify reservations table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'reservations' AND column_name IN ('paid_amount', 'status');
```

---

## 8. Action Plan

### 🔴 **Immediate (This Week)**

1. **Run database migrations** (see section 7)
2. **Fix customer name display** (firstName/lastName split)
3. **Fix email null check** in Customers.tsx
4. **Test all CRUD operations** after migrations

### ⚠️ **High Priority (Next Sprint)**

5. **Implement shared validation pattern** (section 6)
6. **Add error message details** to all catch blocks
7. **Add create form** for Reservations
8. **Standardize error handling** across all entities

### ✅ **Medium Priority (Ongoing)**

9. **Add frontend validation** with Zod
10. **Refactor to use CrudService** for all entities
11. **Add integration tests** for CRUD flows
12. **Document field mappings** in README

---

## 9. Conclusion

### Current State: 🔴 **BROKEN**

All three entities have **critical database schema issues** that prevent CRUD operations from working correctly:

- **Customers:** Missing `status` column
- **Packages:** Missing `is_active` column  
- **Reservations:** Missing `paid_amount` column, incomplete status constraint

### After Fixes: ✅ **FUNCTIONAL**

Once database migrations are applied and field mapping issues are resolved, all CRUD flows will work correctly.

### Long-Term: 🎯 **EXCELLENT**

Implementing the shared validation + insert pattern will provide:
- Type-safe, validated CRUD operations
- Consistent error handling
- Better developer experience
- Easier maintenance and testing

---

**End of Report**
