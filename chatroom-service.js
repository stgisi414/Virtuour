
console.log('💬 CHATROOM SERVICE: Starting ChatroomService import...');

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

console.log('💬 CHATROOM SERVICE: Firestore db object:', db);
console.log('💬 CHATROOM SERVICE: Firestore functions imported successfully');

class ChatroomService {
  constructor() {
    console.log('💬 CHATROOM SERVICE: ChatroomService constructor called');
    console.log('💬 CHATROOM SERVICE: Database available:', !!db);
    this.unsubscribes = new Map();
  }

  async getChatroom(areaId, areaName) {
    console.log('💬 CHATROOM SERVICE: getChatroom called with areaId:', areaId, 'areaName:', areaName);
    try {
      console.log('💬 CHATROOM SERVICE: Getting chatroom document...');
      const chatroomRef = doc(db, 'chatrooms', areaId);
      console.log('💬 CHATROOM SERVICE: Chatroom reference created:', chatroomRef);
      
      const chatroomDoc = await getDoc(chatroomRef);
      console.log('💬 CHATROOM SERVICE: Chatroom document fetched, exists:', chatroomDoc.exists());
      
      if (!chatroomDoc.exists()) {
        console.log('💬 CHATROOM SERVICE: Creating new chatroom...');
        await setDoc(chatroomRef, {
          areaId,
          areaName,
          createdAt: serverTimestamp()
        });
        console.log('💬 CHATROOM SERVICE: New chatroom created successfully');
      }
      
      return chatroomRef;
    } catch (error) {
      console.error('💬 CHATROOM SERVICE: Error in getChatroom:', error);
      console.error('💬 CHATROOM SERVICE: Error code:', error.code);
      console.error('💬 CHATROOM SERVICE: Error message:', error.message);
      throw error;
    }
  }

  async sendMessage(areaId, message, user) {
    console.log('💬 CHATROOM SERVICE: sendMessage called with areaId:', areaId, 'message:', message, 'user:', user);
    try {
      console.log('💬 CHATROOM SERVICE: Getting messages collection...');
      const messagesRef = collection(db, 'chatrooms', areaId, 'messages');
      console.log('💬 CHATROOM SERVICE: Messages collection reference created:', messagesRef);
      
      const messageData = {
        text: message,
        userId: user.uid,
        userName: user.displayName || user.email,
        userPhoto: user.photoURL,
        timestamp: serverTimestamp()
      };
      console.log('💬 CHATROOM SERVICE: Message data prepared:', messageData);
      
      const docRef = await addDoc(messagesRef, messageData);
      console.log('💬 CHATROOM SERVICE: Message sent successfully, doc ID:', docRef.id);
      
      return docRef;
    } catch (error) {
      console.error('💬 CHATROOM SERVICE: Error sending message:', error);
      console.error('💬 CHATROOM SERVICE: Error code:', error.code);
      console.error('💬 CHATROOM SERVICE: Error message:', error.message);
      throw error;
    }
  }

  subscribeToMessages(areaId, callback) {
    console.log('💬 CHATROOM SERVICE: subscribeToMessages called with areaId:', areaId);
    try {
      console.log('💬 CHATROOM SERVICE: Creating messages query...');
      const messagesRef = collection(db, 'chatrooms', areaId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(50));
      console.log('💬 CHATROOM SERVICE: Query created:', q);
      
      console.log('💬 CHATROOM SERVICE: Setting up real-time listener...');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log('💬 CHATROOM SERVICE: Messages snapshot received, size:', snapshot.size);
        const messages = [];
        snapshot.forEach((doc) => {
          console.log('💬 CHATROOM SERVICE: Processing message doc:', doc.id, doc.data());
          messages.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        console.log('💬 CHATROOM SERVICE: Processed messages:', messages.length);
        // Reverse to show oldest first
        messages.reverse();
        callback(messages);
      }, (error) => {
        console.error('💬 CHATROOM SERVICE: Error in messages listener:', error);
        console.error('💬 CHATROOM SERVICE: Error code:', error.code);
        console.error('💬 CHATROOM SERVICE: Error message:', error.message);
      });
      
      this.unsubscribes.set(areaId, unsubscribe);
      console.log('💬 CHATROOM SERVICE: Real-time listener set up successfully');
      
      return unsubscribe;
    } catch (error) {
      console.error('💬 CHATROOM SERVICE: Error setting up message subscription:', error);
      console.error('💬 CHATROOM SERVICE: Error code:', error.code);
      console.error('💬 CHATROOM SERVICE: Error message:', error.message);
      throw error;
    }
  }

  unsubscribeFromMessages(areaId) {
    console.log('💬 CHATROOM SERVICE: unsubscribeFromMessages called with areaId:', areaId);
    if (this.unsubscribes.has(areaId)) {
      console.log('💬 CHATROOM SERVICE: Unsubscribing from messages...');
      this.unsubscribes.get(areaId)();
      this.unsubscribes.delete(areaId);
      console.log('💬 CHATROOM SERVICE: Successfully unsubscribed from messages');
    } else {
      console.log('💬 CHATROOM SERVICE: No active subscription found for areaId:', areaId);
    }
  }

  // Test Firebase connection
  async testConnection() {
    console.log('💬 CHATROOM SERVICE: Testing Firebase connection...');
    try {
      const testRef = collection(db, 'test');
      console.log('💬 CHATROOM SERVICE: Test collection reference created:', testRef);
      console.log('💬 CHATROOM SERVICE: Firebase connection test successful!');
      return true;
    } catch (error) {
      console.error('💬 CHATROOM SERVICE: Firebase connection test failed:', error);
      return false;
    }
  }
}

console.log('💬 CHATROOM SERVICE: Creating ChatroomService instance...');
const chatroomServiceInstance = new ChatroomService();
console.log('💬 CHATROOM SERVICE: ChatroomService instance created:', chatroomServiceInstance);

// Test the connection immediately
console.log('💬 CHATROOM SERVICE: Testing connection on load...');
chatroomServiceInstance.testConnection().then((result) => {
  console.log('💬 CHATROOM SERVICE: Connection test result:', result);
}).catch((error) => {
  console.error('💬 CHATROOM SERVICE: Connection test error:', error);
});

console.log('💬 CHATROOM SERVICE: Exporting ChatroomService instance');
export default chatroomServiceInstance;
