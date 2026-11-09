/**
 * authService.ts
 * طبقة إدارة المصادقة — AuthService
 * يوفر: تسجيل دخول، إنشاء حساب، تسجيل خروج، مراقبة الجلسة
 * مع ترجمة أخطاء Firebase إلى رسائل عربية واضحة
 */

import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  updateEmail as firebaseUpdateEmail,
  verifyBeforeUpdateEmail,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  UserCredential,
  Unsubscribe,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';

// ─────────────────────────────────────────────
// ترجمة أكواد خطأ Firebase → رسائل عربية
// ─────────────────────────────────────────────
const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/user-not-found': 'المستخدم غير موجود، تحقق من البريد الإلكتروني',
  'auth/wrong-password': 'كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى',
  'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'auth/email-already-in-use': 'هذا البريد الإلكتروني مستخدم مسبقاً، جرب تسجيل الدخول',
  'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
  'auth/weak-password': 'كلمة المرور ضعيفة جداً، يجب أن تكون 6 أحرف على الأقل',
  'auth/network-request-failed': 'فشل الاتصال بالشبكة، تحقق من الإنترنت وأعد المحاولة',
  'auth/too-many-requests': 'محاولات كثيرة متكررة، يرجى الانتظار قليلاً قبل المحاولة مجدداً',
  'auth/user-disabled': 'هذا الحساب موقوف، يرجى التواصل مع المسؤول',
  'auth/popup-closed-by-user': 'تم إغلاق نافذة تسجيل الدخول من Google قبل إتمام العملية',
  'auth/cancelled-popup-request': 'تم إلغاء طلب تسجيل الدخول، يرجى المحاولة مرة أخرى',
  'auth/popup-blocked': 'تم حظر النافذة المنبثقة من قِبل المتصفح، يرجى السماح بالنوافذ المنبثقة',
  'auth/unauthorized-domain': 'هذا النطاق غير مصرح به في Firebase Console. يرجى التأكد من إضافة localhost إلى النطاقات المصرح بها',
  'auth/operation-not-allowed': 'تسجيل الدخول عبر Google أو البريد غير مفعّل في Firebase Console',
  'auth/account-exists-with-different-credential':
    'يوجد حساب بهذا البريد بطريقة دخول مختلفة',
  'auth/credential-already-in-use': 'بيانات الاعتماد هذه مرتبطة بالفعل بحساب آخر',
  'auth/missing-password': 'يرجى إدخال كلمة المرور',
  'auth/missing-email': 'يرجى إدخال البريد الإلكتروني',
};

/**
 * يحوّل خطأ Firebase إلى رسالة عربية مفهومة
 */
export function getArabicErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    return FIREBASE_ERROR_MESSAGES[code] ?? 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى';
}

// ─────────────────────────────────────────────
// AuthService Class
// ─────────────────────────────────────────────
class AuthService {
  /**
   * تسجيل الدخول بالبريد وكلمة المرور
   * @throws رسالة خطأ عربية عند الفشل
   */
  async signIn(email: string, password: string): Promise<UserCredential> {
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      return credential;
    } catch (error) {
      throw new Error(getArabicErrorMessage(error));
    }
  }

  async signInWithGoogle(): Promise<UserCredential> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return await signInWithPopup(auth, provider);
    } catch (error) {
      throw new Error(getArabicErrorMessage(error));
    }
  }

  /**
   * إنشاء حساب جديد بالبريد وكلمة المرور
   * @throws رسالة خطأ عربية عند الفشل
   */
  async register(email: string, password: string, displayName?: string): Promise<UserCredential> {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // تحديث اسم العرض إن وُجد
      if (displayName && credential.user) {
        await updateProfile(credential.user, { displayName: displayName.trim() });
      }
      return credential;
    } catch (error) {
      throw new Error(getArabicErrorMessage(error));
    }
  }

  /**
   * تسجيل الخروج
   */
  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      throw new Error(getArabicErrorMessage(error));
    }
  }

  /**
   * جلب المستخدم الحالي المسجل دخوله
   */
  getCurrentUser(): User | null {
    return auth.currentUser;
  }

  /**
   * جلب معرّف المستخدم (UID) لمزامنة البيانات تحت مسار: users/{userId}/
   */
  getCurrentUserId(): string | null {
    return auth.currentUser?.uid ?? null;
  }

  /**
   * مراقبة حالة الجلسة — يُطلق التابع عند كل تغيير (دخول / خروج)
   * @returns دالة إلغاء الاشتراك (Unsubscribe)
   */
  onAuthStateChanged(
    callback: (user: User | null) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe {
    return firebaseOnAuthStateChanged(auth, callback, onError);
  }

  /**
   * إعادة المصادقة — مطلوبة قبل تغيير البريد أو كلمة المرور
   */
  async reauthenticate(currentPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('لا يوجد مستخدم مسجّل حالياً');
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
    } catch (error) {
      throw new Error(getArabicErrorMessage(error));
    }
  }

  /**
   * تحديث البريد الإلكتروني — يتطلب إعادة المصادقة أولاً
   * يرسل بريد تحقق للعنوان الجديد قبل تطبيق التغيير
   */
  async updateEmail(newEmail: string, currentPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('لا يوجد مستخدم مسجّل حالياً');
    try {
      // إعادة مصادقة أولاً
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(user, credential);
      // إرسال بريد تحقق للعنوان الجديد
      await verifyBeforeUpdateEmail(user, newEmail.trim());
    } catch (error) {
      throw new Error(getArabicErrorMessage(error));
    }
  }

  /**
   * تحديث كلمة المرور — يتطلب إعادة المصادقة أولاً
   */
  async updatePassword(newPassword: string, currentPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('لا يوجد مستخدم مسجّل حالياً');
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await firebaseUpdatePassword(user, newPassword);
    } catch (error) {
      throw new Error(getArabicErrorMessage(error));
    }
  }
}

// تصدير نسخة واحدة (Singleton) من الخدمة
export const authService = new AuthService();
export type { User };
