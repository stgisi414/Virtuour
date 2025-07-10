
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
      }
      
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
            kickedUsers: activeKicks
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
