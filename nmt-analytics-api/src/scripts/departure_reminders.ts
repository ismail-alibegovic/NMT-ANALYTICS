/**
 * Departure Reminder Script
 * 
 * Calls the DB function notify_upcoming_departures() 
 * which creates org-wide notifications for departures happening tomorrow.
 * 
 * Run via: npx tsx src/scripts/departure_reminders.ts
 * Schedule via cron: 0 8 * * * (daily at 8 AM)
 */

import { supabaseAdmin } from '../lib/supabase';

async function runDepartureReminders() {
  console.log('[DepartureReminders] Starting...');

  try {
    const { data, error } = await supabaseAdmin.rpc('notify_upcoming_departures');

    if (error) {
      console.error('[DepartureReminders] Error calling RPC:', error.message);
      process.exit(1);
    }

    const count = data?.length ?? 0;
    console.log(`[DepartureReminders] Created ${count} departure reminder notification(s)`);
    
    if (count > 0) {
      console.log('[DepartureReminders] Details:', JSON.stringify(data, null, 2));
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
