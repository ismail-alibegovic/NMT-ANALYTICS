# NMT Analytics - Development Setup Guide

## ✅ Quick Verification Checklist

After setup, verify everything works:

```bash
# 1. Check API configuration
curl http://localhost:3001/api/doctor
# Should show: DEV_AUTO_BOOTSTRAP: true, ADMIN_URL: http://localhost:5173

# 2. Check admin console (after starting npm run dev)
# Should see: ✅ Supabase: Using correct anon key in browser
# Should NOT see: 🚨 CRITICAL SECURITY ERROR

# 3. Test login
# - Go to http://localhost:5173/auth/signin
# - Enter credentials
# - Should redirect to /dashboard (no spinner)

# 4. Check API context
# Get token from localStorage: nmt_auth_token
curl http://localhost:3001/api/me/context \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
# Should return 200 with: { user, org, role, modules: [...] }

# 5. Check API logs
# Should see: GET /me/context 200
# Should NOT see: "Profile not found" or 403
```

---

## Quick Start

### 1. Environment Setup

#### Admin (.env)
```env
# Supabase Configuration
VITE_SUPABASE_URL=https://hacutwknfgufrqlgdiia.supabase.co

# CRITICAL: Use the ANON key here (NOT service_role!)
# Get from: Supabase Dashboard > Settings > API > "anon public" key
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Admin URL (for reference)
VITE_ADMIN_URL=http://localhost:5173
```

#### API (.env)
```env
# Environment
NODE_ENV=development
PORT=3001

# Supabase Configuration
SUPABASE_URL=https://hacutwknfgufrqlgdiia.supabase.co

# CRITICAL: Use service_role key here (server-side only!)
# Get from: Supabase Dashboard > Settings > API > "service_role" key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Optional: Anon key for reference (not used in API currently)
SUPABASE_ANON_KEY=your-anon-key-here

# CORS Configuration
ADMIN_URL=http://localhost:5173

# Development Features (SAFE - auto-creates org/profile/modules for new users)
DEV_AUTO_BOOTSTRAP=true
DEV_DEFAULT_ORG_NAME=NMT Analytics
DEV_DEFAULT_ROLE=admin
DEV_DEFAULT_MODULES=dashboard,customers,packages,reservations,departures,payments,transactions

# Seed User (your Supabase Auth user ID)
SEED_USER_ID=72ed5a01-9095-4045-bd9a-14b3beed9962

# Optional: Bypass auth entirely (USE WITH CAUTION - only for debugging)
# DEV_BYPASS_AUTH=false
```

---

## Running the Applications

### Terminal 1 - API
```bash
cd "/Users/ismailalibegovic/Documents/NMT Projects/nmt-analytics-api"
npm run dev
```

**Expected Output:**
```
[CONFIG] Supabase Host: hacutwknfgufrqlgdiia.supabase.co
[CONFIG] Service Role Key: eyJhbGci***
ℹ️  DEV_AUTO_BOOTSTRAP is enabled - will auto-create org/profile/modules for new users
API running on http://localhost:3001
```

### Terminal 2 - Admin
```bash
cd "/Users/ismailalibegovic/Documents/NMT Projects/nmt-analytics-admin"
npm run dev
```

**Expected Output:**
```
✅ Supabase: Using correct anon key in browser
VITE v5.x.x ready in xxx ms
➜  Local:   http://localhost:5173/
```

---

## Troubleshooting

### 🚨 "service_role key detected in browser"

**Problem**: Admin .env has wrong Supabase key

**Fix**:
1. Go to https://app.supabase.com
2. Select project: hacutwknfgufrqlgdiia
3. Settings > API
4. Copy the **"anon public"** key (NOT service_role)
5. Update `VITE_SUPABASE_ANON_KEY` in admin `.env`
6. Restart admin: `npm run dev`

---

### ❌ Login Fails / No Error Message

**Check**:
1. Browser console for errors
2. Network tab - look for POST to `/auth/v1/token`
3. Verify credentials are correct in Supabase Auth dashboard

**Common Causes**:
- Wrong Supabase URL
- Wrong anon key
- User doesn't exist in Supabase Auth
- Password incorrect

---

### 🔒 "Profile not found" / 403 Errors

**Problem**: User exists in Supabase Auth but no profile in database

**Fix (Automatic - Recommended)**:
1. Ensure `DEV_AUTO_BOOTSTRAP=true` in API `.env`
2. Restart API
3. Sign in - profile will be auto-created

**Fix (Manual)**:
```sql
-- Run in Supabase SQL Editor
INSERT INTO organizations (id, name, slug)
VALUES (gen_random_uuid(), 'NMT Analytics', 'nmt-analytics');

INSERT INTO profiles (id, email, org_id, role)
VALUES (
  '72ed5a01-9095-4045-bd9a-14b3beed9962',
  'your-email@example.com',
  (SELECT id FROM organizations WHERE slug = 'nmt-analytics'),
  'admin'
);

-- Seed modules
INSERT INTO org_modules (org_id, module_key, enabled)
SELECT 
  (SELECT id FROM organizations WHERE slug = 'nmt-analytics'),
  unnest(ARRAY['dashboard', 'customers', 'packages', 'reservations', 'departures', 'payments', 'transactions']),
  true;
```

---

### 🌐 CORS Errors

**Problem**: API rejects requests from admin

**Check**:
1. API `.env` has `ADMIN_URL=http://localhost:5173` (not 5174)
2. API CORS middleware allows this origin
3. No trailing slashes in URLs

---

## Testing Authentication

### 1. Clear Browser Storage
```
1. Open DevTools (F12)
2. Application > Local Storage
3. Delete all entries for localhost:5173
4. Refresh page
```

### 2. Sign In
```
1. Navigate to http://localhost:5173/auth/signin
2. Enter credentials
3. Click "Sign in"
```

### 3. Verify Success

**Browser Console:**
```
✅ Supabase: Using correct anon key in browser
(no errors)
```

**Network Tab:**
```
POST /auth/v1/token?grant_type=password → 200 OK
GET /api/me/context → 200 OK
```

**API Logs:**
```
[AUTH] DEV_AUTO_BOOTSTRAP: Bootstrap complete for user 72ed5a01-...
GET /me/context 200
```

### 4. Test API Call with curl

```bash
# Get your access token from browser localStorage: nmt_auth_token
TOKEN="your-access-token-here"

curl http://localhost:3001/api/me/context \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "user": {
    "id": "72ed5a01-9095-4045-bd9a-14b3beed9962",
    "email": "your-email@example.com"
  },
  "org": {
    "id": "...",
    "name": "NMT Analytics",
    "slug": "nmt-analytics"
  },
  "role": "admin",
  "modules": ["dashboard", "customers", "packages", ...]
}
```

---

## Reset Everything

### Reset Browser Session
```bash
# Clear localStorage in DevTools
# OR
# Open browser in incognito mode
```

### Reset Database (DANGER - deletes data!)
```sql
-- Run in Supabase SQL Editor
DELETE FROM org_modules;
DELETE FROM profiles;
DELETE FROM organizations;
```

### Restart Both Servers
```bash
# Press Ctrl+C in both terminals
# Then run npm run dev again
```

---

## Success Indicators

✅ **Admin starts without errors**
- Console shows: `✅ Supabase: Using correct anon key in browser`

✅ **API starts with bootstrap enabled**
- Logs show: `ℹ️  DEV_AUTO_BOOTSTRAP is enabled`

✅ **Login works**
- Redirect to /dashboard
- No infinite spinner
- No 403 errors in Network tab

✅ **Dashboard loads data**
- `/api/me/context` returns 200
- API logs show: `GET /me/context 200`
- No "Profile not found" errors

---

## Development Flags

### DEV_AUTO_BOOTSTRAP (Recommended: true)
- **What**: Auto-creates org/profile/modules for new users
- **When**: User exists in Supabase Auth but no profile in DB
- **Safe**: Yes - only runs in development
- **Logs**: Shows what was created

### DEV_BYPASS_AUTH (Recommended: false)
- **What**: Skips JWT validation entirely
- **When**: Debugging auth middleware
- **Safe**: Use with caution - allows unauthenticated access
- **Logs**: Shows prominent warning

---

## Common Commands

```bash
# Start API
cd "/Users/ismailalibegovic/Documents/NMT Projects/nmt-analytics-api"
npm run dev

# Start Admin
cd "/Users/ismailalibegovic/Documents/NMT Projects/nmt-analytics-admin"
npm run dev

# Check TypeScript
npm run build

# View API logs
# (already visible in terminal)

# Test API endpoint
curl http://localhost:3001/api/health
```

---

## Security Checklist

- [ ] Admin uses **anon** key (check console for ✅)
- [ ] API uses **service_role** key
- [ ] `DEV_BYPASS_AUTH` is `false` or not set
- [ ] `DEV_AUTO_BOOTSTRAP` is `true` (dev only)
- [ ] `ADMIN_URL` in API matches admin origin
- [ ] No service_role key in browser DevTools
- [ ] No service_role key in git commits

---

## Need Help?

1. Check browser console for errors
2. Check API terminal for logs
3. Verify .env files match templates above
4. Try clearing localStorage and signing in again
5. Check Supabase dashboard for user/auth status
