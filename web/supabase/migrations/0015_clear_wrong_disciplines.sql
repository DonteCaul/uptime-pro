-- Clear wrong disciplines from existing jumps.
-- The old code mapped 240 → 'Belly / RW' and 300 → 'BASE' from the filename's
-- sample rate field. These were wrong — 240 and 300 are Hz sample rates, not
-- discipline IDs. Discipline is only known from the summary JSON's disciplineTypeId.
-- Clear all disciplines that came from the old filename-based mapping.
UPDATE public.jumps
SET discipline = NULL
WHERE discipline IN ('Belly / RW', 'BASE', 'Hop & Pop');
