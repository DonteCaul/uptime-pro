import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../App';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Separator } from '../components/ui/separator';
import { Switch } from '../components/ui/switch';

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const packed = new Date(dateStr);
  const due = new Date(packed.getTime() + 180 * 24 * 60 * 60 * 1000);
  const diff = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
  return diff;
}

function ReserveCountdown({ date }) {
  if (!date) return null;
  const days = daysUntil(date);
  const color = days == null ? '' : days < 0 ? 'text-destructive-foreground' : days < 30 ? 'text-yellow-500' : 'text-green-500';
  const label = days == null ? '' : days < 0 ? `Overdue by ${Math.abs(days)} days` : days === 0 ? 'Due today' : `${days} days remaining`;
  return (
    <p className={`text-xs font-medium mt-1 ${color}`}>{label}</p>
  );
}

export default function Profile() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [homeDzAddress, setHomeDzAddress] = useState('');
  const [resolvedDz, setResolvedDz] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    api.me().then((u) => {
      setProfile(u);
      if (u.home_dz) setResolvedDz(u.home_dz);
      setForm({
        full_name:           u.full_name           || '',
        email:               u.email               || '',
        password:            '',
        next_jump_number:    u.next_jump_number     || '',
        bio:                 u.bio                  || '',
        uspa_license:        u.uspa_license         || '',
        uspa_member_number:  u.uspa_member_number   || '',
        burble_name:         u.burble_name          || '',
        ratings:             u.ratings              || '',
        canopy_size:         u.canopy_size          || '',
        wing_load:           u.wing_load            || '',
        rig_type:            u.rig_type             || '',
        canopy_type:         u.canopy_type          || '',
        reserve_repack_date: u.reserve_repack_date ? u.reserve_repack_date.slice(0, 10) : '',
        is_public:           u.is_public            ?? false,
      });
    });
    api.devices().then(setDevices).catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target?.value ?? e }));

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function resolveHomeDz(address) {
    if (!address.trim()) return null;
    const mbToken = import.meta.env.VITE_MAPBOX_TOKEN;

    // 1. Geocode the address with Mapbox
    const mbRes = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mbToken}&limit=1`
    );
    const mbData = await mbRes.json();
    const center = mbData?.features?.[0]?.center;
    if (!center) return null;
    const [lon, lat] = center;

    // 2. Search Google Places (New) via backend proxy for DZs within 10 miles
    // Use the first result — Google ranks by relevance + proximity already
    try {
      const places = await api.placesNearby(lat, lon, 16093);
      if (places.length > 0) {
        const first = places[0];
        return { lat: first.lat, lon: first.lon, dz: first };
      }
    } catch {}

    return { lat, lon, dz: null };
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    const body = {};
    const str = (k) => { if (form[k] !== '') body[k] = form[k]; };
    ['full_name','email','bio','uspa_license','uspa_member_number',
     'burble_name','ratings','rig_type','canopy_type'].forEach(str);
    if (form.password)            body.password            = form.password;
    if (form.next_jump_number)    body.next_jump_number    = Number(form.next_jump_number);
    if (form.canopy_size)         body.canopy_size         = Number(form.canopy_size);
    if (form.wing_load)           body.wing_load           = parseFloat(form.wing_load);
    if (form.reserve_repack_date) body.reserve_repack_date = form.reserve_repack_date;
    body.is_public = form.is_public;

    // resolve home DZ from address
    if (homeDzAddress.trim()) {
      const result = await resolveHomeDz(homeDzAddress);
      if (result) {
        const name = result.dz ? result.dz.name : homeDzAddress;
        const pinLat = result.dz ? result.dz.lat : result.lat;
        const pinLon = result.dz ? result.dz.lon : result.lon;
        body.home_dz = name;
        body.home_dz_lat = pinLat;
        body.home_dz_lon = pinLon;
        setResolvedDz(name);
      }
    }

    const updated = await api.updateMe(body);
    setProfile(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    const res = await api.uploadAvatar(file);
    if (res.avatar_path) setProfile((p) => ({ ...p, avatar_path: res.avatar_path }));
    setAvatarUploading(false);
  }

  return (
    <div className="flex flex-col gap-5 pb-4 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Profile</h2>

      {/* Avatar + name card */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-4">
          <div className="relative">
            {profile?.avatar_path ? (
              <img
                src={profile.avatar_path}
                alt="avatar"
                className="w-16 h-16 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-primary text-2xl font-bold">
                {(user?.full_name || 'U')[0].toUpperCase()}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-0 right-0 bg-card border border-border rounded-full p-1 hover:bg-accent transition-colors"
            >
              <Camera size={12} className="text-muted-foreground" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </div>
          <div>
            <p className="font-semibold text-foreground">{user?.full_name || 'Jumper'}</p>
            <p className="text-xs text-muted-foreground">UpTime.Pro ID #{user?.uptime_user_id}</p>
            {avatarUploading && <p className="text-xs text-muted-foreground mt-0.5">Uploading…</p>}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSave} className="flex flex-col gap-5">

        {/* Basic info */}
        <Card>
          <CardHeader><CardTitle>Basic Info</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {[
              { label: 'Full Name',        key: 'full_name',        type: 'text' },
              { label: 'Email',            key: 'email',            type: 'email' },
              { label: 'New Password',     key: 'password',         type: 'password', placeholder: 'Leave blank to keep current' },
              { label: 'Next Jump Number', key: 'next_jump_number', type: 'number' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input id={key} type={type} value={form[key] ?? ''} onChange={set(key)} placeholder={placeholder} />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={form.bio ?? ''}
                onChange={set('bio')}
                placeholder="Tell the community about yourself…"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is_public">Public Profile</Label>
                <p className="text-xs text-muted-foreground">Appear on leaderboards and the home DZ map</p>
              </div>
              <Switch
                id="is_public"
                checked={!!form.is_public}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_public: v }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Home DZ */}
        <Card>
          <CardHeader><CardTitle>Home Dropzone</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="home_dz_address">Address or Location</Label>
              <Input
                id="home_dz_address"
                value={homeDzAddress}
                onChange={(e) => setHomeDzAddress(e.target.value)}
                placeholder="e.g. 4241 Skydive Ln, Zephyrhills FL"
              />
              <p className="text-xs text-muted-foreground">
                We'll find the nearest dropzone within 10 miles and pin it on the map.
              </p>
            </div>
            {resolvedDz && (
              <div className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
                <span className="text-xs text-primary font-medium">📍 {resolvedDz}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gear */}
        <Card>
          <CardHeader><CardTitle>Gear &amp; Credentials</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {[
              { label: 'USPA License',       key: 'uspa_license',       placeholder: 'A-12345' },
              { label: 'USPA Member Number', key: 'uspa_member_number', placeholder: '123456' },
              { label: 'Burble Name',        key: 'burble_name',        placeholder: 'Name used in Burble' },
              { label: 'Ratings',            key: 'ratings',            placeholder: 'e.g. Coach, AFF-I, Tandem' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input id={key} value={form[key] ?? ''} onChange={set(key)} placeholder={placeholder} />
              </div>
            ))}

            <Separator />

            {[
              { label: 'Canopy Size (sq ft)', key: 'canopy_size', type: 'number', placeholder: '170' },
              { label: 'Wing Load (lb/sq ft)', key: 'wing_load',  type: 'number', placeholder: '1.2', step: '0.01' },
              { label: 'Rig Type',            key: 'rig_type',   placeholder: 'e.g. Javelin Odyssey' },
              { label: 'Canopy Type',         key: 'canopy_type', placeholder: 'e.g. Pilot 168' },
            ].map(({ label, key, type = 'text', placeholder, step }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type={type}
                  value={form[key] ?? ''}
                  onChange={set(key)}
                  placeholder={placeholder}
                  step={step}
                />
              </div>
            ))}

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="reserve_repack_date">Reserve Repack Date</Label>
              <Input
                id="reserve_repack_date"
                type="date"
                value={form.reserve_repack_date ?? ''}
                onChange={set('reserve_repack_date')}
              />
              <ReserveCountdown date={form.reserve_repack_date} />
              {form.reserve_repack_date && (
                <p className="text-[10px] text-muted-foreground">
                  Due:{' '}
                  {new Date(new Date(form.reserve_repack_date).getTime() + 180 * 86400000).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>

      {/* Devices */}
      {devices.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Devices</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {devices.map((d, i) => (
              <div key={d.id}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex justify-between py-1">
                  <div>
                    <p className="text-sm text-foreground">{d.device_type || `Device #${d.device_id}`}</p>
                    <p className="text-xs text-muted-foreground">{d.jump_count} jumps recorded</p>
                  </div>
                  <p className="text-xs text-muted-foreground self-center">
                    {d.last_seen_at ? new Date(d.last_seen_at).toLocaleDateString() : ''}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        variant="ghost"
        onClick={() => { logout(); navigate('/login'); }}
        className="text-destructive-foreground hover:text-destructive-foreground hover:bg-destructive/20"
      >
        Sign Out
      </Button>
    </div>
  );
}
