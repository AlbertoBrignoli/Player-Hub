-- Servizi (26/10/2026):
-- 1. la categoria "Benessere" (preparazione, mental coaching, fisioterapia, recupero, nutrizione
--    sportiva, AUVI Performance) diventa "Performance";
-- 2. nuova categoria "Benessere" con Power Health (integratori naturali, Atene);
-- 3. nuova categoria "Famiglia" con Myro (ostetriche e nanny a domicilio, Atene).

update public.crm_services set category = 'Performance' where category = 'Benessere';

insert into public.crm_services (category, title, description, partner_name, partner_website, partner_note, show_partner, verified, active, sort,
  accent_color, logo_url, cover_url, hero_claim, about, highlights, contact_email, contact_phone, form_schema, desc_long, includes, sla, quote, quote_by, hue, icon, i18n)
select 'Famiglia', 'Nanny e ostetrica a domicilio',
  'Ostetriche e nanny a domicilio ad Atene per la mamma e il neonato, con Myro.',
  'Myro', 'https://myro-pregnancy.gr/',
  'Myro · servizi di ostetricia a domicilio ad Atene. La richiesta passa da AUVI: ti mettiamo in contatto noi.',
  true, true, true, 115, '#f6ecf1', '/servizi/myro-logo-white.png', '/servizi/myro-cover.jpg',
  'QUANDO NASCE UN BAMBINO, NASCE UNA MAMMA',
  'Myro è un team di ostetriche che segue la famiglia a casa, dalla gravidanza ai primi mesi del bambino. Durante la stagione, tra allenamenti, partite e trasferte, la famiglia non resta sola: un’ostetrica o una nanny di fiducia si occupa del neonato e aiuta la mamma a costruire routine di pasti e sonno.',
  '[{"title":"ASSISTE","text":"Cura e custodia del neonato a casa, di giorno o di notte, anche durante le trasferte."},{"title":"ACCOMPAGNA","text":"Allattamento, routine dei pasti e del sonno con un’ostetrica dedicata."},{"title":"PREPARA","text":"Preparazione al parto, corsi e pilates prima e dopo la nascita."}]'::jsonb,
  null, '+30 698 313 8757',
  '[{"key":"per_chi","type":"radio","label":"A che punto siete?","options":["In attesa di un bambino","Neonato (0-3 mesi)","Bambino 3-12 mesi","Bambino oltre 1 anno"],"section":"LA TUA FAMIGLIA","required":true},
    {"key":"data","type":"date","label":"Data prevista del parto o data di nascita","section":"LA TUA FAMIGLIA"},
    {"key":"gemelli","type":"radio","label":"Gemelli?","options":["No","Sì"],"section":"LA TUA FAMIGLIA"},
    {"key":"servizi","help":"anche più di una","type":"multiselect","label":"Di cosa avete bisogno?","options":["Nanny / assistenza al neonato","Ostetrica a domicilio","Allattamento","Routine dei pasti","Sonno del bambino","Preparazione al parto","Pilates pre e post parto"],"section":"DI COSA AVETE BISOGNO","required":true},
    {"key":"orario","type":"radio","label":"In quali momenti?","options":["Di giorno","Di notte","Giorno e notte","Da definire"],"section":"DI COSA AVETE BISOGNO"},
    {"key":"frequenza","type":"radio","label":"Con che frequenza?","options":["Qualche ora a settimana","Tutti i giorni","Durante le trasferte della squadra","Da definire"],"section":"DI COSA AVETE BISOGNO"},
    {"key":"inizio","type":"radio","label":"Quando vorreste iniziare?","options":["Subito","Entro un mese","Dopo il parto","Solo informazioni"],"section":"DI COSA AVETE BISOGNO"},
    {"key":"zona","type":"text","label":"In che zona di Atene vivete?","placeholder":"Es. Glyfada, Kifisia, Vouliagmeni…","section":"DOVE E COME"},
    {"key":"lingue","help":"anche più di una","type":"multiselect","label":"Lingue preferite","options":["Italiano","Inglese","Greco"],"section":"DOVE E COME"},
    {"key":"contatto","type":"radio","label":"Come preferite essere contattati?","options":["Chiamata","WhatsApp","Email"],"section":"DOVE E COME"},
    {"key":"note","help":"facoltativo ma prezioso","type":"textarea","label":"Qualcosa che dobbiamo sapere","placeholder":"Es. abitudini del bambino, allergie, chi c’è in casa, giorni delle trasferte…","section":"DOVE E COME"}]'::jsonb,
  'Ostetriche e nanny a domicilio ad Atene con Myro: assistenza al neonato di giorno e di notte, allattamento, routine dei pasti e del sonno, preparazione al parto e pilates pre e post parto. Pensato per le famiglie degli atleti che vivono ad Atene.',
  '["Nanny e custodia del neonato a domicilio","Ostetrica dedicata per allattamento, pasti e sonno","Preparazione al parto e corsi","Pilates pre e post parto"]'::jsonb,
  'Su appuntamento', '“Quando nasce un bambino, nasce una mamma.”', 'Myro', 330, 'users',
  '{"en":{"title":"Nanny and home midwife","description":"Home midwives and nannies in Athens for mother and newborn, with Myro.","hero_claim":"WHEN A BABY IS BORN, A MOTHER IS BORN",
    "about":"Myro is a team of midwives who look after the family at home, from pregnancy to the baby’s first months. During the season, between training, matches and away trips, the family is never alone: a trusted midwife or nanny takes care of the newborn and helps the mother build feeding and sleep routines.",
    "highlights":[{"title":"CARE","text":"Newborn care and babysitting at home, day or night, including during away trips."},{"title":"SUPPORT","text":"Breastfeeding, feeding and sleep routines with a dedicated midwife."},{"title":"PREPARE","text":"Birth preparation, classes and pilates before and after birth."}],
    "desc_long":"Home midwives and nannies in Athens with Myro: newborn care day and night, breastfeeding, feeding and sleep routines, birth preparation and pre/post-natal pilates. Designed for athletes’ families living in Athens.",
    "includes":["Nanny and newborn care at home","Dedicated midwife for breastfeeding, feeding and sleep","Birth preparation and classes","Pre and post-natal pilates"],
    "sla":"By appointment","quote":"“When a baby is born, a mother is born.”"}}'::jsonb
where not exists (select 1 from public.crm_services where partner_name = 'Myro');

insert into public.crm_services (category, title, description, partner_name, partner_website, partner_note, show_partner, verified, active, sort,
  accent_color, logo_url, cover_url, hero_claim, about, highlights, contact_email, contact_phone, form_schema, desc_long, includes, sla, quote, quote_by, hue, icon, i18n)
select 'Benessere', 'Integratori naturali',
  'Integratori alimentari naturali con Power Health: energia, recupero, sonno e difese.',
  'Power Health', 'https://www.powerhealth.gr/en/',
  'Power Health · prima azienda greca di integratori naturali, dal 1984 (Power of Nature, Salus, Nelsons, Dr. Wolz). La richiesta passa da AUVI.',
  true, true, true, 98, '#e8f3ec', '/servizi/powerhealth-logo-white.png', '/servizi/powerhealth-cover.jpg',
  'FROM NATURE’S PHARMACY',
  'Power Health è un’azienda greca che dal 1984 sviluppa integratori alimentari naturali per prevenire i piccoli problemi di ogni giorno e sostenere energia e benessere. Con AUVI scegli i prodotti adatti ai tuoi obiettivi e al tuo calendario, da valutare insieme al tuo staff medico o al tuo nutrizionista prima dell’uso.',
  '[{"title":"ENERGIA","text":"Magnesio, vitamine e formule per energia e recupero nei periodi più intensi."},{"title":"EQUILIBRIO","text":"Sonno, stress, difese immunitarie e digestione: soluzioni naturali per ogni giorno."},{"title":"QUALITÀ","text":"Marchi riconosciuti come Power of Nature, Salus, Nelsons e Dr. Wolz."}]'::jsonb,
  'power@powerhealth.gr', '+30 210 2821500',
  '[{"key":"obiettivi","help":"anche più di una","type":"multiselect","label":"Su cosa vuoi lavorare?","options":["Energia e recupero","Sonno e stress","Difese immunitarie","Muscoli e articolazioni","Digestione e intestino","Pelle, capelli e unghie"],"section":"IL TUO OBIETTIVO","required":true},
    {"key":"momento","type":"radio","label":"In che fase sei?","options":["Stagione in corso","Ritiro / pre-campionato","Recupero infortunio","Pausa"],"section":"IL TUO OBIETTIVO"},
    {"key":"attuali","type":"radio","label":"Usi già integratori?","options":["No","Ogni tanto","Sì, regolarmente"],"section":"PER CONSIGLIARTI BENE"},
    {"key":"staff","type":"radio","label":"Chi segue la tua integrazione?","options":["Lo staff medico del club","Il mio nutrizionista","Nessuno, vorrei un consiglio"],"section":"PER CONSIGLIARTI BENE"},
    {"key":"allergie","type":"text","label":"Allergie o intolleranze","placeholder":"Es. lattosio, glutine… (lascia vuoto se nessuna)","section":"PER CONSIGLIARTI BENE"},
    {"key":"consegna","type":"radio","label":"Dove ti servono?","options":["Atene","Altra città in Grecia","Italia","Altro paese"],"section":"CONSEGNA"},
    {"key":"contatto","type":"radio","label":"Come preferisci essere contattato?","options":["Chiamata","WhatsApp","Email"],"section":"CONSEGNA"},
    {"key":"note","help":"facoltativo","type":"textarea","label":"Note","placeholder":"Es. prodotti che usi già, orari degli allenamenti, esigenze particolari…","section":"CONSEGNA"}]'::jsonb,
  'Integratori alimentari naturali Power Health per sostenere energia, recupero, sonno e difese durante la stagione. AUVI ti aiuta a scegliere e a ricevere i prodotti; ogni integratore va valutato con il tuo staff medico o nutrizionista prima dell’uso.',
  '["Consiglio sui prodotti in base ai tuoi obiettivi","Prodotti Power of Nature, Salus, Nelsons e Dr. Wolz","Ritiro o consegna organizzati da AUVI","Coordinamento con il tuo staff medico o nutrizionista"]'::jsonb,
  'Risposta in 48h', '“From nature’s pharmacy to your local pharmacy.”', 'Power Health', 140, 'star',
  '{"en":{"title":"Natural supplements","description":"Natural food supplements with Power Health: energy, recovery, sleep and immunity.","hero_claim":"FROM NATURE’S PHARMACY",
    "about":"Power Health is a Greek company that since 1984 has been developing natural food supplements to prevent everyday problems and support energy and wellbeing. With AUVI you choose the products that fit your goals and your calendar, to be checked with your medical staff or nutritionist before use.",
    "highlights":[{"title":"ENERGY","text":"Magnesium, vitamins and formulas for energy and recovery in the busiest periods."},{"title":"BALANCE","text":"Sleep, stress, immunity and digestion: natural solutions for every day."},{"title":"QUALITY","text":"Trusted brands such as Power of Nature, Salus, Nelsons and Dr. Wolz."}],
    "desc_long":"Power Health natural food supplements to support energy, recovery, sleep and immunity during the season. AUVI helps you choose and receive the products; every supplement should be checked with your medical staff or nutritionist before use.",
    "includes":["Product advice based on your goals","Power of Nature, Salus, Nelsons and Dr. Wolz products","Pick-up or delivery arranged by AUVI","Coordination with your medical staff or nutritionist"],
    "sla":"Reply within 48h","quote":"“From nature’s pharmacy to your local pharmacy.”"}}'::jsonb
where not exists (select 1 from public.crm_services where partner_name = 'Power Health');
