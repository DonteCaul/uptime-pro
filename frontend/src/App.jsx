import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Jumps from './pages/Jumps';
import JumpDetail from './pages/JumpDetail';
import Upload from './pages/Upload';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Social from './pages/Social';
import Nav from './components/Nav';

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

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
    <UnitsContext.Provider value={{ units, setUnits: setAndSaveUnits }}>
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <BrowserRouter>
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
      </BrowserRouter>
    </ThemeContext.Provider>
    </UnitsContext.Provider>
    </AuthContext.Provider>
  );
}
