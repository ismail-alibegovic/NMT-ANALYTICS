# Security Fixes - Implementation Guide

This document contains all the fixes needed to address the security audit findings.

---

## 🔴 CRITICAL FIX #1: Add `requireOrgContext` to Analytics Routes

### File: `src/routes/analytics.ts`

#### Fix 1.1: `/analytics/overview` route

**Lines 22-54**

```diff
-router.get('/analytics/overview', authenticateToken, async (req, res: Response, next) => {
+router.get('/analytics/overview', authenticateToken, requireOrgContext, async (req, res: Response, next) => {
   try {
     const { from, to, granularity } = req.query;

     const dateFrom = from
       ? new Date(from as string)
       : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

     const dateTo = to ? new Date(to as string) : new Date();

     if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
-      return res.status(400).json({ error: "INVALID_DATE_RANGE" });
+      return res.status(400).json({
+        message: "Invalid date range provided",
+        code: "INVALID_DATE_RANGE"
+      });
     }

     // normalize granularity for PostgreSQL
     const pgGranularity =
       granularity === "daily" || granularity === "day"
         ? "day"
         : granularity === "weekly" || granularity === "week"
           ? "week"
           : granularity === "monthly" || granularity === "month"
             ? "month"
             : "day";

-    // orgId is now set by authenticateToken middleware
-    const orgId = req.orgId;
-
-    if (!orgId) {
-      return res.status(403).json({
-        error: "ORG_CONTEXT_REQUIRED",
-        message: "Organization context required"
-      });
-    }
+    // orgId is guaranteed by requireOrgContext middleware
+    const orgId = req.orgId!;

     const currentFrom = dateFrom;
     const currentTo = dateTo;
```

#### Fix 1.2: `/analytics/trends` route

**Lines 134-156**

```diff
-router.get('/analytics/trends', authenticateToken, async (req, res: Response, next) => {
+router.get('/analytics/trends', authenticateToken, requireOrgContext, async (req, res: Response, next) => {
   try {
     const validationResult = AnalyticsQuerySchema.safeParse(req.query);

     if (!validationResult.success) {
-      res.status(400).json({
+      return res.status(400).json({
         message: 'Validation Error',
-        details: validationResult.error.issues,
-        code: 'VALIDATION_ERROR'
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
       });
-      return;
     }

     const { from, to, granularity } = validationResult.data;
-    // orgId is now set by authenticateToken middleware
-    const orgId = req.orgId;
-
-    if (!orgId) {
-      return res.status(403).json({
-        error: "ORG_CONTEXT_REQUIRED",
-        message: "Organization context required"
-      });
-    }
+    // orgId is guaranteed by requireOrgContext middleware
+    const orgId = req.orgId!;

     const endDate = to ? new Date(`${to}T23:59:59Z`) : new Date();
     const startDate = from ? new Date(`${from}T00:00:00Z`) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
```

#### Fix 1.3: `/analytics/dashboard` route

**Lines 261-271**

```diff
-router.get('/analytics/dashboard', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
+router.get('/analytics/dashboard', authenticateToken, requireOrgContext, async (req: Request, res: Response, next: NextFunction) => {
   try {
     const { from, to } = req.query;
-    const orgId = req.orgId;
-
-    if (!orgId) {
-      return res.status(403).json({
-        error: "ORG_CONTEXT_REQUIRED",
-        message: "Organization context required"
-      });
-    }
+    // orgId is guaranteed by requireOrgContext middleware
+    const orgId = req.orgId!;

     // Default to last 30 days if not provided or invalid
     let dateTo = to ? new Date(to as string) : new Date();
     let dateFrom = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
```

#### Fix 1.4: Error response standardization in analytics.ts

**Lines 120-127**

```diff
   } catch (error) {
     console.error('ANALYTICS ERROR (Overview):', error);
     const statusCode = (error as any).status === 403 ? 403 : 500;
     return res.status(statusCode).json({
-      error: statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
+      message: statusCode === 403 ? 'Access forbidden' : 'Internal server error',
+      code: statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
       details: error instanceof Error ? error.message : String(error)
     });
   }
```

**Lines 247-254**

```diff
   } catch (error) {
     console.error('ANALYTICS ERROR (Trends):', error);
     const statusCode = (error as any).status === 403 ? 403 : 500;
     return res.status(statusCode).json({
-      error: statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
+      message: statusCode === 403 ? 'Access forbidden' : 'Internal server error',
+      code: statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
       details: error instanceof Error ? error.message : String(error)
     });
   }
```

---

## 🔴 CRITICAL FIX #2: Fix Documents Route Silent Failure

### File: `src/routes/documents.ts`

**Lines 34-40**

```diff
 router.get('/documents', authenticateToken, requireOrgContext, async (req: any, res: Response) => {
   try {
     const orgId = req.orgId;
     if (!orgId) {
-      // Return empty array instead of erroring if org context is missing
-      return res.json([]);
+      return res.status(403).json({
+        message: "Organization context required",
+        code: "ORG_CONTEXT_REQUIRED"
+      });
     }

     const { data, error } = await supabaseAdmin
```

---

## ⚠️ HIGH PRIORITY FIX #3: Standardize Middleware Error Responses

### File: `src/middleware/requireRole.ts`

**Lines 8-24**

```diff
 export const requireRole = (allowedRoles: string[]): RequestHandler => {
   return (req: Request, res: Response, next: NextFunction) => {
     if (!req.user || !req.user.role) {
-      res.status(401).json({ 
-        error: { code: 'AUTH_REQUIRED', message: 'Authentication and role context required' } 
+      res.status(401).json({
+        message: 'Authentication and role context required',
+        code: 'AUTH_REQUIRED'
       });
       return;
     }

     if (!allowedRoles.includes(req.user.role)) {
-      res.status(403).json({ 
-        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'You do not have the required permissions to access this resource' } 
+      res.status(403).json({
+        message: 'You do not have the required permissions to access this resource',
+        code: 'INSUFFICIENT_PERMISSIONS'
       });
       return;
     }

     next();
   };
 };
```

### File: `src/middleware/requireOrgContext.ts`

**Lines 117-124**

```diff
     } catch (err) {
       console.error(`[ORG] DEV_AUTO_BOOTSTRAP failed:`, err);
       return res.status(500).json({
-        error: "BOOTSTRAP_FAILED",
         message: "Failed to auto-create organization context",
+        code: "BOOTSTRAP_FAILED",
         details: err instanceof Error ? err.message : String(err)
       });
     }
```

---

## ⚠️ HIGH PRIORITY FIX #4: Standardize Route Error Responses

### File: `src/routes/packages.ts`

**Lines 52-56**

```diff
     const validationResult = getPackagesQuerySchema.safeParse(req.query);

     if (!validationResult.success) {
-      return res.status(400).json({ error: 'VALIDATION_ERROR' });
+      return res.status(400).json({
+        message: 'Invalid query parameters',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
+      });
     }
```

**Lines 147-151**

```diff
     const validationResult = updatePackageSchema.safeParse(req.body);

     if (!validationResult.success) {
-      return res.status(400).json({ error: 'VALIDATION_ERROR', details: validationResult.error.issues });
+      return res.status(400).json({
+        message: 'Validation failed',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
+      });
     }
```

**Lines 190-194**

```diff
     const validationResult = updatePackageSchema.safeParse(req.body);

     if (!validationResult.success) {
-      return res.status(400).json({ error: 'VALIDATION_ERROR', details: validationResult.error.issues });
+      return res.status(400).json({
+        message: 'Validation failed',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
+      });
     }
```

### File: `src/routes/departures.ts`

**Lines 80-83**

```diff
     const validationResult = getDeparturesQuerySchema.safeParse(req.query);
     if (!validationResult.success) {
-      return res.status(400).json({ error: 'VALIDATION_ERROR' });
+      return res.status(400).json({
+        message: 'Invalid query parameters',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
+      });
     }
```

**Lines 138-144**

```diff
     const validationResult = createDepartureSchema.safeParse(req.body);
     if (!validationResult.success) {
-      res.status(400).json({
+      return res.status(400).json({
         message: 'Validation error',
+        code: 'VALIDATION_ERROR',
         details: validationResult.error.issues
       });
-      return;
     }
```

**Lines 207-214**

```diff
     const validationResult = putDepartureSchema.safeParse(req.body);
     if (!validationResult.success) {
-      res.status(400).json({
+      return res.status(400).json({
         message: 'Invalid request body',
+        code: 'VALIDATION_ERROR',
         details: validationResult.error.issues
       });
-      return;
     }
```

**Lines 276-283**

```diff
     const validationResult = updateDepartureSchema.safeParse(req.body);
     if (!validationResult.success) {
-      res.status(400).json({
+      return res.status(400).json({
         message: 'Invalid request body',
+        code: 'VALIDATION_ERROR',
         details: validationResult.error.issues
       });
-      return;
     }
```

**Lines 254-260**

```diff
     if (error) {
       if (error.code === 'PGRST116') {
-        res.status(404).json({ message: 'Departure not found' });
-        return;
+        return res.status(404).json({
+          message: 'Departure not found',
+          code: 'NOT_FOUND'
+        });
       }
       throw error;
     }
```

**Lines 326-332**

```diff
     if (error) {
       if (error.code === 'PGRST116') {
-        res.status(404).json({ message: 'Departure not found' });
-        return;
+        return res.status(404).json({
+          message: 'Departure not found',
+          code: 'NOT_FOUND'
+        });
       }
       return handleSupabaseError(res, error, "Failed to update departure");
     }
```

**Lines 356-362**

```diff
     if (error) {
       if (error.code === 'PGRST116') {
-        res.status(404).json({ message: 'Departure not found' });
-        return;
+        return res.status(404).json({
+          message: 'Departure not found',
+          code: 'NOT_FOUND'
+        });
       }
       return handleSupabaseError(res, error, "Failed to delete departure");
     }
```

**Lines 396-399**

```diff
     if (error || !departure) {
-      res.status(404).json({ message: 'Departure not found' });
-      return;
+      return res.status(404).json({
+        message: 'Departure not found',
+        code: 'NOT_FOUND'
+      });
     }
```

**Lines 264-267**

```diff
     console.error('Error in PUT /departures/:id:', error);
-    res.status(500).json({ message: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 336-339**

```diff
     console.error('Error in PATCH /departures/:id:', error);
-    res.status(500).json({ message: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 366-369**

```diff
     console.error('Error in DELETE /departures/:id:', error);
-    res.status(500).json({ message: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 402-405**

```diff
     console.error('Error in GET /departures/:id:', error);
-    res.status(500).json({ message: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 156-162**

```diff
     if (packageError || !packageData) {
-      res.status(404).json({
+      return res.status(404).json({
         message: 'Package not found',
+        code: 'NOT_FOUND',
         details: 'The specified package does not exist or does not belong to your organization'
       });
-      return;
     }
```

**Lines 226-229**

```diff
     if (packageError || !packageData) {
-      res.status(404).json({ message: 'Package not found' });
-      return;
+      return res.status(404).json({
+        message: 'Package not found',
+        code: 'NOT_FOUND'
+      });
     }
```

**Lines 296-299**

```diff
       if (packageError || !packageData) {
-        res.status(404).json({ message: 'Package not found' });
-        return;
+        return res.status(404).json({
+          message: 'Package not found',
+          code: 'NOT_FOUND'
+        });
       }
```

**Lines 195-198**

```diff
   } catch (error) {
     console.error('Error in POST /departures:', error);
-    res.status(500).json({ message: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

### File: `src/routes/reservations.ts`

**Lines 93-96**

```diff
     const validationResult = getReservationsQuerySchema.safeParse(req.query);
     if (!validationResult.success) {
-      return res.status(400).json({ error: 'VALIDATION_ERROR' });
+      return res.status(400).json({
+        message: 'Invalid query parameters',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
+      });
     }
```

**Lines 254-257**

```diff
     if (fetchErr || !reservation) {
-      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reservation not found' } });
-      return;
+      return res.status(404).json({
+        message: 'Reservation not found',
+        code: 'NOT_FOUND'
+      });
     }
```

**Lines 564-569**

```diff
     const validationResult = updateStatusSchema.safeParse(req.body);
     if (!validationResult.success) {
-      res.status(400).json({
-        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: validationResult.error.issues }
+      return res.status(400).json({
+        message: 'Invalid request body',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
       });
-      return;
     }
```

**Lines 582-585**

```diff
     if (fetchErr || !reservation) {
-      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reservation not found' } });
-      return;
+      return res.status(404).json({
+        message: 'Reservation not found',
+        code: 'NOT_FOUND'
+      });
     }
```

### File: `src/routes/transactions.ts`

**Lines 52-55**

```diff
     const validationResult = getTransactionsQuerySchema.safeParse(req.query);
     if (!validationResult.success) {
-      return res.status(400).json({ error: 'VALIDATION_ERROR' });
+      return res.status(400).json({
+        message: 'Invalid query parameters',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
+      });
     }
```

**Lines 123-130**

```diff
     const validationResult = createTransactionSchema.safeParse(req.body);
     if (!validationResult.success) {
-      res.status(400).json({
-        error: 'Validation error',
+      return res.status(400).json({
+        message: 'Validation failed',
+        code: 'VALIDATION_ERROR',
         details: validationResult.error.issues
       });
-      return;
     }
```

**Lines 175-178**

```diff
   } catch (error) {
     console.error('Error in POST /transactions:', error);
-    res.status(500).json({ error: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 187-193**

```diff
     const validationResult = updateTransactionSchema.safeParse(req.body);
     if (!validationResult.success) {
-      res.status(400).json({
-        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: validationResult.error.issues }
+      return res.status(400).json({
+        message: 'Invalid request body',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
       });
-      return;
     }
```

**Lines 212-216**

```diff
     if (error) {
       if (error.code === 'PGRST116') {
-        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
-        return;
+        return res.status(404).json({
+          message: 'Transaction not found',
+          code: 'NOT_FOUND'
+        });
       }
       return handleSupabaseError(res, error, "Failed to update transaction");
     }
```

**Lines 222-225**

```diff
   } catch (error) {
     console.error('Error in PATCH /transactions/:id:', error);
-    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 241-246**

```diff
     if (error) {
       if (error.code === 'PGRST116') {
-        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
-        return;
+        return res.status(404).json({
+          message: 'Transaction not found',
+          code: 'NOT_FOUND'
+        });
       }
       return handleSupabaseError(res, error, "Failed to delete transaction");
     }
```

**Lines 251-254**

```diff
   } catch (error) {
     console.error('Error in DELETE /transactions/:id:', error);
-    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

### File: `src/routes/admin.ts`

**Lines 42-45**

```diff
   } catch (error) {
     console.error('Error in /admin/me:', error);
-    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 61-64**

```diff
   } catch (error) {
     console.error('Error in /admin/orgs:', error);
-    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 73-76**

```diff
     const validation = querySchema.safeParse(req.query);
     if (!validation.success) {
-      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: validation.error.issues } });
+      return res.status(400).json({
+        message: 'Invalid query parameters',
+        code: 'VALIDATION_ERROR',
+        details: validation.error.issues
+      });
     }
```

**Lines 97-100**

```diff
   } catch (error) {
     console.error('Error in /admin/audit-logs:', error);
-    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

### File: `src/routes/documents.ts`

**All error responses in this file need standardization. Here are the key fixes:**

**Lines 72-73**

```diff
     if (!req.file) {
-      return res.status(400).json({ error: 'No file uploaded' });
+      return res.status(400).json({
+        message: 'No file uploaded',
+        code: 'FILE_REQUIRED'
+      });
     }
```

**Lines 92-94**

```diff
       console.error('Storage upload error:', uploadError);
-      return res.status(500).json({ error: 'Failed to upload to storage' });
+      return res.status(500).json({
+        message: 'Failed to upload to storage',
+        code: 'STORAGE_ERROR',
+        details: uploadError.message
+      });
     }
```

**Lines 113-115**

```diff
       console.error('DB insert error:', dbError);
-      return res.status(500).json({ error: 'Failed to save document record' });
+      return res.status(500).json({
+        message: 'Failed to save document record',
+        code: 'DATABASE_ERROR',
+        details: dbError.message
+      });
     }
```

**Lines 141-143**

```diff
     if (fetchErr || !document) {
-      return res.status(404).json({ error: 'Document not found' });
+      return res.status(404).json({
+        message: 'Document not found',
+        code: 'NOT_FOUND'
+      });
     }
```

**Lines 165-167**

```diff
       console.error('DB delete error:', deleteErr);
-      return res.status(500).json({ error: 'Failed to delete document record' });
+      return res.status(500).json({
+        message: 'Failed to delete document record',
+        code: 'DATABASE_ERROR',
+        details: deleteErr.message
+      });
     }
```

**Lines 171-173**

```diff
   } catch (error) {
     console.error('Error in DELETE /documents/:id:', error);
-    res.status(500).json({ error: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 191-193**

```diff
     if (docErr || !document) {
-      return res.status(404).json({ error: 'Document not found' });
+      return res.status(404).json({
+        message: 'Document not found',
+        code: 'NOT_FOUND'
+      });
     }
```

**Lines 202-204**

```diff
       if (storageErr) {
-        return res.status(500).json({ error: 'Failed to download from storage' });
+        return res.status(500).json({
+          message: 'Failed to download from storage',
+          code: 'STORAGE_ERROR',
+          details: storageErr.message
+        });
       }
```

**Lines 238-240**

```diff
-    res.status(400).json({ error: 'Invalid document type' });
+    res.status(400).json({
+      message: 'Invalid document type',
+      code: 'INVALID_DOCUMENT_TYPE'
+    });
```

**Lines 241-243**

```diff
   } catch (error) {
     console.error('Error downloading document:', error);
-    res.status(500).json({ error: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

**Lines 253-255**

```diff
     const validationResult = generateDocumentSchema.safeParse(req.body);
     if (!validationResult.success) {
-      return res.status(400).json({ error: 'Validation error', details: validationResult.error.issues });
+      return res.status(400).json({
+        message: 'Validation failed',
+        code: 'VALIDATION_ERROR',
+        details: validationResult.error.issues
+      });
     }
```

**Lines 267-269**

```diff
     if (!template) {
-      return res.status(404).json({ error: 'Template not found' });
+      return res.status(404).json({
+        message: 'Template not found',
+        code: 'NOT_FOUND'
+      });
     }
```

**Lines 287-289**

```diff
   } catch (error) {
     console.error('Error generating document:', error);
-    res.status(500).json({ error: 'Failed to generate document' });
+    res.status(500).json({
+      message: 'Failed to generate document',
+      code: 'GENERATION_ERROR',
+      details: error instanceof Error ? error.message : String(error)
+    });
   }
```

**Lines 118-121**

```diff
   } catch (error) {
     console.error('Error in /documents/upload:', error);
-    res.status(500).json({ error: 'Internal server error' });
+    res.status(500).json({
+      message: 'Internal server error',
+      code: 'INTERNAL_ERROR'
+    });
   }
```

---

## Summary

### Files to Modify:
1. ✅ `src/routes/analytics.ts` - 3 routes + error responses
2. ✅ `src/routes/documents.ts` - 1 critical fix + 15 error responses
3. ✅ `src/middleware/requireRole.ts` - 2 error responses
4. ✅ `src/middleware/requireOrgContext.ts` - 1 error response
5. ✅ `src/routes/packages.ts` - 3 error responses
6. ✅ `src/routes/departures.ts` - 15 error responses
7. ✅ `src/routes/reservations.ts` - 4 error responses
8. ✅ `src/routes/transactions.ts` - 7 error responses
9. ✅ `src/routes/admin.ts` - 4 error responses

### Total Changes:
- **3 critical route fixes** (analytics routes)
- **1 critical silent failure fix** (documents route)
- **54 error response standardizations**

### Testing Checklist:
- [ ] Test all analytics routes with missing org context
- [ ] Test documents route with missing org context
- [ ] Test all validation errors return correct format
- [ ] Test all 404 errors return correct format
- [ ] Test all 500 errors return correct format
- [ ] Verify frontend error parsing still works
- [ ] Verify audit logs capture errors correctly

---

**End of Fixes Document**
