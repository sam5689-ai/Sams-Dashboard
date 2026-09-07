// Vercel serverless function: returns any tasks that arrived via WhatsApp
// since the last check, and clears the queue. The dashboard polls this on
// load and periodically, since the webhook can fire while no browser tab
// is open.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PENDING_KEY = 'whatsapp:pending_tasks';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!KV_URL || !KV_TOKEN) {
    res.status(200).json({ tasks: [] });
    return;
  }

  try {
    const pipelineRes = await fetch(`${KV_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['LRANGE', PENDING_KEY, '0', '-1'],
        ['DEL', PENDING_KEY],
      ]),
    });

    if (!pipelineRes.ok) throw new Error(`KV error (${pipelineRes.status}): ${await pipelineRes.text()}`);

    const results = await pipelineRes.json();
    const rawList = (results[0] && results[0].result) || [];
    const tasks = rawList
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    res.status(200).json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
