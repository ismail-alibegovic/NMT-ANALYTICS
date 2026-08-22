# Travline Demo Requirements – Implementation Notes 2026-08-21

## Completed
- Hotel bed-config freeform: placeholder changed to "e.g. 2-bed, 3-bed, twin, family, bunk..." in Hotels.tsx; schema CHECK relaxed to ANY room_type.
- Seat map group coloring: Seat component now colors seats by reservationId (group) using GROUP_PALETTE. Solo travelers (partySize <=1) are rendered white as requested.
- Settings UI/API extended with email_sender, sms_sender, booking_reminder_days, newsletter_consent.

## Pending capture
- Email/SMS sender UI integration in Settings page (fields present in state, need rendering).
- Bus capacity/category pricing and group-seating logic (separate task).
- Flight passport fields (passport_number, passport_valid_until, passport_issued, etc.) on passengers.
- Newsletter/reminder scheduling UI.
- Installment payment UI.

## Next steps
Add the missing UI fields and verify DB migrations for new columns.
