const router = require('express').Router()
const { getDb } = require('../db/database')
const authMiddleware = require('../middleware/auth')
const adminMiddleware = require('../middleware/admin')
const bcrypt = require('bcryptjs')

router.use(authMiddleware, adminMiddleware)

router.get('/stats', async (req, res) => {
  try {
    const db = await getDb()
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c
    const totalCampaigns = db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c
    const totalScans = db.prepare('SELECT COUNT(*) as c FROM scans').get().c
    const qrCreatedDaily = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM campaigns WHERE created_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC`).all()
    const scansDaily = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM scans WHERE created_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC`).all()
    const scansByCampaign = db.prepare(`SELECT c.name, COUNT(s.id) as count FROM campaigns c LEFT JOIN scans s ON s.campaign_id = c.id GROUP BY c.id ORDER BY count DESC LIMIT 10`).all()
    res.json({ totalUsers, totalCampaigns, totalScans, qrCreatedDaily, scansDaily, scansByCampaign })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/users', async (req, res) => {
  try {
    const db = await getDb()
    res.json(db.prepare('SELECT id,name,email,role,locked,created_at FROM users ORDER BY created_at DESC').all())
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' })
    const db = await getDb()
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) return res.status(409).json({ error: 'Email already registered' })
    const hash = await bcrypt.hash(password, 10)
    const result = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(name, email, hash, role || 'user')
    res.status(201).json({ id: result.lastInsertRowid, name, email, role: role || 'user' })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, role, password } = req.body
    const db = await getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: 'Not found' })
    let hash = user.password_hash
    if (password) hash = await bcrypt.hash(password, 10)
    db.prepare('UPDATE users SET name=?,email=?,role=?,password_hash=? WHERE id=?').run(name||user.name, email||user.email, role||user.role, hash, user.id)
    res.json(db.prepare('SELECT id,name,email,role,locked FROM users WHERE id=?').get(user.id))
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.put('/users/:id/lock', async (req, res) => {
  try {
    const db = await getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: 'Not found' })
    if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot lock yourself' })
    const newLocked = user.locked ? 0 : 1
    db.prepare('UPDATE users SET locked=? WHERE id=?').run(newLocked, user.id)
    res.json({ locked: !!newLocked })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.delete('/users/:id', async (req, res) => {
  try {
    const db = await getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: 'Not found' })
    if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' })
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/campaigns', async (req, res) => {
  try {
    const db = await getDb()
    res.json(db.prepare(`SELECT c.*, u.name as user_name, u.email as user_email, COUNT(s.id) as scan_count FROM campaigns c JOIN users u ON u.id=c.user_id LEFT JOIN scans s ON s.campaign_id=c.id GROUP BY c.id ORDER BY c.created_at DESC`).all())
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.delete('/campaigns/:id', async (req, res) => {
  try {
    const db = await getDb()
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Not found' })
    db.prepare('DELETE FROM scans WHERE campaign_id = ?').run(campaign.id)
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaign.id)
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

module.exports = router
