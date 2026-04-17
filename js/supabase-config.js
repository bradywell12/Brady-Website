/* =====================================================
   Supabase Configuration
   ===================================================== */
const SUPABASE_URL  = 'https://wzlempnjmnzwjxdiqdmm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bGVtcG5qbW56d2p4ZGlxZG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjQxNDcsImV4cCI6MjA5MTQ0MDE0N30.adQJYad-rQBJrljMv8tA3M-kEYNqHwtMGsif1q5w9H0';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false }
});

/* =====================================================
   EmailJS Configuration
   -----------------------------------------------------
   1. Sign up free at emailjs.com
   2. Add Email Service (Gmail) → copy Service ID
   3. Create two Email Templates (see README below)
   4. Go to Account → copy your Public Key
   5. Paste all three values below
   ===================================================== */
const EJS_SERVICE_ID       = 'service_01xwvw5';       // e.g. 'service_abc123'
const EJS_CONTACT_TEMPLATE = 'template_7j7sep8';   // e.g. 'template_abc123'
const EJS_OUTREACH_TEMPLATE= 'template_ab5zros';  // e.g. 'template_xyz456'
const EJS_PUBLIC_KEY       = '-_wPZUI9pKJkHXqvL';       // e.g. 'user_AbCdEfGh'

/* =====================================================
   Anthropic (Claude) API Key
   -----------------------------------------------------
   1. Go to console.anthropic.com → API Keys
   2. Create a new key and paste it below
   ===================================================== */
const ANTHROPIC_API_KEY = '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';


