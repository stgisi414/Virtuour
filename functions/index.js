
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

// Function to promote first user to master admin when they create a chatroom
exports.assignMasterAdmin = functions.firestore
  .document('chatrooms/{chatroomId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const chatroomId = context.params.chatroomId;
    
    // If there's a creator and no master admins, make them a master admin
    if (data.createdBy && (!data.masterAdmins || data.masterAdmins.length === 0)) {
      try {
        await snap.ref.update({
          masterAdmins: [data.createdBy],
          admins: admin.firestore.FieldValue.arrayUnion(data.createdBy)
        });
        
        console.log(`Made user ${data.createdBy} a master admin of chatroom ${chatroomId}`);
      } catch (error) {
        console.error(`Error assigning master admin to chatroom ${chatroomId}:`, error);
      }
    }
  });
