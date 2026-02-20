const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const { getDb } = require('./db/database')

const app = express()
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

app.use(cors({
  origin: process.env.CORS_ORIGIN || (NODE_ENV === 'production' ? false : 'http://localhost:5173'),
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Initialize DB then mount routes
getDb().then(() => {
  app.use('/api/auth', require('./routes/auth'))
  app.use('/api/campaigns', require('./routes/campaigns'))
  app.use('/api/admin', require('./routes/admin'))
  app.use('/r', require('./routes/redirect'))

  // SPA fallback in production
  if (NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'dist')
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath))
      app.get('*', (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/r/') || req.path.startsWith('/uploads')) return
        res.sendFile(path.join(distPath, 'index.html'))
      })
    }
  }

  app.listen(PORT, () => {
    console.log(`MiniQR server running on http://localhost:${PORT} [${NODE_ENV}]`)
  })
}).catch(err => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})
