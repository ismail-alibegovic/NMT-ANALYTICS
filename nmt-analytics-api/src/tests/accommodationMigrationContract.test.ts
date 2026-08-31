import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '..', '..');

async function readMigration(fileName: string) {
  return readFile(resolve(repoRoot, 'supabase', 'migrations', fileName), 'utf8');
}

describe('accommodation rooming database contract', () => {
  it('enforces reservation accommodation compatibility in the room-slot assignment trigger', async () => {
    const migration = await readMigration('20260831103000_room_slot_requirement_and_capacity_release.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.enforce_departure_room_slot_assignment()');
    expect(migration).toContain('FROM public.reservation_accommodation_requirements rar');
    expect(migration).toContain('requirement_row.hotel_id <> slot_row.hotel_id');
    expect(migration).toContain('requirement_row.hotel_allocation_id <> slot_row.hotel_allocation_id');
    expect(migration).toContain('requirement_row.room_type <> slot_row.room_type');
    expect(migration).toContain("RAISE EXCEPTION 'ROOM_REQUIREMENT_MISMATCH'");
  });

  it('adds an atomic capacity release RPC instead of relying on absolute booked overwrites', async () => {
    const migration = await readMigration('20260831103000_room_slot_requirement_and_capacity_release.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.release_capacity_atomic');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('SET booked = GREATEST(0, booked - p_party_size)');
    expect(migration).toContain('WHERE id = p_departure_id AND org_id = p_org_id');
  });

  it('adds plural reservation accommodation support without removing passenger requirement enforcement', async () => {
    const migration = await readMigration('20260831120000_plural_reservation_accommodation_requirements.sql');

    expect(migration).toContain('DROP CONSTRAINT IF EXISTS reservation_accommodation_one_requirement_per_reservation');
    expect(migration).toContain('reservation_accommodation_unique_reservation_allocation');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS reservation_accommodation_requirement_id UUID');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.replace_reservation_accommodation_requirements_atomic');
    expect(migration).toContain('PASSENGER_REQUIREMENT_COVERAGE_MISMATCH');
    expect(migration).toContain("RAISE EXCEPTION 'ROOM_REQUIREMENT_MISMATCH'");
  });

  it('restricts every new SECURITY DEFINER function to the service role', async () => {
    const migration = await readMigration('20260831210000_security_definer_function_privileges.sql');

    const restrictedFunctions = [
      'public.sync_departure_room_slots_atomic(UUID, UUID, UUID)',
      'public.upsert_reservation_accommodation_requirement_atomic(UUID, UUID, UUID, INT, INT, TEXT)',
      'public.replace_reservation_accommodation_requirements_atomic(UUID, UUID, JSONB)',
    ];

    for (const signature of restrictedFunctions) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon;`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`);
    }
  });

  it('provides a seed ownership registry table scoped to one seed id per organization', async () => {
    const migration = await readMigration('20260831200000_seed_record_registry.sql');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.seed_owned_records');
    expect(migration).toContain('UNIQUE (org_id, seed_id, entity, record_id)');
    expect(migration).toContain('ALTER TABLE public.seed_owned_records ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.seed_owned_records FROM anon;');
    expect(migration).toContain('REVOKE ALL ON TABLE public.seed_owned_records FROM authenticated;');
    expect(migration).toContain('GRANT ALL ON TABLE public.seed_owned_records TO service_role;');
  });
});

describe('demo seed safety contract', () => {
  it('does not contain the unsafe fallback demo profile UUID or profile upsert reassignment', async () => {
    const seed = await readFile(resolve(repoRoot, 'src', 'scripts', 'seed_demo.ts'), 'utf8');

    expect(seed).not.toContain("process.env.SEED_USER_ID || '00000000-0000-0000-0000-000000000001'");
    expect(seed).not.toContain("from('profiles').upsert");
    expect(seed).toContain('supabaseAdmin.auth.admin.getUserById(SEED_USER_ID)');
    expect(seed).toContain('must reference an existing Supabase Auth user');
    expect(seed).toContain('No SEED_USER_ID supplied; demo data will not be linked to a profile or reachable through the authenticated UI.');
    expect(seed).toContain('Refusing to reassign a real profile to the demo organization.');
  });

  it('requires an explicit target organization and reset confirmation before mutating anything', async () => {
    const seed = await readFile(resolve(repoRoot, 'src', 'scripts', 'seed_demo.ts'), 'utf8');

    expect(seed).toContain("const SEED_ID = 'travline_golden_demo_2027';");
    expect(seed).toContain("const DEMO_RESET_CONFIRMATION_VALUE = 'YES_RESET_DEMO_DATA';");
    expect(seed).toContain('DEMO_TARGET_ORG_ID');
    expect(seed).toContain('never auto-selects NMT Analytics');
    expect(seed).toContain('Refusing to run the golden demo seed against an unknown organization.');
    expect(seed).toContain('Golden demo seed target organization (printed before any mutation):');
  });

  it('never deletes all packages or departures in an organization', async () => {
    const seed = await readFile(resolve(repoRoot, 'src', 'scripts', 'seed_demo.ts'), 'utf8');

    expect(seed).not.toContain(".from('packages').delete().eq('org_id'");
    expect(seed).not.toContain(".from('departures').delete().eq('org_id', orgId)");
    expect(seed).not.toContain('.truncate(');
    expect(seed).toContain('seed_owned_records');
  });

  it('refuses to reset when non-seed records depend on seed-owned records', async () => {
    const seed = await readFile(resolve(repoRoot, 'src', 'scripts', 'seed_demo.ts'), 'utf8');

    expect(seed).toContain('user-created departures reference seed-owned packages.');
    expect(seed).toContain('user-created reservations are attached to seed-owned departures.');
    expect(seed).toContain('user-created reservations reference seed-owned customers.');
    expect(seed).toContain('Golden demo seed refused to reset seed-owned records');
  });

  it('keeps seeded Antalya room assignments compatible with reservation room types', async () => {
    const seed = await readFile(resolve(repoRoot, 'src', 'scripts', 'seed_demo.ts'), 'utf8');

    expect(seed).toContain("[doubleSlots[0], byName.get('Amina Hadžić')]");
    expect(seed).toContain("[doubleSlots[0], byName.get('Emir Hadžić')]");
    expect(seed).toContain("[doubleSlots[1], byName.get('Tarik Softić')]");
    expect(seed).toContain("[doubleSlots[1], byName.get('Lamija Softić')]");
    expect(seed).toContain("[tripleSlots[0], byName.get('Sara Begić')]");
    expect(seed).not.toContain("[doubleSlots[1], byName.get('Maja Kovačević')]");
  });

  it('seeds a plural Antalya accommodation example with passenger-level mapping', async () => {
    const seed = await readFile(resolve(repoRoot, 'src', 'scripts', 'seed_demo.ts'), 'utf8');

    expect(seed).toContain("customerName: 'Ahmed Alić'");
    expect(seed).toContain("{ roomType: 'double', roomCount: 1, passengerNames: ['Ahmed Alić', 'Kenan Alić']");
    expect(seed).toContain("{ roomType: 'single', roomCount: 2, passengerNames: ['Faruk Alić', 'Nedim Alić']");
    expect(seed).not.toContain("{ roomType: 'single', roomCount: 1, passengerNames: ['Nedim Alić']");
    expect(seed).toContain('await replaceReservationAccommodation(reservation.id, orgId, normalizedRequirements);');
  });
});
