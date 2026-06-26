export interface EmailOptions {
    to: string;
    subject: string;
    body: string;
    attachments?: {
        filename: string;
        content: Buffer;
        contentType: string;
    }[];
}

export interface EmailProvider {
    sendEmail(options: EmailOptions): Promise<void>;
}

/**
 * Mock implementation of the EmailProvider
 */
export class MockEmailProvider implements EmailProvider {
    async sendEmail(options: EmailOptions): Promise<void> {
        console.log(`[MOCK EMAIL] To: ${options.to}`);
        console.log(`[MOCK EMAIL] Subject: ${options.subject}`);
        console.log(`[MOCK EMAIL] Body: ${options.body.substring(0, 100)}...`);
        if (options.attachments) {
            options.attachments.forEach(att => {
                console.log(`[MOCK EMAIL] Attachment: ${att.filename} (${att.content.length} bytes)`);
            });
        }

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 300));
    }
}

/**
 * Singleton EmailService
 */
export class EmailService {
    private static provider: EmailProvider = new MockEmailProvider();

    static setProvider(provider: EmailProvider) {
        this.provider = provider;
    }

    static async sendBookingConfirmation(reservation: any, pdfBuffer: Buffer) {
        const customerEmail = reservation.customers?.email || reservation.customer_email || 'customer@example.com';
        const customerName = reservation.customers?.full_name || reservation.customer_name || 'Customer';

        return this.provider.sendEmail({
            to: customerEmail,
            subject: `Booking Confirmation - ${reservation.id.substring(0, 8).toUpperCase()}`,
            body: `Dear ${customerName}, your booking for ${reservation.departures?.packages?.name || 'your trip'} is confirmed. Please find your voucher attached.`,
            attachments: [
                {
                    filename: `voucher_${reservation.id.substring(0, 8)}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });
    }
}
