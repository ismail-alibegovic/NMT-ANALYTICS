import { auditLog } from "../middleware/auditLogger";
import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { z } from 'zod';
import { createSignupClient, signupRedirectUrl } from '../lib/authSignup';
import { apiError } from '../lib/errors';

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 znakova'),
  org_name: z.string().min(2, 'Naziv organizacije je obavezan').max(100),
  full_name: z.string().min(2, 'Ime i prezime je obavezno').max(100).optional(),
});

const auditOrganizationCreate = auditLog(
  'CREATE',
  'organization',
  undefined,
  (req) => req.body?.org_name
);

/**
 * POST /auth/signup
 *
 * Self-service registration: creates a Supabase auth user.
 * The handle_new_user trigger (DB-side) auto-creates:
 *   - organizations row (slug derived from org_name)
 *   - profiles row (role = director)
 *   - default org_modules + org_branding
 */
router.post('/auth/signup', auditOrganizationCreate, async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstErr = parsed.error.issues[0];
      return apiError(res, 400, 'VALIDATION_ERROR', firstErr?.message || 'Invalid input');
    }

    const { email, password, full_name } = parsed.data;

    // Fresh anonymous client: signup must send Auth confirmation, never mutate the admin session.
    const { data, error } = await createSignupClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: signupRedirectUrl(),
        data: full_name ? { full_name } : {},
      },
    });

    if (error) {
      if (error.message.includes('already') || error.message.includes('exists')) {
        return apiError(res, 409, 'USER_EXISTS', 'Korisnik sa ovim emailom već postoji');
      }
      return apiError(res, 400, 'SIGNUP_FAILED', 'Registration could not be completed. Try again later.');
    }

    if (!data.user) return apiError(res, 400, 'SIGNUP_FAILED', 'Registration could not be completed');
    // Supabase may return an obfuscated user for existing confirmed addresses.
    // Never use that response to mutate an existing organization.
    if (data.user.identities?.length === 0) return res.status(201).json({ confirmationRequired: true });

    // If org_name was provided, update the auto-created org name
    if (parsed.data.org_name) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('org_id')
        .eq('id', data.user.id)
        .single();

      if (profile?.org_id) {
        await supabaseAdmin
          .from('organizations')
          .update({ name: parsed.data.org_name })
          .eq('id', profile.org_id);

        await supabaseAdmin
          .from('org_branding')
          .update({ display_name: parsed.data.org_name })
          .eq('org_id', profile.org_id);
      }
    }

    res.status(201).json({
      message: 'Registration accepted. Check your email if confirmation is required.',
      confirmationRequired: !data.session,
      user: { id: data.user.id, email: data.user.email },
    });
  } catch (err: any) {
    console.error('Signup failed');
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

/**
 * GET /auth/check-org
 * Query: ?email=foo@bar.com
 * Returns whether the email is already registered (for signup flow UX)
 */
router.get('/auth/check-org', async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string || '').toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Email je obavezan');
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, org_id, role')
      .eq('email', email)
      .single();

    if (data) {
      return res.json({ exists: true });
    }

    res.json({ exists: false });
  } catch {
    res.json({ exists: false });
  }
});

export default router;

