import PDFDocument from 'pdfkit';

interface InvoiceStyle {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  footerText: string;
  showQr: boolean;
}

const defaultStyle: InvoiceStyle = {
  primaryColor: '#1D4ED8',
  secondaryColor: '#111827',
  logoUrl: null,
  footerText: 'Thank you for your business!',
  showQr: false,
};

/**
 * Generate a travel voucher PDF
 */
export async function generateVoucherPDF(reservation: any, orgSettings?: Partial<InvoiceStyle>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const org = reservation.organizations || {};
      const customer = reservation.customers || {};
      const departure = reservation.departures || {};
      const pkg = departure?.packages || {};
      const id = reservation.id || '';
      const style = { ...defaultStyle, ...orgSettings };

      doc.rect(0, 0, 595.28, 120).fill(style.primaryColor);
      doc.fillColor('#FFFFFF').fontSize(28).font('Helvetica-Bold')
        .text('VOUCHER', 50, 30, { align: 'left' });
      doc.fontSize(12).font('Helvetica')
        .text(org.name || 'Travel Agency', 50, 70);
      doc.fontSize(9).text(`Voucher No: ${String(id).substring(0, 8).toUpperCase()}`, 50, 90);

      doc.fillColor(style.secondaryColor);
      doc.moveDown(10);

      doc.fontSize(16).font('Helvetica-Bold').fillColor(style.primaryColor)
        .text('Customer Information', 50, doc.y);
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica').fillColor(style.secondaryColor);
      doc.text(`Name: ${customer?.full_name || reservation.customer_name}`);
      doc.text(`Phone: ${customer?.phone || reservation.customer_phone || 'N/A'}`);
      if (customer?.email) doc.text(`Email: ${customer.email}`);
      doc.moveDown(1);

      if (pkg?.name) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(style.primaryColor)
          .text('Package Details');
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica').fillColor(style.secondaryColor);
        doc.text(`Package: ${pkg.name}`);
        if (pkg.destination) doc.text(`Destination: ${pkg.destination}`);
        doc.moveDown(1);
      }

      if (departure?.depart_at) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(style.primaryColor)
          .text('Travel Dates');
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica').fillColor(style.secondaryColor);
        doc.text(`Departure: ${new Date(departure.depart_at).toLocaleDateString('bs-BA')}`);
        doc.text(`Return: ${new Date(departure.return_at).toLocaleDateString('bs-BA')}`);
        doc.moveDown(1);
      }

      doc.fontSize(16).font('Helvetica-Bold').fillColor(style.primaryColor)
        .text('Reservation Details');
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica').fillColor(style.secondaryColor);
      doc.text(`Party Size: ${reservation.party_size || 1}`);
      doc.text(`Total Amount: ${reservation.total_amount || 0} ${reservation.currency || 'BAM'}`);
      doc.text(`Status: ${(reservation.status || '').toUpperCase()}`);

      doc.moveDown(4);

      doc.rect(50, doc.y, 495.28, 1).fill(style.primaryColor);
      doc.moveDown(1);
      doc.fontSize(9).fillColor('#6B7280').text(
        style.footerText || 'Thank you for choosing our services!',
        { align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate a professional invoice PDF with enhanced design
 */
export async function generateInvoicePDF(reservation: any, orgSettings?: Partial<InvoiceStyle>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const org = reservation.organizations || {};
      const customer = reservation.customers || {};
      const departure = reservation.departures || {};
      const pkg = departure?.packages || {};
      const currency = reservation.currency || 'BAM';
      const total = Number(reservation.total_amount || 0);
      const paid = Number(reservation.paid_amount || 0);
      const balance = Math.max(total - paid, 0);
      const invoiceNo = `INV-${String(reservation.id || '').substring(0, 8).toUpperCase()}`;
      const issueDate = new Date().toLocaleDateString('bs-BA');
      const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('bs-BA');

      const style = { ...defaultStyle, ...orgSettings };

      // === HEADER ===
      doc.rect(0, 0, 595.28, 160).fill(style.primaryColor);

      doc.fillColor('#FFFFFF').fontSize(32).font('Helvetica-Bold')
        .text('INVOICE', 50, 35, { align: 'right' });
      doc.fontSize(10).font('Helvetica')
        .text(`Invoice No: ${invoiceNo}`, 50, 80, { align: 'right' });
      doc.text(`Issue Date: ${issueDate}`, 50, 96, { align: 'right' });
      doc.text(`Due Date: ${dueDate}`, 50, 112, { align: 'right' });

      doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold')
        .text(org.name || 'Travel Agency', 50, 35);
      doc.fontSize(9).font('Helvetica').fillColor('#E0E7FF');
      if (org.address) doc.text(org.address, 50, 65);
      if (org.email) doc.text(org.email, 50, 78);
      if (org.phone) doc.text(org.phone, 50, 91);
      if (org.tax_id) doc.text(`ID: ${org.tax_id}`, 50, 104);
      if (org.bank_account) doc.text(`IBAN: ${org.bank_account}`, 50, 117);

      doc.fillColor(style.secondaryColor);
      const mainStart = 190;

      // === BILL TO ===
      doc.fontSize(12).font('Helvetica-Bold').fillColor(style.primaryColor)
        .text('Bill To', 50, mainStart);
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(style.secondaryColor);
      doc.text(customer.full_name || reservation.customer_name || 'Customer');
      doc.text(customer.phone || reservation.customer_phone || 'N/A');
      if (customer.email) doc.text(customer.email);

      doc.moveDown(2);

      // === TABLE HEADER ===
      const tableY = doc.y;
      const leftMargin = 50;
      const rightMargin = 545;
      const col1 = leftMargin;
      const col2 = 300;
      const col3 = 390;
      const col4 = 470;

      doc.rect(leftMargin, tableY - 5, rightMargin - leftMargin, 22).fill(style.primaryColor);
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
      doc.text('Description', col1 + 5, tableY + 2);
      doc.text('Qty', col2, tableY + 2, { width: 40, align: 'right' });
      doc.text('Unit Price', col3, tableY + 2, { width: 60, align: 'right' });
      doc.text('Amount', col4, tableY + 2, { width: 70, align: 'right' });

      doc.fillColor(style.secondaryColor);

      // === TABLE ROW ===
      const rowY = tableY + 35;
      const description = pkg.name
        ? `${pkg.name}${pkg.destination ? ` — ${pkg.destination}` : ''}`
        : `Reservation ${String(reservation.id || '').substring(0, 8).toUpperCase()}`;

      doc.fontSize(10).font('Helvetica');
      doc.text(description, col1, rowY, { width: 230 });
      if (departure?.depart_at) {
        doc.fontSize(8).fillColor('#6B7280')
          .text(`Departure: ${new Date(departure.depart_at).toLocaleDateString('bs-BA')}`, col1, rowY + 14, { width: 230 });
      }
      doc.fontSize(10).fillColor(style.secondaryColor);
      doc.text(String(reservation.party_size || 1), col2, rowY, { width: 40, align: 'right' });
      doc.text(`${total.toFixed(2)}`, col3, rowY, { width: 60, align: 'right' });
      doc.text(`${total.toFixed(2)} ${currency}`, col4, rowY, { width: 70, align: 'right' });

      // line
      doc.moveTo(leftMargin, rowY + 42).lineTo(rightMargin, rowY + 42).strokeColor('#E5E7EB').stroke();

      // === TOTALS ===
      const totalsY = rowY + 62;
      doc.font('Helvetica').fontSize(10);
      doc.text('Subtotal', 380, totalsY, { width: 80, align: 'right' });
      doc.text(`${total.toFixed(2)} ${currency}`, 460, totalsY, { width: 80, align: 'right' });
      doc.text('Paid', 380, totalsY + 20, { width: 80, align: 'right' });
      doc.text(`${paid.toFixed(2)} ${currency}`, 460, totalsY + 20, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold');
      doc.text('Balance Due', 380, totalsY + 44, { width: 80, align: 'right' });
      doc.fillColor(balance > 0 ? '#DC2626' : '#059669');
      doc.text(`${balance.toFixed(2)} ${currency}`, 460, totalsY + 44, { width: 80, align: 'right' });

      // === PAYMENT INFO ===
      doc.fillColor(style.secondaryColor);
      doc.moveDown(5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(style.primaryColor)
        .text('Payment Information', 50, doc.y);
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(style.secondaryColor);
      doc.text(`Status: ${(reservation.payment_status || 'unpaid').replace(/_/g, ' ').toUpperCase()}`);
      doc.text(`Payment Terms: Due within 15 days`);
      if (org.tax_id) doc.text(`Porezni ID: ${org.tax_id}`);
      if (org.bank_account) doc.text(`IBAN: ${org.bank_account}`);

      // === FOOTER ===
      doc.moveDown(2);
      doc.rect(50, doc.y, 495.28, 0.5).fill(style.primaryColor);
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#6B7280')
        .text(org.invoice_footer || style.footerText || "Thank you for your business!", { align: 'center' });

      const pageBottom = 780;
      doc.fontSize(7).fillColor('#9CA3AF')
        .text('Generated by Travline', 50, pageBottom, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
