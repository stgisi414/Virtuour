
import { auth } from './firebase-config.js';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword 
} from 'firebase/auth';

class AuthService {
  constructor() {
    this.provider = new GoogleAuthProvider();
    this.currentUser = null;
    this.listeners = [];
    
    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      this.listeners.forEach(listener => listener(user));
    });
  }

  async signInWithGoogle() {
    try {
      const result = await signInWithPopup(auth, this.provider);
      return result.user;
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  }

  async signUpWithEmail(email, password) {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error) {
      console.error('Email sign-up error:', error);
      throw error;
    }
  }

  async signInWithEmail(email, password) {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error) {
      console.error('Email sign-in error:', error);
      throw error;
    }
  }

  async signOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out error:', error);
      throw error;
    }
  }

  onAuthStateChanged(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }
}

export default new AuthService();
