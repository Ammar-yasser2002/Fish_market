/**
 * AuthContext.tsx
 * React Context لإدارة حالة المصادقة في كامل التطبيق
 * يوفر: user, userId, isLoading, isAuthenticated, signIn, register, signOut
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { User, UserCredential } from 'firebase/auth';
import { authService } from '../services/authService';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface AuthContextValue {
  /** المستخدم الحالي (null إن لم يكن مسجلاً) */
  user: User | null;
  /** معرّف المستخدم للمزامنة: users/{userId}/ */
  userId: string | null;
  /** جاري التحقق من حالة الجلسة عند أول تحميل */
  isLoading: boolean;
  /** هل المستخدم مسجل دخوله؟ */
  isAuthenticated: boolean;
  /** تسجيل الدخول — يُرمي رسالة خطأ عربية عند الفشل */
  signIn: (email: string, password: string) => Promise<UserCredential>;
  signInWithGoogle: () => Promise<UserCredential>;
  /** إنشاء حساب جديد */
  register: (email: string, password: string, displayName?: string) => Promise<UserCredential>;
  /** تسجيل الخروج */
  signOut: () => Promise<void>;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // مراقبة حالة المصادقة عند أول تحميل
  useEffect(() => {
    let settled = false;
    const finishLoading = (firebaseUser: User | null) => {
      settled = true;
      setUser(firebaseUser);
      setIsLoading(false);
    };
    const unsubscribe = authService.onAuthStateChanged(
      finishLoading,
      () => {
        settled = true;
        setUser(null);
        setIsLoading(false);
      },
    );
    const timeout = window.setTimeout(() => {
      if (!settled) {
        setUser(null);
        setIsLoading(false);
      }
    }, 8000);
    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const cred = await authService.signIn(email, password);
    if (cred.user) setUser(cred.user);
    return cred;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const cred = await authService.signInWithGoogle();
    if (cred.user) setUser(cred.user);
    return cred;
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const cred = await authService.register(email, password, displayName);
      if (cred.user) setUser(cred.user);
      return cred;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authService.signOut();
    // مسح أي بيانات جلسة محلية مرتبطة
    sessionStorage.removeItem('system_authenticated');
    sessionStorage.removeItem('splash_shown');
  }, []);

  const value: AuthContextValue = {
    user,
    userId: user?.uid ?? null,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signInWithGoogle,
    register,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth يجب استخدامه داخل AuthProvider');
  }
  return ctx;
}

export default AuthContext;
