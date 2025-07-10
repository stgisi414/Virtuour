
import { db } from './firebase-config.js';
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
  getDocs
} from 'firebase/firestore';

class ChatroomService {
  constructor() {
    this.listeners = new Map();
  }

  // Create or get chatroom for a specific area
  async getChatroom(areaId, areaName) {
    const chatroomRef = doc(db, 'chatrooms', areaId);
    const chatroomDoc = await getDoc(chatroomRef);
    
    if (!chatroomDoc.exists()) {
      // Create new chatroom
      await setDoc(chatroomRef, {
        areaId,
        areaName,
        createdAt: serverTimestamp(),
        memberCount: 0,
        lastMessage: null,
        lastActivity: serverTimestamp()
      });
    }
    
    return chatroomRef;
  }

  // Send message to chatroom
  async sendMessage(areaId, message, user) {
    if (!user) throw new Error('User must be authenticated to send messages');
    
    const messagesRef = collection(db, 'chatrooms', areaId, 'messages');
    
    await addDoc(messagesRef, {
      text: message,
      userId: user.uid,
      userName: user.displayName || user.email,
      userPhoto: user.photoURL || null,
      timestamp: serverTimestamp(),
      type: 'text'
    });

    // Update chatroom last activity
    const chatroomRef = doc(db, 'chatrooms', areaId);
    await setDoc(chatroomRef, {
      lastMessage: message,
      lastActivity: serverTimestamp()
    }, { merge: true });
  }

  // Listen to messages in real-time
  subscribeToMessages(areaId, callback) {
    const messagesRef = collection(db, 'chatrooms', areaId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(50));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = [];
      snapshot.docs.forEach(doc => {
        messages.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(messages.reverse()); // Reverse to show oldest first
    });

    this.listeners.set(areaId, unsubscribe);
    return unsubscribe;
  }

  // Get recent chatrooms
  async getRecentChatrooms() {
    const chatroomsRef = collection(db, 'chatrooms');
    const q = query(chatroomsRef, orderBy('lastActivity', 'desc'), limit(10));
    
    const snapshot = await getDocs(q);
    const chatrooms = [];
    
    snapshot.forEach(doc => {
      chatrooms.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return chatrooms;
  }

  // Unsubscribe from messages
  unsubscribeFromMessages(areaId) {
    const unsubscribe = this.listeners.get(areaId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(areaId);
    }
  }

  // Clean up all listeners
  cleanup() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }
}

export default new ChatroomService();
