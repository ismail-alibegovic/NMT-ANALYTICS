import 'express-serve-static-core';
import { SupabaseClient } from '@supabase/supabase-js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    startTime: number;
    user?: {
      id: string;
      email?: string;
      role?: string;
    };
    orgId?: string;
    supabase?: SupabaseClient;
  }
}
