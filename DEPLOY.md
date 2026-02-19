# Fleet Arena — Deployment Guide
From zero to live: Git → Supabase → Vercel

---

## Prerequisites
- Node.js installed ✓ (you have this)
- GitHub account
- Supabase account → https://supabase.com
- Vercel account → https://vercel.com (free, sign in with GitHub)
- OpenRouter account → https://openrouter.ai

---

## Step 1 — Install Vercel CLI & create GitHub repo

```bash
# Install Vercel CLI globally
npm install -g vercel

# Verify
vercel --version
```

Go to https://github.com/new and create a repo called `fleet-arena` (private).

```bash
# In your terminal, navigate to where you want the project
cd ~/Projects   # or wherever you keep code

# Clone your new empty repo
git clone https://github.com/YOUR_USERNAME/fleet-arena.git
cd fleet-arena
```

---

## Step 2 — Copy the codebase into the repo

Copy all the files from the scaffold you were given into the `fleet-arena` folder.
The structure should look like:

```
fleet-arena/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── stream/route.ts
│   │   │   ├── sessions/route.ts
│   │   │   ├── sessions/turns/route.ts
│   │   │   ├── rankings/route.ts
│   │   │   └── internal/
│   │   │       ├── stats/route.ts
│   │   │       └── behaviors/route.ts
│   │   ├── arena/
│   │   │   ├── page.tsx
│   │   │   └── ArenaClient.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   └── DashboardClient.tsx
│   │   ├── history/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── ShellLayout.tsx
│   │   ├── ModelSelector.tsx
│   │   ├── ResponseCard.tsx
│   │   └── RankingBar.tsx
│   ├── lib/
│   │   ├── models.ts
│   │   ├── auth.ts
│   │   └── supabase/
│   │       ├── client.ts
│   │       └── server.ts
│   └── types/index.ts
├── supabase/schema.sql
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## Step 3 — Install dependencies & run locally

```bash
# Install all packages
npm install

# Copy env file
cp .env.example .env.local
```

Leave `.env.local` open — you'll fill it in during Steps 4 and 5.

---

## Step 4 — Set up Supabase

### 4a. Create project
1. Go to https://supabase.com → New project
2. Name it `fleet-arena`, choose a region close to you
3. Save your database password somewhere safe

### 4b. Run the schema
**Option A — SQL Editor (dashboard)**  
1. In your Supabase project, go to **SQL Editor**
2. Open `supabase/schema.sql` from this repo
3. Paste the entire file into the editor and click **Run**
4. You should see all tables created with no errors

**Option B — psql (terminal)**  
From **Project Settings → Database** copy the **Connection string** (URI, e.g. `postgresql://postgres.[ref]:[YOUR-PASSWORD]@...pooler.supabase.com:5432/postgres`). Then:

```bash
psql "YOUR_CONNECTION_STRING" -f supabase/schema.sql
```

You should see `CREATE TABLE` and `CREATE POLICY` lines with no errors.

### 4c. Enable Email Auth
1. Go to **Authentication → Providers**
2. Make sure **Email** is enabled
3. Under **Authentication → URL Configuration**, set:
   - Site URL: `http://localhost:3000` (change after deployment)

### 4d. Get your keys
Go to **Project Settings → API**. Copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

Add these to your `.env.local`.

---

## Step 5 — Get OpenRouter API key

1. Go to https://openrouter.ai → Sign in → Keys
2. Create a new key, name it `fleet-arena`
3. Copy it → `OPENROUTER_API_KEY` in `.env.local`

Add credits to your OpenRouter account (even $5 is enough to start).

---

## Step 6 — Your .env.local should now look like

```env
NEXT_PUBLIC_SUPABASE_URL=https://xyzxyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENROUTER_API_KEY=sk-or-v1-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
INTERNAL_EMAIL_DOMAIN=fleet.so
```

---

## Step 7 — Run locally and test

```bash
npm run dev
```

Open http://localhost:3000

**Test checklist:**
- [ ] Arena page loads
- [ ] Can select 2 models and click "Start Session"
- [ ] Prompt submits and responses stream in
- [ ] Ranking bar appears after responses finish
- [ ] Submit ranking reveals model names
- [ ] Can continue conversation (Turn 2)
- [ ] New session button works

**Test internal dashboard:**
1. In Supabase → Authentication → Users → Add user
2. Use an email like `test@fleet.so` with any password
3. Sign in to your app (you'll need to add a login page, or temporarily hardcode `isInternal: true` in `ShellLayout.tsx` to test the UI)
4. `/dashboard` should show the analytics

---

## Step 8 — Push to GitHub

```bash
git add .
git commit -m "initial: fleet arena scaffold"
git push origin main
```

---

## Step 9 — Deploy to Vercel

### Option A — CLI (recommended)
```bash
# From inside the fleet-arena directory
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (your account)
# - Link to existing project? N
# - Project name: fleet-arena
# - Directory: ./  (hit enter)
# - Override settings? N

# After first deploy, set env vars:
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add OPENROUTER_API_KEY
vercel env add NEXT_PUBLIC_APP_URL        # set to your vercel URL e.g. https://fleet-arena.vercel.app
vercel env add INTERNAL_EMAIL_DOMAIN      # fleet.so

# Redeploy with env vars
vercel --prod
```

### Option B — Vercel dashboard
1. Go to https://vercel.com → New Project → Import from GitHub
2. Select your `fleet-arena` repo
3. Before clicking Deploy, go to **Environment Variables** and add all 6 vars from Step 6
4. Click **Deploy**

---

## Step 10 — Post-deploy: Update Supabase URLs

In Supabase → **Authentication → URL Configuration**:
- Site URL: `https://fleet-arena.vercel.app` (your actual Vercel URL)
- Add to Redirect URLs: `https://fleet-arena.vercel.app/**`

---

## Step 11 — Add a login page (for internal access)

The internal dashboard requires `@fleet.so` login. Add a simple auth page:

```bash
# Create src/app/login/page.tsx
```

The simplest approach: use Supabase's magic link email, or add Google OAuth. The `@supabase/ssr` package handles sessions automatically via the middleware.

For a quick magic link login page, add this file:

```tsx
// src/app/login/page.tsx
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  const login = async () => {
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` }
    });
    setSent(true);
  };

  return (
    <div style={{ display:"flex", height:"100vh", alignItems:"center", justifyContent:"center", background:"var(--bg)" }}>
      <div style={{ width: 320, padding: 32, background:"var(--surface)", borderRadius:12, border:"1px solid var(--border)" }}>
        <div style={{ fontWeight:800, fontSize:18, marginBottom:6 }}>fleet arena</div>
        <div style={{ color:"var(--muted)", fontSize:13, marginBottom:24 }}>Internal access only</div>
        {sent ? (
          <div style={{ fontSize:13, color:"var(--success)" }}>Check your email for a login link.</div>
        ) : (
          <>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@fleet.so"
              style={{ width:"100%", padding:"10px 14px", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontFamily:"inherit", fontSize:13, marginBottom:10 }}
            />
            <button
              onClick={login}
              style={{ width:"100%", padding:11, background:"var(--accent)", color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}
            >
              Send login link →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## Step 12 — Set up the behavioral analysis worker

Once you have real data flowing, add the async analysis job. The simplest setup:

1. Create a Supabase Edge Function called `analyze-session`
2. Trigger it via a webhook when `sessions.is_complete` becomes `true`
3. The function calls OpenRouter with an LLM-as-judge prompt and writes to `behavioral_flags`

```bash
# Install Supabase CLI
npm install -g supabase

# Init (only needed once)
supabase init

# Create the function
supabase functions new analyze-session
```

Then add the function code to `supabase/functions/analyze-session/index.ts` — it receives the session ID, fetches all turns + responses, and calls Claude/GPT to annotate behaviors.

---

## Development workflow going forward

```bash
# Daily dev
npm run dev              # local server at localhost:3000

# Push changes
git add .
git commit -m "feat: ..."
git push origin main     # Vercel auto-deploys on push to main

# Check production logs
vercel logs
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Responses not streaming | Check `OPENROUTER_API_KEY` is set and has credits |
| Dashboard returns 401 | User is not signed in with a @fleet.so email |
| Dashboard returns 403 | Email doesn't match `INTERNAL_EMAIL_DOMAIN` env var |
| Supabase RLS errors | Make sure you ran the full `schema.sql` including the policy statements |
| Types errors on build | Run `npm run lint` to find the issue |
| Vercel build fails | Check all env vars are set in Vercel dashboard → Settings → Environment Variables |
