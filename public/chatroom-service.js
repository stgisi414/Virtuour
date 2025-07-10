
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
    this.unsubscribes = new Map();
  }

  async getChatroom(areaId, areaName) {
    try {
      const chatroomRef = doc(db, 'chatrooms', areaId);
      const chatroomDoc = await getDoc(chatroomRef);

      if (!chatroomDoc.exists()) {
        // Create new chatroom
        await setDoc(chatroomRef, {
          areaId: areaId,
          areaName: areaName,
          createdAt: serverTimestamp(),
          messageCount: 0
        });
      }

      return chatroomRef;
    } catch (error) {
      console.error('Error getting/creating chatroom:', error);
      throw error;
    }
  }

  async sendMessage(areaId, messageText, user) {
    try {
      const messagesRef = collection(db, 'chatrooms', areaId, 'messages');
      
      await addDoc(messagesRef, {
        text: messageText,
        userId: user.uid,
        userName: user.displayName || user.email,
        userPhoto: user.photoURL || null,
        timestamp: serverTimestamp()
      });

      // Update message count
      const chatroomRef = doc(db, 'chatrooms', areaId);
      const chatroomDoc = await getDoc(chatroomRef);
      if (chatroomDoc.exists()) {
        await setDoc(chatroomRef, {
          ...chatroomDoc.data(),
          messageCount: (chatroomDoc.data().messageCount || 0) + 1,
          lastMessageAt: serverTimestamp()
        }, { merge: true });
      }

    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  subscribeToMessages(areaId, callback) {
    try {
      const messagesRef = collection(db, 'chatrooms', areaId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(50));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
          messages.push({ id: doc.id, ...doc.data() });
        });
        
        // Reverse to show oldest first
        messages.reverse();
        callback(messages);
      });

      this.unsubscribes.set(areaId, unsubscribe);
      return unsubscribe;

    } catch (error) {
      console.error('Error subscribing to messages:', error);
      throw error;
    }
  }

  unsubscribeFromMessages(areaId) {
    const unsubscribe = this.unsubscribes.get(areaId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribes.delete(areaId);
    }
  }

  unsubscribeAll() {
    this.unsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribes.clear();
  }
}

export default new ChatroomService();
