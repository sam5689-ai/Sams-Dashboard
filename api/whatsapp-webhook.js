// Vercel serverless function: receives WhatsApp Cloud API webhook events,
// turns message text into a task via Claude, and queues it in a small
// Redis store (Vercel KV / Upstash) for the dashboard to pick up next time
// it's open. This is receive-only — no WhatsApp access token is needed
// since we never call the Graph API to send anything back.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PENDING_KEY = 'whatsapp:pending_tasks';

async function kvCommand(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV error (${res.status}): ${await res.text()}`);
  return res.json();
}

async function parseMessageToTask(text, from) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Server is missing ANTHROPIC_API_KEY');

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You convert a short WhatsApp message into a single actionable task for a personal work dashboard (meetings, hiring, and to-dos).

Today's date is ${today}.
Message from: ${from || 'unknown'}
Message text:
${(text || '').slice(0, 2000)}

Reply with ONLY a JSON object (no markdown fences, no explanation) in exactly this shape:
{"title": "short task title", "description": "a short 1-2 sentence summary of what needs doing, in your own words", "dueDate": "YYYY-MM-DD, or empty string if no date is implied", "priority": "high" | "medium" | "low", "category": "short category like Hiring, Admin, Follow-up"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`);

  const data = await res.json();
  const textOut = (data.content && data.content[0] && data.content[0].text) || '{}';
  const jsonMatch = textOut.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textOut);

  const truncate = (s, max) => (typeof s === 'string' && s.length > max ? s.slice(0, max).trim() + '…' : s || '');
  return {
    title: truncate(parsed.title || 'WhatsApp task', 120),
    description: truncate(parsed.description, 400),
    dueDate: parsed.dueDate || '',
    priority: ['high', 'medium', 'low'].includes(parsed.priority) ? parsed.priority : 'medium',
    category: truncate(parsed.category || 'WhatsApp', 40),
  };
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
  // even if something below fails for one message.
  try {
    const entry = (req.body && req.body.entry && req.body.entry[0]) || {};
    const change = (entry.changes && entry.changes[0]) || {};
    const value = change.value || {};
    const messages = value.messages || [];

    for (const message of messages) {
      if (message.type !== 'text') continue;
      try {
        const text = (message.text && message.text.body) || '';
        const from = message.from || '';
        const contact = (value.contacts || []).find((c) => c.wa_id === from);
        const label = (contact && contact.profile && contact.profile.name) || from;

        const task = await parseMessageToTask(text, label);
        task.status = 'todo';

        if (KV_URL && KV_TOKEN) {
          await kvCommand(['LPUSH', PENDING_KEY, JSON.stringify(task)]);
        }
      } catch (perMessageErr) {
        console.error('Failed to process one WhatsApp message:', perMessageErr);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    res.status(200).json({ ok: false, error: err.message });
  }
};
