import { logCommunicationHistory } from '../communicationHistory';
import { resolveOrgEmailProvider } from './orgEmailProvider';

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
        if (process.env.NODE_ENV === 'production') throw new Error('EMAIL_MOCK_PROVIDER_DISABLED_IN_PRODUCTION');
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
 * Production fallback when no SMTP provider is configured: refuse to send rather than
 * pretend. The mock provider would log a "sent" history row for an email that never left.
 */
export class UnconfiguredEmailProvider implements EmailProvider {
    async sendEmail(): Promise<void> {
        throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
}

/**
 * Singleton EmailService
 */
export class EmailService {
    private static provider: EmailProvider = process.env.NODE_ENV === 'production'
        ? new UnconfiguredEmailProvider() : new MockEmailProvider();

    /** Boot-time platform provider only. Never call this from a tenant-scoped request. */
    static setProvider(provider: EmailProvider) {
        this.provider = provider;
    }

    private static async sendAndLog(
        options: EmailOptions,
        context: {
            orgId?: string | null;
            relatedReservationId?: string | null;
            relatedDepartureId?: string | null;
        } = {},
        providerOverride?: EmailProvider
    ) {
        let accepted = false;
        try {
            // Explicit provider (manual/test sends) > the sending org's own SMTP > platform provider.
            // The platform provider is only ever set at boot from SMTP_CONFIG (or fail-closed in production).
            const provider = providerOverride
                ?? (context.orgId ? await resolveOrgEmailProvider(context.orgId) : null)
                ?? this.provider;
            await provider.sendEmail(options);
            accepted = true;

            if (context.orgId) {
                await logCommunicationHistory({
                    orgId: context.orgId,
                    channel: 'email',
                    recipient: options.to,
                    subject: options.subject,
                    bodyPreview: options.body,
                    status: 'sent',
                    relatedReservationId: context.relatedReservationId ?? null,
                    relatedDepartureId: context.relatedDepartureId ?? null,
                    sentAt: new Date(),
                });
            }
        } catch (error: any) {
            if (accepted) throw new Error('EMAIL_ACCEPTED_HISTORY_UNAVAILABLE_DO_NOT_RETRY');
            if (context.orgId) {
                await logCommunicationHistory({
                    orgId: context.orgId,
                    channel: 'email',
                    recipient: options.to,
                    subject: options.subject,
                    bodyPreview: options.body,
                    status: 'failed',
                    errorMessage: 'EMAIL_SEND_FAILED',
                    relatedReservationId: context.relatedReservationId ?? null,
                    relatedDepartureId: context.relatedDepartureId ?? null,
                });
            }

            throw error;
        }
    }

    static async sendBookingConfirmation(reservation: any, pdfBuffer: Buffer) {
        const customerEmail = reservation.customers?.email || reservation.customer_email;
        if (!customerEmail) throw new Error('EMAIL_RECIPIENT_MISSING');
        const customerName = reservation.customers?.full_name || reservation.customer_name || 'Customer';
        const orgId = reservation.org_id || reservation.organizations?.id || null;
        const departureId = reservation.departure_id || reservation.departures?.id || null;

        return this.sendAndLog({
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
        }, {
            orgId,
            relatedReservationId: reservation.id,
            relatedDepartureId: departureId,
        });
    }

    static async sendPaymentConfirmation(reservation: any, pdfBuffer?: Buffer) {
        const customerEmail = reservation.customers?.email || reservation.customer_email || reservation.customerEmail;
        const customerName = reservation.customers?.full_name || reservation.customer_name || reservation.customerName || 'Customer';
        const amount = reservation.amount;
        const currency = reservation.currency || 'BAM';
        const paymentId = reservation.paymentId || reservation.id || '';
        const orgId = reservation.org_id || reservation.orgId || null;
        const reservationId = reservation.reservationId || reservation.id || null;

        return this.sendAndLog({
            to: customerEmail,
            subject: `Potvrda uplate - ${paymentId.substring(0, 8).toUpperCase()}`,
            body: `Poštovani ${customerName},\n\nVaša uplata od ${amount} ${currency} je uspješno primljena.\n\nHvala na povjerenju!\n${reservation.orgName || 'Travline'}`,
        }, {
            orgId,
            relatedReservationId: reservationId,
        });
    }

    static async sendPaymentOverdueReminder(customerEmail: string, customerName: string, amount: number, reservationId: string, orgId?: string | null) {
        return this.sendAndLog({
            to: customerEmail,
            subject: `Podsjetnik: dospjela uplata - ${reservationId.substring(0, 8).toUpperCase()}`,
            body: `Poštovani ${customerName},\n\nPodsjećamo Vas da imate dospjelu uplatu od ${amount} BAM.\n\nMolimo izvršite uplatu u najkraćem mogućem roku.\n\nSrdačno,\nTravline`,
        }, {
            orgId: orgId || null,
            relatedReservationId: reservationId,
        });
    }

    static async sendManualMessage(options: EmailOptions & {
        orgId: string;
        relatedReservationId?: string | null;
        relatedDepartureId?: string | null;
    }, provider?: EmailProvider) {
        return this.sendAndLog(options, {
            orgId: options.orgId,
            relatedReservationId: options.relatedReservationId ?? null,
            relatedDepartureId: options.relatedDepartureId ?? null,
        }, provider);
    }
}

