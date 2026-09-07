// Vercel serverless function: receives WhatsApp Cloud API webhook events
// and logs each message to a small Redis store (Vercel KV / Upstash) for
// the WhatsApp Inbox view to display. Turning a message into a task is a
// manual, on-demand action from that view (see api/parse-whatsapp-message.js)
// rather than automatic — this endpoint's only job is to capture messages
// as they arrive, since it can fire while no browser tab is open.
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
  // Meta calls this once (GET) when you save the webhook config, to prove
  // you control the endpoint.
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Verification failed');
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Always acknowledge with 200 so Meta doesn't retry/disable the webhook,
  // even if something below fails.
  try {
    const entry = (req.body && req.body.entry && req.body.entry[0]) || {};
    const change = (entry.changes && entry.changes[0]) || {};
    const value = change.value || {};
    const messages = value.messages || [];

    for (const message of messages) {
      if (message.type !== 'text') continue;
      const text = (message.text && message.text.body) || '';
      const from = message.from || '';
      const contact = (value.contacts || []).find((c) => c.wa_id === from);
      const name = (contact && contact.profile && contact.profile.name) || '';
      const timestamp = message.timestamp
        ? new Date(Number(message.timestamp) * 1000).toISOString()
        : new Date().toISOString();

      if (KV_URL && KV_TOKEN) {
        try {
          const logEntry = { id: message.id || '', from, name, text, timestamp };
          await kvCommand(['LPUSH', MESSAGE_LOG_KEY, JSON.stringify(logEntry)]);
          await kvCommand(['LTRIM', MESSAGE_LOG_KEY, '0', String(MESSAGE_LOG_MAX - 1)]);
        } catch (logErr) {
          console.error('Failed to log WhatsApp message:', logErr);
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    res.status(200).json({ ok: false, error: err.message });
  }
};
