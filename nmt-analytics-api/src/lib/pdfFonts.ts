import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * Registers DejaVu Sans (Unicode-safe; covers Bosnian/Serbian/Croatian/
 * German diacritics: ć č š ž đ ä ö ü ß etc.) on a PDFKit document.
 *
 * After calling this, generators can use:
 *   doc.font('DejaVu')        — regular
 *   doc.font('DejaVu-Bold')   — bold
 *   doc.font('DejaVu-Oblique')— italic
 *
 * The fonts are loaded once per document. PDFKit caches the parsed font object
 * across doc instances keyed by file path, so subsequent documents reuse it.
 */
const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');

const REGULAR = path.join(FONTS_DIR, 'DejaVuSans.ttf');
const BOLD = path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf');
const OBLIQUE = path.join(FONTS_DIR, 'DejaVuSans-Oblique.ttf');

export function registerUnicodeFonts(doc: InstanceType<typeof PDFDocument>): void {
  doc.registerFont('DejaVu', REGULAR);
  doc.registerFont('DejaVu-Bold', BOLD);
  doc.registerFont('DejaVu-Oblique', OBLIQUE);
  // Set the default family to DejaVu so unknown font() calls still render
  // Unicode safely.
  doc.font('DejaVu');
}

/**
 * These three family names are exposed for explicit font switches in
 * generators.
 */
export const UNICODE_FONTS = {
  regular: 'DejaVu',
  bold: 'DejaVu-Bold',
  italic: 'DejaVu-Oblique',
} as const;
