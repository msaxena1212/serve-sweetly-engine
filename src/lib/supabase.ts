import { createClient } from '@supabase/supabase-js';

// Supabase URL and anon key are read from the environment.
// The ! tells TypeScript these values will be defined at runtime.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);