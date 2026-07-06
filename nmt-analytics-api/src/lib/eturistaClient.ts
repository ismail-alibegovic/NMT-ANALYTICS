import { supabaseAdmin } from './supabase';
import { URL } from 'node:url';
import { lookup as dnsLookup } from 'node:dns/promises';

interface EturistaConfig {
  endpoint: string;
  credentials: string;
}

interface GuestData {
  fullName: string;
  idDocument: string;
  nationality: string;
  dateOfBirth: string;
  arrivalDate: string;
  departureDate: string;
}

interface SubmissionPayload {
  accommodationUnit: string;
  guests: GuestData[];
  submitDate: string;
  agencyCode: string;
}

/**
 * Private IP ranges that eTurista endpoints must NOT resolve to.
 * Used to prevent SSRF — managers can set any URL in org_settings, so we
 * block addresses that would reach the host's own loopback / link-local /
 * RFC1918 / metadata services from inside the server.
 */
const BLOCKED_IP_PREFIXES = [
  '127.',          // IPv4 loopback 127.0.0.0/8
  '0.0.0.0',       // "this host"
  '169.254.',      // link-local (incl. AWS/GCP metadata 169.254.169.254)
  '10.',           // private RFC1918
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',  // private 172.16/12
  '192.168.',      // private 192.168/16
  '::1',           // IPv6 loopback
  'fc', 'fd',      // IPv6 ULA fc00::/7
  'fe80',          // IPv6 link-local
];

function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_PREFIXES.some((p) => ip.startsWith(p));
}

/**
 * Validate that an eTurista endpoint URL is reachable (HTTPS or http only with explicit
 * hostname) and that its DNS resolution does NOT point to a private/loopback address.
 * Throws on invalid/unsafe URLs.
 */
export async function assertSafeEndpoint(endpoint: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('Invalid endpoint URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Endpoint must use http(s) protocol');
  }
  // Block embedded credentials in the URL
  if (parsed.username || parsed.password) {
    throw new Error('Disallowed endpoint');
  }
  // Resolve the hostname and reject any address in private/blocked ranges
  const host = parsed.hostname;
  let addrs: string[] = [];
  try {
    const records = await dnsLookup(host, { all: true });
    addrs = (records as any[]).map((r) => r.address as string);
  } catch (err: any) {
    throw new Error(`Cannot resolve hostname "${host}": ${err.message}`);
  }
  if (addrs.length === 0) {
    throw new Error(`Host "${host}" did not resolve`);
  }
  for (const ip of addrs) {
    if (isBlockedIp(ip)) {
      throw new Error(`Endpoint resolves to a blocked address: ${ip}`);
    }
  }
}

/**
 * Fetch eTurista configuration from org_settings
 */
export async function getEturistaConfig(orgId: string): Promise<EturistaConfig | null> {
  const { data, error } = await supabaseAdmin
    .from('org_settings')
    .select('eturista_endpoint, eturista_credentials')
    .eq('org_id', orgId)
    .single();

  if (error || !data?.eturista_endpoint) return null;

  return {
    endpoint: data.eturista_endpoint,
    credentials: data.eturista_credentials || '',
  };
}

/**
 * Build guest payload from reservation + excursion_passengers data
 */
export async function buildGuestPayload(
  orgId: string,
  departureId: string,
): Promise<{ guests: GuestData[]; departure: any } | null> {
  // Load departure with package info
  const { data: departure, error: depErr } = await supabaseAdmin
    .from('departures')
    .select('*, packages(name, destination)')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .single();

  if (depErr || !departure) return null;

  // Load reservation customers for this departure
  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('id, customer_name, customer_phone, created_at')
    .eq('departure_id', departureId)
    .eq('org_id', orgId)
    .not('status', 'eq', 'cancelled');

  const guests: GuestData[] = (reservations || []).map(r => ({
    fullName: r.customer_name || 'Unknown',
    idDocument: '',  // collected on check-in
    nationality: 'BIH',
    dateOfBirth: '',
    arrivalDate: departure.depart_at?.slice(0, 10) || '',
    departureDate: departure.return_at?.slice(0, 10) || '',
  }));

  return { guests, departure };
}

/**
 * Submit guest data to government endpoint.
 * Validates endpoint safety (SSRF guard) before fetching.
 */
export async function submitToEturista(
  config: EturistaConfig,
  payload: SubmissionPayload,
): Promise<{ success: boolean; status: string; body: any }> {
  try {
    // SSRF guard — block private/loopback/metadata endpoints
    await assertSafeEndpoint(config.endpoint);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.credentials}`,
      },
      body: JSON.stringify(payload),
      // Don't follow redirects — SSRF could pivot via 30x to a private host
      redirect: 'error',
    });

    const body = await response.json().catch(() => ({}));
    return {
      success: response.ok,
      status: `${response.status}`,
      body,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'NETWORK_ERROR',
      body: { error: err.message },
    };
  }
}

/**
 * Save submission record to database
 */
export async function saveSubmissionRecord(
  orgId: string,
  departureId: string | null,
  guestCount: number,
  payload: SubmissionPayload,
  result: { status: string; body: any },
) {
  return supabaseAdmin.from('eturista_submissions').insert({
    org_id: orgId,
    departure_id: departureId,
    submission_date: new Date().toISOString().slice(0, 10),
    guest_count: guestCount,
    raw_payload: payload as any,
    response_status: result.status,
    response_body: result.body,
  });
}
