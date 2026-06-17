"use client";

import { useState, useTransition, useEffect } from "react";
import { Moon, Sun, Wifi } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updatePreferences } from "@/lib/actions/profile";

export function SettingsClient({
  initialUnits,
  initialTheme,
}: {
  initialUnits: "metric" | "imperial";
  initialTheme: "light" | "dark";
}) {
  // Start from the server-provided values (authoritative — from the DB), then
  // sync localStorage for instant theme application on future loads.
  const [units, setUnits] = useState<"metric" | "imperial">(initialUnits);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [, startTransition] = useTransition();

  // Sync theme to the DOM + localStorage immediately (prevents flash).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("uptime-theme", theme);
  }, [theme]);

  // Keep localStorage units in sync (read by pages before hydration).
  useEffect(() => {
    localStorage.setItem("uptime-units", units);
  }, [units]);

  function persistTheme(next: "light" | "dark") {
    setTheme(next);
    startTransition(() => {
      void updatePreferences({ theme: next });
    });
  }

  function persistUnits(next: "metric" | "imperial") {
    setUnits(next);
    startTransition(() => {
      void updatePreferences({ units: next });
    });
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground text-sm">
          Customize your experience
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === "dark" ? (
                <Moon size={16} className="text-muted-foreground" />
              ) : (
                <Sun size={16} className="text-muted-foreground" />
              )}
              <div>
                <Label className="text-sm text-foreground">Dark mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {theme === "dark" ? "Using dark theme" : "Using light theme"}
                </p>
              </div>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(v) => persistTheme(v ? "dark" : "light")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Display units */}
      <Card>
        <CardHeader>
          <CardTitle>Display Units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-foreground">Imperial units</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Feet · MPH · °F
              </p>
            </div>
            <Switch
              checked={units === "imperial"}
              onCheckedChange={(v) => persistUnits(v ? "imperial" : "metric")}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {units === "imperial"
              ? "Showing imperial — altitudes in ft, speeds in mph."
              : "Showing metric — altitudes in m, speeds in m/s."}
          </p>
        </CardContent>
      </Card>

      {/* Device sync (Phase 3 — disabled for now) */}
      <Card>
        <CardHeader>
          <CardTitle>Device Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between opacity-60">
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-foreground">
                    Dekunu device sync
                  </Label>
                  <span className="text-[10px] font-semibold bg-red-500 text-white rounded px-1.5 py-0.5 leading-none">
                    Needs Device
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set DEKUNU_COMPAT=true to enable
                </p>
              </div>
            </div>
            <Switch checked={false} disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
