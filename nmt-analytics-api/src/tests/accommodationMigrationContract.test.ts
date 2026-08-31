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
});

describe('demo seed safety contract', () => {
  it('does not contain the unsafe fallback demo profile UUID or profile upsert reassignment', async () => {
    const seed = await readFile(resolve(repoRoot, 'src', 'scripts', 'seed_demo.ts'), 'utf8');

    expect(seed).not.toContain("process.env.SEED_USER_ID || '00000000-0000-0000-0000-000000000001'");
    expect(seed).not.toContain("from('profiles').upsert");
    expect(seed).toContain('No SEED_USER_ID supplied; demo data will not be linked to a profile.');
    expect(seed).toContain('Refusing to reassign a real profile to the demo organization.');
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
});
