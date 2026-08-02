/**
 * PDF Template Configuration — shared vocabulary with backend.
 *
 * SHARED SCHEMA — verbatim duplicate of
 * `nmt-analytics-api/src/lib/pdfTemplateConfig.ts`.
 * Both admin and api have separate tsconfig roots (no shared package exists yet).
 * SYNC RULE: when editing either file, copy the change to the other verbatim.
 * Drift check: `tsc --noEmit` on both sides catches type divergence only after
 * editing — manual review is the contract for non-type changes (labels, defaults).
 */

export type DocType = 'invoice' | 'voucher' | 'contract' | 'receipt';

export type BlockKey =
  | 'header'
  | 'customerInfo'
  | 'packageDetails'
  | 'travelDates'
  | 'accommodation'
  | 'tourGuide'
  | 'reservationDetails'
  | 'table'
  | 'totals'
  | 'paymentInfo'
  | 'terms'
  | 'signature'
  | 'footer';

export interface BlockStyle {
  fontSize?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface BlockConfig {
  key: BlockKey;
  label: string;
  enabled: boolean;
  customText?: string;
  style?: BlockStyle;
}

export interface DocTemplateConfig {
  blocks: BlockConfig[];
  footerText?: string;
  showLogo?: boolean;
}

export type TemplateConfig = Record<DocType, DocTemplateConfig>;

/**
 * Default block layouts per doc type.
 * These mirror the hardcoded sections in the existing PDF generators.
 */
export const DEFAULT_BLOCKS: Record<DocType, BlockKey[]> = {
  invoice:    ['header', 'customerInfo', 'table', 'totals', 'paymentInfo', 'footer'],
  voucher:    ['header', 'customerInfo', 'packageDetails', 'travelDates', 'accommodation', 'tourGuide', 'reservationDetails', 'footer'],
  contract:   ['header', 'customerInfo', 'packageDetails', 'travelDates', 'totals', 'terms', 'signature', 'footer'],
  receipt:    ['header', 'customerInfo', 'paymentInfo', 'totals', 'footer'],
};

export const BLOCK_LABELS: Record<BlockKey, string> = {
  header: 'Header',
  customerInfo: 'Customer Information',
  packageDetails: 'Package Details',
  travelDates: 'Travel Dates',
  accommodation: 'Accommodation',
  tourGuide: 'Tour Guide',
  reservationDetails: 'Reservation Details',
  table: 'Line Items Table',
  totals: 'Totals Summary',
  paymentInfo: 'Payment Information',
  terms: 'Terms & Conditions',
  signature: 'Signature Area',
  footer: 'Footer',
};

/**
 * Build a full TemplateConfig with defaults for any missing doc types.
 */
export function buildDefaultTemplateConfig(): TemplateConfig {
  const docTypes: DocType[] = ['invoice', 'voucher', 'contract', 'receipt'];
  const result = {} as TemplateConfig;
  for (const dt of docTypes) {
    result[dt] = {
      blocks: DEFAULT_BLOCKS[dt].map(key => ({
        key,
        label: BLOCK_LABELS[key],
        enabled: true,
      } satisfies BlockConfig)),
      footerText: '',
      showLogo: true,
    };
  }
  return result;
}

/**
 * Merge a stored config with defaults so new blocks are always present.
 * Stored blocks are merged by key; missing blocks get defaults appended.
 * customText/style overrides take precedence; missing fields fall back.
 */
export function mergeWithDefaults(stored: Partial<TemplateConfig> | null | undefined): TemplateConfig {
  const defaults = buildDefaultTemplateConfig();
  if (!stored) return defaults;
  const result = { ...defaults };
  for (const dt of Object.keys(defaults) as DocType[]) {
    const s = stored[dt];
    if (s) {
      // Merge existing blocks by key, preserving stored order for known keys.
      const storedByKey = new Map((s.blocks || []).map(b => [b.key, b]));
      const blocks: BlockConfig[] = [];
      const seenKeys = new Set<BlockKey>();
      // First: stored blocks (in stored order) merged over default block if missing fields.
      for (const sb of s.blocks || []) {
        const defBlock = defaults[dt].blocks.find(db => db.key === sb.key);
        if (!defBlock) continue; // drop unknown keys (schema change)
        blocks.push({ ...defBlock, ...sb });
        seenKeys.add(sb.key);
      }
      // Then: any default blocks not present in storage appended at end.
      for (const db of defaults[dt].blocks) {
        if (!seenKeys.has(db.key)) blocks.push(db);
      }
      result[dt] = {
        footerText: s.footerText ?? defaults[dt].footerText,
        showLogo: s.showLogo ?? defaults[dt].showLogo,
        blocks,
      };
    }
  }
  return result;
}

/**
 * Get the ordered list of enabled blocks for a doc type.
 */
export function getEnabledBlocks(config: TemplateConfig, docType: DocType): BlockConfig[] {
  return (config[docType]?.blocks || []).filter(b => b.enabled);
}
