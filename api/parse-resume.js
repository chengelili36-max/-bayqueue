export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileBase64, fileType, fileName } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'No file data' });

    // Extract readable text from base64 (works for text-based PDFs)
    const raw = Buffer.from(fileBase64, 'base64').toString('latin1');
    
    // Extract text between BT and ET markers (PDF text blocks)
    let resumeText = '';
    const btMatches = raw.match(/BT[\s\S]*?ET/g) || [];
    if (btMatches.length > 0) {
      btMatches.forEach(block => {
        const tjMatches = block.match(/\(([^)]+)\)\s*Tj/g) || [];
        tjMatches.forEach(m => {
          const txt = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '');
          resumeText += txt + ' ';
        });
      });
    }
    
    // Fallback: extract any readable ASCII strings >= 4 chars
    if (resumeText.trim().length < 100) {
      const asciiMatches = raw.match(/[\x20-\x7E]{4,}/g) || [];
      resumeText = asciiMatches
        .filter(s => !s.includes('obj') && !s.includes('stream') && !/^[\d\s.]+$/.test(s))
        .join(' ')
        .slice(0, 6000);
    }

    resumeText = resumeText.replace(/\s{3,}/g, ' ').trim().slice(0, 6000);

    if (resumeText.length < 50) {
      return res.status(200).json({
        name: null, yoe: 0, education: 2,
        company: null, role: null, tech_stack: [],
        _warning: 'Could not extract text from PDF. Please fill manually.'
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
          { role: 'user', content: `Extract from this resume and return ONLY valid JSON:\n{\n  "name": "full name or null",\n  "yoe": <integer total years of work experience>,\n  "education": <0=HighSchool,1=Associate,2=Bachelor,3=Master,4=PhD,5=MBA,6=Bootcamp>,\n  "company": "most recent company or null",\n  "role": "most recent job title or null",\n  "tech_stack": ["skill1","skill2",...]\n}\n\nResume:\n${resumeText}` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });

    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON', raw: text });

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
