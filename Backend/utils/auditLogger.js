const { getDb } = require('../config/mysql-database');

/**
 * Log security-related events for audit purposes
 */
class AuditLogger {
  /**
   * Log credential access events
   * @param {number} userId - User ID accessing credentials
   * @param {string} action - Action performed (ACCESS, UPDATE, DELETE, etc.)
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @param {Object} metadata - Additional metadata
   */
  static async logCredentialAccess(userId, action, ipAddress, userAgent = null, metadata = {}) {
    try {
      const db = getDb();
      await db.execute(`
        INSERT INTO audit_logs (
          user_id, action, ip_address, user_agent, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, NOW())
      `, [
        userId,
        action,
        ipAddress,
        userAgent,
        JSON.stringify(metadata)
      ]);
    } catch (error) {
      console.error('Audit logging failed:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  /**
   * Log authentication events
   * @param {number} userId - User ID
   * @param {string} action - AUTH_LOGIN, AUTH_LOGOUT, AUTH_FAILED
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   */
  static async logAuthEvent(userId, action, ipAddress, userAgent = null) {
    try {
      const db = getDb();
      await db.execute(`
        INSERT INTO audit_logs (
          user_id, action, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, NOW())
      `, [userId, action, ipAddress, userAgent]);
    } catch (error) {
      console.error('Auth audit logging failed:', error);
    }
  }

  /**
   * Get audit logs for a user
   * @param {number} userId - User ID
   * @param {number} limit - Number of logs to retrieve
   * @returns {Array} Audit logs
   */
  static async getUserAuditLogs(userId, limit = 50) {
    try {
      const db = getDb();
      const [logs] = await db.execute(`
        SELECT action, ip_address, user_agent, metadata, created_at
        FROM audit_logs 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `, [userId, limit]);
      return logs;
    } catch (error) {
      console.error('Failed to retrieve audit logs:', error);
      return [];
    }
  }

  /**
   * Get suspicious activity (multiple failed attempts)
   * @param {number} hours - Hours to look back
   * @returns {Array} Suspicious activities
   */
  static async getSuspiciousActivity(hours = 24) {
    try {
      const db = getDb();
      const [activities] = await db.execute(`
        SELECT user_id, ip_address, COUNT(*) as attempt_count
        FROM audit_logs 
        WHERE action LIKE '%FAILED%' 
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        GROUP BY user_id, ip_address
        HAVING attempt_count >= 5
        ORDER BY attempt_count DESC
      `, [hours]);
      return activities;
    } catch (error) {
      console.error('Failed to retrieve suspicious activity:', error);
      return [];
    }
  }
}

module.exports = AuditLogger;