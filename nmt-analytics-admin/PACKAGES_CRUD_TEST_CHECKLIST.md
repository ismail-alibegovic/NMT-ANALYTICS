# Packages CRUD - Manual Test Checklist

**Date:** 2026-01-11  
**Scope:** Create, Edit, Delete operations  
**Status:** ⚠️ **REQUIRES MIGRATION** - `is_active` column needed

---

## ⚠️ Prerequisites

### **CRITICAL: Run Database Migration First**

```bash
cd /Users/ismailalibegovic/Documents/NMT\ Projects/nmt-analytics-api
psql -h <host> -U <user> -d <database> -f supabase/sql/002_crud_fixes.sql
```

**This adds:**
- `packages.is_active` column (BOOLEAN DEFAULT TRUE)
- Index for filtering
- Verification queries

**Without migration:** ❌ All operations will fail with "column does not exist"

---

## 🧪 Test Checklist

### **Test 1: CREATE Package**

#### **Setup:**
1. Navigate to Packages page: `http://localhost:5173/packages`
2. Open DevTools (`F12`)
3. Go to **Network** tab
4. Click "Add Package" button

#### **Fill Form:**
```
Name: Test Package 2026-01-11
Destination: Sarajevo
Price: 1500
Currency: BAM
Active: ✓ (checked)
Duration Days: 7 (optional)
Max Participants: 20 (optional)
```

#### **Click "Create"**

---

#### **Network Request:**

**Check Request:**
```
URL: POST http://localhost:3001/api/packages
Method: POST
Status: 201 Created (expected)

Headers:
  Authorization: Bearer <token>
  Content-Type: application/json
```

**Request Payload:**
```json
{
  "name": "Test Package 2026-01-11",
  "destination": "Sarajevo",
  "price": 1500,
  "currency": "BAM",
  "active": true,
  "durationDays": 7,
  "maxParticipants": 20
}
```

**Field Mapping (Frontend → Backend):**
```
price → base_price
active → is_active
durationDays → duration_days
maxParticipants → max_participants
```

---

#### **Response JSON:**

**Expected Response (Status 201):**
```json
{
  "id": "abc-123-def-456",
  "org_id": "your-org-id",
  "name": "Test Package 2026-01-11",
  "destination": "Sarajevo",
  "base_price": 1500.00,
  "currency": "BAM",
  "is_active": true,
  "description": null,
  "duration_days": 7,
  "max_participants": 20,
  "start_date": null,
  "end_date": null,
  "created_at": "2026-01-11T19:30:00.000Z"
}
```

**Key Fields to Verify:**
- ✅ `id` is UUID
- ✅ `org_id` is YOUR org ID (multi-tenant check)
- ✅ `base_price` = 1500.00
- ✅ `is_active` = true
- ✅ `duration_days` = 7
- ✅ `max_participants` = 20

---

#### **UI Behavior:**

**Expected:**
- ✅ Success toast: "Package created successfully"
- ✅ Modal closes
- ✅ Package appears in list
- ✅ List shows: Name, Destination, Price (BAM 1,500), Status (Enabled)

**If Failed:**
- ❌ Error toast: "Failed to create package"
- ❌ Modal stays open

---

#### **Failure Scenarios:**

**Scenario 1: Missing `is_active` Column**

**Error Response:**
```json
{
  "message": "Failed to create package",
  "code": "DATABASE_ERROR",
  "details": "column \"is_active\" of relation \"packages\" does not exist"
}
```

**Fix:** Run migration `002_crud_fixes.sql`

---

**Scenario 2: Validation Error**

**Error Response:**
```json
{
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "path": ["name"],
      "message": "Name is required"
    }
  ]
}
```

**Fix:** Fill in required fields

---

**Scenario 3: Missing Auth Token**

**Error Response:**
```json
{
  "message": "No authorization token provided",
  "code": "UNAUTHORIZED"
}
```

**Fix:** Login again

---

### **Test 2: EDIT Package**

#### **Setup:**
1. Find the package you just created in the list
2. Click "Edit" button
3. Open DevTools Network tab

#### **Modify Form:**
```
Name: Test Package 2026-01-11 - UPDATED
Price: 1800 (changed from 1500)
Active: ✓ (keep checked)
```

#### **Click "Update"**

---

#### **Network Request:**

**Check Request:**
```
URL: PATCH http://localhost:3001/api/packages/{id}
Method: PATCH
Status: 200 OK (expected)

Headers:
  Authorization: Bearer <token>
  Content-Type: application/json
```

**Request Payload:**
```json
{
  "name": "Test Package 2026-01-11 - UPDATED",
  "price": 1800,
  "active": true
}
```

**Note:** Only changed fields are sent

---

#### **Response JSON:**

**Expected Response (Status 200):**
```json
{
  "id": "abc-123-def-456",
  "org_id": "your-org-id",
  "name": "Test Package 2026-01-11 - UPDATED",
  "destination": "Sarajevo",
  "base_price": 1800.00,
  "currency": "BAM",
  "is_active": true,
  "duration_days": 7,
  "max_participants": 20,
  "created_at": "2026-01-11T19:30:00.000Z"
}
```

**Key Fields to Verify:**
- ✅ `name` updated to "Test Package 2026-01-11 - UPDATED"
- ✅ `base_price` updated to 1800.00
- ✅ `is_active` still true
- ✅ `org_id` unchanged (multi-tenant check)

---

#### **UI Behavior:**

**Expected:**
- ✅ Success toast: "Package updated successfully"
- ✅ Modal closes
- ✅ Package name updated in list
- ✅ Price updated in list (BAM 1,800)

**If Failed:**
- ❌ Error toast: "Failed to update package"
- ❌ Modal stays open

---

#### **Failure Scenarios:**

**Scenario 1: Package Not Found**

**Error Response:**
```json
{
  "message": "Package not found",
  "code": "NOT_FOUND"
}
```

**Reason:** Package belongs to different org or doesn't exist

---

**Scenario 2: Missing `is_active` Column**

**Error Response:**
```json
{
  "message": "Failed to update package",
  "code": "DATABASE_ERROR",
  "details": "column \"is_active\" of relation \"packages\" does not exist"
}
```

**Fix:** Run migration `002_crud_fixes.sql`

---

### **Test 3: DELETE Package**

#### **Setup:**
1. Find the package you just edited
2. Click "Delete" button
3. Confirm deletion in dialog
4. Open DevTools Network tab

---

#### **Network Request:**

**Check Request:**
```
URL: DELETE http://localhost:3001/api/packages/{id}
Method: DELETE
Status: 204 No Content (expected)

Headers:
  Authorization: Bearer <token>
```

**No Request Payload** (DELETE has no body)

---

#### **Response:**

**Expected Response (Status 204):**
```
No content (empty response body)
```

**Note:** 204 No Content is correct for DELETE operations

---

#### **Backend Behavior:**

**Soft Delete (Not Hard Delete):**
```sql
UPDATE packages 
SET is_active = false 
WHERE id = :id AND org_id = :org_id
```

**Multi-Tenant Check:**
- ✅ `org_id` filter ensures you can only delete your own packages
- ✅ Package not actually deleted, just marked inactive

---

#### **UI Behavior:**

**Expected:**
- ✅ Success toast: "Package deleted successfully"
- ✅ Package removed from list (or marked as "Disabled")
- ✅ List refreshes

**If Failed:**
- ❌ Error toast: "Failed to delete package"
- ❌ Package still in list

---

#### **Failure Scenarios:**

**Scenario 1: Package Not Found**

**Error Response:**
```json
{
  "message": "Failed to delete package",
  "code": "DATABASE_ERROR"
}
```

**Reason:** Package belongs to different org or already deleted

---

**Scenario 2: Missing `is_active` Column**

**Error Response:**
```json
{
  "message": "Failed to delete package",
  "code": "DATABASE_ERROR",
  "details": "column \"is_active\" of relation \"packages\" does not exist"
}
```

**Fix:** Run migration `002_crud_fixes.sql`

---

## 📊 Quick Reference Table

| Operation | Method | URL | Status | Request Body | Response Body |
|-----------|--------|-----|--------|--------------|---------------|
| **CREATE** | POST | `/api/packages` | 201 | Package data | Created package |
| **UPDATE** | PATCH | `/api/packages/:id` | 200 | Changed fields | Updated package |
| **DELETE** | DELETE | `/api/packages/:id` | 204 | None | Empty |

---

## 🔧 Minimal Fixes Needed

### **Fix 1: Run Database Migration** 🔴 **CRITICAL**

**Problem:** `is_active` column doesn't exist

**Fix:**
```bash
cd /Users/ismailalibegovic/Documents/NMT\ Projects/nmt-analytics-api
psql -h <host> -U <user> -d <database> -f supabase/sql/002_crud_fixes.sql
```

**Verification:**
```sql
\d packages
-- Should show is_active column
```

---

### **Fix 2: Standardize Error Format (Backend)** ⚠️ **RECOMMENDED**

**Problem:** Inconsistent error format in PATCH route

**File:** `src/routes/packages.ts`

**Lines 150, 193:**

```diff
 if (!validationResult.success) {
-  return res.status(400).json({ error: 'VALIDATION_ERROR', details: ... });
+  return res.status(400).json({
+    message: 'Validation failed',
+    code: 'VALIDATION_ERROR',
+    details: validationResult.error.issues
+  });
 }
```

**This ensures consistent error format:**
```json
{
  "message": "...",
  "code": "...",
  "details": "..."
}
```

---

## ✅ Verification Checklist

### **After Running Migration:**

- [ ] **CREATE Test:**
  - [ ] Click "Add Package"
  - [ ] Fill form with test data
  - [ ] Click "Create"
  - [ ] Verify: Status 201, package created
  - [ ] Verify: Success toast shown
  - [ ] Verify: Package appears in list

- [ ] **UPDATE Test:**
  - [ ] Click "Edit" on created package
  - [ ] Change name and price
  - [ ] Click "Update"
  - [ ] Verify: Status 200, package updated
  - [ ] Verify: Success toast shown
  - [ ] Verify: Changes reflected in list

- [ ] **DELETE Test:**
  - [ ] Click "Delete" on package
  - [ ] Confirm deletion
  - [ ] Verify: Status 204
  - [ ] Verify: Success toast shown
  - [ ] Verify: Package removed from list

- [ ] **Multi-Tenancy Test:**
  - [ ] Verify `org_id` in all responses matches your org
  - [ ] Try accessing package from different org (should fail)

---

## 🐛 Common Issues & Solutions

### **Issue 1: "column is_active does not exist"**

**Symptom:**
```
Error: column "is_active" of relation "packages" does not exist
```

**Solution:**
```bash
psql -h <host> -U <user> -d <database> -f supabase/sql/002_crud_fixes.sql
```

---

### **Issue 2: "Package not found" on UPDATE/DELETE**

**Symptom:**
```
Error: Package not found
```

**Possible Causes:**
1. Package belongs to different org (multi-tenant isolation)
2. Package ID is incorrect
3. Package already deleted

**Solution:**
- Check `org_id` in database
- Verify package ID
- Check if `is_active = false`

---

### **Issue 3: "No authorization token"**

**Symptom:**
```
Error: No authorization token provided
```

**Solution:**
- Login again
- Check if token is in localStorage
- Verify token is sent in Authorization header

---

### **Issue 4: Frontend shows "undefined undefined"**

**Symptom:**
- Package list shows "undefined undefined" for name

**Cause:**
- Frontend expects `price` and `active`
- Backend returns `base_price` and `is_active`

**Solution:**
- Frontend API client already transforms these (lines 46-50 in `packages.ts`)
- Verify transformation is working

---

## 📝 Test Data Template

### **Package 1: Basic**
```json
{
  "name": "Weekend Getaway",
  "destination": "Mostar",
  "price": 800,
  "currency": "BAM",
  "active": true
}
```

### **Package 2: Full**
```json
{
  "name": "Summer Adventure",
  "destination": "Dubrovnik",
  "price": 2500,
  "currency": "BAM",
  "active": true,
  "description": "7-day adventure tour",
  "durationDays": 7,
  "maxParticipants": 15,
  "startDate": "2026-06-01",
  "endDate": "2026-08-31"
}
```

### **Package 3: Minimal**
```json
{
  "name": "Day Trip",
  "destination": "Blagaj",
  "price": 150,
  "currency": "BAM",
  "active": true
}
```

---

## 🎯 Success Criteria

### **All Tests Pass If:**

- ✅ CREATE: Status 201, package created, appears in list
- ✅ UPDATE: Status 200, changes saved, reflected in list
- ✅ DELETE: Status 204, package removed from list
- ✅ Multi-tenancy: `org_id` always matches your org
- ✅ Toasts: Success messages shown for all operations
- ✅ Errors: Clear error messages on failure

---

## 📚 Additional Resources

- **PACKAGES_CRUD_AUDIT.md** - Detailed audit with flow traces
- **002_crud_fixes.sql** - Database migration script
- **Backend:** `src/routes/packages.ts` - API routes
- **Frontend:** `src/pages/admin/Packages.tsx` - UI component
- **API Client:** `src/api/packages.ts` - API functions

---

**Status:** ⚠️ **READY TO TEST** - Run migration first, then follow checklist!
