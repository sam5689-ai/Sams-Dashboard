// Vercel serverless function: returns the recent WhatsApp message log for
// the Inbox view. Read-only and doesn't clear anything — messages stay
// visible across visits (capped to the most recent 50 by the webhook that
// writes them). Turning one into a task is a separate, on-demand action
// (see api/parse-whatsapp-message.js).
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MESSAGE_LOG_KEY = 'whatsapp:message_log';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!KV_URL || !KV_TOKEN) {
    res.status(200).json({ messages: [] });
    return;
  }

  try {
    const kvRes = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['LRANGE', MESSAGE_LOG_KEY, '0', '-1']),
    });

    if (!kvRes.ok) throw new Error(`KV error (${kvRes.status}): ${await kvRes.text()}`);

    const data = await kvRes.json();
    const rawList = data.result || [];
    const messages = rawList
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    res.status(200).json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
