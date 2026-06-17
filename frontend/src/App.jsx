import React, { createContext, useContext, useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Nav from './components/Nav';

const Login     = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Jumps     = lazy(() => import('./pages/Jumps'));
const JumpDetail = lazy(() => import('./pages/JumpDetail'));
const Upload    = lazy(() => import('./pages/Upload'));
const Profile   = lazy(() => import('./pages/Profile'));
const Settings  = lazy(() => import('./pages/Settings'));
const Social    = lazy(() => import('./pages/Social'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const AuthContext = createContext(null);
export const UnitsContext = createContext('metric');
export const ThemeContext = createContext('dark');

export function useAuth()  { return useContext(AuthContext); }
export function useUnits() { return useContext(UnitsContext); }
export function useTheme() { return useContext(ThemeContext); }

function RequireAuth({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

// Layout: full-width for JumpDetail, constrained for everything else
function AppLayout() {
  const location = useLocation();
  const isJumpDetail = /^\/jumps\/\d+/.test(location.pathname);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      {isJumpDetail ? (
        <Outlet />
      ) : (
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6">
          <Outlet />
        </main>
      )}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [units, setUnits] = useState(() => localStorage.getItem('units') || 'metric');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  function setAndSaveUnits(u) {
    localStorage.setItem('units', u);
    setUnits(u);
  }

  function login(tok, usr) {
    localStorage.setItem('token', tok);
    localStorage.setItem('user', JSON.stringify(usr));
    setToken(tok);
    setUser(usr);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }

  const suspenseFallback = (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400" />
    </div>
  );

  return (
    <QueryClientProvider client={queryClient}>
    <AuthContext.Provider value={{ token, user, login, logout }}>
    <UnitsContext.Provider value={{ units, setUnits: setAndSaveUnits }}>
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <BrowserRouter>
        <Suspense fallback={suspenseFallback}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/"          element={<Dashboard />} />
              <Route path="/jumps"     element={<Jumps />} />
              <Route path="/jumps/:id" element={<JumpDetail />} />
              <Route path="/upload"    element={<Upload />} />
              <Route path="/social"    element={<Social />} />
              <Route path="/profile"   element={<Profile />} />
              <Route path="/settings"  element={<Settings />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeContext.Provider>
    </UnitsContext.Provider>
    </AuthContext.Provider>
    </QueryClientProvider>
  );
}
