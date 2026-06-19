-- Reclassify jumps that were imported with action_type_id 300 as "BASE"
-- to their correct discipline "Hop & Pop".
-- Dekunu action type 300 is Hop & Pop, not BASE.

UPDATE public.jumps
SET discipline = 'Hop & Pop'
WHERE discipline = 'BASE'
  AND action_type_id = 300;
