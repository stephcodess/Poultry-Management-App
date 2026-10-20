const { getDb } = require('../database/db')

function logActivity({ userId, userName, userEmail, action, entity, entityId, details }) {
  try {
    getDb().prepare(`
      INSERT INTO activity_log (user_id, user_name, user_email, action, entity, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId || null,
      userName || null,
      userEmail || null,
      action,
      entity || null,
      entityId || null,
      details ? JSON.stringify(details) : null
    )
  } catch (e) {
    // never let logging crash the app
  }
}

module.exports = { logActivity }
