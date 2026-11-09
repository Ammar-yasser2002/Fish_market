/**
 * firebaseConfig.ts
 * تهيئة Firebase App ومزودي الخدمات (Auth + Firestore)
 * Project: ain-bamabed-fish-auction
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  Auth,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  setPersistence,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
const firebaseConfig = {
  apiKey: 'AIzaSyD-gEN9bNJeCUVUxfdiCz0W_uVn9Tiu8lE',
  authDomain: 'ain-bamabed-fish-auction.firebaseapp.com',
  projectId: 'ain-bamabed-fish-auction',
  storageBucket: 'ain-bamabed-fish-auction.firebasestorage.app',
  messagingSenderId: '952279984537',
  appId: '1:952279984537:web:b217185ae3b9162fe24b08',
  measurementId: 'G-CFPM3KNX5V',
};

// Use a named app so an old/default AI Studio Firebase app cannot be reused.
const firebaseApp: FirebaseApp =
  getApps().find((app) => app.name === 'desktop') ?? initializeApp(firebaseConfig, 'desktop');

// مزود المصادقة — تفعيل الاستمرارية المحلية لحفظ الجلسة تلقائياً
// Explicit IndexedDB/popup setup avoids the Electron sessionStorage OAuth error.
export const auth: Auth = initializeAuth(firebaseApp, {
  persistence: indexedDBLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

// ضبط استمرارية الجلسة محلياً (المستخدم يبقى مسجلاً حتى بعد إغلاق التطبيق)
setPersistence(auth, indexedDBLocalPersistence).catch((err) => {
  console.warn('[Firebase] Failed to set auth persistence:', err);
});

// Firestore لمزامنة البيانات
export const db: Firestore = getFirestore(firebaseApp);

export default firebaseApp;
