import { createContext, useContext, useState } from 'react';

const AuthCtx = createContext();

/**
 * Read the session from localStorage SYNCHRONOUSLY on first render.
 * The old version loaded it inside a useEffect(), so on a direct URL open or
 * a refresh of e.g. /academic-vp/approved the first render had `user === null`
 * and ProtectedRoute immediately redirected to /login — the login effect then
 * ran too late and the user was thrown out of the portal they asked for.
 */
function readSession() {
  try {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (t && u) return { token: t, user: JSON.parse(u) };
  } catch { /* corrupted storage → treat as logged out */ }
  return { token: null, user: null };
}

export function AuthProvider({ children }) {
  const initial = readSession();
  const [user,  setUser]  = useState(initial.user);
  const [token, setToken] = useState(initial.token);

  const login = (t, u) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setToken(t); setUser(u);
  };
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null); setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);