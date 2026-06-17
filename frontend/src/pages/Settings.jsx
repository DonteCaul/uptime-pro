import React, { useEffect, useState } from 'react';
import { Moon, Sun, Wifi } from 'lucide-react';
import { useUnits, useTheme } from '../App';
import { api } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';

export default function Settings() {
  const { units, setUnits } = useUnits();
  const { theme, setTheme } = useTheme();
  const [dekunuCompat, setDekunuCompat] = useState(false);
  const [dekunuLoading, setDekunuLoading] = useState(true);

  useEffect(() => {
    api.getDekunuCompat()
      .then(r => setDekunuCompat(r.enabled))
      .catch(() => {})
      .finally(() => setDekunuLoading(false));
  }, []);

  async function toggleDekunuCompat(v) {
    setDekunuCompat(v);
    try {
      const r = await api.setDekunuCompat(v);
      setDekunuCompat(r.enabled);
    } catch {
      setDekunuCompat(!v);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground text-sm">Customize your experience</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === 'dark' ? <Moon size={16} className="text-muted-foreground" /> : <Sun size={16} className="text-muted-foreground" />}
              <div>
                <Label className="text-sm text-foreground">Dark mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {theme === 'dark' ? 'Using dark theme' : 'Using light theme'}
                </p>
              </div>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Device Sync</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between opacity-60">
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-foreground">Dekunu device sync</Label>
                  <span className="text-[10px] font-semibold bg-red-500 text-white rounded px-1.5 py-0.5 leading-none">Work in Progress</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Device sync disabled</p>
              </div>
            </div>
            <Switch checked={false} disabled />
          </div>
          {dekunuCompat && (
            <p className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
              Point <span className="font-mono text-foreground">api.dekunu.cloud</span> to this
              server via DNS. Devices will sync automatically over WiFi.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Display Units</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-foreground">Imperial units</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Feet · MPH · °F</p>
            </div>
            <Switch
              checked={units === 'imperial'}
              onCheckedChange={(v) => setUnits(v ? 'imperial' : 'metric')}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {units === 'imperial'
              ? 'Showing imperial — altitudes in ft, speeds in mph.'
              : 'Showing metric — altitudes in m, speeds in m/s.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
