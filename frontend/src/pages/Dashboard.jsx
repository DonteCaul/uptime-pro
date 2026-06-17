import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { api } from '../api';
import { useAuth, useUnits } from '../App';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import StatCard from '../components/StatCard';
import * as U from '../units';

function fmtDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { units } = useUnits();
  const [stats, setStats] = useState(null);
  const [recentJumps, setRecentJumps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.stats(), api.jumps(5, 0)]).then(([s, j]) => {
      setStats(s);
      setRecentJumps(j.jumps || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-muted-foreground py-20">Loading…</div>;

  return (
    <div className="flex flex-col gap-6 pb-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Hey, {user?.full_name?.split(' ')[0] || 'Jumper'}
        </h2>
        <p className="text-muted-foreground text-sm">Here's your jump summary</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Jumps" value={stats?.total_jumps ?? '0'} />
        <Link to={stats?.highest_exit_jump_id ? `/jumps/${stats.highest_exit_jump_id}` : '#'}>
          <StatCard label="Highest Exit" value={U.alt(stats?.highest_exit_m, units)} linkable />
        </Link>
        <Link to={stats?.fastest_freefall_jump_id ? `/jumps/${stats.fastest_freefall_jump_id}` : '#'}>
          <StatCard label="Fastest Freefall" value={U.speed(stats?.fastest_freefall_ms, units)} linkable />
        </Link>
        <StatCard label="Total Freefall" value={fmtDuration(stats?.total_freefall_s)} />
      </div>

      {recentJumps.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Recent Jumps</h3>
            <Link to="/jumps" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              {recentJumps.map((j, i) => (
                <Link
                  key={j.id}
                  to={`/jumps/${j.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0 first:rounded-t-lg last:rounded-b-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {j.jumped_at ? new Date(j.jumped_at).toLocaleDateString() : j.filename}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {j.exit_altitude_m ? `Exit ${U.alt(j.exit_altitude_m, units)}` : 'No altitude data'}
                      {j.freefall_duration_s ? ` · ${fmtDuration(j.freefall_duration_s)} FF` : ''}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {(!stats?.total_jumps || stats.total_jumps === '0') && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 gap-3">
            <p className="text-muted-foreground text-sm">No jumps yet</p>
            <Button asChild size="sm">
              <Link to="/upload">Upload your first logs</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
