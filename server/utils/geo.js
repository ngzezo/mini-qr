// Free IP geolocation using ip-api.com (no API key needed)
const fetch = require('node-fetch')

async function getGeoLocation(ip) {
  try {
    // Skip for localhost/private IPs
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168') || ip.startsWith('10.')) {
      return { country: 'Local', city: 'Local', latitude: null, longitude: null }
    }
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,lat,lon,status`, {
      timeout: 3000
    })
    const data = await res.json()
    if (data.status === 'success') {
      return {
        country: data.country || null,
        city: data.city || null,
        latitude: data.lat || null,
        longitude: data.lon || null
      }
    }
  } catch (_) {}
  return { country: null, city: null, latitude: null, longitude: null }
}

module.exports = { getGeoLocation }
