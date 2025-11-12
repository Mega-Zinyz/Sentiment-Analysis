const SessionManager = require('../utils/sessionManager');
const AuditLogger = require('../utils/auditLogger');

// Get user's active sessions
const getUserSessionsHandler = async (req, res) => {
  try {
    const sessions = await SessionManager.getUserActiveSessions(req.user.userId);
    
    // Hide sensitive token data
    const safeSessions = sessions.map(session => ({
      id: session.id,
      created_at: session.created_at,
      expires_at: session.expires_at,
      status: session.status
    }));
    
    res.json({
      success: true,
      sessions: safeSessions,
      total: safeSessions.length
    });
  } catch (error) {
    console.error('❌ Error getting user sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
};

// Revoke a specific session
const revokeSessionHandler = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;
    
    const revoked = await SessionManager.revokeSession(sessionId, userId);
    
    if (revoked) {
    await AuditLogger.logCredentialAccess(
      userId,
      'SESSION_REVOKED',
      req.ip,
      req.get('User-Agent'),
      { sessionId }
    );      res.json({
        success: true,
        message: 'Session revoked successfully'
      });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('❌ Error revoking session:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

// Revoke all other sessions (keep current)
const revokeOtherSessionsHandler = async (req, res) => {
  try {
    const userId = req.user.userId;
    const currentToken = req.headers['authorization']?.split(' ')[1];
    
    const revokedCount = await SessionManager.revokeOtherSessions(userId, currentToken);
    
    await AuditLogger.logCredentialAccess(
      userId,
      'OTHER_SESSIONS_REVOKED',
      req.ip,
      req.get('User-Agent'),
      { revokedCount }
    );
    
    res.json({
      success: true,
      message: `${revokedCount} other sessions revoked successfully`,
      revokedCount
    });
  } catch (error) {
    console.error('❌ Error revoking other sessions:', error);
    res.status(500).json({ error: 'Failed to revoke other sessions' });
  }
};

// Admin: Get session statistics
const getSessionStatsHandler = async (req, res) => {
  try {
    const stats = await SessionManager.getSessionStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Error getting session stats:', error);
    res.status(500).json({ error: 'Failed to get session statistics' });
  }
};

// Admin: Force cleanup expired sessions
const cleanupSessionsHandler = async (req, res) => {
  try {
    const deletedCount = await SessionManager.cleanupExpiredSessions();
    
    await AuditLogger.logCredentialAccess(
      req.user.userId,
      'SESSION_CLEANUP',
      req.ip,
      req.get('User-Agent'),
      { deletedCount }
    );
    
    res.json({
      success: true,
      message: `${deletedCount} expired sessions cleaned up`,
      deletedCount
    });
  } catch (error) {
    console.error('❌ Error cleaning up sessions:', error);
    res.status(500).json({ error: 'Failed to cleanup sessions' });
  }
};

module.exports = {
  getUserSessionsHandler,
  revokeSessionHandler,
  revokeOtherSessionsHandler,
  getSessionStatsHandler,
  cleanupSessionsHandler
};