import { 
  db,
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
} from './firebase-config.js';

class ChatroomService {
  constructor() {
    this.unsubscribes = new Map();
  }

  async getChatroom(areaId, areaName, currentUser = null) {
    try {
      // Validate areaId to prevent abuse
      if (!areaId || typeof areaId !== 'string') {
        throw new Error('Invalid area ID');
      }
      
      // Sanitize areaId - only allow alphanumeric, hyphens, underscores
      const sanitizedAreaId = areaId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
      if (sanitizedAreaId.length < 3) {
        throw new Error('Area ID too short after sanitization');
      }
      
      // Validate area name
      if (!areaName || typeof areaName !== 'string' || areaName.length < 2 || areaName.length > 100) {
        throw new Error('Invalid area name');
      }

      const chatroomRef = doc(db, 'chatrooms', sanitizedAreaId);
      const chatroomDoc = await getDoc(chatroomRef);

      if (!chatroomDoc.exists()) {
        if (!currentUser) {
          throw new Error('Must be authenticated to create chatroom');
        }

        // Rate limiting check - prevent user from creating too many chatrooms
        const userChatroomsQuery = query(
          collection(db, 'chatrooms'),
          where('createdBy', '==', currentUser.uid)
        );
        const userChatrooms = await getDocs(userChatroomsQuery);
        
        if (userChatrooms.size >= 10) { // Limit to 10 chatrooms per user
          throw new Error('You have reached the maximum number of chatrooms you can create');
        }

        // Create new chatroom with strict validation
        const initialAdmins = [currentUser.uid];
        await setDoc(chatroomRef, {
          areaId: sanitizedAreaId,
          areaName: areaName.trim(),
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          messageCount: 0,
          admins: initialAdmins,
          masterAdmins: [], // Will be set by Cloud Function
          bannedUsers: [],
          moderators: [],
          createdBy: currentUser.uid
        });
      } else {
        // Update last activity when someone joins
        await updateDoc(chatroomRef, {
          lastActivityAt: serverTimestamp()
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
        // Update last activity on message
        await updateDoc(chatroomRef, {
          lastActivityAt: serverTimestamp()
        });
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

      const masterAdmins = chatroomData.masterAdmins || [];
       if (!masterAdmins.includes(currentUser.uid)) {
        throw new Error('Only master admins can promote users');
      }


      if (this.isAdmin(chatroomData, userId)) {
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

      const masterAdmins = chatroomData.masterAdmins || [];
       if (!masterAdmins.includes(currentUser.uid)) {
        throw new Error('Only master admins can demote users');
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
      const masterAdmins = chatroomData.masterAdmins || [];
      if (!admins.includes(currentUser.uid) && !masterAdmins.includes(currentUser.uid)) {
        throw new Error('Only admins or master admins can ban users');
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
      const masterAdmins = chatroomData.masterAdmins || [];
      if (!admins.includes(currentUser.uid) && !masterAdmins.includes(currentUser.uid)) {
        throw new Error('Only admins or master admins can unban users');
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
      const masterAdmins = chatroomData.masterAdmins || [];
      if (!admins.includes(currentUser.uid) && !masterAdmins.includes(currentUser.uid)) {
        throw new Error('Only admins or master admins can kick users');
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
      const masterAdmins = chatroomData.masterAdmins || [];
      if (!admins.includes(currentUser.uid) && !masterAdmins.includes(currentUser.uid)) {
        throw new Error('Only admins or master admins can delete messages');
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
  
  isMasterAdmin(chatroomData, userId) {
    if (!chatroomData) return false;
    const masterAdmins = chatroomData.masterAdmins || [];
    return masterAdmins.includes(userId);
  }


  isBanned(chatroomData, userId) {
    if (!chatroomData) return false;
    const bannedUsers = chatroomData.bannedUsers || [];
    return bannedUsers.includes(userId);
  }

   async addMasterAdmin(areaId, userId, currentUser) {
    try {
      const chatroomData = await this.getChatroomData(areaId);
      if (!chatroomData) throw new Error('Chatroom not found');

      const masterAdmins = chatroomData.masterAdmins || [];
      if (!masterAdmins.includes(currentUser.uid)) {
        throw new Error('Only master admins can promote other master admins');
      }

      if (masterAdmins.includes(userId)) {
        throw new Error('User is already a master admin');
      }

      const chatroomRef = doc(db, 'chatrooms', areaId);
      await updateDoc(chatroomRef, {
        masterAdmins: arrayUnion(userId)
      });

    } catch (error) {
      console.error('Error promoting to master admin:', error);
      throw error;
    }
  }
    async removeMasterAdmin(areaId, userId, currentUser) {
    try {
      const chatroomData = await this.getChatroomData(areaId);
      if (!chatroomData) throw new Error('Chatroom not found');

      const masterAdmins = chatroomData.masterAdmins || [];
      if (!masterAdmins.includes(currentUser.uid)) {
        throw new Error('Only master admins can remove other master admins');
      }

      if (!masterAdmins.includes(userId)) {
        throw new Error('User is not a master admin');
      }

      const chatroomRef = doc(db, 'chatrooms', areaId);
      await updateDoc(chatroomRef, {
        masterAdmins: arrayRemove(userId)
      });

    } catch (error) {
      console.error('Error demoting master admin:', error);
      throw error;
    }
  }
}

export default new ChatroomService();