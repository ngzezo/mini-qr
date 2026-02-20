const router = require('express').Router()
const { getDb } = require('../db/database')
const { getGeoLocation } = require('../utils/geo')

router.get('/:shortCode', async (req, res) => {
  try {
    const db = await getDb()
    const campaign = db.prepare('SELECT * FROM campaigns WHERE short_code = ?').get(req.params.shortCode)
    if (!campaign) return res.status(404).send('QR code not found')

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
    const userAgent = req.headers['user-agent'] || ''

    res.redirect(302, campaign.destination_url)

    getGeoLocation(ip).then(geo => {
      getDb().then(db2 => {
        db2.prepare('INSERT INTO scans (campaign_id, ip, user_agent, country, city, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          campaign.id, ip, userAgent, geo.country, geo.city, geo.latitude, geo.longitude
        )
      }).catch(console.error)
    }).catch(console.error)
  } catch (err) {
    console.error(err)
    res.status(500).send('Server error')
  }
})

module.exports = router
