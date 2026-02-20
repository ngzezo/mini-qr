const router = require('express').Router()
const { getDb } = require('../db/database')
const authMiddleware = require('../middleware/auth')
const adminMiddleware = require('../middleware/admin')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const type = req.params.type // 'logo' or 'favicon'
    const ext = path.extname(file.originalname).toLowerCase() || '.png'
    cb(null, `site_${type}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image files are allowed'))
  }
})

// Public: get current site settings (logo, favicon URLs)
router.get('/', async (_req, res) => {
  try {
    const db = await getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all()
    const result = {}
    rows.forEach(r => { result[r.key] = r.value })
    res.json(result)
  } catch {
    res.json({})
  }
})

// Admin: upload logo or favicon
router.post('/upload/:type', authMiddleware, adminMiddleware, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    next()
  })
}, async (req, res) => {
  try {
    const { type } = req.params
    if (!['logo', 'favicon'].includes(type)) {
      return res.status(400).json({ error: 'type must be logo or favicon' })
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const db = await getDb()
    const url = `/uploads/${req.file.filename}`
    const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(type)
    if (existing) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(url, type)
    } else {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(type, url)
    }
    res.json({ url })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Upload failed' })
  }
})

module.exports = router
