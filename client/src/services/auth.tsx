import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import type { User } from '../types';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { disconnectSocket } from './socket';

interface Session {
  token: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function homePathFor(user: User) {
  return user.role === 'admin' ? '/dashboard' : '/social';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    disconnectSocket();
    setUser(null);
  }, []);

  // On load, ask the server if the stored token is still valid.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<{ user: User }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  const startSession = ({ token, user }: Session) => {
    disconnectSocket(); // a new socket joins the rooms for the new role
    setToken(token);
    setUser(user);
    return user;
  };

  const login = async (email: string, password: string) =>
    startSession(await api<Session>('/auth/login', { method: 'POST', body: { email, password } }));

  const register = async (name: string, email: string, password: string) =>
    startSession(await api<Session>('/auth/register', { method: 'POST', body: { name, email, password } }));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
