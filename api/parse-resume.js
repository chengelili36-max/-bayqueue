export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { resumeText, fileBase64, fileType, fileName } = req.body;

    // Get text content - either direct text paste or extract from file
    let text = '';
    if (resumeText && resumeText.trim().length > 50) {
      text = resumeText.trim().slice(0, 8000);
    } else if (fileBase64) {
      const buffer = Buffer.from(fileBase64, 'base64');
      const raw = buffer.toString('binary');
      // Extract readable ASCII strings
      const matches = raw.match(/[A-Za-z][A-Za-z0-9 ,.\-@+/(){}\[\]#&:;'"!?%$]{4,}/g) || [];
      text = matches
        .filter(s => !/^(stream|endstream|xref|obj|endobj|trailer|Type|Subtype|Filter|Length|Font|Encoding|BaseFont|Producer|Creator)/.test(s))
        .join(' ')
        .slice(0, 6000);
    }

    if (!text || text.length < 50) {
      return res.status(200).json({
        name: null, yoe: 0, education: 2,
        company: null, role: null, tech_stack: [],
        _warning: 'Not enough text to parse'
      });
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 1024,
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'You are a precise resume parser. Always return valid JSON only, no other text.' },
          { role: 'user', content: `Extract from this resume and return ONLY valid JSON, no markdown:\n{\n  "name": "full name or null",\n  "yoe": <integer total years of work experience>,\n  "education": <0=HighSchool,1=Associate,2=Bachelor,3=Master,4=PhD,5=MBA,6=Bootcamp>,\n  "company": "most recent company or null",\n  "role": "most recent job title or null",\n  "tech_stack": ["skill1","skill2",...]\n}\n\nResume:\n${text}` }
        ]
      })
    });

    const data = await response.json();
    console.log('DeepSeek status:', response.status);
    console.log('DeepSeek response:', JSON.stringify(data).slice(0, 500));
    if (!response.ok) return res.status(500).json({ error: data });

    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON', raw: content });

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
