export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    console.log('=== REQUEST BODY KEYS:', Object.keys(body));
    console.log('=== resumeText length:', body.resumeText?.length || 0);
    console.log('=== resumeText preview:', (body.resumeText || '').slice(0, 300));
    console.log('=== fileBase64 length:', body.fileBase64?.length || 0);

    const { resumeText, fileBase64 } = body;
    let text = '';

    if (resumeText && resumeText.trim().length > 10) {
      text = resumeText.trim().slice(0, 8000);
    } else if (fileBase64) {
      const buffer = Buffer.from(fileBase64, 'base64');
      const raw = buffer.toString('binary');
      const matches = raw.match(/[A-Za-z][A-Za-z0-9 ,.\-@+/(){}\[\]#&:;'"!?%$]{4,}/g) || [];
      text = matches.filter(s => !/^(stream|endstream|obj|endobj|Font|Filter|Length)/.test(s)).join(' ').slice(0, 6000);
    }

    console.log('=== FINAL text length:', text.length);
    console.log('=== FINAL text preview:', text.slice(0, 300));

    if (!text || text.length < 10) {
      return res.status(200).json({ name: null, yoe: 0, education: 2, company: null, role: null, tech_stack: [], _warning: 'empty text' });
    }

    const prompt = `Extract from this resume and return ONLY valid JSON:\n{\n  "name": "full name or null",\n  "yoe": <integer total years>,\n  "education": <0=HS,1=AA,2=BS,3=MS,4=PhD,5=MBA,6=Bootcamp>,\n  "company": "most recent company or null",\n  "role": "most recent title or null",\n  "tech_stack": ["skill1","skill2",...]\n}\n\nResume:\n${text}`;
    console.log('=== PROMPT sent to DeepSeek (first 400 chars):', prompt.slice(0, 400));

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 1024, temperature: 0.1,
        messages: [
          { role: 'system', content: 'You are a precise resume parser. Always return valid JSON only, no other text.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const data = await response.json();
    console.log('=== DeepSeek status:', response.status);
    console.log('=== DeepSeek content:', data.choices?.[0]?.message?.content);

    if (!response.ok) return res.status(500).json({ error: data });
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON', raw: content });
    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.log('=== ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
