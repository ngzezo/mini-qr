const router = require('express').Router()
const { getDb } = require('../db/database')
const authMiddleware = require('../middleware/auth')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { nanoid } = require('nanoid')

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${nanoid(8)}${path.extname(file.originalname)}`)
})
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } })

router.use(authMiddleware)

router.get('/', async (req, res) => {
  try {
    const db = await getDb()
    const campaigns = db.prepare(`
      SELECT c.id, c.user_id, c.name, c.destination_url, c.short_code, c.fg_color, c.bg_color, c.logo_url, c.qr_options, c.created_at, c.updated_at,
             COUNT(s.id) as scan_count
      FROM campaigns c
      LEFT JOIN scans s ON s.campaign_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all(req.user.id)
    res.json(campaigns)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.post('/', upload.single('logo'), async (req, res) => {
  try {
    const { name, destination_url, fg_color, bg_color, qr_options } = req.body
    if (!name || !destination_url) return res.status(400).json({ error: 'name and destination_url required' })
    const db = await getDb()
    // Enforce unique name per user
    const existing = db.prepare('SELECT id FROM campaigns WHERE user_id = ? AND name = ?').get(req.user.id, name)
    if (existing) return res.status(409).json({ error: `You already have a campaign named "${name}". Please choose a different name.` })
    const short_code = nanoid(8)
    const logo_url = req.file ? `/uploads/${req.file.filename}` : null
    // Keep qr_options as-is (base64 images are allowed; body limit is 10MB)
    const sanitizedQrOptions = qr_options || null
    const result = db.prepare(`INSERT INTO campaigns (user_id, name, destination_url, short_code, fg_color, bg_color, logo_url, qr_options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, name, destination_url, short_code, fg_color || '#000000', bg_color || '#ffffff', logo_url, sanitizedQrOptions
    )
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(campaign)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/:id', async (req, res) => {
  try {
    const db = await getDb()
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Not found' })
    if (campaign.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
    res.json(campaign)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.put('/:id', upload.single('logo'), async (req, res) => {
  try {
    const db = await getDb()
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Not found' })
    if (campaign.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
    const { name, destination_url, fg_color, bg_color, qr_options } = req.body
    const logo_url = req.file ? `/uploads/${req.file.filename}` : campaign.logo_url
    db.prepare(`UPDATE campaigns SET name=?, destination_url=?, fg_color=?, bg_color=?, logo_url=?, qr_options=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      name || campaign.name, destination_url || campaign.destination_url,
      fg_color || campaign.fg_color, bg_color || campaign.bg_color, logo_url,
      qr_options !== undefined ? qr_options : campaign.qr_options, campaign.id
    )
    res.json(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id))
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb()
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Not found' })
    if (campaign.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
    db.prepare('DELETE FROM scans WHERE campaign_id = ?').run(campaign.id)
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaign.id)
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/:id/analytics', async (req, res) => {
  try {
    const db = await getDb()
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Not found' })
    if (campaign.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

    const total = db.prepare('SELECT COUNT(*) as c FROM scans WHERE campaign_id = ?').get(campaign.id).c
    const today = db.prepare(`SELECT COUNT(*) as c FROM scans WHERE campaign_id = ? AND date(created_at) = date('now')`).get(campaign.id).c
    const thisWeek = db.prepare(`SELECT COUNT(*) as c FROM scans WHERE campaign_id = ? AND created_at >= datetime('now','-7 days')`).get(campaign.id).c
    const thisMonth = db.prepare(`SELECT COUNT(*) as c FROM scans WHERE campaign_id = ? AND created_at >= datetime('now','-30 days')`).get(campaign.id).c
    const recentScans = db.prepare('SELECT id,ip,user_agent,country,city,latitude,longitude,created_at FROM scans WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 50').all(campaign.id)
    const dailyScans = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM scans WHERE campaign_id = ? AND created_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC`).all(campaign.id)
    const topCountries = db.prepare('SELECT country, COUNT(*) as count FROM scans WHERE campaign_id = ? AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10').all(campaign.id)
    const coordinates = db.prepare('SELECT latitude, longitude, country, city FROM scans WHERE campaign_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 500').all(campaign.id)

    res.json({ campaign, stats: { total, today, thisWeek, thisMonth }, recentScans, dailyScans, topCountries, coordinates })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

module.exports = router
