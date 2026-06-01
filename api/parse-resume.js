export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileBase64, fileType, fileName } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'No file data' });

    const isPDF = fileType === 'application/pdf' || fileName?.endsWith('.pdf');

    const messages = isPDF
      ? [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 }
            },
            {
              type: 'text',
              text: `Extract the following from this resume and return ONLY a valid JSON object, no explanation, no markdown:
{
  "name": "full name or null",
  "yoe": <integer, total years of work experience>,
  "education": <0=HighSchool, 1=Associate, 2=Bachelor, 3=Master, 4=PhD, 5=MBA, 6=Bootcamp>,
  "company": "most recent company name or null",
  "role": "most recent job title or null",
  "tech_stack": ["skill1", "skill2", ...] (every technical skill, language, framework, tool, platform found)
}`
            }
          ]
        }]
      : [{
          role: 'user',
          content: `Extract from this resume text and return ONLY a valid JSON object, no explanation:\n{\n  "name": "full name or null",\n  "yoe": <integer>,\n  "education": <0=HighSchool,1=Associate,2=Bachelor,3=Master,4=PhD,5=MBA,6=Bootcamp>,\n  "company": "most recent company or null",\n  "role": "most recent title or null",\n  "tech_stack": ["skill1","skill2",...]\n}\nResume:\n${Buffer.from(fileBase64, 'base64').toString('utf-8').slice(0, 8000)}`
        }];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });

    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON in response', raw: text });

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
