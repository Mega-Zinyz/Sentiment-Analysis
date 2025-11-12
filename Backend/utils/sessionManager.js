const { getDb } = require('../config/mysql-database');

class SessionManager {
  /**
   * Clean up expired sessions from the database
   */
  static async cleanupExpiredSessions() {
    try {
      const db = getDb();
      const [result] = await db.execute(
        'DELETE FROM user_sessions WHERE expires_at < NOW()'
      );
      
      const deletedCount = result.affectedRows;
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} expired sessions`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('❌ Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  /**
   * Get active sessions for a user
   */
  static async getUserActiveSessions(userId) {
    try {
      const db = getDb();
      const [sessions] = await db.execute(`
        SELECT id, expires_at, created_at,
               CASE 
                 WHEN expires_at > NOW() THEN 'active'
                 ELSE 'expired'
               END as status
        FROM user_sessions 
        WHERE user_id = ?
        ORDER BY created_at DESC
      `, [userId]);
      
      return sessions;
    } catch (error) {
      console.error('❌ Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Revoke specific session
   */
  static async revokeSession(sessionId, userId) {
    try {
      const db = getDb();
      const [result] = await db.execute(
        'DELETE FROM user_sessions WHERE id = ? AND user_id = ?',
        [sessionId, userId]
      );
      
      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Error revoking session:', error);
      return false;
    }
  }

  /**
   * Revoke all sessions for a user except current
   */
  static async revokeOtherSessions(userId, currentToken) {
    try {
      const db = getDb();
      const [result] = await db.execute(
        'DELETE FROM user_sessions WHERE user_id = ? AND token != ?',
        [userId, currentToken]
      );
      
      return result.affectedRows;
    } catch (error) {
      console.error('❌ Error revoking other sessions:', error);
      return 0;
    }
  }

  /**
   * Get session statistics
   */
  static async getSessionStats() {
    try {
      const db = getDb();
      const [stats] = await db.execute(`
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_sessions,
          COUNT(CASE WHEN expires_at <= NOW() THEN 1 END) as expired_sessions,
          COUNT(DISTINCT user_id) as unique_users
        FROM user_sessions
      `);
      
      return stats[0] || { total_sessions: 0, active_sessions: 0, expired_sessions: 0, unique_users: 0 };
    } catch (error) {
      console.error('❌ Error getting session stats:', error);
      return { total_sessions: 0, active_sessions: 0, expired_sessions: 0, unique_users: 0 };
    }
  }

  /**
   * Auto cleanup job - run periodically
   */
  static startCleanupJob(intervalMinutes = 60) {
    // Run cleanup immediately
    this.cleanupExpiredSessions();
    
    // Schedule periodic cleanup
    const interval = intervalMinutes * 60 * 1000; // Convert to milliseconds
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, interval);
    
    console.log(`🔄 Session cleanup job started (every ${intervalMinutes} minutes)`);
  }
}

module.exports = SessionManager;