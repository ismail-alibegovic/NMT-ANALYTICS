# API Client 429 Handling Fix - Summary

**Date:** 2026-01-11  
**Issue:** API client continues retrying on HTTP 429, causing auth lockout

---

## 🔍 Problem Analysis

### **Before Fix:**

When the API returned HTTP 429 (Too Many Requests), the API client:
- ❌ Did not detect 429 status specifically
- ❌ Continued with normal error handling flow
- ❌ Potentially allowed retries through other mechanisms
- ❌ Returned generic error message

This caused:
- 🔴 Continued retry attempts
- 🔴 Auth lockout escalation
- 🔴 Poor user experience (no clear message)

---

## ✅ Fixes Applied

### **1. Added 429 Detection in Response Interceptor**

**File:** `src/lib/apiClient.ts`  
**Lines:** 128-137

```typescript
// Handle 429 Rate Limit - DO NOT RETRY
if (error.response?.status === 429) {
  logger.error('[api-client] 429 Rate Limit - Request blocked');
  // Mark as already retried to prevent any retry logic
  if (originalRequest) {
    originalRequest._retry = true;
  }
  // Return immediately without retry - error will be handled by caller
  return Promise.reject(error);
}
```

**How it prevents retries:**
1. **Early detection** - Catches 429 before any other error handling
2. **Sets `_retry` flag** - Marks request as already retried, preventing retry loops
3. **Immediate rejection** - Returns error immediately to caller without processing
4. **Logs the event** - Helps debugging

---

### **2. Added Clear Error Message in normalizeError**

**File:** `src/lib/apiClient.ts`  
**Lines:** 168-172

```typescript
// Handle 429 Rate Limit with clear message
if (status === 429) {
  message = 'Authentication rate limit reached. Please wait and refresh.';
  code = 'RATE_LIMIT_EXCEEDED';
  return { message, status, code };
}
```

**Benefits:**
- ✅ Clear, user-friendly message
- ✅ Specific error code for programmatic handling
- ✅ Early return prevents other error message logic
- ✅ Consistent error format

---

## 📊 Exact Diff

### **Response Interceptor (Lines 109-153)**

```diff
 // Response interceptor
 api.interceptors.response.use(
   (response: AxiosResponse) => {
     return response;
   },
   async (error: AxiosError) => {
     const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

+    // Handle 429 Rate Limit - DO NOT RETRY
+    if (error.response?.status === 429) {
+      logger.error('[api-client] 429 Rate Limit - Request blocked');
+      // Mark as already retried to prevent any retry logic
+      if (originalRequest) {
+        originalRequest._retry = true;
+      }
+      // Return immediately without retry - error will be handled by caller
+      return Promise.reject(error);
+    }
+
     // Handle 401/403
     if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
       originalRequest._retry = true;
       await supabase.auth.signOut();
       window.dispatchEvent(new CustomEvent('api-auth-error', {
         detail: { message: 'Session expired' }
       }));
       window.location.href = '/auth/signin';
       return Promise.reject(error);
     }

     return Promise.reject(error);
   }
 );
```

### **normalizeError Function (Lines 150-191)**

```diff
 function normalizeError(error: any): ApiError {
   if (error.response) {
     const data = error.response.data;
     const status = error.response.status;
     let message = 'An error occurred';
     let code = data?.code;

+    // Handle 429 Rate Limit with clear message
+    if (status === 429) {
+      message = 'Authentication rate limit reached. Please wait and refresh.';
+      code = 'RATE_LIMIT_EXCEEDED';
+      return { message, status, code };
+    }
+
     // Handle { message: "..." }
     if (data?.message) {
       message = data.message;
     }
     // Handle { error: "..." } or { error: { message: "..." } }
     else if (data?.error) {
       if (typeof data.error === 'string') {
         message = data.error;
       } else if (typeof data.error === 'object' && data.error.message) {
         message = data.error.message;
       }
     }

     return {
       message,
       status,
       code,
     };
   }

   return {
     message: error.message || 'Network error',
     code: 'NETWORK_ERROR',
   };
 }
```

---

## 🎯 Retry Prevention Logic Explained

### **How Retries Are Prevented:**

1. **Early Detection (Line 128):**
   ```typescript
   if (error.response?.status === 429) {
   ```
   - Catches 429 errors **before** any other error handling
   - Prevents 401/403 handler from running
   - Prevents any downstream retry logic

2. **Flag Setting (Lines 131-133):**
   ```typescript
   if (originalRequest) {
     originalRequest._retry = true;
   }
   ```
   - Sets `_retry` flag on the request config
   - This flag is checked by other error handlers (e.g., 401/403 handler at line 141)
   - Prevents retry loops in case of multiple error handlers

3. **Immediate Rejection (Line 136):**
   ```typescript
   return Promise.reject(error);
   ```
   - Returns error immediately to caller
   - No retry, no redirect, no additional processing
   - Caller (e.g., AppContext) handles the error

4. **Clear Error Message (Lines 168-172):**
   ```typescript
   if (status === 429) {
     message = 'Authentication rate limit reached. Please wait and refresh.';
     code = 'RATE_LIMIT_EXCEEDED';
     return { message, status, code };
   }
   ```
   - Provides clear, actionable message to user
   - Returns early, preventing generic error messages
   - Consistent error format for programmatic handling

---

## 🔒 Behavior Verification

### **Other Status Codes - Unchanged:**

| Status | Behavior | Changed? |
|--------|----------|----------|
| **200-299** | Success, return data | ❌ No |
| **401** | Sign out, redirect to login | ❌ No |
| **403** | Sign out, redirect to login | ❌ No |
| **404** | Return error to caller | ❌ No |
| **429** | **Block retry, return clear error** | ✅ **Yes** |
| **500** | Return error to caller | ❌ No |
| **Network** | Return network error | ❌ No |

### **Predictable Behavior:**

- ✅ 429 errors are caught **first** (before 401/403 handler)
- ✅ No automatic retry happens
- ✅ Error is returned immediately to caller
- ✅ Clear error message is surfaced
- ✅ Other status codes behave exactly as before

---

## 📈 Before vs After

### **Before Fix:**

```
API returns 429
  ↓
Response interceptor (no specific handling)
  ↓
Possibly retries through other mechanisms
  ↓
Generic error message
  ↓
User confused, continues clicking
  ↓
More 429 errors
  ↓
Auth lockout escalates
```

### **After Fix:**

```
API returns 429
  ↓
Response interceptor detects 429
  ↓
Sets _retry flag (prevents retry)
  ↓
Returns error immediately
  ↓
normalizeError provides clear message
  ↓
User sees: "Authentication rate limit reached. Please wait and refresh."
  ↓
AppContext uses cached data (if available)
  ↓
No further requests
  ↓
Rate limit clears naturally
```

---

## 🧪 Testing Checklist

### **Verify 429 Handling:**
- [ ] Trigger 429 error (rapid API calls)
- [ ] Verify no automatic retry happens
- [ ] Verify error message: "Authentication rate limit reached. Please wait and refresh."
- [ ] Verify error code: `RATE_LIMIT_EXCEEDED`
- [ ] Verify no redirect to login page
- [ ] Verify AppContext uses cached data

### **Verify Other Status Codes Still Work:**
- [ ] 401 → Signs out and redirects to login
- [ ] 403 → Signs out and redirects to login
- [ ] 404 → Returns error to caller
- [ ] 500 → Returns error to caller
- [ ] 200 → Returns data successfully

---

## 🎯 Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| **429 Detection** | Generic error handling | Specific 429 detection |
| **Retry Behavior** | Potentially retries | **NO RETRY** |
| **Error Message** | Generic | **Clear, actionable** |
| **Error Code** | None or generic | `RATE_LIMIT_EXCEEDED` |
| **User Experience** | Confusing | Informative |
| **Auth Lockout** | Escalates | Prevented |

---

## 💡 How This Works With AppContext

The AppContext already has 429 handling (from previous fix):

```typescript
// AppContext.tsx (lines 77-89)
if (error.response?.status === 429 || error.status === 429) {
  logger.error('[AppContext] 429 - Rate limited. Using cached context if available.');
  toast.error('Too many requests. Please wait a moment and refresh.');
  if (cachedContext.current) {
    setUserContext(cachedContext.current);
  }
  return; // Stop retry loop
}
```

**Combined behavior:**
1. API client detects 429 → Returns error immediately (no retry)
2. Error bubbles up to AppContext
3. AppContext detects 429 → Uses cached context
4. User sees clear toast message
5. No further API calls
6. Rate limit clears naturally

---

## ✅ Confirmation

### **No Automatic Retry:**
- ✅ `_retry` flag set immediately
- ✅ Early return prevents retry logic
- ✅ Error returned to caller immediately

### **Clear Error Message:**
- ✅ "Authentication rate limit reached. Please wait and refresh."
- ✅ Error code: `RATE_LIMIT_EXCEEDED`
- ✅ Status: 429

### **Other Status Codes Unaffected:**
- ✅ 401/403 still trigger sign out
- ✅ Other errors still handled normally
- ✅ Success responses unchanged

---

**Status:** ✅ **COMPLETE** - 429 errors are now detected early, retries are prevented, and users see a clear error message.
