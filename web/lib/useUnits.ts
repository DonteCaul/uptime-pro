"use client";

import { useState, useEffect } from "react";
import type { UnitSystem } from "@/lib/units";

/**
 * React hook that returns the user's live unit preference.
 *
 * Reads from localStorage (key `uptime-units`) so the value is always
 * current even when Next.js serves a stale server-component render from the
 * Router Cache. Falls back to the server-provided default (usually "metric").
 */
export function useUnits(serverDefault: UnitSystem): UnitSystem {
  const [units, setUnits] = useState<UnitSystem>(serverDefault);

  useEffect(() => {
    const stored = localStorage.getItem("uptime-units") as UnitSystem | null;
    if (stored === "metric" || stored === "imperial") {
      setUnits(stored);
    }
  }, []);

  // Re-sync whenever localStorage changes (e.g. another tab updates it).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "uptime-units") {
        const next = e.newValue as UnitSystem | null;
        if (next === "metric" || next === "imperial") setUnits(next);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return units;
}
