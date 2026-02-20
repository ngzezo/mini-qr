const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'mini-qr-secret-change-in-production'

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

module.exports = { signToken, verifyToken }
