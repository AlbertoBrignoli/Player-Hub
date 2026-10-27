-- Profilo agente precompilato alla registrazione: oltre ai dati dell'agenzia copia anche
-- telefono agenzia, WhatsApp, licenza e descrizione (notes) da crm_allowed_emails.profile_seed.
do $$
declare d text := pg_get_functiondef('public.handle_new_crm_user'::regproc);
begin
  d := replace(d,
    'agency_logo_url = coalesce(wl.profile_seed->>''agency_logo_url'', agency_logo_url)',
    'agency_logo_url = coalesce(wl.profile_seed->>''agency_logo_url'', agency_logo_url),
        agency_phone = coalesce(wl.profile_seed->>''agency_phone'', agency_phone),
        whatsapp = coalesce(wl.profile_seed->>''whatsapp'', whatsapp),
        licence = coalesce(wl.profile_seed->>''licence'', licence),
        notes = coalesce(wl.profile_seed->>''notes'', notes)');
  execute d;
end $$;
