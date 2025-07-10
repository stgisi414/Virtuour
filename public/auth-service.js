import { auth } from './firebase-config.js';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword 
} from './firebase-config.js';

console.log('🔑 AUTH SERVICE: Starting AuthService import...');
console.log('🔑 AUTH SERVICE: Auth object from firebase-config:', auth);

class AuthService {
  constructor() {
    console.log('🔑 AUTH SERVICE: AuthService constructor called');
    console.log('🔑 AUTH SERVICE: Creating GoogleAuthProvider...');
    this.provider = new GoogleAuthProvider();
    console.log('🔑 AUTH SERVICE: GoogleAuthProvider created:', this.provider);

    this.currentUser = null;
    this.listeners = [];

    console.log('🔑 AUTH SERVICE: AuthService initializing with auth object:', auth);

    // Listen for auth state changes
    console.log('🔑 AUTH SERVICE: Setting up onAuthStateChanged listener...');
    onAuthStateChanged(auth, (user) => {
      console.log('🔑 AUTH SERVICE: Auth state changed event fired:', user);
      this.currentUser = user;
      console.log('🔑 AUTH SERVICE: Current user set to:', this.currentUser);
      console.log('🔑 AUTH SERVICE: Notifying', this.listeners.length, 'listeners');
      this.listeners.forEach((listener, index) => {
        console.log('🔑 AUTH SERVICE: Calling listener', index);
        listener(user);
      });
    });
    console.log('🔑 AUTH SERVICE: AuthService constructor completed');
  }

  async signInWithGoogle() {
    console.log('🔑 AUTH SERVICE: signInWithGoogle called');
    try {
      console.log('🔑 AUTH SERVICE: Attempting signInWithPopup with auth:', auth, 'provider:', this.provider);
      const result = await signInWithPopup(auth, this.provider);
      console.log('🔑 AUTH SERVICE: signInWithPopup successful, result:', result);
      console.log('🔑 AUTH SERVICE: User object:', result.user);
      return result.user;
    } catch (error) {
      console.error('🔑 AUTH SERVICE: Google sign-in error:', error);
      console.error('🔑 AUTH SERVICE: Error code:', error.code);
      console.error('🔑 AUTH SERVICE: Error message:', error.message);
      throw error;
    }
  }

  async signUpWithEmail(email, password) {
    console.log('🔑 AUTH SERVICE: signUpWithEmail called with email:', email);
    try {
      console.log('🔑 AUTH SERVICE: Attempting createUserWithEmailAndPassword...');
      const result = await createUserWithEmailAndPassword(auth, email, password);
      console.log('🔑 AUTH SERVICE: Email sign-up successful, result:', result);
      return result.user;
    } catch (error) {
      console.error('🔑 AUTH SERVICE: Email sign-up error:', error);
      console.error('🔑 AUTH SERVICE: Error code:', error.code);
      console.error('🔑 AUTH SERVICE: Error message:', error.message);
      throw error;
    }
  }

  async signInWithEmail(email, password) {
    console.log('🔑 AUTH SERVICE: signInWithEmail called with email:', email);
    try {
      console.log('🔑 AUTH SERVICE: Attempting signInWithEmailAndPassword...');
      const result = await signInWithEmailAndPassword(auth, email, password);
      console.log('🔑 AUTH SERVICE: Email sign-in successful, result:', result);
      return result.user;
    } catch (error) {
      console.error('🔑 AUTH SERVICE: Email sign-in error:', error);
      console.error('🔑 AUTH SERVICE: Error code:', error.code);
      console.error('🔑 AUTH SERVICE: Error message:', error.message);
      throw error;
    }
  }

  async signOut() {
    console.log('🔑 AUTH SERVICE: signOut called');
    try {
      console.log('🔑 AUTH SERVICE: Attempting signOut...');
      await signOut(auth);
      console.log('🔑 AUTH SERVICE: Sign out successful');
    } catch (error) {
      console.error('🔑 AUTH SERVICE: Sign-out error:', error);
      console.error('🔑 AUTH SERVICE: Error code:', error.code);
      console.error('🔑 AUTH SERVICE: Error message:', error.message);
      throw error;
    }
  }

  onAuthStateChanged(callback) {
    console.log('🔑 AUTH SERVICE: onAuthStateChanged called, adding listener');
    console.log('🔑 AUTH SERVICE: Current listeners count:', this.listeners.length);
    this.listeners.push(callback);
    console.log('🔑 AUTH SERVICE: New listeners count:', this.listeners.length);
    return () => {
      console.log('🔑 AUTH SERVICE: Removing auth state listener');
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  getCurrentUser() {
    console.log('🔑 AUTH SERVICE: getCurrentUser called, returning:', this.currentUser);
    return this.currentUser;
  }

  isAuthenticated() {
    const authenticated = !!this.currentUser;
    console.log('🔑 AUTH SERVICE: isAuthenticated called, returning:', authenticated);
    return authenticated;
  }
}

console.log('🔑 AUTH SERVICE: Creating AuthService instance...');
const authServiceInstance = new AuthService();
console.log('🔑 AUTH SERVICE: AuthService instance created:', authServiceInstance);
console.log('🔑 AUTH SERVICE: Exporting AuthService instance');

export default authServiceInstance;