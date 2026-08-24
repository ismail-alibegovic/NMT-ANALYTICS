/**
 * Departure Reminder Script
 * 
 * Calls the DB function notify_upcoming_departures() 
 * which creates org-wide notifications for departures happening tomorrow.
 * 
 * Run via: npx tsx src/scripts/departure_reminders.ts
 * Schedule via cron: 0 8 * * * (daily at 8 AM)
 */

import { runUpcomingDepartureReminderDelivery } from '../lib/reminderDelivery';

async function runDepartureReminders() {
  console.log('[DepartureReminders] Starting...');

  try {
    const summary = await runUpcomingDepartureReminderDelivery();

    console.log(`[DepartureReminders] Created ${summary.createdCount} departure reminder notification(s)`);
    console.log(
      `[DepartureReminders] Delivery summary: ` +
      `email sent=${summary.emailSent}, skipped=${summary.emailSkipped}, failed=${summary.emailFailed}; ` +
      `sms sent=${summary.smsSent}, skipped=${summary.smsSkipped}, failed=${summary.smsFailed}`
    );

    if (summary.results.length > 0) {
      console.log('[DepartureReminders] Details:', JSON.stringify(summary.results, null, 2));
    }
  } catch (err) {
    console.error('[DepartureReminders] Unexpected error:', err);
    process.exit(1);
  }
}

runDepartureReminders()
  .then(() => {
    console.log('[DepartureReminders] Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[DepartureReminders] Fatal:', err);
    process.exit(1);
  });
