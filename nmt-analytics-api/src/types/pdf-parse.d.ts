declare module 'pdf-parse' {
  export interface PdfData {
    numpages?: number
    numrender?: number
    info?: unknown
    metadata?: unknown
    text?: string
    version?: unknown
  }
  function pdfParse(buffer: Buffer | Uint8Array, options?: unknown): Promise<PdfData>
  export default pdfParse
}
