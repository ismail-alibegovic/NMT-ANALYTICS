import { renderTemplatedPDF } from './pdfTemplateRenderer';
import type { TemplateConfig } from './pdfTemplateConfig';

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

export async function generateReceiptPDF(receipt: any, branding?: BrandingWithConfig): Promise<Buffer> {
  return renderTemplatedPDF('receipt', receipt, branding?.pdfTemplateConfig, brandingOverrides(branding));
}
