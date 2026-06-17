const express = require('express');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const GOOGLE_KEY = () => process.env.GOOGLE_PLACES_KEY;

// POST /places/nearby
// body: { lat, lon, radiusMeters?, queries? }
// Returns array of { name, lat, lon }
router.post('/nearby', requireAuth, async (req, res) => {
  const { lat, lon, radiusMeters = 16093 } = req.body; // default 10 miles
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

  const key = GOOGLE_KEY();
  if (!key) return res.status(500).json({ error: 'Google Places key not configured' });

  // Run queries sequentially so results stay ordered by relevance (skydiving first)
  const queries = ['skydiving', 'parachute center', 'skydive'];
  const seen = new Set();
  const results = [];

  for (const q of queries) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
        },
        body: JSON.stringify({
          textQuery: q,
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: radiusMeters,
            },
          },
          maxResultCount: 10,
        }),
      });
      const data = await response.json();
      for (const place of data.places || []) {
        if (seen.has(place.id)) continue;
        seen.add(place.id);
        results.push({
          name: place.displayName?.text || 'Unknown DZ',
          lat: place.location.latitude,
          lon: place.location.longitude,
        });
      }
    } catch (err) {
      console.error('Places API error:', err.message);
    }
  }

  res.json(results);
});

module.exports = router;
