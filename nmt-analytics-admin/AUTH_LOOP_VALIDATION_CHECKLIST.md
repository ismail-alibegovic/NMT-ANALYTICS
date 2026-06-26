# Auth Loop Fix - Validation Checklist

**Date:** 2026-01-11  
**Purpose:** Verify that the authentication loop bug is fixed

---

## 🧪 Pre-Test Setup

### **1. Ensure Both Servers Are Running**
- [ ] Backend API running on `http://localhost:3001`
- [ ] Frontend admin running on `http://localhost:5173`
- [ ] No console errors on startup

### **2. Clear Browser State**
- [ ] Clear localStorage (DevTools → Application → Local Storage → Clear All)
- [ ] Clear cookies for localhost
- [ ] Close all browser tabs for localhost:5173
- [ ] Open a fresh browser tab

---

## ✅ Test 1: Page Load - Auth Context Fetching

### **Steps:**
1. Open browser DevTools (F12 or Cmd+Option+I)
2. Go to **Network** tab
3. Filter by: `me/context`
4. Navigate to `http://localhost:5173`
5. If prompted, sign in
6. Wait for page to fully load (5-10 seconds)

### **Expected Results:**
- [ ] **ONE** request to `GET /api/me/context` appears
- [ ] Request returns status `200 OK`
- [ ] Response contains: `{ user, org, role, modules }`
- [ ] No additional `me/context` requests appear
- [ ] No `429 Too Many Requests` responses

### **Console Logs to Verify:**
Look for these logs in the Console tab:
- [ ] `[AppContext] Fetching user context for: <user-id>`
- [ ] `[AppContext] User context loaded: { org: "...", role: "...", modules: ... }`
- [ ] **NO** repeated "Fetching user context" logs
- [ ] **NO** "429 - Rate limited" logs

### **Screenshot Evidence:**
Take a screenshot of:
- [ ] Network tab showing only ONE `me/context` request
- [ ] Console tab showing successful context load

---

## ✅ Test 2: Token Refresh - No Refetch

### **Steps:**
1. Keep Network tab open with `me/context` filter
2. Wait 5 minutes (or trigger token refresh manually)
3. Watch for new `me/context` requests

### **Expected Results:**
- [ ] **ZERO** new requests to `/api/me/context`
- [ ] Console shows: `[AppContext] Using cached context for: <user-id>`
- [ ] No 429 errors
- [ ] App continues working normally

### **How to Trigger Token Refresh (Optional):**
In Console, run:
```javascript
supabase.auth.refreshSession()
```

Then verify:
- [ ] No new `me/context` request appears
- [ ] Console shows "Using cached context"

---

## ✅ Test 3: Packages CRUD Operations

### **Navigate to Packages:**
1. Click "Packages" in sidebar
2. Wait for packages list to load

### **Test 3.1: Create Package**

**Steps:**
1. Click "Add Package" button
2. Fill in form:
   - Name: "Test Package 001"
   - Destination: "Test Destination"
   - Price: 1000
   - Currency: BAM
   - Active: ✓ (checked)
3. Click "Create"

**Expected Results:**
- [ ] Success toast: "Package created successfully"
- [ ] New package appears in list
- [ ] Network tab shows `POST /api/packages` with status `201 Created`
- [ ] **NO** 429 errors
- [ ] **NO** repeated auth context requests

**If it fails:**
- [ ] Capture Network request/response for `POST /api/packages`
- [ ] Capture Console errors
- [ ] Note the error message shown to user

---

### **Test 3.2: Edit Package**

**Steps:**
1. Find the package you just created
2. Click "Edit" button
3. Change name to "Test Package 001 - Updated"
4. Click "Update"

**Expected Results:**
- [ ] Success toast: "Package updated successfully"
- [ ] Package name updated in list
- [ ] Network tab shows `PATCH /api/packages/:id` with status `200 OK`
- [ ] **NO** 429 errors
- [ ] **NO** repeated auth context requests

**If it fails:**
- [ ] Capture Network request/response for `PATCH /api/packages/:id`
- [ ] Capture Console errors
- [ ] Note the error message shown to user

---

### **Test 3.3: Delete Package**

**Steps:**
1. Find the package you just edited
2. Click "Delete" button
3. Confirm deletion in popup

**Expected Results:**
- [ ] Success toast: "Package deleted successfully"
- [ ] Package removed from list
- [ ] Network tab shows `DELETE /api/packages/:id` with status `204 No Content`
- [ ] **NO** 429 errors
- [ ] **NO** repeated auth context requests

**If it fails:**
- [ ] Capture Network request/response for `DELETE /api/packages/:id`
- [ ] Capture Console errors
- [ ] Note the error message shown to user

---

## ✅ Test 4: Reservations - Update Paid Amount

**Note:** This test requires existing reservations. If none exist, create one first via the API or import.

### **Navigate to Reservations:**
1. Click "Reservations" in sidebar
2. Wait for reservations list to load

### **Test 4.1: Update Paid Amount**

**Steps:**
1. Find a reservation with status "confirmed"
2. Click "Edit" or open reservation details
3. Update `paid_amount` field (e.g., from 0 to 500)
4. Click "Save" or "Update"

**Expected Results:**
- [ ] Success toast: "Reservation updated successfully"
- [ ] Paid amount updated in list
- [ ] Remaining amount recalculated correctly
- [ ] Network tab shows `PATCH /api/reservations/:id` with status `200 OK`
- [ ] **NO** 429 errors
- [ ] **NO** repeated auth context requests

**If it fails:**
- [ ] Capture Network request/response for `PATCH /api/reservations/:id`
- [ ] Capture Console errors
- [ ] Note the error message shown to user
- [ ] Check if `paid_amount` column exists in database

---

## ✅ Test 5: UI Behavior - No Toast Spam

### **Monitor for 2 Minutes:**
1. Stay on any page (Dashboard, Packages, Reservations)
2. Don't interact with the page
3. Watch for toast messages

**Expected Results:**
- [ ] **NO** toast messages appear automatically
- [ ] **NO** "Too many requests" messages
- [ ] **NO** "Session expired" messages
- [ ] **NO** "Authentication required" messages

**If toast spam occurs:**
- [ ] Note the exact message
- [ ] Note how often it appears
- [ ] Check Network tab for repeated requests
- [ ] Capture Console logs

---

## ✅ Test 6: Console Errors - No Context Errors

### **Check Console Tab:**
1. Open Console tab in DevTools
2. Filter by "error" or "warn"
3. Look for context-related errors

**Expected Results:**
- [ ] **NO** errors containing "context"
- [ ] **NO** errors containing "429"
- [ ] **NO** errors containing "rate limit"
- [ ] **NO** errors containing "org_id"
- [ ] **NO** errors containing "fetchUserContext"

**If errors appear:**
- [ ] Copy full error stack trace
- [ ] Note which action triggered the error
- [ ] Check if error is blocking functionality

---

## ✅ Test 7: Database Schema Verification

### **Verify Missing Columns Were Added:**

Run this SQL query in your database:

```sql
-- Check customers table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customers' AND column_name = 'status';

-- Check packages table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'packages' AND column_name = 'is_active';

-- Check reservations table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'reservations' AND column_name = 'paid_amount';
```

**Expected Results:**
- [ ] `customers.status` column exists (TEXT, default 'active')
- [ ] `packages.is_active` column exists (BOOLEAN, default TRUE)
- [ ] `reservations.paid_amount` column exists (NUMERIC, default 0)

**If columns are missing:**
- [ ] Run the migration: `supabase/sql/002_crud_fixes.sql`
- [ ] Verify columns were created
- [ ] Retry CRUD tests

---

## 📊 Summary Checklist

### **Auth Loop Fix:**
- [ ] Only ONE `/api/me/context` call on page load
- [ ] No repeated context fetches on token refresh
- [ ] No 429 rate limit errors
- [ ] Context caching working (see "Using cached context" logs)

### **CRUD Operations:**
- [ ] Packages: Create ✓
- [ ] Packages: Edit ✓
- [ ] Packages: Delete ✓
- [ ] Reservations: Update paid_amount ✓

### **UI Behavior:**
- [ ] No toast spam
- [ ] No console errors related to context
- [ ] No auth-related error messages

### **Database Schema:**
- [ ] `customers.status` column exists
- [ ] `packages.is_active` column exists
- [ ] `reservations.paid_amount` column exists

---

## 🐛 If Tests Fail

### **Capture This Information:**

1. **Network Request/Response:**
   - Request URL
   - Request method
   - Request headers (especially Authorization)
   - Request body
   - Response status
   - Response body

2. **Console Logs:**
   - Full error stack trace
   - Any warnings
   - AppContext logs

3. **Screenshots:**
   - Network tab showing the failing request
   - Console tab showing errors
   - UI showing error message

4. **Steps to Reproduce:**
   - Exact sequence of actions
   - Which page you were on
   - What you clicked

---

## ✅ Success Criteria

**All tests pass if:**
- ✅ Only ONE `/api/me/context` request on page load
- ✅ No 429 errors anywhere
- ✅ All CRUD operations work (create, edit, delete)
- ✅ Paid amount updates work for reservations
- ✅ No toast spam
- ✅ No console errors related to context
- ✅ Database columns exist

**If ANY test fails:**
- Document the failure with screenshots and logs
- Check if database migration was run
- Verify both servers are running
- Clear browser cache and try again

---

## 🎯 Quick Verification Commands

### **Check if servers are running:**
```bash
# Check frontend
curl http://localhost:5173

# Check backend
curl http://localhost:3001/api/health
```

### **Check database columns:**
```bash
# Connect to your database and run:
\d customers
\d packages
\d reservations
```

### **Check browser localStorage:**
```javascript
// In browser console:
console.log('Auth token:', localStorage.getItem('nmt_auth_token'));
console.log('All localStorage:', { ...localStorage });
```

---

**Ready to test!** Follow the checklist above and mark each item as you verify it.
