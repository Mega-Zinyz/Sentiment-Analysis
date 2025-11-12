const { getDb } = require('../config/mysql-database');

// Get system statistics
const getSystemStatsHandler = async (req, res) => {
  try {
    const db = getDb();
    // Get total users
    const [totalUsersRows] = await db.execute('SELECT COUNT(*) as count FROM users');
    const totalUsers = totalUsersRows[0].count;

    // Get total analyses
    const [totalAnalysesRows] = await db.execute('SELECT COUNT(*) as count FROM analysis_history');
    const totalAnalyses = totalAnalysesRows[0].count;

    // Get total word libraries (training data)
    const [totalWordLibrariesRows] = await db.execute('SELECT COUNT(*) as count FROM word_libraries');
    const totalWordLibraries = totalWordLibrariesRows[0].count;

    res.json({
      totalUsers,
      totalAnalyses,
      totalWordLibraries
    });
  } catch (error) {
    console.error('Get system stats error:', error);
    res.status(500).json({ error: 'Failed to get system statistics' });
  }
};

// Get all users with pagination and filtering
const getUsersHandler = async (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 10, search = '', role, isActive } = req.query;
    const offset = (page - 1) * limit;

    // Build dynamic query
    let whereConditions = [];
    let params = [];

    if (search) {
      whereConditions.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (role && role !== 'all') {
      whereConditions.push('role = ?');
      params.push(role);
    }

    if (isActive !== undefined && isActive !== 'all') {
      whereConditions.push('is_active = ?');
      params.push(isActive === 'true' ? 1 : 0);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM users ${whereClause}`;
    const [totalUsersRows] = await db.execute(countQuery, params);
    const totalUsers = totalUsersRows[0].count;

    // Get users
    const query = `
      SELECT id, username, email, role, is_active, created_at, updated_at 
      FROM users ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    const [users] = await db.execute(query, [...params, parseInt(limit), parseInt(offset)]);

    res.json({
      users,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// Toggle user active status
const toggleUserStatusHandler = async (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { isActive } = req.body;

    await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, userId]);

    res.json({ success: true, message: 'User status updated successfully' });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
};

// Update user role
const updateUserRoleHandler = async (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { role } = req.body;

    // Prevent demoting the last admin
    if (role !== 'admin') {
      const [adminCountRows] = await db.execute('SELECT COUNT(*) as count FROM users WHERE role = "admin" AND is_active = 1');
      const adminCount = adminCountRows[0].count;

      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last active admin' });
      }
    }

    await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId]);

    res.json({ success: true, message: 'User role updated successfully' });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

// Delete user
const deleteUserHandler = async (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    // Check if user exists and get role
    const [userRows] = await db.execute('SELECT role FROM users WHERE id = ?', [userId]);
    const user = userRows.length > 0 ? userRows[0] : null;

    if (user && user.role === 'admin') {
      const [adminCountRows] = await db.execute('SELECT COUNT(*) as count FROM users WHERE role = "admin" AND is_active = 1 AND id != ?', [userId]);
      const adminCount = adminCountRows[0].count;

      if (adminCount < 1) {
        return res.status(400).json({ error: 'Cannot delete the last active admin' });
      }
    }

    // Begin transaction by deleting related data first
    try {
      // Delete related data
      await db.execute('DELETE FROM analysis_history WHERE user_id = ?', [userId]);
      
      // Delete user word libraries (cascades to words and samples)
      await db.execute('DELETE FROM word_libraries WHERE user_id = ?', [userId]);
      
      // Delete user API credentials
      await db.execute('DELETE FROM user_api_credentials WHERE user_id = ?', [userId]);
      
      // Delete user sessions
      await db.execute('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
      
      // Finally delete the user
      await db.execute('DELETE FROM users WHERE id = ?', [userId]);

      res.json({ success: true, message: 'User deleted successfully' });
    } catch (deleteError) {
      console.error('Delete user transaction error:', deleteError);
      res.status(500).json({ error: 'Failed to delete user completely' });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Get user analytics
const getUserAnalyticsHandler = async (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    // Get user basic info
    const [userRows] = await db.execute('SELECT username, email, role, created_at FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRows[0];

    // Get analysis count
    const [analysisCountRows] = await db.execute('SELECT COUNT(*) as count FROM analysis_history WHERE user_id = ?', [userId]);
    const analysisCount = analysisCountRows[0].count;

    // Get word libraries count
    const [wordLibrariesCountRows] = await db.execute('SELECT COUNT(*) as count FROM word_libraries WHERE user_id = ?', [userId]);
    const wordLibrariesCount = wordLibrariesCountRows[0].count;

    // Get recent analyses
    const [recentAnalyses] = await db.execute(`
      SELECT keyword, tweet_count, dataset_used, created_at 
      FROM analysis_history 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 5
    `, [userId]);

    res.json({
      user,
      analysisCount,
      wordLibrariesCount,
      recentAnalyses
    });
  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({ error: 'Failed to get user analytics' });
  }
};

// Get system analytics
const getSystemAnalyticsHandler = async (req, res) => {
  try {
    const db = getDb();
    // Get user registrations by month (last 12 months)
    const [userRegistrations] = await db.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as count
      FROM users 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month
    `);

    // Get analysis activity by day (last 30 days)
    const [analysisActivity] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM analysis_history 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // Get most active users
    const [mostActiveUsers] = await db.execute(`
      SELECT 
        u.username,
        COUNT(ah.id) as analysis_count
      FROM users u
      LEFT JOIN analysis_history ah ON u.id = ah.user_id
      GROUP BY u.id, u.username
      ORDER BY analysis_count DESC
      LIMIT 10
    `);

    res.json({
      userRegistrations,
      analysisActivity,
      mostActiveUsers
    });
  } catch (error) {
    console.error('Get system analytics error:', error);
    res.status(500).json({ error: 'Failed to get system analytics' });
  }
};

// Get security audit logs
const getAuditLogsHandler = async (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 50, userId, action } = req.query;
    const offset = (page - 1) * limit;

    // Build dynamic query
    let whereConditions = [];
    let params = [];

    if (userId) {
      whereConditions.push('user_id = ?');
      params.push(userId);
    }

    if (action) {
      whereConditions.push('action LIKE ?');
      params.push(`%${action}%`);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`;
    const [totalRows] = await db.execute(countQuery, params);
    const totalLogs = totalRows[0].count;

    // Get audit logs with user information
    const query = `
      SELECT 
        al.id, al.user_id, al.action, al.ip_address, al.user_agent, 
        al.metadata, al.created_at,
        u.username, u.email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC 
      LIMIT ? OFFSET ?
    `;
    const [logs] = await db.execute(query, [...params, parseInt(limit), parseInt(offset)]);

    res.json({
      logs,
      totalLogs,
      totalPages: Math.ceil(totalLogs / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
};

// Get suspicious activities
const getSuspiciousActivitiesHandler = async (req, res) => {
  try {
    const db = getDb();
    const { hours = 24 } = req.query;

    // Get multiple failed login attempts
    const [failedLogins] = await db.execute(`
      SELECT 
        al.user_id, al.ip_address, u.username, u.email,
        COUNT(*) as failed_attempts,
        MAX(al.created_at) as last_attempt
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action = 'AUTH_LOGIN_FAILED' 
      AND al.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY al.user_id, al.ip_address
      HAVING failed_attempts >= 3
      ORDER BY failed_attempts DESC
    `, [hours]);

    // Get unusual credential access patterns
    const [credentialAccess] = await db.execute(`
      SELECT 
        al.user_id, al.ip_address, u.username, u.email,
        COUNT(*) as access_count,
        MAX(al.created_at) as last_access
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action LIKE 'CREDENTIAL_%' 
      AND al.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY al.user_id, al.ip_address
      HAVING access_count >= 20
      ORDER BY access_count DESC
    `, [hours]);

    res.json({
      failedLogins,
      credentialAccess,
      timeframe: `${hours} hours`
    });
  } catch (error) {
    console.error('Get suspicious activities error:', error);
    res.status(500).json({ error: 'Failed to get suspicious activities' });
  }
};

module.exports = {
  getSystemStatsHandler,
  getUsersHandler,
  toggleUserStatusHandler,
  updateUserRoleHandler,
  deleteUserHandler,
  getUserAnalyticsHandler,
  getSystemAnalyticsHandler,
  getAuditLogsHandler,
  getSuspiciousActivitiesHandler
};