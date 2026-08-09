// src/utils/telegram.js
// Sends order preparation messages to Telegram group

const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
const CHAT_ID   = import.meta.env.VITE_TELEGRAM_CHAT_ID

/**
 * Build a plain-text order message (no prices — staff prep view)
 * @param {object} invoice  - invoice object from API
 * @param {string} label    - optional label e.g. "ថ្មី", "កែប្រែ", "បោះពុម្ព"
 */
export function buildOrderMessage(invoice, label = 'ថ្មី') {
  const d    = new Date(invoice.createdAt)
  const date = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  const cust = invoice.partnerName || invoice.customerName || 'Walk-in Customer'
  const phone = invoice.customerPhone ? `\n📞 ${invoice.customerPhone}` : ''

  const items = (invoice.items || [])
    .map((item, i) => {
      const brand = item.brand ? ` · ${item.brand}` : ''
      const size  = item.unitValue ? ` (${item.unitValue}${item.unit})` : ''
      return `${i + 1}. ${item.productName}${brand}${size} × *${item.quantity}*`
    })
    .join('\n')

  return [
    `🛒 *ការបញ្ជាទិញ${label === 'ថ្មី' ? 'ថ្មី' : ` [${label}]`}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 *អតិថិជន:* ${cust}${phone}`,
    `📋 *លេខ:* \`${invoice.invoiceNumber}\``,
    `📅 *ថ្ងៃ:* ${date}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 *បញ្ជីទំនិញ:*`,
    items || '_(គ្មានទំនិញ)_',
    `━━━━━━━━━━━━━━━━━━━━`,
    `✅ *សូមរៀបចំការបញ្ជាទិញ!*`,
  ].join('\n')
}

/**
 * Send a message to the Telegram group
 * @param {string} text - markdown text
 * @returns {Promise<boolean>} true if sent OK
 */
export async function sendToTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('Telegram: BOT_TOKEN or CHAT_ID missing in .env')
    return false
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    CHAT_ID,
          text,
          parse_mode: 'Markdown',
        }),
      }
    )
    const data = await res.json()
    if (!data.ok) console.error('Telegram error:', data.description)
    return data.ok
  } catch (err) {
    console.error('Telegram fetch error:', err)
    return false
  }
}

/**
 * Convenience: build + send in one call
 */
export async function sendOrderToTelegram(invoice, label = 'ថ្មី') {
  const text = buildOrderMessage(invoice, label)
  return sendToTelegram(text)
}