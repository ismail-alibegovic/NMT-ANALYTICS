import PDFDocument from 'pdfkit';

/**
 * Generate a voucher PDF for a reservation
 * Returns a Buffer containing the PDF data
 */
export async function generateVoucherPDF(reservation: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers: Buffer[] = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const result = Buffer.concat(buffers);
                resolve(result);
            });
            doc.on('error', reject);

            // Extract data
            const org = reservation.organizations;
            const customer = reservation.customers;
            const departure = reservation.departures;
            const pkg = departure?.packages;
            const id = reservation.id;

            // Title
            doc.fontSize(24).text(`${org?.name || 'Travel Agency'} - Travel Voucher`, { align: 'center' });
            doc.moveDown(2);

            // Customer info
            doc.fontSize(14).text('Customer Information:', { underline: true });
            doc.fontSize(12).text(`Name: ${customer?.full_name || reservation.customer_name}`);
            doc.text(`Phone: ${customer?.phone || reservation.customer_phone || 'N/A'}`);
            doc.moveDown();

            // Package info
            if (pkg) {
                doc.fontSize(14).text('Package Information:', { underline: true });
                doc.fontSize(12).text(`Package: ${pkg.name}`);
                doc.text(`Destination: ${pkg.destination}`);
                doc.moveDown();
            }

            // Departure info
            if (departure) {
                doc.fontSize(14).text('Departure Information:', { underline: true });
                doc.fontSize(12).text(`Departure Date: ${new Date(departure.depart_at).toLocaleDateString()}`);
                doc.text(`Return Date: ${new Date(departure.return_at).toLocaleDateString()}`);
                doc.text(`Party Size: ${reservation.party_size}`);
                doc.moveDown();
            }

            // Reservation details
            doc.fontSize(14).text('Reservation Details:', { underline: true });
            doc.fontSize(12).text(`Total Amount: ${reservation.total_amount || 'N/A'} ${reservation.currency}`);
            doc.text(`Status: ${reservation.status}`);
            doc.text(`Created: ${new Date(reservation.created_at).toLocaleDateString()}`);
            doc.text(`Voucher Number: ${id.substring(0, 8).toUpperCase()}`);

            // Footer
            doc.moveDown(2);
            doc.fontSize(10).text('Thank you for choosing our services!', { align: 'center' });

            // Finalize PDF
            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

export async function generateInvoicePDF(reservation: any): Promise<Buffer> {
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
            const balance = Number(reservation.balance_due ?? Math.max(total - paid, 0));
            const invoiceNo = `INV-${String(reservation.id || '').substring(0, 8).toUpperCase()}`;
            const issueDate = new Date().toLocaleDateString('bs-BA');

            doc.fontSize(26).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
            doc.moveDown(0.2);
            doc.fontSize(10).font('Helvetica').text(`Invoice No: ${invoiceNo}`, { align: 'right' });
            doc.text(`Issue Date: ${issueDate}`, { align: 'right' });
            doc.moveDown(2);

            doc.fontSize(16).font('Helvetica-Bold').text(org.name || 'Travel Agency');
            doc.fontSize(10).font('Helvetica');
            if (org.address) doc.text(org.address);
            if (org.email) doc.text(org.email);
            if (org.phone) doc.text(org.phone);
            doc.moveDown(1.5);

            doc.fontSize(12).font('Helvetica-Bold').text('Bill To');
            doc.fontSize(10).font('Helvetica');
            doc.text(customer.full_name || reservation.customer_name || 'Customer');
            doc.text(customer.phone || reservation.customer_phone || 'N/A');
            if (customer.email) doc.text(customer.email);
            doc.moveDown(1.5);

            const tableTop = doc.y;
            const left = 50;
            const colDesc = left;
            const colQty = 330;
            const colPrice = 390;
            const colAmount = 470;

            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Description', colDesc, tableTop);
            doc.text('Qty', colQty, tableTop, { width: 40, align: 'right' });
            doc.text('Price', colPrice, tableTop, { width: 60, align: 'right' });
            doc.text('Amount', colAmount, tableTop, { width: 70, align: 'right' });
            doc.moveTo(left, tableTop + 18).lineTo(545, tableTop + 18).strokeColor('#E5E7EB').stroke();

            const rowY = tableTop + 32;
            const description = pkg.name
                ? `${pkg.name}${pkg.destination ? ` — ${pkg.destination}` : ''}`
                : `Reservation ${String(reservation.id || '').substring(0, 8).toUpperCase()}`;
            doc.font('Helvetica').fillColor('#111827');
            doc.text(description, colDesc, rowY, { width: 260 });
            if (departure.depart_at) {
                doc.fontSize(8).fillColor('#6B7280').text(`Departure: ${new Date(departure.depart_at).toLocaleDateString('bs-BA')}`, colDesc, rowY + 14, { width: 260 });
            }
            doc.fontSize(10).fillColor('#111827');
            doc.text(String(reservation.party_size || 1), colQty, rowY, { width: 40, align: 'right' });
            doc.text(`${total.toFixed(2)} ${currency}`, colPrice, rowY, { width: 60, align: 'right' });
            doc.text(`${total.toFixed(2)} ${currency}`, colAmount, rowY, { width: 70, align: 'right' });
            doc.moveTo(left, rowY + 42).lineTo(545, rowY + 42).strokeColor('#E5E7EB').stroke();

            const totalsY = rowY + 62;
            doc.font('Helvetica');
            doc.text('Subtotal', 390, totalsY, { width: 80, align: 'right' });
            doc.text(`${total.toFixed(2)} ${currency}`, 470, totalsY, { width: 70, align: 'right' });
            doc.text('Paid', 390, totalsY + 20, { width: 80, align: 'right' });
            doc.text(`${paid.toFixed(2)} ${currency}`, 470, totalsY + 20, { width: 70, align: 'right' });
            doc.font('Helvetica-Bold');
            doc.text('Balance Due', 390, totalsY + 44, { width: 80, align: 'right' });
            doc.text(`${Math.max(balance, 0).toFixed(2)} ${currency}`, 470, totalsY + 44, { width: 70, align: 'right' });

            doc.moveDown(4);
            doc.fontSize(10).font('Helvetica-Bold').text('Payment Status');
            doc.font('Helvetica').text(String(reservation.payment_status || 'unpaid').replace(/_/g, ' ').toUpperCase());

            doc.moveDown(2);
            doc.fontSize(9).fillColor('#6B7280').text('This invoice was generated by NMT Analytics.', { align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
