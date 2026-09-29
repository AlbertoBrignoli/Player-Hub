-- Solo immagini AUVI nuove (bucket exercise-images): via le vecchie foto Free Exercise DB
-- caricate da GitHub. Gli esercizi senza immagine mostrano un segnaposto finché non
-- viene generata la nuova (gen_status resta 'pending').
update public.fitness_exercise_library set image_url = null where image_url like 'https://raw.githubusercontent.com/%';
update public.fitness_exercises set image_url = null where image_url like 'https://raw.githubusercontent.com/%';
