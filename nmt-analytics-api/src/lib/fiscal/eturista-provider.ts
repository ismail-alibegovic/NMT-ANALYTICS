import { supabaseAdmin } from '../supabase';
import { URL } from 'node:url';
import { lookup as dnsLookup } from 'node:dns/promises';
import type {
  FiscalProvider,
  FiscalProviderConfig,
  FiscalMarket,
  GuestData,
  SubmissionPayload,
  SubmissionResult,
} from './types';

const BLOCKED_IP_PREFIXES = [
  '127.', '0.0.0.0', '169.254.',
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
  '::1', 'fc', 'fd', 'fe80',
];

function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_PREFIXES.some((p) => ip.startsWith(p));
}

async function assertSafeEndpoint(endpoint: string): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new Error('Invalid endpoint URL'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Endpoint must use http(s) protocol');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Disallowed endpoint');
  }
  const host = parsed.hostname;
  let addrs: string[] = [];
  try {
    const records = await dnsLookup(host, { all: true });
    addrs = (records as any[]).map((r) => r.address as string);
  } catch (err: any) {
    throw new Error(`Cannot resolve hostname "${host}": ${err.message}`);
  }
  for (const ip of addrs) {
    if (isBlockedIp(ip)) throw new Error(`Endpoint resolves to a blocked address: ${ip}`);
  }
}

export class EtuRistaProvider implements FiscalProvider {
  readonly market: FiscalMarket = 'RS';
  readonly displayName = 'eTurista / CIS';
  readonly description = 'Srbija — Centralni informacioni sistem za prijavu gostiju';

  async getConfig(orgId: string): Promise<FiscalProviderConfig | null> {
    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .select('key, value')
      .eq('org_id', orgId)
      .in('key', ['eturista_endpoint', 'eturista_credentials']);
    if (error || !data || data.length === 0) return null;
    const map = new Map(data.map((r: any) => [r.key, r.value]));
    const endpoint = map.get('eturista_endpoint');
    if (!endpoint) return null;
    return {
      endpoint: String(endpoint),
      credentials: String(map.get('eturista_credentials') || ''),
    };
  }

  async buildGuestPayload(
    orgId: string,
    departureId: string,
  ): Promise<{ guests: GuestData[]; departure: any } | null> {
    const { data: departure, error: depErr } = await supabaseAdmin
      .from('departures')
      .select('*, packages(name, destination)')
      .eq('id', departureId)
      .eq('org_id', orgId)
      .single();
    if (depErr || !departure) return null;

    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('id, customer_name, customer_phone, created_at')
      .eq('departure_id', departureId)
      .eq('org_id', orgId)
      .not('status', 'eq', 'cancelled');

    const guests: GuestData[] = (reservations || []).map(r => ({
      fullName: r.customer_name || 'Unknown',
      idDocument: '',
      nationality: 'BIH',
      dateOfBirth: '',
      arrivalDate: departure.depart_at?.slice(0, 10) || '',
      departureDate: departure.return_at?.slice(0, 10) || '',
    }));

    return { guests, departure };
  }

  async submit(
    config: FiscalProviderConfig,
    payload: SubmissionPayload,
  ): Promise<SubmissionResult> {
    try {
      await assertSafeEndpoint(config.endpoint);
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.credentials}`,
        },
        body: JSON.stringify(payload),
        redirect: 'error',
      });
      const body = await response.json().catch(() => ({}));
      return { success: response.ok, status: `${response.status}`, body };
    } catch (err: any) {
      return { success: false, status: 'NETWORK_ERROR', body: { error: err.message } };
    }
  }

  async saveSubmissionRecord(
    orgId: string,
    departureId: string | null,
    guestCount: number,
    payload: SubmissionPayload,
    result: SubmissionResult,
  ) {
    return supabaseAdmin.from('fiscal_submissions').insert({
      org_id: orgId,
      market: this.market,
      departure_id: departureId,
      guest_count: guestCount,
      payload: payload as any,
      response_status: result.status,
      response_body: result.body,
    });
  }
}
