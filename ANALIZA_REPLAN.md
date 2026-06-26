# NMT Analytics — Analiza & Prijedlog Novog Planiranja

## 1. Trenutno Stanje — Šta Radi, Šta Ne Radi

### ✅ Funkcionalno
- Auth (Supabase + JWT) — signin/signup radi
- Org context middleware — svaki zahtjev vezan za organizaciju
- Dashboard (Home.tsx) — revenue/booking trendovi, KPI kartice
- CRUD rute: customers, packages, departures, reservations, payments, transactions
- Reports — summary podaci + CSV export
- Settings — uređivanje podataka organizacije
- Audit logs — praćenje akcija
- Integrations — modul za povezivanje eksternih servisa
- Export svih podataka

### ❌ Problemi / Nedostaci

| Problem | Lokacija | Detalji |
|---------|----------|---------|
| **Hardkodirane notifikacije** | `NotificationDropdown.tsx` | 8 template itema: "Terry Franci", "Alena Franci", "Jocelyn Kenter", "Brandon Philips" traže dozvolu za "Project - Nganter App" — kompletno lažni podaci, nema API-ja, nema baze, nema logike |
| **Dupli Reports page** | `pages/Reports.tsx` vs `pages/admin/Reports.tsx` | Dvije različite implementacije, samo jedna u routeru (ona iz `pages/Reports.tsx` koja koristi KPICard+RevenueChart) |
| **Template ostaci** | `BasicTableOne.tsx` | Hardkodirani template podaci (Lindsey Curtis, Web Designer...) — nigdje se ne koristi |
| **Role sistem nekonzistentan** | DB: `CHECK (role IN ('admin', 'user'))` | Kod koristi `super_admin` u `requireRole(['super_admin'])` za admin rute i debug, ali DB ne dozvoljava tu ulogu |
| **Nema UI razlike po roli** | Sav frontend | AuthGuard samo provjerava postoji li userContext. Sidebar se filtrira po modulima, ne po roli. Direktor i radnik vide isti interfejs. |
| **AI ruta nedovršena** | `routes/ai.ts` | Samo djelomično implementirana |
| **Notifikacije ne postoje kao funkcionalnost** | Cijeli sistem | Nema `notifications` tabele, nema API ruta, nema logike za generisanje notifikacija — samo šema u settings za email/sms notifikacije |
| **Dva Reports fajla** | `pages/admin/Reports.tsx` | Potpuno drugačiji UI od `pages/Reports.tsx`, nije povezan u router |

---

## 2. Koja Je Uloga NMT Analytics?

### Osnovna namjena
NMT Analytics je **multi-tenant operativni sistem za turističke agencije**. Svaka agencija (= jedna organizacija) dobija svoj potpuno izolovan workspace sa sopstvenim:
- Klijentima (customers)
- Aranžmanima/paketima (packages)
- Polascima (departures)
- Rezervacijama (reservations)
- Uplatama/transakcijama (payments/transactions)
- Izvještajima i analitikom

### Kako Olakšava Agencijama Posao

**Prije NMT (tipično):**
- Excel tabele, papirni folderi, različiti sistemi za plaćanja i klijente
- Ručno praćenje polazaka i rezervacija
- Nemogućnost uvida u profitabilnost paketa
- Kašnjenje u naplati, nema pregleda ko je platio a ko nije

**Sa NMT:**
1. **Centralizovano upravljanje klijentima** — svi podaci na jednom mjestu
2. **Praćenje kapaciteta polazaka** — automatska provjera popunjenosti (booked ≤ capacity)
3. **Finansijska evidencija** — uplate, nadoknade, stanje duga po klijentu
4. **Izvještaji i analitika** — revenue trendovi, top destinacije, collection rate
5. **Multi-tenant arhitektura** — jedna instanca, više agencija, potpuna izolacija
6. **Integracije** — mogućnost povezivanja sa eksternim booking sistemima

### Budući Potencijal
- Email/SMS notifikacije za potvrde rezervacija i podsjetnike
- AI asistent za predikcije popunjenosti i preporuke paketa
- Javni booking widget koji agencije mogu ugraditi na svoj sajt
- Fakture i finansijski dokumenti (PDF generisanje)
- Kraći linkovi za plaćanje koje agencija šalje klijentima

---

## 3. Role Model — Prijedlog

### Trenutni Problem
DB dozvoljava samo `admin` i `user`, dok kod koristi `super_admin`. Frontend ne reaguje na role.

### Prijedlog: 5 Stepeni Hijerarhije

```
super_admin    — Platform administrator (vlasnik platforme, vidi sve org)
director       — Direktor agencije (pun pristup + finansije + postavke)
manager        — Menadžer/operativa (sve osim postavki organizacije)
agent          — Agent na terenu (samo klijenti + rezervacije + polasci)
viewer         — Read-only (uvid u podatke, bez izmjena)
```

### Šta Ko Vidi — Po Interfejsima

| Feature | super_admin | director | manager | agent | viewer |
|---------|:-----------:|:--------:|:-------:|:-----:|:------:|
| Dashboard (KPI + trendovi) | ✅ (sve org) | ✅ | ✅ | ✅ | ✅ (read) |
| Klijenti | ✅ | ✅ (CRUD) | ✅ (CRUD) | ✅ (CRUD) | ✅ (read) |
| Paketi/Aranžmani | ✅ | ✅ (CRUD) | ✅ (CRUD) | ✅ (read) | ✅ (read) |
| Polasci | ✅ | ✅ (CRUD) | ✅ (CRUD) | ✅ (read) | ✅ (read) |
| Rezervacije | ✅ | ✅ (CRUD) | ✅ (CRUD) | ✅ (CRUD) | ✅ (read) |
| Uplate/Transakcije | ✅ | ✅ (CRUD) | ✅ (read) | ❌ | ❌ |
| Finansijski dashboard | ✅ | ✅ | ✅ (read) | ❌ | ❌ |
| Izvještaji & CSV export | ✅ | ✅ | ✅ | ❌ | ❌ |
| Integracije | ✅ | ✅ | ✅ | ❌ | ❌ |
| Postavke organizacije | ✅ | ✅ | ❌ | ❌ | ❌ |
| Profil (lični) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Audit log | ✅ | ✅ | ❌ | ❌ | ❌ |
| Dokumenti | ✅ | ✅ | ✅ | ❌ | ❌ |
| Notifikacije | ✅ | ✅ | ✅ | ✅ (svoje) | ✅ (svoje) |
| Upravljanje korisnicima | ✅ | ✅ | ❌ | ❌ | ❌ |
| Naplata (ko nije platio) | ✅ | ✅ | ✅ | ✅ (samo svoje) | ❌ |

---

## 4. Interfejsi — Direktor vs Radnik

### Direktor (director + manager)
Pun interfejs sa akcentom na:
- **Finansijski dashboard** — revenue, collection rate, avg booking value
- **Upravljanje** — sve CRUD operacije
- **Izvještaji** — Excel/CSV export, grafikoni
- **Postavke** — podešavanje organizacije (samo director)
- **Sidebar**: sve stavke + "Finansije" sekcija

### Radnik (agent + viewer)
Pojednostavljen interfejs:
- **Dashboard** — samo osnovni KPI (broj klijenata, rezervacija)
- **Klijenti + Rezervacije** — dnevni rad
- **Polasci** — pregled, bez izmjene paketa
- **Samo svoje transakcije** — ako agent vodi klijenta, vidi njegovu naplatu
- **Bez finansijskih izvještaja, integracija, postavki, audit loga**

### Tehnička Implementacija Razlike

Frontend bi trebao imati dva "moda" prikaza:

```typescript
// AuthGuard već postoji, treba ga proširiti:
// Sada: samo provjerava da li userContext postoji
// Treba: provjerava rolu i redirecta na odgovarajući interfejs

// Koncept:
const roleHierarchy = ['viewer', 'agent', 'manager', 'director', 'super_admin'];

function hasAccess(requiredLevel: string, userRole: string): boolean {
  return roleHierarchy.indexOf(userRole) >= roleHierarchy.indexOf(requiredLevel);
}
```

Umjesto dva potpuno odvojena interfejsa (što bi značilo održavanje duplog koda), **jedan interfejs sa uslovnim prikazivanjem** elemenata na osnovu role. Sidebar, akcije (dugmad za edit/delete), i pojedinačne stranice provjeravaju permisije.

---

## 5. Notifikacije — Detaljna Analiza

### Trenutni Problem
`NotificationDropdown.tsx` sadrži **8 potpuno lažnih notifikacija**:
- "Terry Franci requests permission to change Project - Nganter App"
- "Alena Franci requests permission to change Project - Nganter App"
- "Jocelyn Kenter requests permission to change Project - Nganter App"
- "Brandon Philips requests permission to change Project - Nganter App"
- Isti pattern ponovljen 8 puta sa izmjenama vremena (5 min ago, 8 min ago, 15 min ago, 1 hr ago)

Ovo su ostaci admin templejta sa kojeg je rađen frontend.

### Šta Treba Uraditi

**Kratkoročno (odmah):**
- Očistiti hardkodirane notifikacije
- Zamijeniti sa komponentom koja ne prikazuje ništa ili prikazuje "Nema notifikacija"
- Sačuvati strukturu dropdown-a za kasniju implementaciju

**Srednjoročno (plan implementacije):**

1. **Nova DB tabela:**
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = org-wide
    type TEXT NOT NULL, -- 'new_reservation', 'payment_received', 'departure_reminder', 'system'
    title TEXT NOT NULL,
    body TEXT,
    data JSONB,        -- dodatni kontekst (npr. reservation_id, amount)
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

2. **API rute:**
- `GET /api/notifications` — paginirane notifikacije za trenutnog user-a
- `PATCH /api/notifications/:id/read` — označi kao pročitano
- `PATCH /api/notifications/read-all` — označi sve kao pročitano
- `GET /api/notifications/unread-count` — broj nepročitanih (za badge)

3. **Backend logika za automatsko generisanje:**
- Kad se napravi rezervacija → notifikacija za agente
- Kad se izvrši uplata → notifikacija za finansije
- Dan prije polaska → reminder
- Sistem update → org-wide notifikacija

4. **Real-time (budućnost):**
- Supabase Realtime ili WebSocket za ažuriranje u realnom vremenu

---

## 6. Template Ostaci — Šta Treba Očistiti

| Fajl | Razlog | Akcija |
|------|--------|--------|
| `NotificationDropdown.tsx` | Lažne notifikacije | Očistiti podatke, zadržati UI strukturu |
| `BasicTableOne.tsx` | Hardkodirani template podaci | Obrisati ako se ne koristi, ili refaktorisati |
| `admin/Reports.tsx` | Duplikat od `pages/Reports.tsx` | Obrisati (nije u routeru) |
| BarChartOne, LineChartOne, DonutChart | Vjerovatno template | Pregledati da li se koriste; obrisati ako nisu |

---

## 7. Plan Implementacije — Faze

### Faza 1 — Cleanup (hitno)
1. Očistiti `NotificationDropdown.tsx` — ukloniti hardkodirane iteme
2. Obrisati `admin/Reports.tsx` (duplikat)
3. Obrisati neiskorištene template komponente (`BasicTableOne`, neiskorišteni chartovi)
4. Popraviti DB role constraint da uključuje `super_admin`
5. Uskladiti `requireRole` middleware sa stvarnim rolama u DB

### Faza 2 — Role System
1. Proširiti DB: `CHECK (role IN ('super_admin', 'director', 'manager', 'agent', 'viewer'))`
2. Dodati `permissions` tabelu ili mapu permisija po roli
3. Napraviti `hasAccess()` helper na frontendu
4. Implementirati role-based routing u AuthGuard
5. Prilagoditi sidebar da sakriva stavke na osnovu role (ne samo modula)

### Faza 3 — Notifikacije
1. Kreirati notifications tabelu (migracija)
2. Implementirati API rute
3. Rebuildati frontend NotificationDropdown da vuče prave podatke
4. Dodati badge sa brojem nepročitanih
5. Dodati auto-generisanje notifikacija na ključne akcije

### Faza 4 — Interfejs Razlike
1. Implementirati pojednostavljeni dashboard za agent/viewer role
2. Sakriti finansijske opcije za niže role
3. Dodati "moji klijenti" filter za agente

### Faza 5 — Features
1. Notifikacioni sistem sa email/SMS integracijom
2. AI asistent za predikcije
3. Javni booking widget
4. PDF fakture

---

## 8. Arhitektonski Pregled — Kako Sistem Olakšava Agencijama

```
┌─────────────────────────────────────────────────────────────────┐
│                      NMT Analytics Platform                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Agencija A    │  │ Agencija B    │  │ Agencija C    │  ...    │
│  │ (org_id=A)    │  │ (org_id=B)    │  │ (org_id=C)    │          │
│  │ customers     │  │ customers     │  │ customers     │          │
│  │ packages      │  │ packages      │  │ packages      │          │
│  │ reservations  │  │ reservations  │  │ reservations  │          │
│  │ payments      │  │ payments      │  │ payments      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
│         └─────────────────┴─────────────────┘                    │
│                           │                                       │
│                    ┌──────┴──────┐                                │
│                    │  Supabase   │  (multi-tenant RLS)            │
│                    │  PostgreSQL │                                │
│                    └──────┬──────┘                                │
│                           │                                       │
│                    ┌──────┴──────┐                                │
│                    │  Express    │  (auth, org context, roles)    │
│                    │  API        │                                │
│                    └──────┬──────┘                                │
│                           │                                       │
│                    ┌──────┴──────┐                                │
│                    │  React      │  (role-based UI)               │
│                    │  Frontend   │                                │
│                    └─────────────┘                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Ključne Karakteristike koje Olakšavaju Posao

1. **Multi-tenant izolacija** — jedna platforma za sve agencije, a svaka vidi samo svoje podatke
2. **Org-scoped queries** — middleware automatski postavlja `org_id` filter na sve upite
3. **Role-based pristup** — direktor vidi finansije, agent vodi klijente, viewer samo gleda
4. **Centralna evidencija** — umjesto Excel tabela, svi podaci na jednom mjestu
5. **Finansijska kontrola** — ko je platio, ko nije, collection rate, revenue trendovi
6. **Automatska validacija** — booked ≤ capacity, jedinstveni telefon po agenciji
7. **Izvještaji** — ne moraš ručno praviti, klikneš i dobiješ CSV

---

## 9. Konkretne Izmjene Koda — Šta i Gdje

### Notification Dropdown (najhitnije)
File: `nmt-analytics-admin/src/components/header/NotificationDropdown.tsx`
- Zamijeniti hardkodirani sadržaj sa "Nema notifikacija" placeholderom
- Dodati API poziv ka `/api/notifications` (kad ruta bude gotova)
- Dodati badge sa brojem nepročitanih

### DB Role Constraint
File: `nmt-analytics-api/supabase/sql/001_init.sql` (linija 19)
```sql
-- Trenutno: CHECK (role IN ('admin', 'user'))
-- Treba:
CHECK (role IN ('super_admin', 'director', 'manager', 'agent', 'viewer'))
```

### Dupli Reports
File: `nmt-analytics-admin/src/pages/admin/Reports.tsx` — obrisati
File: `nmt-analytics-admin/src/pages/Reports.tsx` — ostaje (jedini u routeru)

### requireRole Middleware
File: `nmt-analytics-api/src/middleware/requireRole.ts`
- Trenutno radi korektno, ali DB ne dozvoljava validne role — prvo migrirati DB

### AuthGuard (frontend)
File: `nmt-analytics-admin/src/components/auth/AuthGuard.tsx`
- Dodati provjeru role i redirect na odgovarajući interfejs

---

## 10. Sljedeći Koraci

1. ✅ **Pročitaj ovu analizu** — potvrdi da li se slažeš sa prijedlogom role modela i smjerom
2. Odluči: da li želiš da krenemo sa **Fazom 1 (Cleanup)** odmah?
3. Nakon toga: **Faza 2 (Role System)** — najveći posao, ali ključan za sve dalje
4. **Faza 3 (Notifikacije)** — nakon što su role stabilne
5. **Faza 4 (Interfejs razlike)** — onda kad su role i notifikacije spremne
