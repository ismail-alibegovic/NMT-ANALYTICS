# Clean Debug Environment - Chrome Extension Noise Filter

**Date:** 2026-01-11  
**Purpose:** Isolate real app errors from browser extension noise

---

## 🧹 Clean Environment Checklist

### **Method 1: Incognito Mode (Recommended)**

**Steps:**
1. Open Chrome
2. Press `Cmd+Shift+N` (Mac) or `Ctrl+Shift+N` (Windows/Linux)
3. Navigate to `http://localhost:5173`
4. Open DevTools (`Cmd+Option+I` or `F12`)

**Benefits:**
- ✅ Extensions disabled by default
- ✅ Clean localStorage/cookies
- ✅ No cached data
- ✅ Fresh session

**Note:** Some extensions run in incognito if you've enabled them. Check `chrome://extensions` and disable "Allow in Incognito" for all extensions.

---

### **Method 2: Disable Extensions Manually**

**Steps:**
1. Open Chrome
2. Go to `chrome://extensions`
3. Toggle OFF all extensions
4. Reload the page
5. Open DevTools

**To disable all at once:**
1. Go to `chrome://extensions`
2. Click "Developer mode" (top right)
3. Click "Pack extension" → Cancel (this refreshes the page)
4. Use the toggle switches to disable all

---

### **Method 3: Clear Site Data**

**Steps:**
1. Open DevTools (`F12` or `Cmd+Option+I`)
2. Go to **Application** tab
3. In left sidebar, click "Storage"
4. Click "Clear site data" button
5. Confirm and reload page

**What gets cleared:**
- ✅ localStorage
- ✅ sessionStorage
- ✅ Cookies
- ✅ Cache
- ✅ IndexedDB

---

### **Method 4: Chrome Guest Profile (Nuclear Option)**

**Steps:**
1. Click your Chrome profile icon (top right)
2. Click "Guest"
3. Navigate to `http://localhost:5173`
4. Open DevTools

**Benefits:**
- ✅ Completely isolated environment
- ✅ No extensions
- ✅ No settings
- ✅ No history

---

## 🔍 Identifying Error Origins

### **App Errors vs Extension Errors**

| **App Error** | **Extension Error** |
|---------------|---------------------|
| Stack trace shows your source files | Stack trace shows `chrome-extension://` |
| File paths: `src/`, `node_modules/`, `@vite/` | File paths: `background.js`, `content.js` |
| Errors in Console → "localhost:5173" | Errors in Console → "chrome-extension://..." |
| Happens in incognito mode | Doesn't happen in incognito mode |
| Reproducible in other browsers | Only in Chrome |

---

## 🎯 Exact Signs to Look For

### **1. Stack Trace Analysis**

#### **App Error (Your Code):**
```
Error: Failed to fetch user context
    at fetchUserContext (AppContext.tsx:68:15)
    at async initAuth (AppContext.tsx:142:7)
    at http://localhost:5173/src/context/AppContext.tsx:164:23
```

**Signs:**
- ✅ File paths contain `localhost:5173`
- ✅ File names match your source files (`AppContext.tsx`, `apiClient.ts`)
- ✅ Line numbers match your code
- ✅ Function names you recognize

---

#### **Extension Error (Not Your Code):**
```
Error: Extension context invalidated
    at chrome-extension://abcdefghijklmnop/background.js:123:45
    at chrome.runtime.onMessage.addListener
    at chrome-extension://abcdefghijklmnop/content.js:67:12
```

**Signs:**
- ❌ File paths contain `chrome-extension://`
- ❌ File names: `background.js`, `content.js`, `popup.js`
- ❌ Chrome API calls: `chrome.runtime`, `chrome.storage`, `chrome.tabs`
- ❌ Extension IDs: long random strings

---

### **2. Console Message Prefixes**

#### **App Messages:**
```
[AppContext] Fetching user context for: abc123
[api-client] ✅ Token attached
[Vite] connected
```

**Signs:**
- ✅ Prefixes you added: `[AppContext]`, `[api-client]`
- ✅ Vite messages: `[Vite]`, `[HMR]`
- ✅ React messages: `Warning: ...`

---

#### **Extension Messages:**
```
[Extension] Background script loaded
chrome.runtime.sendMessage is not available
Extension context invalidated
```

**Signs:**
- ❌ Mentions "Extension", "chrome.runtime", "chrome.storage"
- ❌ Extension-specific terminology
- ❌ Not prefixed with your app's logger

---

### **3. Network Request Origins**

#### **App Requests:**
```
Request URL: http://localhost:5173/api/me/context
Initiator: AppContext.tsx:68
```

**Signs:**
- ✅ URL starts with `http://localhost:5173` or your API domain
- ✅ Initiator is your source file
- ✅ Request headers you set (Authorization: Bearer ...)

---

#### **Extension Requests:**
```
Request URL: https://some-extension-api.com/track
Initiator: chrome-extension://abcdefghijklmnop/background.js
```

**Signs:**
- ❌ URL is external (not your API)
- ❌ Initiator is `chrome-extension://`
- ❌ Request headers you didn't set

---

## 🔧 Console Filtering Techniques

### **Method 1: Filter by Source**

**In DevTools Console:**
1. Click the filter icon (funnel) in Console tab
2. Type: `-chrome-extension`
3. This hides all extension messages

**Filter Examples:**
```
localhost:5173          # Show only app messages
-chrome-extension       # Hide extension messages
-node_modules           # Hide library messages
AppContext              # Show only AppContext logs
error                   # Show only errors
```

---

### **Method 2: Filter by Log Level**

**In DevTools Console:**
1. Click "Default levels" dropdown
2. Uncheck "Verbose"
3. Uncheck "Info" (optional)
4. Keep "Warnings" and "Errors"

**Result:** Only see important messages

---

### **Method 3: Use Console Groups**

**In your code:**
```typescript
// Wrap your logs in groups
console.group('[AppContext] Init');
console.log('Fetching user context...');
console.log('User ID:', userId);
console.groupEnd();
```

**Benefit:** Easy to collapse/expand in Console

---

### **Method 4: Custom Log Levels**

**Add to your logger utility:**
```typescript
// src/utils/logger.ts
export const logger = {
  app: (message: string, ...args: any[]) => {
    console.log(`%c[APP] ${message}`, 'color: #4CAF50; font-weight: bold', ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`%c[APP ERROR] ${message}`, 'color: #f44336; font-weight: bold', ...args);
  },
};
```

**Usage:**
```typescript
logger.app('User context loaded', context);
logger.error('Failed to fetch context', error);
```

**Benefit:** Easy to filter by `[APP]` prefix

---

## 📋 Quick Debug Checklist

### **Before Debugging:**
- [ ] Open incognito window (`Cmd+Shift+N`)
- [ ] Navigate to `http://localhost:5173`
- [ ] Open DevTools (`Cmd+Option+I`)
- [ ] Go to Console tab
- [ ] Filter by `-chrome-extension`
- [ ] Clear console (`Cmd+K`)

### **During Debugging:**
- [ ] Reproduce the issue
- [ ] Check if error appears in filtered console
- [ ] Check stack trace for `localhost:5173` or `chrome-extension://`
- [ ] Check Network tab for failed requests
- [ ] Note the exact error message

### **Verify It's an App Error:**
- [ ] Error contains your file names (AppContext.tsx, apiClient.ts)
- [ ] Stack trace shows `localhost:5173`
- [ ] Error is reproducible in incognito mode
- [ ] Error is reproducible in Firefox/Safari

---

## 🎯 Common Extension Errors to Ignore

### **Safe to Ignore:**

```
Extension context invalidated
chrome.runtime.sendMessage is not available
Unchecked runtime.lastError: The message port closed before a response was received
Failed to load resource: net::ERR_BLOCKED_BY_CLIENT
```

**Why:** These are from browser extensions, not your app.

---

### **NOT Safe to Ignore:**

```
Error: Failed to fetch user context
TypeError: Cannot read property 'org_id' of null
Uncaught (in promise) Error: Network request failed
429 Too Many Requests
```

**Why:** These are from your app and indicate real issues.

---

## 🔍 Advanced Filtering

### **Filter Console by Regular Expression**

**In Console filter box:**
```
/localhost:5173|AppContext|api-client/
```

**Result:** Only shows messages matching these patterns

---

### **Filter Network Requests**

**In Network tab:**
1. Click filter icon
2. Type: `localhost:5173`
3. Or type: `-chrome-extension`

**Result:** Only shows your app's requests

---

### **Filter by Domain**

**In Network tab:**
1. Click "All" dropdown
2. Select "XHR" (for API calls)
3. Or select "JS" (for script errors)

---

## 📊 Comparison Table

| **Scenario** | **App Error** | **Extension Error** |
|--------------|---------------|---------------------|
| **File Path** | `localhost:5173/src/...` | `chrome-extension://...` |
| **Function Names** | Your functions | `chrome.runtime`, `chrome.storage` |
| **Reproducible in Incognito** | ✅ Yes | ❌ No |
| **Reproducible in Firefox** | ✅ Yes | ❌ No |
| **Stack Trace Shows** | Your source files | Extension files |
| **Console Prefix** | `[AppContext]`, `[api-client]` | `[Extension]`, no prefix |
| **Network Initiator** | Your source files | `chrome-extension://` |

---

## 🧪 Test Your Filtering

### **Step 1: Open Incognito**
```
Cmd+Shift+N (Mac) or Ctrl+Shift+N (Windows)
```

### **Step 2: Navigate to App**
```
http://localhost:5173
```

### **Step 3: Open DevTools**
```
Cmd+Option+I (Mac) or F12 (Windows)
```

### **Step 4: Filter Console**
```
-chrome-extension
```

### **Step 5: Reload Page**
```
Cmd+R (Mac) or F5 (Windows)
```

### **Step 6: Verify**
- [ ] Only see app messages
- [ ] No extension errors
- [ ] Stack traces show `localhost:5173`

---

## ✅ Success Criteria

**You've successfully isolated app errors when:**
- ✅ Console only shows messages from `localhost:5173`
- ✅ No `chrome-extension://` in stack traces
- ✅ All errors are reproducible in incognito mode
- ✅ Network tab only shows your API requests
- ✅ No extension-related error messages

---

## 🎯 Quick Reference

### **Open Incognito:**
- Mac: `Cmd+Shift+N`
- Windows: `Ctrl+Shift+N`

### **Open DevTools:**
- Mac: `Cmd+Option+I`
- Windows: `F12`

### **Clear Console:**
- Mac: `Cmd+K`
- Windows: `Ctrl+L`

### **Filter Console:**
```
-chrome-extension    # Hide extension messages
localhost:5173       # Show only app messages
error                # Show only errors
```

### **Check Extensions:**
```
chrome://extensions
```

---

**Use this checklist every time you debug to ensure you're seeing real app errors, not extension noise!**
