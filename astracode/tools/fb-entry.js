// ค่า web config ของ Firebase เป็นข้อมูลสาธารณะ (ไม่ใช่ความลับ); ความปลอดภัยอยู่ที่ server ที่ตรวจ ID token
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, reload } from 'firebase/auth';
const auth = getAuth(initializeApp({
  apiKey: 'AIzaSyBDiG6Y7fhI-pPkucmAtTNZaZ5rgLIdxOM',
  authDomain: 'astra-892a8.firebaseapp.com',
  projectId: 'astra-892a8',
  storageBucket: 'astra-892a8.firebasestorage.app',
  messagingSenderId: '889010905283',
  appId: '1:889010905283:web:48f81fd28f7effa02d4276',
}));
auth.languageCode = 'th';
const google = new GoogleAuthProvider(); google.setCustomParameters({ prompt: 'select_account' });
window.FB = {
  auth,
  login: (e, p) => signInWithEmailAndPassword(auth, e, p).then(r => r.user),
  register: (e, p) => createUserWithEmailAndPassword(auth, e, p).then(r => r.user),
  verify: u => sendEmailVerification(u, { url: location.origin + '/login' }),
  reset: e => sendPasswordResetEmail(auth, e, { url: location.origin + '/login' }),
  google: () => signInWithPopup(auth, google).then(r => r.user).catch(e => { // popup ถูกบล็อก (บางเบราว์เซอร์มือถือ) → redirect แทน
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, google).then(() => null);
    throw e;
  }),
  redirected: () => getRedirectResult(auth).then(r => r?.user || null),
  reload: u => reload(u).then(() => auth.currentUser),
  out: () => signOut(auth),
};
