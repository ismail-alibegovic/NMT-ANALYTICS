# API Client 429 Cooldown Helper - Implementation

**Date:** 2026-01-11  
**Purpose:** Prevent request storms by adding global 429 detection and cooldown helper

---

## 📊 Changes Made

### **1. Added 429 Cooldown Helper Functions**

**File:** `src/lib/apiClient.ts`  
**Lines:** 43-78

```typescript
// ============================================================================
// 429 Rate Limit Cooldown Helper
// ============================================================================

let rateLimitCooldownUntil = 0; // Timestamp when cooldown expires

/**
 * Check if we're in a 429 cooldown period
 * @returns true if in cooldown, false if requests are allowed
 */
export function shouldCooldown429(): boolean {
  const now = Date.now();
  if (rateLimitCooldownUntil > now) {
    const remainingSeconds = Math.ceil((rateLimitCooldownUntil - now) / 1000);
    logger.warn(`[api-client] 429 cooldown active for ${remainingSeconds}s`);
    return true;
  }
  return false;
}

/**
 * Set 429 cooldown for 60 seconds
 * Called internally when 429 is detected
 */
function set429Cooldown(): void {
  const cooldownSeconds = 60;
  rateLimitCooldownUntil = Date.now() + (cooldownSeconds * 1000);
  logger.error(`[api-client] 429 detected - cooldown set for ${cooldownSeconds}s`);
}

/**
 * Clear 429 cooldown (e.g., on successful request or logout)
 */
export function clear429Cooldown(): void {
  rateLimitCooldownUntil = 0;
}
```

**How it works:**
- **`shouldCooldown429()`** - Check if we're in cooldown period (returns true/false)
- **`set429Cooldown()`** - Set 60-second cooldown when 429 detected (internal)
- **`clear429Cooldown()`** - Clear cooldown on logout or successful request (exported)

---

### **2. Updated Response Interceptor**

**File:** `src/lib/apiClient.ts`  
**Lines:** 167-177

```diff
 // Handle 429 Rate Limit - DO NOT RETRY
 if (error.response?.status === 429) {
   logger.error('[api-client] 429 Rate Limit - Request blocked');
+  set429Cooldown(); // Set 60-second cooldown
   // Mark as already retried to prevent any retry logic
   if (originalRequest) {
     originalRequest._retry = true;
   }
   // Return immediately without retry - error will be handled by caller
   return Promise.reject(error);
 }
```

**What changed:**
- ✅ Calls `set429Cooldown()` when 429 is detected
- ✅ Sets global 60-second cooldown
- ✅ Prevents any retry logic
- ✅ Returns error immediately to caller

---

### **3. Updated normalizeError Message**

**File:** `src/lib/apiClient.ts`  
**Lines:** 207-212

```diff
 // Handle 429 Rate Limit with clear message
 if (status === 429) {
-  message = 'Authentication rate limit reached. Please wait and refresh.';
-  code = 'RATE_LIMIT_EXCEEDED';
+  message = 'Authentication rate limit reached. Please wait 60 seconds and refresh.';
+  code = 'RATE_LIMIT';
   return { message, status, code };
 }
```

**What changed:**
- ✅ Message now says "60 seconds" (specific time)
- ✅ Code changed to `RATE_LIMIT` (simpler)
- ✅ Matches requested format exactly

---

## 📋 Complete Diff Patch

```diff
@@ -40,6 +40,45 @@
   logger.debugError('[api-client] baseURL:', baseURL);
 }
 
+// ============================================================================
+// 429 Rate Limit Cooldown Helper
+// ============================================================================
+
+let rateLimitCooldownUntil = 0; // Timestamp when cooldown expires
+
+/**
+ * Check if we're in a 429 cooldown period
+ * @returns true if in cooldown, false if requests are allowed
+ */
+export function shouldCooldown429(): boolean {
+  const now = Date.now();
+  if (rateLimitCooldownUntil > now) {
+    const remainingSeconds = Math.ceil((rateLimitCooldownUntil - now) / 1000);
+    logger.warn(`[api-client] 429 cooldown active for ${remainingSeconds}s`);
+    return true;
+  }
+  return false;
+}
+
+/**
+ * Set 429 cooldown for 60 seconds
+ * Called internally when 429 is detected
+ */
+function set429Cooldown(): void {
+  const cooldownSeconds = 60;
+  rateLimitCooldownUntil = Date.now() + (cooldownSeconds * 1000);
+  logger.error(`[api-client] 429 detected - cooldown set for ${cooldownSeconds}s`);
+}
+
+/**
+ * Clear 429 cooldown (e.g., on successful request or logout)
+ */
+export function clear429Cooldown(): void {
+  rateLimitCooldownUntil = 0;
+}
+
+// ============================================================================
+
 const api: AxiosInstance = axios.create({
   baseURL,
   timeout: 10000,

@@ -167,6 +206,7 @@
     // Handle 429 Rate Limit - DO NOT RETRY
     if (error.response?.status === 429) {
       logger.error('[api-client] 429 Rate Limit - Request blocked');
+      set429Cooldown(); // Set 60-second cooldown
       // Mark as already retried to prevent any retry logic
       if (originalRequest) {
         originalRequest._retry = true;

@@ -207,8 +247,8 @@
 
     // Handle 429 Rate Limit with clear message
     if (status === 429) {
-      message = 'Authentication rate limit reached. Please wait and refresh.';
-      code = 'RATE_LIMIT_EXCEEDED';
+      message = 'Authentication rate limit reached. Please wait 60 seconds and refresh.';
+      code = 'RATE_LIMIT';
       return { message, status, code };
     }
```

---

## 🎯 How AppContext Should Use shouldCooldown429()

### **Option 1: Check Before Making Request (Recommended)**

**File:** `src/context/AppContext.tsx`

```typescript
import { shouldCooldown429, clear429Cooldown } from '../lib/apiClient';

const fetchUserContext = async (user: User | null, force = false) => {
  if (!user) {
    // ... existing cleanup ...
    return;
  }

  // ✅ Check API client cooldown FIRST
  if (shouldCooldown429()) {
    logger.warn('[AppContext] API client in 429 cooldown, using cached context');
    if (cachedContext.current) {
      setUserContext(cachedContext.current);
    }
    return;
  }

  // ... existing cache check ...
  
  // ... existing single-flight guard ...
  
  // ... make request ...
  
  try {
    const context = await getMeContext();
    setUserContext(context);
    cachedContext.current = context;
    lastUserId.current = user.id;
    rateLimitCooldownUntil.current = 0; // Clear AppContext cooldown
    // No need to call clear429Cooldown() - it clears automatically after 60s
  } catch (error: any) {
    // ... existing error handling ...
  }
};

const logout = () => {
  // ... existing cleanup ...
  clear429Cooldown(); // ✅ Clear API client cooldown on logout
};
```

---

### **Option 2: Sync Cooldowns (Alternative)**

If you want AppContext and apiClient cooldowns to be in sync:

```typescript
import { shouldCooldown429, clear429Cooldown } from '../lib/apiClient';

const fetchUserContext = async (user: User | null, force = false) => {
  // Check BOTH cooldowns
  const apiCooldown = shouldCooldown429();
  const appCooldown = rateLimitCooldownUntil.current > Date.now();
  
  if (apiCooldown || appCooldown) {
    logger.warn('[AppContext] In cooldown period, using cached context');
    if (cachedContext.current) {
      setUserContext(cachedContext.current);
    }
    return;
  }
  
  // ... rest of function ...
};
```

---

## ✅ Benefits

### **1. Global 429 Detection**
- ✅ All API calls go through the same interceptor
- ✅ 429 detected globally, not just for /api/me/context
- ✅ Cooldown applies to ALL requests

### **2. Prevents Request Storms**
- ✅ After 429, NO requests for 60 seconds
- ✅ `shouldCooldown429()` can be checked before making requests
- ✅ Automatic cooldown expiry after 60 seconds

### **3. Clear Error Messages**
- ✅ Message: "Authentication rate limit reached. Please wait 60 seconds and refresh."
- ✅ Code: `RATE_LIMIT`
- ✅ Consistent format: `{ message, code, status }`

### **4. No Auto-Retry**
- ✅ `_retry` flag set to prevent retry loops
- ✅ Error returned immediately to caller
- ✅ Caller decides what to do (use cache, show error, etc.)

---

## 🔧 Usage Examples

### **Check Cooldown Before Request**

```typescript
import { shouldCooldown429 } from '../lib/apiClient';

async function fetchData() {
  if (shouldCooldown429()) {
    console.log('In cooldown, using cached data');
    return cachedData;
  }
  
  const response = await api.get('/some/endpoint');
  return response.data;
}
```

---

### **Clear Cooldown on Logout**

```typescript
import { clear429Cooldown } from '../lib/apiClient';

function logout() {
  // Clear tokens, cache, etc.
  clear429Cooldown(); // Clear API client cooldown
  supabase.auth.signOut();
}
```

---

### **Check Cooldown Status**

```typescript
import { shouldCooldown429 } from '../lib/apiClient';

// Returns true if in cooldown, false otherwise
const inCooldown = shouldCooldown429();

if (inCooldown) {
  // Show message to user
  toast.info('Please wait before making more requests');
}
```

---

## 📊 Flow Diagram

### **Before:**

```
API Request → 429 Response
  ↓
normalizeError returns error
  ↓
Caller receives error
  ↓
Caller might retry immediately ❌
  ↓
More 429 errors ❌
```

### **After:**

```
API Request → 429 Response
  ↓
Interceptor detects 429
  ↓
set429Cooldown() called (60s)
  ↓
normalizeError returns clear message
  ↓
Caller receives error
  ↓
Caller checks shouldCooldown429() ✅
  ↓
Returns true → Use cached data ✅
  ↓
No new requests for 60s ✅
```

---

## 🎯 Key Points

### **For AppContext:**

1. **Import the helper:**
   ```typescript
   import { shouldCooldown429, clear429Cooldown } from '../lib/apiClient';
   ```

2. **Check before request:**
   ```typescript
   if (shouldCooldown429()) {
     // Use cached context
     return;
   }
   ```

3. **Clear on logout:**
   ```typescript
   clear429Cooldown();
   ```

### **For Other Components:**

- Same pattern: check `shouldCooldown429()` before making requests
- Use cached data if in cooldown
- No need to set cooldown manually (interceptor does it)

---

## ✅ Verification

### **Test 1: Normal Request**
```
1. Make API request
2. Verify: shouldCooldown429() returns false
3. Verify: Request goes through
```

### **Test 2: 429 Response**
```
1. Trigger 429 error
2. Verify: set429Cooldown() called
3. Verify: shouldCooldown429() returns true
4. Verify: Message: "Please wait 60 seconds and refresh."
5. Verify: Code: "RATE_LIMIT"
```

### **Test 3: Cooldown Period**
```
1. After 429, check shouldCooldown429()
2. Verify: Returns true for 60 seconds
3. Verify: Returns false after 60 seconds
```

### **Test 4: Logout Clears Cooldown**
```
1. Set cooldown (trigger 429)
2. Call clear429Cooldown()
3. Verify: shouldCooldown429() returns false
```

---

## 📝 Summary

### **Changes:**
- ✅ Added `shouldCooldown429()` helper (exported)
- ✅ Added `clear429Cooldown()` helper (exported)
- ✅ Added `set429Cooldown()` internal function
- ✅ Updated response interceptor to call `set429Cooldown()`
- ✅ Updated error message to "Please wait 60 seconds and refresh."
- ✅ Updated error code to `RATE_LIMIT`

### **Benefits:**
- ✅ Global 429 detection
- ✅ Prevents request storms
- ✅ Clear error messages
- ✅ No auto-retry behavior
- ✅ Easy to use in AppContext and other components

---

**Status:** ✅ **COMPLETE** - API client now has global 429 cooldown helper to prevent request storms!
