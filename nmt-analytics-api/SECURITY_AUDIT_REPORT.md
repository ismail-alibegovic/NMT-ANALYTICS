# NMT Analytics API - Security Audit Report
**Date:** 2026-01-11  
**Auditor:** Senior Backend Engineer  
**Scope:** Authentication, Organization Context, Error Handling

---

## Executive Summary

This audit reviewed all authentication middleware, organization context handling, and error responses across the NMT Analytics API. The system demonstrates **good foundational security** with multi-tenant isolation, but has **inconsistent error response formats** and **several routes with potential silent failure risks**.

### Overall Assessment
- ✅ **Authentication**: Solid JWT validation with Supabase
- ✅ **Org Context**: Server-side injection, never trusted from client
- ⚠️ **Error Handling**: Inconsistent formats across routes
- ⚠️ **Silent Failures**: 3 risky routes identified

---

## 1. Authentication Middleware Audit

### ✅ `authenticateToken.ts` - STRONG
**Location:** `src/middleware/authenticateToken.ts`

**Strengths:**
- ✅ JWT validation via Supabase `auth.getUser(token)`
- ✅ Server-side org_id injection from `profiles` table
- ✅ Never trusts client-provided org_id
- ✅ DEV_BYPASS_AUTH for development (properly gated)
- ✅ DEV_AUTO_BOOTSTRAP for seamless dev setup
- ✅ Standardized error responses with `code` field

**Weaknesses:**
- ⚠️ Line 120: Error response uses `details` instead of `code` for bootstrap errors
- ⚠️ Line 163-166: Inconsistent error format (missing `details` field)

**Recommendation:**
```typescript
// Line 151-155: Standardize bootstrap error
return res.status(500).json({
  message: "Failed to auto-bootstrap user context",
  code: "BOOTSTRAP_ERROR",
  details: bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr)
});
```

---

### ✅ `requireOrgContext.ts` - STRONG
**Location:** `src/middleware/requireOrgContext.ts`

**Strengths:**
- ✅ Double-checks org context after authentication
- ✅ DEV_AUTO_BOOTSTRAP fallback
- ✅ Proper org creation and module seeding

**Weaknesses:**
- ⚠️ Line 120-123: Uses old error format `{ error, message, details }` instead of `{ message, code, details }`

**Recommendation:**
```typescript
// Line 119-123: Standardize error format
return res.status(500).json({
  message: "Failed to auto-create organization context",
  code: "BOOTSTRAP_FAILED",
  details: err instanceof Error ? err.message : String(err)
});
```

---

### ⚠️ `requireRole.ts` - INCONSISTENT
**Location:** `src/middleware/requireRole.ts`

**Weaknesses:**
- ❌ Line 10-12: Uses nested `{ error: { code, message } }` format
- ❌ Line 17-19: Same nested format
- ❌ Inconsistent with standardized `{ message, code, details }` format

**Recommendation:**
```typescript
// Lines 10-12
return res.status(401).json({ 
  message: 'Authentication and role context required',
  code: 'AUTH_REQUIRED'
});

// Lines 17-19
return res.status(403).json({ 
  message: 'You do not have the required permissions to access this resource',
  code: 'INSUFFICIENT_PERMISSIONS'
});
```

---

## 2. Protected Routes Audit

### Route Protection Matrix

| Route | Auth | Org Context | org_id Injection | Status |
|-------|------|-------------|------------------|--------|
| `GET /customers` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `POST /customers` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `PATCH /customers/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `DELETE /customers/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /packages` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `POST /packages` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `PATCH /packages/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `DELETE /packages/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /reservations` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `POST /reservations` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `PATCH /reservations/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `DELETE /reservations/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /departures` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `POST /departures` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `PATCH /departures/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `DELETE /departures/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /transactions` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `POST /transactions` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `PATCH /transactions/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `DELETE /transactions/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /documents` | ✅ | ✅ | ✅ Server-side | ⚠️ RISKY |
| `POST /documents/upload` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `DELETE /documents/:id` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `POST /import/:entity` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /analytics/overview` | ✅ | ❌ | ⚠️ Manual check | ⚠️ RISKY |
| `GET /analytics/trends` | ✅ | ❌ | ⚠️ Manual check | ⚠️ RISKY |
| `GET /analytics/dashboard` | ✅ | ❌ | ⚠️ Manual check | ⚠️ RISKY |
| `GET /dashboard` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /admin/me` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /admin/orgs` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |
| `GET /admin/audit-logs` | ✅ | ✅ | ✅ Server-side | ✅ SAFE |

---

## 3. Risky Routes - CRITICAL FINDINGS

### 🔴 CRITICAL: Analytics Routes Missing `requireOrgContext`

**Affected Routes:**
1. `GET /api/analytics/overview` (Line 22, `src/routes/analytics.ts`)
2. `GET /api/analytics/trends` (Line 134, `src/routes/analytics.ts`)
3. `GET /api/analytics/dashboard` (Line 261, `src/routes/analytics.ts`)

**Issue:**
These routes use `authenticateToken` but **NOT** `requireOrgContext`. They manually check `req.orgId` and return 403 if missing, but this creates inconsistency and potential for silent failures.

**Risk:**
- If `authenticateToken` fails to set `req.orgId` (e.g., profile missing), the route returns a 403 instead of properly bootstrapping or returning a standardized error.
- Manual checks at lines 49-54, 151-156, 266-271 are redundant if `requireOrgContext` is used.

**Recommendation:**
```typescript
// BEFORE
router.get('/analytics/overview', authenticateToken, async (req, res, next) => {
  const orgId = req.orgId;
  if (!orgId) {
    return res.status(403).json({
      error: "ORG_CONTEXT_REQUIRED",
      message: "Organization context required"
    });
  }
  // ...
});

// AFTER
router.get('/analytics/overview', authenticateToken, requireOrgContext, async (req, res, next) => {
  const orgId = req.orgId!; // Now guaranteed to exist
  // ...
});
```

---

### ⚠️ MEDIUM: Documents Route Silent Failure

**Affected Route:**
- `GET /api/documents` (Line 34, `src/routes/documents.ts`)

**Issue:**
Lines 37-40: If `req.orgId` is missing, the route returns an empty array `[]` instead of an error. This silently fails and could confuse the frontend.

**Risk:**
- User with missing org context sees empty documents list instead of an error
- Frontend cannot distinguish between "no documents" and "missing org context"

**Recommendation:**
```typescript
// BEFORE
const orgId = req.orgId;
if (!orgId) {
  return res.json([]);
}

// AFTER
const orgId = req.orgId;
if (!orgId) {
  return res.status(403).json({
    message: "Organization context required",
    code: "ORG_CONTEXT_REQUIRED"
  });
}
```

---

## 4. Error Response Standardization Audit

### Current Error Formats Found

| Format | Example | Routes Using It | Status |
|--------|---------|-----------------|--------|
| `{ message, code, details }` | `{ message: "...", code: "...", details: "..." }` | Most routes | ✅ STANDARD |
| `{ error: "..." }` | `{ error: "VALIDATION_ERROR" }` | packages.ts:55, departures.ts:82 | ❌ INCONSISTENT |
| `{ error: { code, message } }` | `{ error: { code: "...", message: "..." } }` | requireRole.ts, transactions.ts | ❌ INCONSISTENT |
| `{ message, details }` | `{ message: "...", details: "..." }` | departures.ts:140 | ❌ MISSING CODE |
| `{ error, message, details }` | `{ error: "...", message: "...", details: "..." }` | requireOrgContext.ts:120 | ❌ INCONSISTENT |

### Routes with Inconsistent Error Responses

#### 🔴 HIGH Priority Fixes

**1. `src/routes/packages.ts`**
- Line 55: `{ error: 'VALIDATION_ERROR' }` → Should be `{ message: "...", code: "VALIDATION_ERROR", details: [...] }`
- Line 150: `{ error: 'VALIDATION_ERROR', details: [...] }` → Should be `{ message: "...", code: "VALIDATION_ERROR", details: [...] }`
- Line 194: Same issue

**2. `src/routes/departures.ts`**
- Line 82: `{ error: 'VALIDATION_ERROR' }` → Should be `{ message: "...", code: "VALIDATION_ERROR", details: [...] }`
- Line 140-142: `{ message: "...", details: "..." }` → Missing `code` field
- Line 159-161: Same issue
- Line 227: `{ message: "..." }` → Missing `code` and `details`
- Line 256: Same issue
- Line 328: Same issue
- Line 358: Same issue
- Line 397: Same issue

**3. `src/routes/reservations.ts`**
- Line 95: `{ error: 'VALIDATION_ERROR' }` → Should be `{ message: "...", code: "VALIDATION_ERROR", details: [...] }`
- Line 255: `{ error: { code: 'NOT_FOUND', message: '...' } }` → Should be `{ message: "...", code: "NOT_FOUND" }`
- Line 566: Same nested error format
- Line 583: Same nested error format

**4. `src/routes/transactions.ts`**
- Line 54: `{ error: 'VALIDATION_ERROR' }` → Should be `{ message: "...", code: "VALIDATION_ERROR", details: [...] }`
- Line 126-128: `{ error: '...', details: [...] }` → Should be `{ message: "...", code: "VALIDATION_ERROR", details: [...] }`
- Line 177: `{ error: 'Internal server error' }` → Should be `{ message: "...", code: "INTERNAL_ERROR" }`
- Line 190-192: Nested error format
- Line 214: Same issue
- Line 224: Same issue
- Line 243: Same issue
- Line 253: Same issue

**5. `src/routes/documents.ts`**
- Line 72: `{ error: 'No file uploaded' }` → Should be `{ message: "...", code: "FILE_REQUIRED" }`
- Line 93: `{ error: 'Failed to upload to storage' }` → Should be `{ message: "...", code: "STORAGE_ERROR" }`
- Line 114: `{ error: 'Failed to save document record' }` → Should be `{ message: "...", code: "DATABASE_ERROR" }`
- Line 142: `{ error: 'Document not found' }` → Should be `{ message: "...", code: "NOT_FOUND" }`
- Line 166: `{ error: 'Failed to delete document record' }` → Should be `{ message: "...", code: "DATABASE_ERROR" }`
- Line 172: `{ error: 'Internal server error' }` → Should be `{ message: "...", code: "INTERNAL_ERROR" }`
- Line 192: `{ error: 'Document not found' }` → Should be `{ message: "...", code: "NOT_FOUND" }`
- Line 203: `{ error: 'Failed to download from storage' }` → Should be `{ message: "...", code: "STORAGE_ERROR" }`
- Line 239: `{ error: 'Invalid document type' }` → Should be `{ message: "...", code: "INVALID_DOCUMENT_TYPE" }`
- Line 243: `{ error: 'Internal server error' }` → Should be `{ message: "...", code: "INTERNAL_ERROR" }`
- Line 254: `{ error: 'Validation error', details: [...] }` → Should be `{ message: "...", code: "VALIDATION_ERROR", details: [...] }`
- Line 268: `{ error: 'Template not found' }` → Should be `{ message: "...", code: "NOT_FOUND" }`
- Line 288: `{ error: 'Failed to generate document' }` → Should be `{ message: "...", code: "GENERATION_ERROR" }`

**6. `src/routes/admin.ts`**
- Line 44: `{ error: { code: 'INTERNAL_ERROR', message: '...' } }` → Should be `{ message: "...", code: "INTERNAL_ERROR" }`
- Line 63: Same issue
- Line 75: Same issue
- Line 99: Same issue

**7. `src/routes/analytics.ts`**
- Line 33: `{ error: "INVALID_DATE_RANGE" }` → Should be `{ message: "...", code: "INVALID_DATE_RANGE" }`
- Line 51-53: `{ error: "...", message: "..." }` → Should be `{ message: "...", code: "..." }`
- Line 152-155: Same issue
- Line 267-270: Same issue

**8. `src/routes/import.ts`**
- Line 179-182: Uses standard format ✅
- Line 186-189: Uses standard format ✅
- Line 200-203: Uses standard format ✅
- Line 298-301: Uses standard format ✅

**9. `src/middleware/requireRole.ts`**
- Line 10-12: Nested error format
- Line 17-19: Nested error format

**10. `src/middleware/requireOrgContext.ts`**
- Line 120-123: `{ error: "...", message: "...", details: "..." }` → Should be `{ message: "...", code: "...", details: "..." }`

---

## 5. Organization Context Injection - VERIFIED ✅

### All routes properly inject org_id server-side:

**Pattern Used (SAFE):**
```typescript
// ✅ CORRECT - Server-side injection
const orgId = req.orgId!; // From authenticateToken middleware
await supabaseAdmin
  .from('table')
  .insert({ org_id: orgId, ...data })
  .eq('org_id', orgId);
```

**Never Found (GOOD):**
```typescript
// ❌ DANGEROUS - Client-provided org_id (NOT FOUND IN CODEBASE)
const { org_id } = req.body; // NEVER DO THIS
```

### Verification:
- ✅ All `INSERT` operations use `req.orgId` from middleware
- ✅ All `SELECT` operations filter by `req.orgId`
- ✅ All `UPDATE` operations include `.eq('org_id', req.orgId)`
- ✅ All `DELETE` operations include `.eq('org_id', req.orgId)`
- ✅ No client-provided `org_id` found in request bodies

---

## 6. Recommended "Golden Pattern" for Routes

### ✅ GOLDEN PATTERN - Use This for All Routes

```typescript
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';

const router = Router();

// 1. Define Zod schema for validation
const createEntitySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  // ... other fields
});

/**
 * POST /api/entities
 * 
 * GOLDEN PATTERN:
 * 1. Use authenticateToken + requireOrgContext middleware
 * 2. Validate with Zod
 * 3. Use req.orgId! (guaranteed by middleware)
 * 4. Return standardized errors: { message, code, details }
 */
router.post('/entities', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    // 1. Validate input
    const validationResult = createEntitySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.issues
      });
    }

    const validated = validationResult.data;
    const orgId = req.orgId!; // Guaranteed by requireOrgContext

    // 2. Database operation with server-side org_id
    const { data, error } = await supabaseAdmin
      .from('entities')
      .insert({
        org_id: orgId, // ✅ Server-side injection
        ...validated
      })
      .select()
      .single();

    // 3. Handle database errors
    if (error) {
      return handleSupabaseError(res, error, "Failed to create entity");
    }

    // 4. Success response
    return res.status(201).json(data);

  } catch (error) {
    // 5. Catch-all error handler
    console.error('Error in POST /entities:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/entities
 */
router.get('/entities', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const orgId = req.orgId!;

    const { data, error } = await supabaseAdmin
      .from('entities')
      .select('*')
      .eq('org_id', orgId) // ✅ Multi-tenant filter
      .order('created_at', { ascending: false });

    if (error) {
      return handleSupabaseError(res, error, "Failed to fetch entities");
    }

    return res.json({
      data: data || [],
      total: (data || []).length
    });

  } catch (error) {
    console.error('Error in GET /entities:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * PATCH /api/entities/:id
 */
router.patch('/entities/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // Validate partial update
    const validationResult = createEntitySchema.partial().safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.issues
      });
    }

    const { data, error } = await supabaseAdmin
      .from('entities')
      .update(validationResult.data)
      .eq('id', id)
      .eq('org_id', orgId) // ✅ Multi-tenant safety
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          message: 'Entity not found',
          code: 'NOT_FOUND'
        });
      }
      return handleSupabaseError(res, error, "Failed to update entity");
    }

    return res.json(data);

  } catch (error) {
    console.error('Error in PATCH /entities/:id:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * DELETE /api/entities/:id
 */
router.delete('/entities/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const { error } = await supabaseAdmin
      .from('entities')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId); // ✅ Multi-tenant safety

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          message: 'Entity not found',
          code: 'NOT_FOUND'
        });
      }
      return handleSupabaseError(res, error, "Failed to delete entity");
    }

    return res.status(204).send();

  } catch (error) {
    console.error('Error in DELETE /entities/:id:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
```

### Key Principles:
1. ✅ **Always use both** `authenticateToken` and `requireOrgContext` middleware
2. ✅ **Always validate** with Zod schemas
3. ✅ **Always use** `req.orgId!` (guaranteed by middleware)
4. ✅ **Always filter** by `org_id` in queries
5. ✅ **Always return** `{ message, code, details }` error format
6. ✅ **Always handle** Supabase errors with `handleSupabaseError`
7. ✅ **Always catch** unexpected errors with try/catch

---

## 7. Summary of Fixes Required

### 🔴 CRITICAL (Fix Immediately)
1. **Add `requireOrgContext` to analytics routes** (3 routes)
   - `/api/analytics/overview`
   - `/api/analytics/trends`
   - `/api/analytics/dashboard`

2. **Fix documents route silent failure** (1 route)
   - `/api/documents` - Return error instead of empty array

### ⚠️ HIGH (Fix in Next Sprint)
3. **Standardize error responses** (50+ occurrences)
   - All routes should use `{ message, code, details }` format
   - Remove nested `{ error: { code, message } }` format
   - Remove simple `{ error: "..." }` format

4. **Fix middleware error responses** (3 files)
   - `requireRole.ts` - Standardize error format
   - `requireOrgContext.ts` - Standardize bootstrap error
   - `authenticateToken.ts` - Minor consistency fixes

### ✅ LOW (Nice to Have)
5. **Add missing error codes** (10+ occurrences)
   - Some errors have `message` and `details` but missing `code`

---

## 8. Multi-Tenant Safety Verification ✅

### All routes verified for multi-tenant safety:
- ✅ All `INSERT` operations inject `org_id` server-side
- ✅ All `SELECT` operations filter by `org_id`
- ✅ All `UPDATE` operations include `.eq('org_id', req.orgId)`
- ✅ All `DELETE` operations include `.eq('org_id', req.orgId)`
- ✅ No cross-tenant data leakage possible
- ✅ No client-provided `org_id` accepted

---

## 9. Dev-Friendly Error Messages ✅

### Current state:
- ✅ Most errors include descriptive messages
- ✅ Validation errors include Zod issue details
- ✅ Database errors include Supabase error details
- ✅ Console logging for debugging
- ⚠️ Some errors lack `details` field (see section 4)

### Recommendations:
- Add `details` field to all error responses
- Include request ID in error logs
- Add more context to validation errors

---

## 10. Conclusion

The NMT Analytics API has **solid authentication and multi-tenant isolation**, but requires **error response standardization** and **fixing 3 critical routes** that could silently fail.

### Action Items:
1. ✅ **Immediate:** Fix analytics routes (add `requireOrgContext`)
2. ✅ **Immediate:** Fix documents route silent failure
3. ⚠️ **Next Sprint:** Standardize all error responses
4. ⚠️ **Next Sprint:** Fix middleware error formats
5. ✅ **Ongoing:** Use golden pattern for new routes

### Risk Assessment:
- **Current Risk Level:** MEDIUM
- **After Fixes:** LOW
- **Multi-Tenant Safety:** HIGH (already secure)

---

**End of Report**
