-- I form di Myro e Power Health sono sempre in inglese (i partner sono ad Atene):
-- l'atleta compila in inglese e la richiesta arriva al partner già in inglese.

update public.crm_services set form_schema =
 '[{"key":"per_chi","type":"radio","label":"Where are you at?","options":["Expecting a baby","Newborn (0-3 months)","Baby 3-12 months","Child over 1 year"],"section":"YOUR FAMILY","required":true},
   {"key":"data","type":"date","label":"Due date or date of birth","section":"YOUR FAMILY"},
   {"key":"gemelli","type":"radio","label":"Twins?","options":["No","Yes"],"section":"YOUR FAMILY"},
   {"key":"servizi","help":"you can pick more than one","type":"multiselect","label":"What do you need?","options":["Nanny / newborn care","Home midwife","Breastfeeding","Feeding routine","Baby sleep","Birth preparation","Pre and post-natal pilates"],"section":"WHAT YOU NEED","required":true},
   {"key":"orario","type":"radio","label":"At what times?","options":["Daytime","Night-time","Day and night","To be defined"],"section":"WHAT YOU NEED"},
   {"key":"frequenza","type":"radio","label":"How often?","options":["A few hours a week","Every day","During the team''s away trips","To be defined"],"section":"WHAT YOU NEED"},
   {"key":"inizio","type":"radio","label":"When would you like to start?","options":["Right away","Within a month","After the birth","Just information"],"section":"WHAT YOU NEED"},
   {"key":"zona","type":"text","label":"Which area of Athens do you live in?","placeholder":"E.g. Glyfada, Kifisia, Vouliagmeni…","section":"WHERE AND HOW"},
   {"key":"lingue","help":"you can pick more than one","type":"multiselect","label":"Preferred languages","options":["Italian","English","Greek"],"section":"WHERE AND HOW"},
   {"key":"contatto","type":"radio","label":"How would you like to be contacted?","options":["Call","WhatsApp","Email"],"section":"WHERE AND HOW"},
   {"key":"note","help":"optional but valuable","type":"textarea","label":"Anything we should know","placeholder":"E.g. the baby''s habits, allergies, who is at home, away-trip days…","section":"WHERE AND HOW"}]'::jsonb
where partner_name = 'Myro';

update public.crm_services set form_schema =
 '[{"key":"obiettivi","help":"you can pick more than one","type":"multiselect","label":"What do you want to work on?","options":["Energy and recovery","Sleep and stress","Immunity","Muscles and joints","Digestion and gut","Skin, hair and nails"],"section":"YOUR GOAL","required":true},
   {"key":"momento","type":"radio","label":"What phase are you in?","options":["Season in progress","Pre-season camp","Injury recovery","Break"],"section":"YOUR GOAL"},
   {"key":"attuali","type":"radio","label":"Do you already take supplements?","options":["No","Now and then","Yes, regularly"],"section":"SO WE CAN ADVISE YOU"},
   {"key":"staff","type":"radio","label":"Who manages your supplementation?","options":["The club''s medical staff","My nutritionist","No one, I''d like advice"],"section":"SO WE CAN ADVISE YOU"},
   {"key":"allergie","type":"text","label":"Allergies or intolerances","placeholder":"E.g. lactose, gluten… (leave empty if none)","section":"SO WE CAN ADVISE YOU"},
   {"key":"consegna","type":"radio","label":"Where do you need them?","options":["Athens","Another city in Greece","Italy","Another country"],"section":"DELIVERY"},
   {"key":"contatto","type":"radio","label":"How would you like to be contacted?","options":["Call","WhatsApp","Email"],"section":"DELIVERY"},
   {"key":"note","help":"optional","type":"textarea","label":"Notes","placeholder":"E.g. products you already use, training times, special needs…","section":"DELIVERY"}]'::jsonb
where partner_name = 'Power Health';
