const { verifyToken } = require('../utils/jwt')
const { getDb } = require('../db/database')

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const token = authHeader.slice(7)
  try {
    const payload = verifyToken(token)
    const db = await getDb()
    const user = db.prepare('SELECT id, name, email, role, locked FROM users WHERE id = ?').get(payload.userId)
    if (!user) return res.status(401).json({ error: 'User not found' })
    if (user.locked) return res.status(403).json({ error: 'Account is locked' })
    req.user = user
    next()
  } catch (_) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = authMiddleware
