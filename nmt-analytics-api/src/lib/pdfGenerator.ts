import { renderTemplatedPDF } from './pdfTemplateRenderer';
import type { TemplateConfig } from './pdfTemplateConfig';
import { buildDefaultTemplateConfig } from './pdfTemplateConfig';

/**
 * All four PDF generators are now thin wrappers over the single renderer in
 * `pdfTemplateRenderer.ts`. Existing call sites keep their signatures so
 * route handlers and tests do not need to change. When a stored template
 * config is passed, blocks are read from it; otherwise the renderer falls
 * back to the default block layout defined in `pdfTemplateConfig.ts`.
 *
 * Style overrides come from `getOrgBranding()` (org_branding row) and are
 * applied on top of the renderer's DEFAULT_STYLE.
 */

type BrandingLike = Partial<{
  primaryColor: string;
  secondaryColor: string;
  footerText: string;
  showQr: boolean;
  logoUrl: string | null;
}>;

function brandingOverrides(branding?: BrandingLike) {
  if (!branding) return undefined;
  const out: Record<string, any> = {};
  if (branding.primaryColor) out.primaryColor = branding.primaryColor;
  if (branding.secondaryColor) out.secondaryColor = branding.secondaryColor;
  if (branding.footerText) out.footerText = branding.footerText;
  if (branding.showQr !== undefined) out.showQr = branding.showQr;
  if (branding.logoUrl !== undefined) out.logoUrl = branding.logoUrl;
  return Object.keys(out).length ? out : undefined;
}

type BrandingWithConfig = BrandingLike & { pdfTemplateConfig?: TemplateConfig };

export async function generateVoucherPDF(reservation: any, branding?: BrandingWithConfig): Promise<Buffer> {
  return renderTemplatedPDF('voucher', reservation, branding?.pdfTemplateConfig, brandingOverrides(branding));
}

export async function generateInvoicePDF(reservation: any, branding?: BrandingWithConfig): Promise<Buffer> {
  return renderTemplatedPDF('invoice', reservation, branding?.pdfTemplateConfig, brandingOverrides(branding));
}
