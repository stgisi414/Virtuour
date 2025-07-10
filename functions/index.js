
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Clean up expired messages every hour
exports.cleanupExpiredMessages = functions.pubsub
  .schedule('0 * * * *') // Run every hour at minute 0
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting cleanup of expired messages...');
    
    try {
      const now = admin.firestore.Timestamp.now();
      const chatroomsSnapshot = await db.collection('chatrooms').get();
      
      let totalDeleted = 0;
      const chatroomsToCheck = [];
      
      for (const chatroomDoc of chatroomsSnapshot.docs) {
        const messagesRef = db.collection('chatrooms').doc(chatroomDoc.id).collection('messages');
        const expiredMessages = await messagesRef
          .where('expiresAt', '<=', now)
          .get();
        
        const batch = db.batch();
        expiredMessages.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        if (expiredMessages.size > 0) {
          await batch.commit();
          totalDeleted += expiredMessages.size;
          console.log(`Deleted ${expiredMessages.size} expired messages from chatroom ${chatroomDoc.id}`);
        }
        
        // Check if chatroom should be deleted after message cleanup
        chatroomsToCheck.push(chatroomDoc.id);
      }
      
      // Now check for empty chatrooms to delete
      await cleanupEmptyChatrooms(chatroomsToCheck);
      
      console.log(`Cleanup completed. Total messages deleted: ${totalDeleted}`);
      return null;
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  });

// Clean up temporary kicks (kicked users)
exports.cleanupKickedUsers = functions.pubsub
  .schedule('*/10 * * * *') // Run every 10 minutes
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting cleanup of kicked users...');
    
    try {
      const now = admin.firestore.Timestamp.now();
      const chatroomsSnapshot = await db.collection('chatrooms').get();
      
      for (const chatroomDoc of chatroomsSnapshot.docs) {
        const data = chatroomDoc.data();
        const kickedUsers = data.kickedUsers || [];
        
        // Filter out expired kicks
        const activeKicks = kickedUsers.filter(kick => 
          kick.expiresAt && kick.expiresAt.toDate() > now.toDate()
        );
        
        if (activeKicks.length !== kickedUsers.length) {
          await chatroomDoc.ref.update({
            kickedUsers: activeKicks,
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Updated kicked users for chatroom ${chatroomDoc.id}`);
        }
      }
      
      console.log('Kicked users cleanup completed');
      return null;
    } catch (error) {
      console.error('Error during kicked users cleanup:', error);
      throw error;
    }
  });

// Clean up inactive chatrooms every 6 hours
exports.cleanupInactiveChatrooms = functions.pubsub
  .schedule('0 */6 * * *') // Run every 6 hours
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting cleanup of inactive chatrooms...');
    
    try {
      const now = admin.firestore.Timestamp.now();
      const cutoffTime = new Date(now.toDate().getTime() - (48 * 60 * 60 * 1000)); // 48 hours ago
      const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffTime);
      
      const inactiveChatrooms = await db.collection('chatrooms')
        .where('lastActivityAt', '<', cutoffTimestamp)
        .get();
      
      let deletedCount = 0;
      
      for (const chatroomDoc of inactiveChatrooms.docs) {
        const chatroomId = chatroomDoc.id;
        
        // Check if chatroom has any non-expired messages
        const messagesRef = db.collection('chatrooms').doc(chatroomId).collection('messages');
        const activeMessages = await messagesRef
          .where('expiresAt', '>', now)
          .limit(1)
          .get();
        
        // If no active messages, delete the entire chatroom
        if (activeMessages.empty) {
          console.log(`Deleting inactive chatroom: ${chatroomId}`);
          
          // Delete all messages first
          const allMessages = await messagesRef.get();
          const batch = db.batch();
          
          allMessages.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          // Delete the chatroom document
          batch.delete(chatroomDoc.ref);
          
          await batch.commit();
          deletedCount++;
          
          console.log(`Deleted inactive chatroom ${chatroomId} and ${allMessages.size} messages`);
        }
      }
      
      console.log(`Inactive chatrooms cleanup completed. Deleted ${deletedCount} chatrooms`);
      return null;
    } catch (error) {
      console.error('Error during inactive chatrooms cleanup:', error);
      throw error;
    }
  });

// Helper function to clean up empty chatrooms
async function cleanupEmptyChatrooms(chatroomIds) {
  const now = admin.firestore.Timestamp.now();
  const cutoffTime = new Date(now.toDate().getTime() - (48 * 60 * 60 * 1000)); // 48 hours ago
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffTime);
  
  for (const chatroomId of chatroomIds) {
    try {
      const chatroomRef = db.collection('chatrooms').doc(chatroomId);
      const chatroomDoc = await chatroomRef.get();
      
      if (!chatroomDoc.exists()) continue;
      
      const data = chatroomDoc.data();
      const lastActivity = data.lastActivityAt || data.createdAt;
      
      // Check if chatroom has been inactive for 48 hours
      if (lastActivity && lastActivity.toDate() < cutoffTime) {
        // Check if there are any active messages
        const messagesRef = db.collection('chatrooms').doc(chatroomId).collection('messages');
        const activeMessages = await messagesRef
          .where('expiresAt', '>', now)
          .limit(1)
          .get();
        
        if (activeMessages.empty) {
          console.log(`Deleting empty inactive chatroom: ${chatroomId}`);
          await chatroomRef.delete();
        }
      }
    } catch (error) {
      console.error(`Error checking chatroom ${chatroomId}:`, error);
    }
  }
}

// Function to validate and set up new chatrooms
exports.validateAndSetupChatroom = functions.firestore
  .document('chatrooms/{chatroomId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const chatroomId = context.params.chatroomId;
    
    try {
      // Additional server-side validation
      if (!data.createdBy || !data.areaId || !data.areaName) {
        console.error(`Invalid chatroom data for ${chatroomId}:`, data);
        await snap.ref.delete();
        return;
      }

      // Validate areaId format
      if (!/^[a-zA-Z0-9_-]{3,50}$/.test(chatroomId)) {
        console.error(`Invalid chatroomId format: ${chatroomId}`);
        await snap.ref.delete();
        return;
      }

      // Check if user has created too many chatrooms recently
      const recentChatrooms = await db.collection('chatrooms')
        .where('createdBy', '==', data.createdBy)
        .where('createdAt', '>', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))) // Last 24 hours
        .get();

      if (recentChatrooms.size > 5) { // Max 5 chatrooms per day
        console.error(`User ${data.createdBy} exceeded daily chatroom creation limit`);
        await snap.ref.delete();
        return;
      }

      // If validation passes, make creator a master admin
      await snap.ref.update({
        masterAdmins: [data.createdBy],
        admins: admin.firestore.FieldValue.arrayUnion(data.createdBy),
        validatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`Validated and set up chatroom ${chatroomId} for user ${data.createdBy}`);
    } catch (error) {
      console.error(`Error validating chatroom ${chatroomId}:`, error);
      // Delete invalid chatroom
      await snap.ref.delete();
    }
  });
