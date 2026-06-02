export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileBase64, fileType, fileName } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'No file data' });

    const buffer = Buffer.from(fileBase64, 'base64');

    // Try to extract text from PDF stream objects
    const raw = buffer.toString('binary');
    let resumeText = '';

    // Method 1: Extract text from PDF content streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(raw)) !== null) {
      const streamContent = match[1];
      // Look for text showing operators: Tj, TJ, '
      const textMatches = streamContent.match(/\(([^\)\\]|\\.)*\)\s*(Tj|'|")/g) || [];
      textMatches.forEach(tm => {
        const inner = tm.match(/\(([^\)\\]|\\.)*\)/);
        if (inner) {
          const txt = inner[0].slice(1, -1)
            .replace(/\\n/g, ' ')
            .replace(/\\r/g, ' ')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\');
          resumeText += txt + ' ';
        }
      });

      // Also handle TJ arrays: [(text) num (text)] TJ
      const tjArrays = streamContent.match(/\[([^\]]*)\]\s*TJ/g) || [];
      tjArrays.forEach(tj => {
        const parts = tj.match(/\(([^\)\\]|\\.)*\)/g) || [];
        parts.forEach(p => {
          resumeText += p.slice(1, -1).replace(/\\\(/g, '(').replace(/\\\)/g, ')') + ' ';
        });
      });
    }

    // Method 2: fallback - grab all ASCII strings
    if (resumeText.trim().length < 100) {
      const asciiReg = /[A-Za-z][A-Za-z0-9 ,.\-@+/(){}\[\]#&:;'"!?%$]{5,}/g;
      const matches = raw.match(asciiReg) || [];
      resumeText = matches
        .filter(s => !/^(stream|endstream|xref|obj|endobj|trailer|Type|Subtype|Filter|Length|Width|Height|BitsPerComponent|ColorSpace|Producer|Creator|CreationDate|ModDate|Pages|MediaBox|Resources|Font|Encoding|BaseFont|Widths|FirstChar|LastChar|FontDescriptor)/.test(s))
        .join(' ')
        .slice(0, 6000);
    }

    resumeText = resumeText.replace(/\s{2,}/g, ' ').trim().slice(0, 6000);

    // If still can't extract, return warning
    if (resumeText.length < 80) {
      return res.status(200).json({
        name: null, yoe: 0, education: 2,
        company: null, role: null, tech_stack: [],
        _warning: 'Could not extract PDF text'
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
