// Vercel serverless function. Keeps the Anthropic API key server-side —
// the dashboard's browser code calls this same-origin endpoint instead of
// calling api.anthropic.com directly, so the key is never exposed to viewers.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
    return;
  }

  const { subject, body, from } = req.body || {};
  if (!subject && !body) {
    res.status(400).json({ error: 'Missing subject/body' });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You convert an email into a single actionable task for a personal work dashboard (meetings, hiring, and to-dos).

Today's date is ${today}.
Email from: ${from || 'unknown'}
Email subject: ${subject || ''}
Email body (this may still contain an older quoted message below the newest
text, e.g. after "On ... wrote:" or lines starting with ">" — ignore any
quoted/forwarded history and base the task only on the newest message):
${(body || '').slice(0, 4000)}

Reply with ONLY a JSON object (no markdown fences, no explanation) in exactly this shape:
{"title": "short task title", "description": "a short 1-2 sentence summary of what needs doing, in your own words — never paste the raw email text", "dueDate": "YYYY-MM-DD, or empty string if no date is implied", "priority": "high" | "medium" | "low", "category": "short category like Hiring, Admin, Follow-up"}`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      res.status(502).json({ error: `Anthropic API error: ${errText}` });
      return;
    }

    const data = await anthropicRes.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      res.status(502).json({ error: 'Could not parse AI response', raw: text });
      return;
    }

    const truncate = (s, max) => (typeof s === 'string' && s.length > max ? s.slice(0, max).trim() + '…' : s || '');

    res.status(200).json({
      title: truncate(parsed.title || subject || 'Untitled task', 120),
      description: truncate(parsed.description, 400),
      dueDate: parsed.dueDate || '',
      priority: ['high', 'medium', 'low'].includes(parsed.priority) ? parsed.priority : 'medium',
      category: truncate(parsed.category || 'Email', 40),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
