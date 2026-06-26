## Expected Console Output

### API Startup
```
[CONFIG] Supabase Host: hacutwknfgufrqlgdiia.supabase.co
[CONFIG] Service Role Key: eyJhbGci***
ℹ️  DEV_AUTO_BOOTSTRAP is enabled - will auto-create org/profile/modules for new users
API running on http://localhost:3001
```

### First Login (Profile Missing)
```
[AUTH] DEV_AUTO_BOOTSTRAP: Creating org/profile/modules for user 72ed5a01-9095-4045-bd9a-14b3beed9962
[AUTH] DEV_AUTO_BOOTSTRAP: Using existing org a1b2c3d4-...
[AUTH] DEV_AUTO_BOOTSTRAP: Created profile for user 72ed5a01-9095-4045-bd9a-14b3beed9962
[AUTH] DEV_AUTO_BOOTSTRAP: Created 7 modules
[AUTH] DEV_AUTO_BOOTSTRAP: Bootstrap complete for user 72ed5a01-9095-4045-bd9a-14b3beed9962
[ME/CONTEXT] User 72ed5a01-9095-4045-bd9a-14b3beed9962 context: org=NMT Analytics, role=admin, modules=7
GET /me/context 200
```

### Subsequent Logins
```
[ME/CONTEXT] User 72ed5a01-9095-4045-bd9a-14b3beed9962 context: org=NMT Analytics, role=admin, modules=7
GET /me/context 200
```

### Response Format
```json
{
  "user": {
    "id": "72ed5a01-9095-4045-bd9a-14b3beed9962",
    "email": "user@example.com"
  },
  "org": {
    "id": "a1b2c3d4-...",
    "name": "NMT Analytics",
    "slug": "nmt-analytics"
  },
  "role": "admin",
  "modules": [
    "dashboard",
    "customers",
    "packages",
    "reservations",
    "departures",
    "payments",
    "transactions"
  ]
}
```
