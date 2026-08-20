"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onIdTokenChanged, User as FirebaseUser } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { API_BASE } from "@/lib/api";

export interface Profile {
  id: string;
  shopId: string;
  role: "CUSTOMER" | "STAFF" | "OWNER" | "DELIVERY";
  name: string;
  email: string | null;
  isActive: boolean;
}

interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthState>({
  firebaseUser: null,
  profile: null,
  loading: true,
  error: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    firebaseUser: null,
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setState({ firebaseUser: null, profile: null, loading: false, error: null });
        return;
      }
      // Mark loading again as soon as we know a user exists, before the
      // /me round trip resolves — otherwise consumers briefly see
      // firebaseUser: null (from the previous state) and bounce to /login
      // during the window between sign-in and this fetch completing.
      setState((prev) => ({ ...prev, firebaseUser: user, loading: true, error: null }));
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error("Could not load your account profile.");
        }
        const profile: Profile = await res.json();
        setState({ firebaseUser: user, profile, loading: false, error: null });
      } catch (e) {
        setState({
          firebaseUser: user,
          profile: null,
          loading: false,
          error: (e as Error).message,
        });
      }
    });
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
