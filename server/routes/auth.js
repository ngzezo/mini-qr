const router = require('express').Router()
const bcrypt = require('bcryptjs')
const { getDb } = require('../db/database')
const { signToken } = require('../utils/jwt')
const authMiddleware = require('../middleware/auth')

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' })
    const db = await getDb()
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) return res.status(409).json({ error: 'Email already registered' })
    const hash = await bcrypt.hash(password, 10)
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get()
    const role = count.c === 0 ? 'admin' : 'user'
    const result = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hash, role)
    const token = signToken({ userId: result.lastInsertRowid })
    res.json({ token, user: { id: result.lastInsertRowid, name, email, role } })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'email and password required' })
    const db = await getDb()
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    if (user.locked) return res.status(403).json({ error: 'Account is locked' })
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    const token = signToken({ userId: user.id })
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user })
})

module.exports = router
