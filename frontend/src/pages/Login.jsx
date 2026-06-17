import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { cn } from '../lib/utils';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await api.login(Number(userId), password)
        : await api.register(Number(userId), name, password);
      login(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-card border border-border mb-4">
            <span className="text-3xl text-primary">⬡</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">UpTime.Pro</h1>
          <p className="text-muted-foreground text-sm mt-1">Your personal jump logbook</p>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <div className="flex bg-muted rounded-md p-1 gap-1">
              {['login', 'register'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 py-1.5 rounded text-sm font-medium transition-colors',
                    mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="userId">UpTime.Pro User ID</Label>
                <Input
                  id="userId"
                  type="number"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                  placeholder="e.g. 469"
                />
              </div>

              {mode === 'register' && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Donte Caul"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-destructive-foreground text-sm bg-destructive/20 border border-destructive/30 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
