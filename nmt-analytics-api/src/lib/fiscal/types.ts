/**
 * Abstract fiscal compliance provider interface.
 * Each market (RS/HR/BA) implements this as a provider adapter.
 */

/** Supported markets */
export type FiscalMarket = 'RS' | 'HR' | 'BA';

/** Base config every provider needs */
export interface FiscalProviderConfig {
  endpoint: string;
  credentials: string;
}

/** Guest manifest record */
export interface GuestData {
  fullName: string;
  idDocument: string;
  nationality: string;
  dateOfBirth: string;
  arrivalDate: string;
  departureDate: string;
}

/** Generic submission payload that providers transform as needed */
export interface SubmissionPayload {
  accommodationUnit: string;
  guests: GuestData[];
  submitDate: string;
  agencyCode: string;
}

/** Submission result returned by every provider */
export interface SubmissionResult {
  success: boolean;
  status: string;
  body: any;
}

/** What every fiscal provider must implement */
export interface FiscalProvider {
  /** Market code this provider handles */
  readonly market: FiscalMarket;

  /** Provider display name (shown in Integrations UI) */
  readonly displayName: string;

  /** Description for Integrations page */
  readonly description: string;

  /**
   * Load provider-specific config from org_settings.
   * Returns null if not configured.
   */
  getConfig(orgId: string): Promise<FiscalProviderConfig | null>;

  /**
   * Build guest payload for a departure.
   * Returns null if departure not found or no guests.
   */
  buildGuestPayload(
    orgId: string,
    departureId: string,
  ): Promise<{ guests: GuestData[]; departure: any } | null>;

  /**
   * Submit guest data to the government endpoint.
   * Must include SSRF guard (block private/loopback addresses).
   */
  submit(
    config: FiscalProviderConfig,
    payload: SubmissionPayload,
  ): Promise<SubmissionResult>;

  /**
   * Save submission record to the database.
   */
  saveSubmissionRecord(
    orgId: string,
    departureId: string | null,
    guestCount: number,
    payload: SubmissionPayload,
    result: SubmissionResult,
  ): Promise<any>;
}
