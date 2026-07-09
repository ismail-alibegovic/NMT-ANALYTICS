# Supabase SQL Setup

This directory contains the SQL schema and RPC functions required for the NMT Analytics API.

## How to run

1.  Log in to your [Supabase Dashboard](https://app.supabase.com/).
2.  Select your project.
3.  Go to the **SQL Editor** in the left sidebar.
4.  Click **New Query**.
5.  Copy the contents of `001_init.sql` and paste them into the editor.
6.  Click **Run**.

## What's included

-   **Extensions**: `uuid-ossp` and `pgcrypto` for UUID generation.
-   **Tables**: `organizations`, `profiles`, `customers`, `packages`, `departures`, `reservations`, and `transactions`.
-   **Multi-tenancy**: All tenant-specific tables include an `org_id` and are protected by Row Level Security (RLS).
-   **RLS Policies**: Users can only access data belonging to their organization.
-   **RPC Functions**:
    -   `increment_booked(row_id, amount)`: Atomically updates the number of booked slots for a departure while enforcing capacity constraints.
-   **Indexes**: Optimized for common API queries (e.g., filtering by `org_id` and date ranges).

## Notes

-   The `profiles` table links to Supabase Auth's `auth.users` table.
-   After a user signs up via Supabase Auth, a corresponding entry must be created in the `profiles` table to assign them to an organization.
-   The `increment_booked` function is used by the seed script and can be called via the Supabase client: `supabase.rpc('increment_booked', { row_id: '...', amount: 1 })`.
