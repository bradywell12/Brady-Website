/* =====================================================
   Supabase Configuration
   -----------------------------------------------------
   1. Go to https://supabase.com and create a free account
   2. Create a new project
   3. Go to Project Settings → API
   4. Copy your "Project URL" and "anon public" key
   5. Paste them below in place of the placeholder strings
   ===================================================== */

const SUPABASE_URL  = 'PASTE_YOUR_PROJECT_URL_HERE';
const SUPABASE_ANON = 'PASTE_YOUR_ANON_PUBLIC_KEY_HERE';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
