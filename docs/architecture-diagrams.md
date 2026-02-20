# Fleet Arena — Architecture diagrams

These Mermaid diagrams can be rendered in GitHub, GitLab, or any Mermaid-compatible viewer.

---

## System context (high level)

```mermaid
flowchart TB
  User["User\n(evaluates & ranks models)"]
  Internal["Internal user\n(@fleet.so, dashboard)"]

  subgraph FleetArena["Fleet Arena — Next.js"]
    App[App Router\narena, history, dashboard]
    API[API routes\nsessions, stream, rankings, internal]
  end

  Supabase["Supabase\n(Postgres + Auth)"]
  OpenRouter["OpenRouter\n(LLM API)"]
  Inngest["Inngest\n(background jobs)"]
  Upstash["Upstash Redis\n(rate limit, optional)"]

  User --> App
  Internal --> App
  App --> API
  API --> Supabase
  API --> OpenRouter
  API --> Inngest
  API --> Upstash
  Inngest -.->|invokes| API
```

---

## Container view (Next.js app)

```mermaid
flowchart TB
  subgraph "Fleet Arena (Next.js on Vercel)"
    subgraph "Frontend"
      Arena["Arena\n/model selection, turns, ranking"]
      History["History\n/session list"]
      Dashboard["Dashboard\n/stats, behaviors, export"]
      Login["Login\n/magic link"]
    end

    subgraph "API layer"
      SessionsAPI["/api/sessions\n/create, complete, resume"]
      TurnsAPI["/api/sessions/turns"]
      StreamAPI["/api/stream\n/SSE, N models"]
      RankingsAPI["/api/rankings"]
      AnalyzeAPI["/api/analyze\n/manual trigger → Inngest"]
      InternalAPI["/api/internal/*\n/stats, behaviors, export"]
      InngestWebhook["/api/inngest\n/Inngest serve"]
    end

    Middleware["Middleware\n/auth, internal domain"]
  end

  subgraph "Background"
    AnalyzeFn["Inngest: analyze-session\n/load data, judge, write flags"]
    BackfillFn["Inngest: backfill-analysis"]
  end

  Arena --> SessionsAPI
  Arena --> TurnsAPI
  Arena --> StreamAPI
  Arena --> RankingsAPI
  History --> SessionsAPI
  Dashboard --> InternalAPI
  Login --> Middleware
  StreamAPI --> AnalyzeFn
  SessionsAPI --> InngestWebhook
  InngestWebhook --> AnalyzeFn
  InngestWebhook --> BackfillFn
```

---

## Data flow: one arena turn

```mermaid
flowchart LR
  subgraph Client
    UI[User: prompt + rank]
  end

  subgraph API
    T[POST /turns]
    S[POST /stream]
    R[POST /rankings]
  end

  subgraph Store["Supabase"]
    sessions[(sessions)]
    turns[(turns)]
    responses[(responses)]
    rankings[(rankings)]
  end

  subgraph External
    OR[OpenRouter]
  end

  UI --> T
  T --> turns
  T --> sessions
  UI --> S
  S --> responses
  S --> OR
  OR --> S
  S --> responses
  UI --> R
  R --> rankings
  R --> turns
```

---

## Database entity relationship (simplified)

```mermaid
erDiagram
  profiles ||--o{ sessions : "has"
  sessions ||--o{ turns : "contains"
  turns ||--o{ responses : "has"
  turns ||--o{ rankings : "has"
  sessions ||--o{ behavioral_flags : "has"

  profiles {
    uuid id PK
    text email
    boolean is_internal
    int total_sessions
    int total_rankings
  }

  sessions {
    uuid id PK
    uuid user_id FK
    text[] model_ids
    boolean is_complete
    int turn_count
    int analyzed_turn_count
    timestamptz completed_at
  }

  turns {
    uuid id PK
    uuid session_id FK
    int turn_number
    text prompt
    boolean ranking_submitted
  }

  responses {
    uuid id PK
    uuid turn_id FK
    text model_id
    text content
    int latency_ms
    int token_count
  }

  rankings {
    uuid id PK
    uuid turn_id FK
    uuid response_id FK
    int rank
  }

  behavioral_flags {
    uuid id PK
    uuid session_id FK
    uuid turn_id FK
    text model_id
    text flag_type
    text severity
  }
```

---

## Auth and routing matrix

| Route / path | Auth | Internal (@fleet.so) | Purpose |
|--------------|------|----------------------|---------|
| `/`, `/arena` | Optional (redirect if not logged in for arena) | No | Landing, arena |
| `/history`, `/sessions/[id]` | Required | No | User’s sessions |
| `/dashboard`, `/dashboard/*` | Required | Yes | Internal analytics |
| `/login` | Redirect if already logged in | No | Magic link login |
| `POST /api/sessions` | Required | No | Create / complete session |
| `POST /api/sessions/turns` | Required | No | Create turn |
| `POST /api/stream` | Required | No | Stream N model responses |
| `POST /api/rankings` | Required | No | Submit ranking |
| `POST /api/analyze` | Required | No (ownership check) | Manual trigger → Inngest |
| `GET/POST /api/internal/*` | Required | Yes | Stats, behaviors, export |
| `GET/POST/PUT /api/inngest` | Inngest signing | N/A | Inngest webhook |
