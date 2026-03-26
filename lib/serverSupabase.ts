import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const hasServerSupabaseConfig = Boolean(supabaseUrl && supabaseServerKey);

export const serverSupabase = hasServerSupabaseConfig
  ? createClient(supabaseUrl, supabaseServerKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

