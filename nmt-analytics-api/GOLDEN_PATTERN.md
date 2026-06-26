# Golden Pattern for NMT Analytics API Routes

This document defines the **recommended standard pattern** for all API routes to ensure:
- ✅ Rock-solid authentication
- ✅ Multi-tenant safety
- ✅ Consistent error handling
- ✅ Developer-friendly debugging

---

## 🎯 The Golden Pattern

### Complete Example Route File

```typescript
import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { formatListResponse, paginationQuerySchema, getPaginationParams } from '../utils/pagination';

const router = Router();

// ============================================================================
// 1. DEFINE ZOD SCHEMAS
// ============================================================================

const getEntitiesQuerySchema = z.object({
  search: z.string().optional(),
  ...paginationQuerySchema,
}).transform(data => ({
  ...data,
  ...getPaginationParams(data),
}));

const createEntitySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
});

const updateEntitySchema = createEntitySchema.partial();

// ============================================================================
// 2. LIST ROUTE (GET /entities)
// ============================================================================

/**
 * GET /api/entities
 * 
 * Returns paginated list of entities for the authenticated user's organization.
 * 
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - search: string (optional)
 * - orderBy: string (default: 'created_at')
 * - orderDir: 'asc' | 'desc' (default: 'desc')
 */
router.get('/entities', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    // 1. Validate query parameters
    const validationResult = getEntitiesQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid query parameters',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.issues
      });
    }

    const { search, page, limit, offset, orderBy, orderDir } = validationResult.data;
    
    // 2. Get org_id from middleware (guaranteed to exist)
    const orgId = req.orgId!;

    // 3. Build query with org_id filter
    let query = supabaseAdmin
      .from('entities')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId) // ✅ Multi-tenant filter
      .order(orderBy as string || 'created_at', { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1);

    // 4. Add optional filters
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }

    // 5. Execute query
    const { data: entities, error, count } = await query;

    // 6. Handle database errors
    if (error) {
      return handleSupabaseError(res, error, "Failed to fetch entities");
    }

    // 7. Return standardized response
    return res.json(formatListResponse(entities || [], count || 0, page, limit));

  } catch (error) {
    // 8. Catch-all error handler
    console.error('Error in GET /entities:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// 3. CREATE ROUTE (POST /entities)
// ============================================================================

/**
 * POST /api/entities
 * 
 * Creates a new entity for the authenticated user's organization.
 * 
 * Body:
 * - name: string (required)
 * - description: string (optional)
 * - isActive: boolean (default: true)
 * - metadata: object (optional)
 */
router.post('/entities', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    // 1. Validate request body
    const validationResult = createEntitySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.issues
      });
    }

    const validated = validationResult.data;
    
    // 2. Get org_id from middleware (guaranteed to exist)
    const orgId = req.orgId!;

    // 3. Optional: Check for duplicates
    const { data: existing } = await supabaseAdmin
      .from('entities')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', validated.name)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        message: 'Entity with this name already exists',
        code: 'DUPLICATE_ENTRY'
      });
    }

    // 4. Insert with server-side org_id injection
    const { data: entity, error } = await supabaseAdmin
      .from('entities')
      .insert({
        org_id: orgId, // ✅ Server-side injection, never from client
        name: validated.name,
        description: validated.description,
        is_active: validated.isActive,
        metadata: validated.metadata,
      })
      .select()
      .single();

    // 5. Handle database errors
    if (error) {
      return handleSupabaseError(res, error, "Failed to create entity");
    }

    // 6. Return created entity
    return res.status(201).json(entity);

  } catch (error) {
    console.error('Error in POST /entities:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// 4. UPDATE ROUTE (PATCH /entities/:id)
// ============================================================================

/**
 * PATCH /api/entities/:id
 * 
 * Updates an existing entity. Only updates provided fields.
 * 
 * Body: Partial<Entity>
 */
router.patch('/entities/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    
    // 1. Validate request body
    const validationResult = updateEntitySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.issues
      });
    }

    const validated = validationResult.data;
    
    // 2. Get org_id from middleware
    const orgId = req.orgId!;

    // 3. Build update object (only include provided fields)
    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.isActive !== undefined) updateData.is_active = validated.isActive;
    if (validated.metadata !== undefined) updateData.metadata = validated.metadata;

    // 4. Update with multi-tenant safety
    const { data: entity, error } = await supabaseAdmin
      .from('entities')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId) // ✅ Multi-tenant safety - only update if belongs to org
      .select()
      .single();

    // 5. Handle errors
    if (error) {
      // Check if entity not found (PGRST116 is PostgREST's "no rows" error)
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          message: 'Entity not found',
          code: 'NOT_FOUND'
        });
      }
      return handleSupabaseError(res, error, "Failed to update entity");
    }

    // 6. Return updated entity
    return res.json(entity);

  } catch (error) {
    console.error('Error in PATCH /entities/:id:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// 5. DELETE ROUTE (DELETE /entities/:id)
// ============================================================================

/**
 * DELETE /api/entities/:id
 * 
 * Deletes an entity (or soft-deletes by setting is_active = false).
 */
router.delete('/entities/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // Option A: Hard delete
    const { error } = await supabaseAdmin
      .from('entities')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId); // ✅ Multi-tenant safety

    // Option B: Soft delete (uncomment to use)
    // const { error } = await supabaseAdmin
    //   .from('entities')
    //   .update({ is_active: false })
    //   .eq('id', id)
    //   .eq('org_id', orgId);

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          message: 'Entity not found',
          code: 'NOT_FOUND'
        });
      }
      return handleSupabaseError(res, error, "Failed to delete entity");
    }

    // Return 204 No Content for successful deletion
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

// ============================================================================
// 6. GET SINGLE ROUTE (GET /entities/:id)
// ============================================================================

/**
 * GET /api/entities/:id
 * 
 * Returns a single entity by ID.
 */
router.get('/entities/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const { data: entity, error } = await supabaseAdmin
      .from('entities')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId) // ✅ Multi-tenant safety
      .single();

    if (error || !entity) {
      return res.status(404).json({
        message: 'Entity not found',
        code: 'NOT_FOUND'
      });
    }

    return res.json(entity);

  } catch (error) {
    console.error('Error in GET /entities/:id:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
```

---

## 📋 Checklist for Every Route

### ✅ Middleware
- [ ] Use `authenticateToken` middleware
- [ ] Use `requireOrgContext` middleware
- [ ] Order: `authenticateToken, requireOrgContext, async (req, res) => {}`

### ✅ Validation
- [ ] Define Zod schema for request body/query
- [ ] Validate with `.safeParse()`
- [ ] Return standardized error on validation failure:
  ```typescript
  {
    message: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: validationResult.error.issues
  }
  ```

### ✅ Organization Context
- [ ] Get `orgId` from `req.orgId!` (guaranteed by middleware)
- [ ] **NEVER** accept `org_id` from request body or query params
- [ ] Always filter queries by `.eq('org_id', orgId)`
- [ ] Always inject `org_id` in inserts: `{ org_id: orgId, ...data }`

### ✅ Error Handling
- [ ] Use `handleSupabaseError(res, error, message)` for database errors
- [ ] Check for `PGRST116` error code for "not found" cases
- [ ] Return standardized error format:
  ```typescript
  {
    message: string,  // Human-readable message
    code: string,     // Machine-readable error code
    details?: any     // Optional additional context
  }
  ```
- [ ] Wrap route in try/catch with 500 fallback

### ✅ Response Format
- [ ] List routes: Use `formatListResponse(data, count, page, limit)`
- [ ] Create routes: Return 201 status with created entity
- [ ] Update routes: Return 200 status with updated entity
- [ ] Delete routes: Return 204 No Content
- [ ] Error routes: Return appropriate status (400, 401, 403, 404, 500)

---

## 🚫 Anti-Patterns to Avoid

### ❌ DON'T: Accept org_id from client
```typescript
// ❌ DANGEROUS - Client can spoof org_id
const { org_id, name } = req.body;
await supabaseAdmin.from('entities').insert({ org_id, name });
```

### ✅ DO: Use server-side org_id
```typescript
// ✅ SAFE - Server-side injection
const orgId = req.orgId!;
const { name } = req.body;
await supabaseAdmin.from('entities').insert({ org_id: orgId, name });
```

---

### ❌ DON'T: Skip org_id filter on queries
```typescript
// ❌ DANGEROUS - Returns data from all orgs
const { data } = await supabaseAdmin.from('entities').select('*');
```

### ✅ DO: Always filter by org_id
```typescript
// ✅ SAFE - Only returns data for user's org
const { data } = await supabaseAdmin
  .from('entities')
  .select('*')
  .eq('org_id', req.orgId!);
```

---

### ❌ DON'T: Use inconsistent error formats
```typescript
// ❌ INCONSISTENT
return res.status(400).json({ error: 'VALIDATION_ERROR' });
return res.status(404).json({ message: 'Not found' });
return res.status(500).json({ error: { code: 'ERROR', message: 'Failed' } });
```

### ✅ DO: Use standardized error format
```typescript
// ✅ CONSISTENT
return res.status(400).json({
  message: 'Validation failed',
  code: 'VALIDATION_ERROR',
  details: validationResult.error.issues
});

return res.status(404).json({
  message: 'Entity not found',
  code: 'NOT_FOUND'
});

return res.status(500).json({
  message: 'Internal server error',
  code: 'INTERNAL_ERROR',
  details: error.message
});
```

---

### ❌ DON'T: Skip requireOrgContext middleware
```typescript
// ❌ RISKY - Manual org_id check can be forgotten
router.get('/entities', authenticateToken, async (req, res) => {
  const orgId = req.orgId;
  if (!orgId) {
    return res.status(403).json({ error: 'ORG_REQUIRED' });
  }
  // ...
});
```

### ✅ DO: Use requireOrgContext middleware
```typescript
// ✅ SAFE - Middleware guarantees org_id exists
router.get('/entities', authenticateToken, requireOrgContext, async (req, res) => {
  const orgId = req.orgId!; // Guaranteed to exist
  // ...
});
```

---

### ❌ DON'T: Return empty data on missing org_id
```typescript
// ❌ SILENT FAILURE - User sees empty list instead of error
const orgId = req.orgId;
if (!orgId) {
  return res.json([]);
}
```

### ✅ DO: Return proper error
```typescript
// ✅ EXPLICIT ERROR - User knows something is wrong
const orgId = req.orgId;
if (!orgId) {
  return res.status(403).json({
    message: 'Organization context required',
    code: 'ORG_CONTEXT_REQUIRED'
  });
}
```

---

## 🎨 Error Code Standards

### Standard Error Codes

| Code | HTTP Status | Use Case |
|------|-------------|----------|
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `INVALID_DATE_RANGE` | 400 | Invalid date parameters |
| `DUPLICATE_ENTRY` | 409 | Unique constraint violation |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `AUTH_REQUIRED` | 401 | Missing authentication |
| `ORG_CONTEXT_REQUIRED` | 403 | Missing organization context |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required role |
| `FORBIDDEN` | 403 | Access denied |
| `NOT_FOUND` | 404 | Entity not found |
| `CAPACITY_FULL` | 400 | Departure/resource at capacity |
| `DEPARTURE_NOT_FOUND` | 404 | Specific to departures |
| `CUSTOMER_NOT_FOUND` | 404 | Specific to customers |
| `DATABASE_ERROR` | 500 | Supabase/Postgres error |
| `STORAGE_ERROR` | 500 | Supabase Storage error |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `BOOTSTRAP_ERROR` | 500 | Dev auto-bootstrap failed |
| `BOOTSTRAP_FAILED` | 500 | Org creation failed |

---

## 🔒 Multi-Tenant Safety Rules

### Rule 1: Server-Side org_id Injection
**ALWAYS** inject `org_id` from `req.orgId`, **NEVER** from client input.

```typescript
// ✅ CORRECT
const orgId = req.orgId!;
await supabaseAdmin.from('table').insert({ org_id: orgId, ...data });

// ❌ WRONG
const { org_id } = req.body;
await supabaseAdmin.from('table').insert({ org_id, ...data });
```

### Rule 2: Multi-Tenant Filtering
**ALWAYS** filter queries by `org_id`.

```typescript
// ✅ CORRECT - All operations
await supabaseAdmin.from('table').select('*').eq('org_id', orgId);
await supabaseAdmin.from('table').update(data).eq('id', id).eq('org_id', orgId);
await supabaseAdmin.from('table').delete().eq('id', id).eq('org_id', orgId);

// ❌ WRONG - Missing org_id filter
await supabaseAdmin.from('table').select('*');
await supabaseAdmin.from('table').update(data).eq('id', id);
await supabaseAdmin.from('table').delete().eq('id', id);
```

### Rule 3: Use Both Middleware
**ALWAYS** use both `authenticateToken` and `requireOrgContext`.

```typescript
// ✅ CORRECT
router.get('/entities', authenticateToken, requireOrgContext, async (req, res) => {
  const orgId = req.orgId!; // Guaranteed
});

// ❌ WRONG - Missing requireOrgContext
router.get('/entities', authenticateToken, async (req, res) => {
  const orgId = req.orgId; // May be undefined
});
```

---

## 📚 Additional Resources

- **Full Audit Report:** `SECURITY_AUDIT_REPORT.md`
- **Fixes with Diffs:** `SECURITY_FIXES.md`
- **Supabase Helper:** `src/lib/supabase.ts` (`handleSupabaseError`)
- **Pagination Helper:** `src/utils/pagination.ts` (`formatListResponse`)
- **Business Logic:** `src/utils/business.ts` (`calculateRemainingAmount`, `getDepartureStatus`)

---

**Use this pattern for all new routes and refactor existing routes to match!**
