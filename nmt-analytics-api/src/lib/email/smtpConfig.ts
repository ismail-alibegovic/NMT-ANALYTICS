import { z } from 'zod';

// Shared by platform activation, tenant settings and the transport itself.
export const smtpConfigSchema = z.object({
  host: z.string().trim().min(1).refine(value => !/[\s/@:]/.test(value), 'Use an SMTP hostname'),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().optional(),
  requireTLS: z.boolean().optional(),
  user: z.string().trim().min(1),
  pass: z.string().min(1),
  fromEmail: z.string().trim().email().optional(),
  fromName: z.string().trim().refine(value => !/[\r\n]/.test(value)).optional(),
});

export type SmtpConfig = z.infer<typeof smtpConfigSchema>;

export function parseSmtpConfig(value: unknown): SmtpConfig {
  const parsed = smtpConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error('SMTP_CONFIGURATION_INVALID');
  return parsed.data;
}
