# BayQueue — 湾区求职排名系统

> **Like a concert waiting room, but for Bay Area job seekers.**  
> Upload your resume. See where you rank among active candidates in your field.

🔗 **Live:** [bayqueue.vercel.app](https://bayqueue.vercel.app)

---

## What It Does

BayQueue tracks active job seekers in the San Francisco Bay Area and ranks them by **Years of Experience (YoE)**, **education**, and **tech stack** — within their specific role category (SWE, Data/AI, PM, Design, DevOps).

Think of it like a concert ticket waiting room: you can see exactly how many people are ahead of you, your percentile, and your score breakdown — in real time.

---

## Features

- 🎫 **Role-based queues** — SWE, Data & AI, PM, Design, Infrastructure, and more. You only compete with people in the same field.
- 📄 **PDF resume parsing** — Upload your resume and AI auto-fills your profile (YoE, tech stack, education, company, role).
- 🌐 **Bilingual** — Full Chinese / English toggle (中文 / EN).
- 📊 **Live layoff tracker** — Real-time Bay Area layoff data from California WARN Act + layoffs.fyi.
- 🏆 **Real-time ranking** — Every submission updates the live queue. Your rank changes as more people join.
- 🔍 **Searchable dropdowns** — 60+ Bay Area companies and 35+ job roles with custom entry support.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JS (no framework) |
| PDF Parsing | PDF.js (browser-side text extraction) |
| AI Resume Parser | DeepSeek API (`deepseek-chat`) |
| Backend API | Vercel Serverless Functions (Node.js) |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel |
| Data Sources | California WARN Act, layoffs.fyi |

---

## Architecture

```
User Browser
    ↓  Upload PDF
PDF.js (browser)  →  extract text
    ↓
POST /api/parse-resume  (Vercel Serverless)
    ↓
DeepSeek API  →  structured JSON
    ↓
Auto-fill form
    ↓  User submits
Supabase PostgreSQL
    ↓
Real-time ranking within role queue
    ↓
Display: #position, percentile, score breakdown
```

---

## Ranking Algorithm

```
Total Score (max 100) = YoE Score + Education Score + Tech Stack Score

YoE Score       = min(yoe × 2.5, 50)      → max 50 pts
Education Score = HS:0  AA:5  BS:18  MS:24  PhD:30  MBA:22  Bootcamp:10
Tech Stack      = sum of skill weights      → max 20 pts

Skill weights:
  4pts — Python, ML/AI, LLM/GenAI, React, Kubernetes
  3pts — AWS, GCP, Azure, Node.js, Go, Rust, PyTorch/TensorFlow
  2pts — TypeScript, SQL, Docker, Java, C++/C, Spark/Kafka
  1pts — Swift/iOS, Figma/Design
```

---

## Queue Categories

| Queue | Roles Included |
|---|---|
| SWE Queue | Software Engineer, Frontend, Backend, Full Stack, Mobile, Embedded |
| Data & AI Queue | Data Scientist, ML Engineer, Data Analyst, Data Engineer, Research Scientist |
| PM Queue | Product Manager, TPM, Program Manager |
| Design Queue | UX Designer, UI Designer, UX Researcher |
| Infrastructure Queue | DevOps, SRE, Platform Engineer, Security Engineer |
| Other Queue | Sales, Operations, Finance, HR, and all others |

---

## Project Structure

```
bayqueue/
├── index.html              # Full frontend (single file)
├── api/
│   └── parse-resume.js     # Vercel serverless function (DeepSeek resume parser)
├── package.json
└── README.md
```

---

## Local Development

```bash
# Clone
git clone https://github.com/chengelili36-max/-bayqueue.git
cd -bayqueue

# Install dependencies
npm install

# Set environment variables
# Create .env file:
# DEEPSEEK_API_KEY=your_key_here
# SUPABASE_URL=your_supabase_url
# SUPABASE_KEY=your_supabase_anon_key

# Run locally with Vercel CLI
vercel dev
```

---

## Database Setup (Supabase)

Run this SQL in your Supabase SQL Editor:

```sql
create table job_seekers (
  id uuid primary key default gen_random_uuid(),
  name text,
  company text,
  education integer not null,
  role text,
  yoe integer not null,
  tech_stack text[] default '{}',
  score integer default 0,
  rank integer default 0,
  queue_category text,
  created_at timestamp with time zone default now()
);

create index on job_seekers (score desc);
create index on job_seekers (queue_category, score desc);

alter table job_seekers enable row level security;

create policy "anyone can insert"
  on job_seekers for insert
  with check (true);

create policy "anyone can read"
  on job_seekers for select
  using (true);
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key for resume parsing |
| Supabase credentials | Hardcoded in `index.html` (anon/public key — safe for frontend) |

---

## Data Sources

- **California WARN Act** — Public layoff filings from CA Employment Development Department
- **layoffs.fyi** — Community-tracked tech layoff data (2026)
- **User submissions** — Self-reported profiles from job seekers

---

## Roadmap

- [ ] Fix Supabase real-time ranking (currently uses fallback for new users)
- [ ] LinkedIn OAuth login (skip manual form)
- [ ] "Within your company" ranking (e.g., rank among 4,000 Block layoffs)
- [ ] Email notifications when your rank changes
- [ ] Recruiter-facing dashboard (flip side of the marketplace)
- [ ] Mobile app

---

## Contributing

Pull requests welcome. For major changes, open an issue first.

---

## License

MIT

---

*Built in one day. Deployed on Vercel. Data from public sources.*  
*If you were laid off in the Bay Area — [check your rank](https://bayqueue.vercel.app).*
