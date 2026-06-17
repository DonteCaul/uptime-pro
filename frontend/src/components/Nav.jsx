import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlaneTakeoff, Upload, User, Settings, LogOut, Users } from 'lucide-react';
import { useAuth } from '../App';
import { cn } from '../lib/utils';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/jumps', label: 'Jumps', icon: PlaneTakeoff },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/social', label: 'Social', icon: Users },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <>
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-primary text-xl">⬡</span>
          <span className="font-bold text-foreground tracking-wide text-sm">UPTIME.PRO</span>
        </div>
        <span className="text-xs text-muted-foreground">{user?.full_name || `#${user?.uptime_user_id}`}</span>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex z-50 md:static md:border-t-0 md:border-b md:border-border">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center py-2.5 text-[10px] gap-1 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center py-2.5 text-[10px] gap-1 text-muted-foreground hover:text-destructive-foreground transition-colors"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Logout
        </button>
      </nav>

      <div className="h-16 md:h-0" />
    </>
  );
}
