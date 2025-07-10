
// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

console.log('🔥 FIREBASE CONFIG: Starting Firebase configuration...');

const firebaseConfig = {
  apiKey: "AIzaSyCTSCuEWDCg5hlMIUra9Zl89dbz4_vSc7Y",
  authDomain: "virtuour.firebaseapp.com",
  projectId: "virtuour",
  storageBucket: "virtuour.firebasestorage.app",
  messagingSenderId: "857465062823",
  appId: "1:857465062823:web:d04524cc285193c7a76282",
  measurementId: "G-955N78GH31"
};

console.log('🔥 FIREBASE CONFIG: Config object created:', firebaseConfig);

// Initialize Firebase
console.log('🔥 FIREBASE CONFIG: Initializing Firebase app...');
const app = initializeApp(firebaseConfig);
console.log('🔥 FIREBASE CONFIG: Firebase app initialized:', app);

// Initialize Firebase services
console.log('🔥 FIREBASE CONFIG: Initializing Auth...');
export const auth = getAuth(app);
console.log('🔥 FIREBASE CONFIG: Auth initialized:', auth);

console.log('🔥 FIREBASE CONFIG: Initializing Firestore...');
export const db = getFirestore(app);
console.log('🔥 FIREBASE CONFIG: Firestore initialized:', db);

console.log('🔥 FIREBASE CONFIG: Initializing Storage...');
export const storage = getStorage(app);
console.log('🔥 FIREBASE CONFIG: Storage initialized:', storage);

// Initialize analytics only if supported
let analytics = null;
try {
  console.log('🔥 FIREBASE CONFIG: Attempting to initialize Analytics...');
  analytics = getAnalytics(app);
  console.log('🔥 FIREBASE CONFIG: Analytics initialized successfully:', analytics);
} catch (error) {
  console.log('🔥 FIREBASE CONFIG: Analytics not available:', error);
}

// Export Firebase Auth functions
export { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword 
} from 'firebase/auth';

// Export Firestore functions
export { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  Timestamp
} from 'firebase/firestore';

console.log('🔥 FIREBASE CONFIG: All Firebase services initialized successfully');

export { analytics };
export default app;
