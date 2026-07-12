/**
 * PDF Template Configuration
 *
 * Shared types and helpers for the block-based PDF template editor.
 * Each doc type (invoice, voucher, contract, receipt) has a set of blocks
 * that can be toggled, reordered, and customized per org.
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

export interface BlockConfig {
  key: BlockKey;
  label: string;
  enabled: boolean;
  customText?: string;
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
  invoice: ['header', 'customerInfo', 'table', 'totals', 'paymentInfo', 'footer'],
  voucher: ['header', 'customerInfo', 'packageDetails', 'travelDates', 'accommodation', 'tourGuide', 'reservationDetails', 'footer'],
  contract: ['header', 'customerInfo', 'packageDetails', 'travelDates', 'terms', 'signature', 'footer'],
  receipt: ['header', 'customerInfo', 'paymentInfo', 'totals', 'footer'],
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
      })),
      footerText: '',
      showLogo: true,
    };
  }
  return result;
}

/**
 * Merge a stored config with defaults so new blocks are always present.
 */
export function mergeWithDefaults(stored: Partial<TemplateConfig> | null | undefined): TemplateConfig {
  const defaults = buildDefaultTemplateConfig();
  if (!stored) return defaults;
  const result = { ...defaults };
  for (const dt of Object.keys(defaults) as DocType[]) {
    const s = stored[dt];
    if (s) {
      result[dt] = {
        footerText: s.footerText ?? defaults[dt].footerText,
        showLogo: s.showLogo ?? defaults[dt].showLogo,
        blocks: defaults[dt].blocks.map(defBlock => {
          const storedBlock = s.blocks?.find(b => b.key === defBlock.key);
          return storedBlock ? { ...defBlock, ...storedBlock } : defBlock;
        }),
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
