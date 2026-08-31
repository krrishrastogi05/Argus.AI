import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, Loader2 } from 'lucide-react';

import { homePathFor, useAuth } from '../services/auth';

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const signedIn = mode === 'login' ? await login(email, password) : await register(name, email, password);
      navigate(homePathFor(signedIn), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white focus:border-cyan-500 outline-none';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4 shadow-2xl">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
          <Eye className="text-cyan-500 w-7 h-7" /> ARGUS<span className="text-cyan-500">.AI</span>
        </Link>
        <p className="text-xs text-slate-500 font-mono">
          {mode === 'login' ? 'SIGN IN TO CONTINUE' : 'CREATE A CITIZEN ACCOUNT'}
        </p>

        {mode === 'register' && (
          <label className="block space-y-1">
            <span className="text-xs font-bold text-slate-400">NAME</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-400">EMAIL</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-400">PASSWORD</span>
          <input
            className={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold py-3 rounded flex items-center justify-center gap-2 transition"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          className="w-full text-xs text-slate-400 hover:text-cyan-400 transition"
        >
          {mode === 'login' ? 'New here? Create a citizen account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
