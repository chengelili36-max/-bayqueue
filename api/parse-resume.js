import { inflateSync, unzipSync } from 'zlib';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { resumeText, fileBase64 } = req.body;
    let text = '';

    if (resumeText && resumeText.trim().length > 10) {
      text = resumeText.trim().slice(0, 8000);
    } else if (fileBase64) {
      const buffer = Buffer.from(fileBase64, 'base64');
      text = extractPDFText(buffer);
    }

    console.log('Text length:', text.length);
    console.log('Text preview:', text.slice(0, 300));

    if (!text || text.length < 20) {
      return res.status(200).json({ name: null, yoe: 0, education: 2, company: null, role: null, tech_stack: [], _warning: 'empty' });
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat', max_tokens: 1024, temperature: 0.1,
        messages: [
          { role: 'system', content: 'You are a precise resume parser. Always return valid JSON only, no other text.' },
          { role: 'user', content: `Extract from this resume and return ONLY valid JSON:\n{\n  "name": "full name or null",\n  "yoe": <integer total years>,\n  "education": <0=HS,1=AA,2=BS,3=MS,4=PhD,5=MBA,6=Bootcamp>,\n  "company": "most recent company or null",\n  "role": "most recent title or null",\n  "tech_stack": ["skill1","skill2",...]\n}\n\nResume:\n${text}` }
        ]
      })
    });

    const data = await response.json();
    console.log('DeepSeek:', data.choices?.[0]?.message?.content);
    if (!response.ok) return res.status(500).json({ error: data });
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON', raw: content });
    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.log('ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function extractPDFText(buffer) {
  let text = '';
  const raw = buffer.toString('binary');

  // Find all compressed streams and decompress them
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRegex.exec(raw)) !== null) {
    const streamData = match[1];
    const streamBuf = Buffer.from(streamData, 'binary');

    // Try zlib decompression
    let decompressed = null;
    try { decompressed = inflateSync(streamBuf).toString('utf-8'); } catch (e) {}
    if (!decompressed) {
      try { decompressed = unzipSync(streamBuf).toString('utf-8'); } catch (e) {}
    }
    // Fallback: use raw stream as-is
    if (!decompressed) decompressed = streamData;

    // Extract text from PDF operators: Tj, TJ, '
    const tjMatches = decompressed.match(/\(([^)\\]|\\.)*\)\s*Tj/g) || [];
    tjMatches.forEach(m => {
      const inner = m.match(/\(([\s\S]*?)\)\s*Tj$/);
      if (inner) text += inner[1].replace(/\\n/g, ' ').replace(/\\\(/g, '(').replace(/\\\)/g, ')') + ' ';
    });

    const tjArrays = decompressed.match(/\[[\s\S]*?\]\s*TJ/g) || [];
    tjArrays.forEach(tj => {
      const parts = tj.match(/\(([^)\\]|\\.)*\)/g) || [];
      parts.forEach(p => { text += p.slice(1, -1).replace(/\\\(/g, '(').replace(/\\\)/g, ')') + ' '; });
    });
  }

  // Fallback: extract readable strings if decompression found nothing
  if (text.trim().length < 100) {
    const ascii = raw.match(/[A-Za-z][A-Za-z0-9 ,.\-@+(){}&:;'"!?]{6,}/g) || [];
    text = ascii
      .filter(s => !/^(stream|endstream|xref|endobj|startxref|Producer|Creator|CreationDate|ModDate|Filter|FlateDecode|Length|Subtype|Type|Font|Encoding|BaseFont|ToUnicode|Widths|FontDescriptor|MediaBox|Resources|Contents|Pages|Catalog)/.test(s))
      .join(' ');
  }

  return text.replace(/\s{2,}/g, ' ').trim().slice(0, 6000);
}
