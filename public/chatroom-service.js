
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
} from './firebase-config.js';

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
          messageCount: 0,
          admins: [], // Array of user IDs who are admins
          bannedUsers: [], // Array of user IDs who are banned
          moderators: [] // Array of user IDs who are moderators
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
      // Check if user is banned
      const chatroomRef = doc(db, 'chatrooms', areaId);
      const chatroomDoc = await getDoc(chatroomRef);
      
      if (chatroomDoc.exists()) {
        const bannedUsers = chatroomDoc.data().bannedUsers || [];
        if (bannedUsers.includes(user.uid)) {
          throw new Error('You are banned from this chatroom');
        }
      }

      const messagesRef = collection(db, 'chatrooms', areaId, 'messages');
      
      // Set expiry time to 48 hours from now
      const expiryTime = new Date();
      expiryTime.setHours(expiryTime.getHours() + 48);
      
      await addDoc(messagesRef, {
        text: messageText,
        userId: user.uid,
        userName: user.displayName || user.email,
        userPhoto: user.photoURL || null,
        timestamp: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiryTime)
      });

      // Update message count
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
      const q = query(
        messagesRef, 
        where('expiresAt', '>', Timestamp.now()),
        orderBy('expiresAt'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          // Double check message hasn't expired
          if (data.expiresAt && data.expiresAt.toDate() > new Date()) {
            messages.push({ id: doc.id, ...data });
          }
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

  async getChatroomData(areaId) {
    try {
      const chatroomRef = doc(db, 'chatrooms', areaId);
      const chatroomDoc = await getDoc(chatroomRef);
      return chatroomDoc.exists() ? chatroomDoc.data() : null;
    } catch (error) {
      console.error('Error getting chatroom data:', error);
      throw error;
    }
  }

  async promoteToAdmin(areaId, userId, currentUser) {
    try {
      const chatroomData = await this.getChatroomData(areaId);
      if (!chatroomData) throw new Error('Chatroom not found');

      const admins = chatroomData.admins || [];
      if (!admins.includes(currentUser.uid)) {
        throw new Error('Only admins can promote users');
      }

      if (admins.includes(userId)) {
        throw new Error('User is already an admin');
      }

      const chatroomRef = doc(db, 'chatrooms', areaId);
      await updateDoc(chatroomRef, {
        admins: arrayUnion(userId)
      });

    } catch (error) {
      console.error('Error promoting to admin:', error);
      throw error;
    }
  }

  async demoteAdmin(areaId, userId, currentUser) {
    try {
      const chatroomData = await this.getChatroomData(areaId);
      if (!chatroomData) throw new Error('Chatroom not found');

      const admins = chatroomData.admins || [];
      if (!admins.includes(currentUser.uid)) {
        throw new Error('Only admins can demote users');
      }

      const chatroomRef = doc(db, 'chatrooms', areaId);
      await updateDoc(chatroomRef, {
        admins: arrayRemove(userId)
      });

    } catch (error) {
      console.error('Error demoting admin:', error);
      throw error;
    }
  }

  async banUser(areaId, userId, currentUser) {
    try {
      const chatroomData = await this.getChatroomData(areaId);
      if (!chatroomData) throw new Error('Chatroom not found');

      const admins = chatroomData.admins || [];
      if (!admins.includes(currentUser.uid)) {
        throw new Error('Only admins can ban users');
      }

      const bannedUsers = chatroomData.bannedUsers || [];
      if (bannedUsers.includes(userId)) {
        throw new Error('User is already banned');
      }

      const chatroomRef = doc(db, 'chatrooms', areaId);
      await updateDoc(chatroomRef, {
        bannedUsers: arrayUnion(userId),
        admins: arrayRemove(userId) // Remove from admins if they were one
      });

    } catch (error) {
      console.error('Error banning user:', error);
      throw error;
    }
  }

  async unbanUser(areaId, userId, currentUser) {
    try {
      const chatroomData = await this.getChatroomData(areaId);
      if (!chatroomData) throw new Error('Chatroom not found');

      const admins = chatroomData.admins || [];
      if (!admins.includes(currentUser.uid)) {
        throw new Error('Only admins can unban users');
      }

      const chatroomRef = doc(db, 'chatrooms', areaId);
      await updateDoc(chatroomRef, {
        bannedUsers: arrayRemove(userId)
      });

    } catch (error) {
      console.error('Error unbanning user:', error);
      throw error;
    }
  }

  async kickUser(areaId, userId, currentUser) {
    try {
      const chatroomData = await this.getChatroomData(areaId);
      if (!chatroomData) throw new Error('Chatroom not found');

      const admins = chatroomData.admins || [];
      if (!admins.includes(currentUser.uid)) {
        throw new Error('Only admins can kick users');
      }

      // Temporarily ban for 10 minutes
      const tempBanExpiry = new Date();
      tempBanExpiry.setMinutes(tempBanExpiry.getMinutes() + 10);

      const chatroomRef = doc(db, 'chatrooms', areaId);
      await updateDoc(chatroomRef, {
        kickedUsers: arrayUnion({
          userId: userId,
          expiresAt: Timestamp.fromDate(tempBanExpiry)
        })
      });

    } catch (error) {
      console.error('Error kicking user:', error);
      throw error;
    }
  }

  async deleteMessage(areaId, messageId, currentUser) {
    try {
      const chatroomData = await this.getChatroomData(areaId);
      if (!chatroomData) throw new Error('Chatroom not found');

      const admins = chatroomData.admins || [];
      if (!admins.includes(currentUser.uid)) {
        throw new Error('Only admins can delete messages');
      }

      const messageRef = doc(db, 'chatrooms', areaId, 'messages', messageId);
      await deleteDoc(messageRef);

    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  isAdmin(chatroomData, userId) {
    if (!chatroomData) return false;
    const admins = chatroomData.admins || [];
    return admins.includes(userId);
  }

  isBanned(chatroomData, userId) {
    if (!chatroomData) return false;
    const bannedUsers = chatroomData.bannedUsers || [];
    return bannedUsers.includes(userId);
  }
}

export default new ChatroomService();
