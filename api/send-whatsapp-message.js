// Vercel serverless function: sends a free-form WhatsApp reply via the
// Graph API. Unlike the rest of the WhatsApp integration, this requires a
// real access token (kept server-side) since sending is a genuine write
// action, not just receiving. Meta only allows free-form (non-template)
// replies within 24 hours of the customer's last message — outside that
// window this will fail with a clear error rather than a cryptic one.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MESSAGE_LOG_KEY = 'whatsapp:message_log';
const MESSAGE_LOG_MAX = 50;

async function kvCommand(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV error (${res.status}): ${await res.text()}`);
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    res.status(500).json({ error: 'Server is missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID' });
    return;
  }

  const { to, text } = req.body || {};
  if (!to || !text) {
    res.status(400).json({ error: 'Missing to/text' });
    return;
  }

  try {
    const graphRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    const data = await graphRes.json();

    if (!graphRes.ok) {
      const metaMessage = (data.error && data.error.message) || 'Unknown error';
      // Meta's error code 131047 (and similar "re-engagement" errors) means
      // the 24-hour free-form messaging window has closed for this contact.
      const isWindowClosed = metaMessage.toLowerCase().includes('24') || metaMessage.toLowerCase().includes('window') || metaMessage.toLowerCase().includes('re-engage');
      res.status(502).json({
        error: isWindowClosed
          ? `Can't send a free-form reply — it's been more than 24 hours since this contact last messaged you, so WhatsApp only allows pre-approved templates now. (${metaMessage})`
          : `WhatsApp API error: ${metaMessage}`,
      });
      return;
    }

    if (KV_URL && KV_TOKEN) {
      try {
        const logEntry = {
          id: (data.messages && data.messages[0] && data.messages[0].id) || '',
          from: to,
          name: '',
          text,
          timestamp: new Date().toISOString(),
          direction: 'out',
        };
        await kvCommand(['LPUSH', MESSAGE_LOG_KEY, JSON.stringify(logEntry)]);
        await kvCommand(['LTRIM', MESSAGE_LOG_KEY, '0', String(MESSAGE_LOG_MAX - 1)]);
      } catch (logErr) {
        console.error('Failed to log outbound WhatsApp message:', logErr);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
