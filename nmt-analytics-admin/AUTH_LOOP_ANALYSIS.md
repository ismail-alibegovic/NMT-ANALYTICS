# Auth/Context Loop Analysis & Fix

**Date:** 2026-01-11  
**File:** `src/context/AppContext.tsx`  
**Status:** ✅ **ALREADY WELL-GUARDED** with minor improvement needed

---

## 🔍 Root Cause Analysis

### **Current Implementation Review:**

The AppContext already has **excellent** protection mechanisms:

1. ✅ **Single-flight guard** (lines 29-30, 92-102)
2. ✅ **Caching** (lines 33-34, 85-90)
3. ✅ **429 cooldown** (lines 36-37, 74-83, 132-144)
4. ✅ **Boolean flag guard** (lines 29, 104-108)
5. ✅ **Proper cleanup on logout** (lines 50-61)
6. ✅ **No fetch on TOKEN_REFRESHED** (lines 245-248)

### **Potential Loop Causes:**

#### **1. useEffect Dependency Issue (Line 270-283)** ⚠️

```typescript
useEffect(() => {
  const handleApiAuthError = async (event: Event) => {
    const customEvent = event as CustomEvent;
    toast.error(customEvent.detail.message);
    await supabase.auth.signOut();
  };

  window.addEventListener('api-auth-error', handleApiAuthError);

  return () => {
    window.removeEventListener('api-auth-error', handleApiAuthError as EventListener);
  };
}, [toast]); // ⚠️ toast changes on every render
```

**Problem:**
- `toast` object may be recreated on each render
- This causes the useEffect to re-run
- Event listener is removed and re-added
- **Not directly causing context loop, but inefficient**

**Fix:** Use `useCallback` for the handler or remove `toast` from deps

---

#### **2. Multiple Component Mounts** ⚠️

If the `AppProvider` is mounted multiple times (e.g., in development with React StrictMode or improper routing), each mount will call `fetchUserContext`.

**Check:**
- Is `AppProvider` wrapped around the entire app only once?
- Is React StrictMode enabled (causes double-mount in dev)?

---

#### **3. External State Updates** ⚠️

If other components are calling `supabase.auth.signOut()` or triggering auth events, this could cause loops.

**Check:**
- Are there any other places calling `supabase.auth.signOut()`?
- Are there any custom auth event dispatchers?

---

## ✅ Recommended Fixes

### **Fix 1: Stabilize Event Listener (Minor Improvement)**

**Current (Line 270-283):**
```typescript
useEffect(() => {
  const handleApiAuthError = async (event: Event) => {
    const customEvent = event as CustomEvent;
    toast.error(customEvent.detail.message);
    await supabase.auth.signOut();
  };

  window.addEventListener('api-auth-error', handleApiAuthError);

  return () => {
    window.removeEventListener('api-auth-error', handleApiAuthError as EventListener);
  };
}, [toast]); // ⚠️ Unstable dependency
```

**Fixed:**
```typescript
useEffect(() => {
  const handleApiAuthError = async (event: Event) => {
    const customEvent = event as CustomEvent;
    toast.error(customEvent.detail.message);
    await supabase.auth.signOut();
  };

  window.addEventListener('api-auth-error', handleApiAuthError);

  return () => {
    window.removeEventListener('api-auth-error', handleApiAuthError as EventListener);
  };
}, []); // ✅ Empty deps - toast is stable enough for this use case
```

**Rationale:**
- `toast` is from `useToast()` context and should be stable
- Even if it changes, the event handler will use the latest closure
- Removing from deps prevents unnecessary re-registration

---

### **Fix 2: Add Development Logging**

Add more detailed logging to track when and why `fetchUserContext` is called:

**Add at the start of `fetchUserContext` (Line 63):**

```typescript
const fetchUserContext = async (user: User | null, force = false) => {
  logger.log('[AppContext] fetchUserContext called:', {
    userId: user?.id,
    force,
    hasCachedContext: !!cachedContext.current,
    lastUserId: lastUserId.current,
    isFetching: isFetchingContext.current,
    hasInFlightPromise: !!inFlightPromise.current,
    inCooldown: rateLimitCooldownUntil.current > Date.now()
  });

  if (!user) {
    // ... existing code
  }
  // ... rest of function
};
```

This will help identify exactly when and why the function is being called.

---

## 📊 Current Guards Summary

### **Guard 1: Cooldown Check (Lines 74-83)**
```typescript
const now = Date.now();
if (rateLimitCooldownUntil.current > now) {
  const remainingSeconds = Math.ceil((rateLimitCooldownUntil.current - now) / 1000);
  logger.warn(`[AppContext] In 429 cooldown for ${remainingSeconds}s, using cached context`);
  if (cachedContext.current) {
    setUserContext(cachedContext.current);
  }
  return; // ✅ Prevents request
}
```

### **Guard 2: Cache Check (Lines 85-90)**
```typescript
if (!force && cachedContext.current && lastUserId.current === user.id) {
  logger.log('[AppContext] Using cached context for:', user.id);
  setUserContext(cachedContext.current);
  return; // ✅ Prevents request
}
```

### **Guard 3: In-Flight Promise (Lines 92-102)**
```typescript
if (inFlightPromise.current) {
  logger.log('[AppContext] Request already in-flight, waiting for it to complete...');
  try {
    await inFlightPromise.current;
    logger.log('[AppContext] In-flight request completed, using result');
  } catch (error) {
    logger.error('[AppContext] In-flight request failed:', error);
  }
  return; // ✅ Prevents duplicate request
}
```

### **Guard 4: Boolean Flag (Lines 104-108)**
```typescript
if (isFetchingContext.current) {
  logger.log('[AppContext] Already fetching context (flag check), skipping...');
  return; // ✅ Prevents duplicate request
}
```

**Result:** With all these guards, it's **nearly impossible** for duplicate requests to occur.

---

## 🧪 Verification Steps

### **Step 1: Check Network Tab**

1. Open Chrome DevTools (`F12` or `Cmd+Option+I`)
2. Go to **Network** tab
3. Filter by: `me/context`
4. Clear network log (`Cmd+K`)
5. Reload page (`F5` or `Cmd+R`)

**Expected:**
- ✅ **ONE** request to `GET /api/me/context`
- ✅ Status: `200 OK`
- ✅ **NO** additional requests

**If you see multiple requests:**
- Check the **Initiator** column to see what triggered each request
- Check console logs for `[AppContext]` messages

---

### **Step 2: Check Console Logs**

Look for these log patterns:

**Expected (Single Request):**
```
[AppContext] fetchUserContext called: { userId: "...", force: false, ... }
[AppContext] Fetching user context for: ...
[AppContext] User context loaded: { org: "...", role: "...", modules: 3 }
```

**If Loop Detected:**
```
[AppContext] fetchUserContext called: { userId: "...", force: false, ... }
[AppContext] Using cached context for: ...  // ✅ Good - using cache
```

**Or:**
```
[AppContext] fetchUserContext called: { userId: "...", force: false, ... }
[AppContext] Request already in-flight, waiting...  // ✅ Good - guard working
```

---

### **Step 3: Check for Multiple Mounts**

Add this at the top of `AppProvider` (Line 21):

```typescript
export function AppProvider({ children }: AppProviderProps) {
  // Add this
  useEffect(() => {
    console.log('[AppProvider] MOUNTED');
    return () => {
      console.log('[AppProvider] UNMOUNTED');
    };
  }, []);

  // ... rest of component
}
```

**Expected:**
- In production: `MOUNTED` once
- In development (StrictMode): `MOUNTED` → `UNMOUNTED` → `MOUNTED` (React 18 behavior)

**If you see multiple mounts in production:**
- Check if `AppProvider` is used multiple times in the component tree
- Check routing configuration

---

## 🔧 Minimal Diff

### **Change 1: Stabilize Event Listener**

**File:** `src/context/AppContext.tsx`  
**Lines:** 270-283

```diff
   useEffect(() => {
     const handleApiAuthError = async (event: Event) => {
       const customEvent = event as CustomEvent;
       toast.error(customEvent.detail.message);
       // Sign out to trigger redirect to login
       await supabase.auth.signOut();
     };
 
     window.addEventListener('api-auth-error', handleApiAuthError);
 
     return () => {
       window.removeEventListener('api-auth-error', handleApiAuthError as EventListener);
     };
-  }, [toast]);
+  }, []); // toast is stable, no need to re-register listener
 });
```

---

### **Change 2: Add Debug Logging (Optional)**

**File:** `src/context/AppContext.tsx`  
**Line:** 63

```diff
 const fetchUserContext = async (user: User | null, force = false) => {
+  // Debug logging
+  if (import.meta.env.DEV) {
+    logger.log('[AppContext] fetchUserContext called:', {
+      userId: user?.id,
+      force,
+      hasCachedContext: !!cachedContext.current,
+      lastUserId: lastUserId.current,
+      isFetching: isFetchingContext.current,
+      hasInFlightPromise: !!inFlightPromise.current,
+      inCooldown: rateLimitCooldownUntil.current > Date.now()
+    });
+  }
+
   if (!user) {
     setUserContext(null);
     cachedContext.current = null;
```

---

## 📋 Diagnostic Checklist

If you're still seeing multiple requests, check:

- [ ] **Network Tab:** How many requests to `/api/me/context`?
- [ ] **Initiator:** What triggered each request?
- [ ] **Console:** Any `[AppContext]` logs showing why?
- [ ] **React DevTools:** Is `AppProvider` mounted multiple times?
- [ ] **StrictMode:** Is it enabled? (causes double-mount in dev)
- [ ] **Routing:** Is `AppProvider` in the right place?
- [ ] **Other Code:** Any other calls to `getMeContext()` outside AppContext?

---

## 🎯 Expected Behavior

### **On Page Load:**
```
1. AppProvider mounts
2. useEffect runs (line 213)
3. getSession() called
4. fetchUserContext(user) called
5. Guards check:
   ✅ No cooldown
   ✅ No cache (first load)
   ✅ No in-flight request
   ✅ Not already fetching
6. Request sent to /api/me/context
7. Response received, context cached
8. onAuthStateChange listener registered
```

**Result:** ✅ **ONE** request

---

### **On Token Refresh:**
```
1. Supabase triggers TOKEN_REFRESHED event
2. onAuthStateChange handler runs (line 232)
3. setToken() updates token
4. NO fetchUserContext() call (line 245-248)
5. Cached context used
```

**Result:** ✅ **ZERO** requests

---

### **On Navigation:**
```
1. User navigates to different page
2. AppProvider stays mounted (no re-mount)
3. No auth events triggered
4. No fetchUserContext() call
```

**Result:** ✅ **ZERO** requests

---

## 🚨 Common Pitfalls

### **Pitfall 1: Multiple AppProvider Instances**

**Bad:**
```tsx
// App.tsx
<AppProvider>
  <Router>
    <Routes>
      <Route path="/admin" element={
        <AppProvider> {/* ❌ Duplicate! */}
          <AdminLayout />
        </AppProvider>
      } />
    </Routes>
  </Router>
</AppProvider>
```

**Good:**
```tsx
// App.tsx
<AppProvider>
  <Router>
    <Routes>
      <Route path="/admin" element={<AdminLayout />} />
    </Routes>
  </Router>
</AppProvider>
```

---

### **Pitfall 2: Calling getMeContext() Directly**

**Bad:**
```tsx
// Some component
useEffect(() => {
  getMeContext().then(setContext); // ❌ Bypasses guards!
}, []);
```

**Good:**
```tsx
// Some component
const { userContext } = useApp(); // ✅ Use context
```

---

### **Pitfall 3: Force Refresh on Every Render**

**Bad:**
```tsx
useEffect(() => {
  fetchUserContext(user, true); // ❌ force=true on every render!
}, [user]); // ❌ user changes trigger refetch
```

**Good:**
```tsx
// Let AppContext handle it automatically
// Only force refresh on explicit user action (e.g., "Refresh" button)
```

---

## ✅ Summary

### **Current State:**
- ✅ AppContext has **excellent** guards
- ✅ Single-flight protection
- ✅ Caching mechanism
- ✅ 429 cooldown
- ✅ No fetch on token refresh
- ⚠️ Minor: Event listener re-registration (not causing loop)

### **Recommended Actions:**
1. **Apply Fix 1:** Remove `toast` from useEffect deps (minor improvement)
2. **Add Debug Logging:** To track calls in development
3. **Verify:** Check Network tab for single request
4. **Check:** Ensure AppProvider is mounted only once

### **If Loop Persists:**
1. Check console logs for `[AppContext]` messages
2. Check Network tab Initiator column
3. Check for multiple AppProvider mounts
4. Check for direct `getMeContext()` calls outside AppContext
5. Share console logs and network trace for further diagnosis

---

**Status:** ✅ **WELL-PROTECTED** - Minor improvement recommended, but core logic is solid!
