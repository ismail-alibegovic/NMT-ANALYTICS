# Faza 3 — Notifikacije ✅

## Završeno

### 1. Database Schema
- **Migration**: `004_notifications.sql`
- **Tabela**: `notifications`
  - `org_id` — organizacija
  - `user_id` — korisnik (NULL = org-wide)
  - `type` — tip notifikacije
  - `title` — naslov
  - `body` — tekst
  - `data` — JSONB dodatni podaci
  - `is_read` — da li je pročitano
- **Indeksi**: org_user, created_at, is_read

### 2. Backend API
- **Routes**: `routes/notifications.ts`
  - `GET /notifications` — lista notifikacija (paginirano)
  - `GET /notifications/unread-count` — broj nepročitanih
  - `PATCH /notifications/:id/read` — označi kao pročitano
  - `PATCH /notifications/read-all` — označi sve kao pročitano

### 3. Notification Service
- **File**: `lib/notificationService.ts`
- **Funkcije**:
  - `createNotification()` — generic kreiranje
  - `notifyNewReservation()` — nova rezervacija
  - `notifyPaymentReceived()` — uplata primljena
  - `notifyDepartureReminder()` — podsjetnik za polazak
  - `notifyPaymentOverdue()` — zakašnjela naplata

### 4. Frontend API Client
- **File**: `api/notifications.ts`
- **Funkcije**:
  - `getNotifications(page, limit)`
  - `getUnreadCount()`
  - `markAsRead(id)`
  - `markAllAsRead()`

## Sljedeći Korak: Integracija u UI

**Potrebno**:
1. Primijeniti migraciju `004_notifications.sql`
2. Registrovati `/notifications` route u main router
3. Ažurirati NotificationDropdown da vuče prave podatke
4. Dodati badge sa unread count
5. Dodati auto-generisanje notifikacija u business logic
   - Nakon create reservation → `notifyNewReservation()`
   - Nakon payment → `notifyPaymentReceived()`
   - Cron job za departure reminders
