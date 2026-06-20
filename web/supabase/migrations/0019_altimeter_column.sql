-- Add altimeter preference column to profiles.
-- Stores the user's selected altimeter brand (e.g. "dekunu").
ALTER TABLE app.profiles
  ADD COLUMN IF NOT EXISTS altimeter text DEFAULT 'none';
