
// Firebase configuration
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

import {
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
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

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
const app = window.firebase.initializeApp(firebaseConfig);
console.log('🔥 FIREBASE CONFIG: Firebase app initialized:', app);

// Initialize Firebase services
console.log('🔥 FIREBASE CONFIG: Initializing Auth...');
export const auth = window.firebase.getAuth(app);
console.log('🔥 FIREBASE CONFIG: Auth initialized:', auth);

console.log('🔥 FIREBASE CONFIG: Initializing Firestore...');
export const db = window.firebase.getFirestore(app);
console.log('🔥 FIREBASE CONFIG: Firestore initialized:', db);

console.log('🔥 FIREBASE CONFIG: Initializing Storage...');
export const storage = window.firebase.getStorage(app);
console.log('🔥 FIREBASE CONFIG: Storage initialized:', storage);

// Export Firebase functions for use in other modules
export {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
};

console.log('🔥 FIREBASE CONFIG: All Firebase services initialized successfully');

export default app;
