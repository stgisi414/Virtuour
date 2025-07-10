
// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyCTSCuEWDCg5hlMIUra9Zl89dbz4_vSc7Y",
  authDomain: "virtuour.firebaseapp.com",
  projectId: "virtuour",
  storageBucket: "virtuour.firebasestorage.app",
  messagingSenderId: "857465062823",
  appId: "1:857465062823:web:d04524cc285193c7a76282",
  measurementId: "G-955N78GH31"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);

export default app;
