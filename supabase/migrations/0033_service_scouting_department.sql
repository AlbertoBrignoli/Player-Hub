-- Servizi AUVI: Scouting Department (05/10/2026)
-- Scouting e analisi personale delle partite per l'atleta: report post-partita, profilazione
-- con benchmark di ruolo, adattamento allo stile di gioco, percorso di crescita.
-- Contenuti da company profile e brochure "Sports Directors" del partner (Parma).
-- Idempotente: aggiorna la scheda se esiste gia'.

insert into public.crm_services (category, title, partner_name, verified, show_partner, active, sort, icon)
select 'Analisi e scouting', 'Scouting e analisi partita', 'Scouting Department', true, true, true, 98, 'activity'
where not exists (select 1 from public.crm_services where partner_name = 'Scouting Department');

update public.crm_services set
  category = 'Analisi e scouting',
  title = 'Scouting e analisi partita',
  verified = true, show_partner = true, active = true, sort = 98, icon = 'activity',
  partner_website = 'https://www.scoutingdepartment.com',
  contact_email = 'info@scoutingdepartment.com',
  logo_url = '/servizi/scouting-logo-white.png',
  cover_url = '/servizi/scouting-cover.jpg',
  accent_color = '#A8872F',
  hue = 85,
  hero_claim = 'IL TUO GIOCO, LETTO CON GLI OCCHI DI UNO SCOUT.',
  description = 'Report personali dopo ogni partita, profilo tecnico e benchmark di ruolo: video e dati sul tuo gioco, a cura degli scout di Scouting Department.',
  desc_long = 'Analisi personale delle tue partite e del tuo profilo: occhio umano, video e dati che lavorano insieme, come nei reparti scouting dei club di vertice.',
  about = 'Scouting Department nasce da oltre vent''anni di calcio professionistico ed è il reparto scouting, analisi dati e reclutamento in outsourcing di club, direttori sportivi e allenatori. Gli scout aggiornano ogni giorno un database di quasi 2.000 giocatori e oltre 100 campionati professionistici europei. Con AUVI lo stesso metodo lavora per te: le tue partite analizzate come le analizza un club, per capire cosa funziona, cosa migliorare e come ti vede chi ti valuta.',
  highlights = '[
    {"title":"POST MATCH.","text":"Report personalizzato e dettagliato sulla tua prestazione, partita per partita, con i dati elaborati dal Datametrics Department."},
    {"title":"PROFILAZIONE.","text":"Il tuo profilo tecnico, tattico e fisico confrontato con i giocatori del tuo ruolo: punti di forza e margini di crescita, con benchmark."},
    {"title":"PERCORSO.","text":"Analisi del percorso di sviluppo, storico infortuni e carriera, adattamento allo stile di gioco di un club: le basi per scegliere il prossimo passo."}
  ]'::jsonb,
  includes = '[
    "Report post-partita personale (video e dati)",
    "Profilazione del giocatore e benchmark di ruolo",
    "Analisi dello stile di gioco e dell''adattamento a un club",
    "Analisi del percorso di sviluppo e crescita",
    "Storico infortuni e analisi di carriera",
    "Database di quasi 2.000 giocatori e oltre 100 campionati europei"
  ]'::jsonb,
  partner_note = 'Scouting Department · Via Paradigna 61, Parma. Scouting in outsourcing, analisi dati e video per club, direttori sportivi, allenatori, atleti e agenti.',
  sla = 'Risposta entro 48h',
  quote = '“Un sistema in cui l''occhio umano, i video e l''analisi dei dati lavorano in sinergia.”',
  quote_by = 'Scouting Department',
  form_intro = null,
  form_schema = '[
    {"key":"servizio","type":"multiselect","label":"Cosa ti serve?","help":"anche più di una","section":"COSA TI SERVE",
     "options":["Report post-partita personale","Analisi di più partite","Profilazione e benchmark di ruolo","Adattamento allo stile di un club","Percorso di sviluppo"]},
    {"key":"partite","type":"radio","label":"Quali partite vuoi far analizzare?","section":"COSA TI SERVE",
     "options":["La prossima partita","Le ultime partite giocate","L''intera stagione","Da definire"]},
    {"key":"focus","type":"multiselect","label":"Su cosa vuoi più riscontro?","help":"anche più di una","section":"IL TUO GIOCO",
     "options":["Fase difensiva","Costruzione","Fase offensiva","Posizionamento","Duelli","Intensità e condizione"]},
    {"key":"obiettivo","type":"radio","label":"Obiettivo principale","section":"IL TUO GIOCO",
     "options":["Migliorare la prestazione","Preparare un trasferimento","Rinnovo o trattativa","Rientro da infortunio"]},
    {"key":"video","type":"radio","label":"Hai i video delle partite?","section":"IL TUO GIOCO",
     "options":["Sì, li carico in Media","Li fornisce il club","No, servono a voi"]},
    {"key":"consegna","type":"radio","label":"Come vuoi ricevere l''analisi?","section":"PREFERENZE",
     "options":["Report scritto","Call con lo scout","Entrambi"]},
    {"key":"frequenza","type":"radio","label":"Con che frequenza?","section":"PREFERENZE",
     "options":["Una tantum","Dopo ogni partita","Ogni mese","Da definire"]},
    {"key":"contatto","type":"radio","label":"Come preferisci essere contattato?","section":"PREFERENZE",
     "options":["Chiamata","WhatsApp","Email"]},
    {"key":"note","type":"textarea","label":"Altro che lo scout deve sapere","help":"facoltativo","section":"PREFERENZE",
     "placeholder":"Es. partite specifiche, ruolo che vuoi approfondire, club o campionato di interesse…"}
  ]'::jsonb,
  i18n = jsonb_build_object('en', '{
    "title":"Scouting & match analysis",
    "hero_claim":"YOUR GAME, SEEN THROUGH A SCOUT''S EYES.",
    "description":"Personal post-match reports, technical profile and role benchmark: video and data on your game, by the scouts of Scouting Department.",
    "desc_long":"Personal analysis of your matches and your profile: the human eye, video and data working together, as in the scouting departments of top clubs.",
    "about":"Scouting Department comes from over twenty years in professional football and is the outsourced scouting, data analysis and recruitment department of clubs, sporting directors and coaches. Its scouts update a database of almost 2,000 players and over 100 professional European leagues every day. With AUVI the same method works for you: your matches analysed the way a club analyses them, to understand what works, what to improve and how the people assessing you see you.",
    "highlights":[
      {"title":"POST MATCH.","text":"A tailored, detailed report on your performance, match by match, with data processed by the Datametrics Department."},
      {"title":"PROFILING.","text":"Your technical, tactical and physical profile compared with players in your role: strengths and room for growth, with benchmarks."},
      {"title":"PATHWAY.","text":"Development pathway analysis, injury and career history, fit with a club''s style of play: the basis for choosing your next step."}
    ],
    "includes":["Personal post-match report (video and data)","Player profiling and role benchmark","Style of play and club fit analysis","Development and growth pathway analysis","Injury history and career analysis","Database of almost 2,000 players and over 100 European leagues"],
    "sla":"Reply within 48h",
    "quote":"“A system where the human eye, video and data analysis work in synergy.”"
  }'::jsonb)
where partner_name = 'Scouting Department';

-- domande obbligatorie (il questionario non si invia senza)
update public.crm_services set form_schema = (
  select jsonb_agg(case when f->>'key' in ('servizio','partite','obiettivo','consegna','contatto') then f || '{"required":true}' else f end order by ord)
  from jsonb_array_elements(form_schema) with ordinality as e(f, ord))
where partner_name = 'Scouting Department';
