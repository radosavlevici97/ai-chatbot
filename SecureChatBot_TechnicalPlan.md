# Secure Self-Hosted ChatGPT Alternative — Technical Plan

> **This document contains TWO versions of the plan:**
> - **VERSION A — SHOWCASE** (build first): Cloud-hosted, Gemini free API, shareable via URL
> - **VERSION B — PRODUCTION** (build after approval): Self-hosted, Ollama local models, full security
>
> Both versions share the same codebase. The only difference is the LLM provider config and deployment target.

---

---

# VERSION A — SHOWCASE DEMO

**Goal:** Build a working ChatGPT-like demo accessible via URL, using free cloud APIs, to demonstrate the concept to stakeholders and get buy-in for the production version.

**Audience:** 5-15 people during demo sessions
**Timeline:** 4-5 weeks
**Cost:** $0-10/month

---

## A1. Architecture Overview (Showcase)

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND                                 │
│               Next.js on Vercel (free tier)                  │
│         or Railway / Render static hosting                   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────┼────────────────────────────────────┐
│                     BACKEND                                  │
│          Python FastAPI on Railway / Render                   │
│                   (free tier)                                 │
│                                                              │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────────┐   │
│  │ Chat Service │ │ RAG Service  │ │ Document Processing│   │
│  │  (streaming) │ │  (search)    │ │ (upload, parse)    │   │
│  └──────┬───────┘ └──────┬───────┘ └────────┬───────────┘   │
│         │                │                   │               │
│  ┌──────┴────────────────┴───────────────────┴─────────┐    │
│  │           LLM Provider Abstraction Layer             │    │
│  │    (swap between Gemini / OpenRouter / Ollama)       │    │
│  └─────────────────────┬───────────────────────────────┘    │
└────────────────────────┼────────────────────────────────────┘
                         │ HTTPS API calls
┌────────────────────────┼────────────────────────────────────┐
│              EXTERNAL SERVICES (free)                         │
│                                                              │
│  ┌──────────────────┐  ┌────────────────┐                   │
│  │ Google Gemini     │  │ Google Gemini   │                  │
│  │ 2.5 Flash API     │  │ Embedding API   │                  │
│  │ (chat + vision)   │  │ (for RAG)       │                  │
│  │                   │  │                 │                   │
│  │ 250 req/day free  │  │ free tier       │                  │
│  └──────────────────┘  └────────────────┘                   │
│                                                              │
│  ┌──────────────────┐  (fallback, optional)                  │
│  │ OpenRouter       │                                        │
│  │ 18 free models   │                                        │
│  └──────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                     DATA LAYER                               │
│                                                              │
│  ┌──────────────────┐  ┌────────────────┐                   │
│  │ SQLite            │  │ ChromaDB       │                   │
│  │ (single file DB)  │  │ (embedded,     │                   │
│  │                   │  │  in-process)   │                   │
│  │ - users           │  │                │                   │
│  │ - conversations   │  │ - embeddings   │                   │
│  │ - messages        │  │ - doc chunks   │                   │
│  └──────────────────┘  └────────────────┘                   │
│                                                              │
│  ┌──────────────────┐                                        │
│  │ Local Filesystem  │                                        │
│  │ - uploaded docs   │                                        │
│  │ - images          │                                        │
│  └──────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

**Key simplifications vs production:**
- SQLite instead of PostgreSQL (no separate DB server needed)
- ChromaDB embedded (in-process, no separate container)
- No Redis (not needed at demo scale)
- No Celery (process documents synchronously, fast enough for demo)
- No MinIO (local filesystem for file storage)
- No Nginx/Caddy (hosting platform handles HTTPS)
- No Prometheus/Grafana (not needed for demo)

---

## A2. Technology Stack (Showcase)

### Frontend
| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | **Next.js 15+ (React 19)** | Same as production — code carries forward |
| UI | **shadcn/ui + Tailwind CSS 4** | Polished look, fast to build |
| State | **Zustand** | Simple, lightweight |
| Streaming | **SSE (Server-Sent Events)** | Token-by-token response display |
| Markdown | **react-markdown + Shiki** | Code blocks, syntax highlighting |
| File Upload | **react-dropzone** | Drag & drop |
| Hosting | **Vercel** (free tier) | Zero config deploy from GitHub |

### Backend
| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | **Python 3.12 / FastAPI** | Same as production |
| LLM Client | **google-genai** (official Gemini SDK) | Direct, simple, no LangChain overhead needed for demo |
| Embeddings | **Gemini Embedding API** (free) | No local model needed |
| Vector DB | **ChromaDB** (embedded mode) | pip install, no server, stores in a folder |
| Database | **SQLite** via **SQLAlchemy** | Zero config, single file, good enough for 15 users |
| OCR | **PyMuPDF (fitz)** | PDF text extraction, lightweight |
| File Storage | **Local filesystem** | Simple uploads/ directory |
| Hosting | **Railway.app** (free tier) | Easy Python deployment, gives you a URL |

### LLM Provider (Free Cloud APIs)
| Use Case | Provider | Free Limits |
|----------|----------|-------------|
| **Text Chat** | Google Gemini 2.5 Flash | 250 req/day, 10 req/min, 1M context |
| **Image Analysis** | Google Gemini 2.5 Flash | Same — it's natively multimodal |
| **Embeddings (RAG)** | Google Gemini Embedding | Free tier included |
| **Fallback Chat** | OpenRouter (free models) | 18 models, varies per model |

> **250 requests/day** is plenty for a demo. A typical showcase session: 5 people x 20 messages each = 100 requests. You can demo twice per day comfortably.

---

## A3. Features (Showcase)

### Must-Have for Demo
- [x] Login / register (simple email + password)
- [x] Chat interface with streaming responses
- [x] Markdown rendering + code blocks with syntax highlighting
- [x] Conversation history sidebar (create, rename, delete)
- [x] Document upload (PDF, DOCX, TXT, images)
- [x] RAG — ask questions about uploaded documents with citations
- [x] Image understanding — upload a photo, ask questions about it
- [x] Dark mode / light mode
- [x] Responsive (works on mobile for demo)
- [x] Stop generation button
- [x] System prompt / custom instructions per conversation

### Nice-to-Have (if time allows)
- [ ] Regenerate response
- [ ] Export conversation to Markdown
- [ ] Multiple model selection (Gemini vs OpenRouter models)
- [ ] Conversation search

### Explicitly Deferred to Production
- 2FA, SSO, LDAP
- RBAC (4 roles) — demo just has admin + user
- Encryption at rest
- Audit logging
- Admin dashboard
- Monitoring / alerting
- Celery background workers
- Hybrid search (BM25)
- Automated backups

---

## A4. Deployment (Showcase)

### Option 1: Vercel + Railway (Recommended, $0)

```
GitHub Repo
    ├── /frontend  →  Auto-deploys to Vercel (free)
    │                  → https://your-chatbot.vercel.app
    │
    └── /backend   →  Auto-deploys to Railway (free tier)
                       → https://your-chatbot-api.railway.app
```

**Setup steps:**
1. Push code to GitHub
2. Connect frontend folder to Vercel → get a URL
3. Connect backend folder to Railway → get a URL
4. Set environment variables (Gemini API key, JWT secret)
5. Share the Vercel URL with stakeholders

**Vercel free tier:** 100GB bandwidth, serverless functions, automatic HTTPS
**Railway free tier:** $5 credit/month (enough for demo), 512MB RAM, 1GB disk

### Option 2: Single VPS ($5/month, more control)

```
DigitalOcean / Hetzner VPS ($5/month)
    └── Docker Compose
        ├── frontend (Next.js)
        ├── backend (FastAPI)
        └── Caddy (auto-HTTPS)
```

Better if you want a custom domain like `chat.yourcompany.com`.

---

## A5. Showcase .env Configuration

```env
# === LLM Provider ===
LLM_PROVIDER=gemini                          # "gemini" | "openrouter" | "ollama"
GEMINI_API_KEY=your-api-key-from-google-ai-studio
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004

# === Fallback (optional) ===
OPENROUTER_API_KEY=your-openrouter-key       # optional fallback

# === Auth ===
JWT_SECRET=generate-a-random-64-char-string
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

# === Database ===
DATABASE_URL=sqlite:///./data/chatbot.db

# === Storage ===
UPLOAD_DIR=./data/uploads
UPLOAD_MAX_SIZE_MB=25

# === RAG ===
CHROMA_PERSIST_DIR=./data/chroma
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
RAG_TOP_K=5

# === App ===
FRONTEND_URL=https://your-chatbot.vercel.app
CORS_ORIGINS=["https://your-chatbot.vercel.app"]
```

---

## A6. Implementation Phases (Showcase)

### Phase S1 — Skeleton (Week 1)
- [ ] Create GitHub repo with frontend/ and backend/ directories
- [ ] Backend: FastAPI scaffold, SQLite + SQLAlchemy, Alembic
- [ ] Backend: Auth endpoints (register, login, JWT)
- [ ] Backend: Gemini API integration — simple chat endpoint with SSE streaming
- [ ] Frontend: Next.js scaffold with shadcn/ui
- [ ] Frontend: Login / register pages
- [ ] Frontend: Basic chat page — send message, display streamed response
- [ ] Test end-to-end: login → send message → see streamed Gemini response

### Phase S2 — Full Chat Experience (Week 2)
- [ ] Backend: Conversation CRUD (create, list, get, rename, delete)
- [ ] Backend: Message history per conversation (context sent to Gemini)
- [ ] Frontend: Sidebar with conversation list
- [ ] Frontend: Markdown rendering (react-markdown + Shiki for code)
- [ ] Frontend: Stop generation button
- [ ] Frontend: System prompt input per conversation
- [ ] Frontend: Dark mode / light mode toggle
- [ ] Frontend: Mobile responsive layout

### Phase S3 — Document Intelligence / RAG (Week 3)
- [ ] Backend: File upload endpoint (validate type, store file)
- [ ] Backend: Text extraction (PDF via PyMuPDF, DOCX via python-docx, TXT direct)
- [ ] Backend: Chunking (RecursiveCharacterTextSplitter)
- [ ] Backend: Embed chunks via Gemini Embedding API → store in ChromaDB
- [ ] Backend: RAG query — embed question, retrieve top-k, inject context, call Gemini
- [ ] Backend: Return citations (filename + page number) in response
- [ ] Frontend: Document upload panel (drag & drop, progress indicator)
- [ ] Frontend: Document library (list uploaded docs, delete, status)
- [ ] Frontend: Toggle "search my documents" per conversation
- [ ] Frontend: Display citations in chat messages

### Phase S4 — Image Understanding (Week 4)
- [ ] Backend: Accept image uploads in chat messages
- [ ] Backend: Send images to Gemini 2.5 Flash (natively multimodal — no extra model needed)
- [ ] Backend: Handle mixed messages (text + images)
- [ ] Frontend: Image paste from clipboard + drag & drop in chat input
- [ ] Frontend: Image thumbnail preview before sending
- [ ] Frontend: Display images inline in conversation

### Phase S5 — Polish & Deploy (Week 5)
- [ ] Deploy backend to Railway
- [ ] Deploy frontend to Vercel
- [ ] Set up custom domain (optional)
- [ ] Basic error handling (API rate limits, network errors, file too large)
- [ ] Loading states and empty states
- [ ] OpenRouter fallback (if Gemini rate limit hit)
- [ ] Test with 5-10 people
- [ ] Fix bugs and polish UI
- [ ] Prepare demo script / talking points

---

## A7. Showcase Cost Summary

| Component | Cost |
|-----------|------|
| Google Gemini API (free tier) | **$0** |
| OpenRouter API (free tier) | **$0** |
| Vercel frontend hosting (free tier) | **$0** |
| Railway backend hosting (free tier) | **$0** |
| Domain name (optional) | $0-12/year |
| **Total** | **$0 - $1/month** |

---

## A8. Showcase Limitations (to communicate to stakeholders)

| Limitation | Why | Fixed in Production |
|------------|-----|-------------------|
| 250 requests/day | Gemini free tier | Ollama = unlimited |
| Data goes to Google | Cloud API | Ollama = 100% local |
| 10 requests/minute max | Gemini rate limit | Ollama = no limit |
| No 2FA | Demo simplicity | Full 2FA in production |
| SQLite (not scalable) | Demo simplicity | PostgreSQL in production |
| No audit logging | Demo simplicity | Full audit trail in production |
| No encryption at rest | Demo simplicity | AES-256 in production |
| ~15 concurrent users max | Free tier hosting | Dedicated server in production |

---

---

# VERSION B — PRODUCTION (Self-Hosted, Ollama)

**Goal:** Fully private, secure, production-grade ChatGPT alternative running entirely on your own infrastructure. Zero data leaves your network.

**Audience:** Organization / team (scalable)
**Timeline:** 12 weeks (after showcase approval)
**Cost:** $0 software + hardware investment

---

## B1. Architecture Overview (Production)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Web UI      │  │  Mobile PWA  │  │  Admin Dashboard          │  │
│  │  (Next.js)   │  │  (responsive)│  │  (user mgmt, logs, config)│  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬──────────────┘  │
│         └─────────────────┼───────────────────────┘                  │
│                           │ HTTPS / WSS                              │
└───────────────────────────┼──────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────────┐
│                    API GATEWAY                                        │
│  ┌────────────────────────┴────────────────────────────────────────┐ │
│  │  Caddy (auto-HTTPS) + Rate Limiter + Security Headers           │ │
│  └────────────────────────┬────────────────────────────────────────┘ │
└───────────────────────────┼──────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────────┐
│                    BACKEND LAYER (Python FastAPI)                     │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ Chat Service  │ │ RAG Service  │ │ Doc/Image    │ │ Auth       │ │
│  │              │ │              │ │ Processing   │ │ Service    │ │
│  │ - sessions   │ │ - ingest     │ │ - OCR        │ │ - JWT      │ │
│  │ - streaming  │ │ - chunk      │ │ - PDF parse  │ │ - RBAC     │ │
│  │ - history    │ │ - embed      │ │ - img analyze│ │ - 2FA      │ │
│  │ - context    │ │ - retrieve   │ │ - file store │ │ - SSO/LDAP │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └────────────┘ │
│         │                │                │                          │
│  ┌──────┴────────────────┴────────────────┴────────────────────────┐ │
│  │              LLM Orchestration Layer (LangChain)                 │ │
│  │  - Model routing  - Prompt templates  - Chain management        │ │
│  │  - Fallback logic  - Token management  - Memory management      │ │
│  └──────────────────────────┬──────────────────────────────────────┘ │
└─────────────────────────────┼────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────────┐
│                    MODEL LAYER (100% LOCAL)                           │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Ollama Server (on GPU machine)                                │  │
│  │                                                                │  │
│  │  Text:    Llama 3.3 70B  |  DeepSeek V3.2  |  Mistral 7B     │  │
│  │  Vision:  Qwen2.5-VL-72B |  LLaMA 3.2-Vision                 │  │
│  │  Embed:   nomic-embed-text                                     │  │
│  │  Code:    Qwen3-coder                                          │  │
│  │                                                                │  │
│  │  ► No internet required                                        │  │
│  │  ► No rate limits                                              │  │
│  │  ► No data leaves the server                                   │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────────┐
│                    DATA LAYER                                         │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ PostgreSQL 16 │ │ Qdrant       │ │ Redis 7      │ │ MinIO      │ │
│  │              │ │              │ │              │ │ (self-host │ │
│  │ - users      │ │ - embeddings │ │ - sessions   │ │  S3)       │ │
│  │ - chats      │ │ - doc chunks │ │ - cache      │ │            │ │
│  │ - audit logs │ │ - metadata   │ │ - rate limits│ │ - docs     │ │
│  │ - settings   │ │              │ │ - pub/sub    │ │ - images   │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## B2. Technology Stack (Production)

### Frontend (same as showcase — code reused)
| Component | Technology |
|-----------|-----------|
| Framework | **Next.js 15+ (React 19)** |
| UI | **shadcn/ui + Tailwind CSS 4** |
| State | **Zustand** |
| Streaming | **SSE + WebSocket** |
| Markdown | **react-markdown + Shiki** |
| File Upload | **react-dropzone** |
| Auth UI | **NextAuth.js v5** |

### Backend (upgraded from showcase)
| Component | Showcase | Production | Why Upgrade |
|-----------|----------|------------|-------------|
| Database | SQLite | **PostgreSQL 16** | Concurrent users, row-level security, ACID |
| Vector DB | ChromaDB (embedded) | **Qdrant** (server) | Production performance, filtering, clustering |
| Cache | None | **Redis 7** | Sessions, rate limiting, pub/sub |
| Task Queue | Synchronous | **Celery + Redis** | Background doc processing, non-blocking |
| File Storage | Local filesystem | **MinIO** | S3-compatible, replication, backup |
| LLM Client | google-genai SDK | **LangChain 0.3+** | Model routing, chains, agents, fallback |
| Embedding | Gemini API | **nomic-embed-text via Ollama** | Local, private, unlimited |
| OCR | PyMuPDF only | **PyMuPDF + Tesseract OCR** | Scanned PDFs, image text |

### LLM Layer (100% Local via Ollama)
| Use Case | Model | VRAM Needed |
|----------|-------|-------------|
| Text Chat (best quality) | **Llama 3.3 70B** (Q4 quantized) | ~40GB |
| Text Chat (fast/light) | **Mistral 7B** or **DeepSeek V3.2** | ~4-8GB |
| Vision / Images | **Qwen2.5-VL-72B** or **LLaMA 3.2-Vision** | ~40GB or ~8GB |
| Embeddings | **nomic-embed-text** | ~0.5GB |
| Code Generation | **Qwen3-coder** | ~8GB |

### Infrastructure
| Component | Technology |
|-----------|-----------|
| Containerization | **Docker + Docker Compose** |
| Reverse Proxy | **Caddy** (auto-HTTPS via Let's Encrypt) |
| Monitoring | **Prometheus + Grafana** |
| Logging | **Loki + Promtail** |
| CI/CD | **GitHub Actions** |
| Backup | **pg_dump + restic** (encrypted) |

---

## B3. Full Feature List (Production)

### Chat Interface (ChatGPT Parity)
- Multi-turn conversations with full context retention
- Streaming token-by-token rendering (SSE)
- Markdown: bold, italic, headers, lists, tables, LaTeX math
- Code blocks with syntax highlighting and one-click copy
- Conversation branching (edit previous message, fork)
- Regenerate response
- Stop generation mid-stream
- Conversation search (full-text across all chats)
- Export conversations (JSON, Markdown, PDF)
- Dark / light mode
- Responsive (desktop, tablet, mobile)
- Keyboard shortcuts (Ctrl+Enter, Ctrl+Shift+N, etc.)
- Conversation sidebar grouped by date
- Pin/star, folders/tags, bulk operations
- Model selection per conversation
- Per-message model switching
- Model comparison mode (side-by-side)

### Document Intelligence (RAG)
- **Formats:** PDF, DOCX, DOC, TXT, RTF, ODT, XLSX, XLS, CSV, PPTX, PPT, PNG, JPG, HTML, XML, EML, ZIP
- Semantic search (vector similarity)
- Hybrid search (semantic + BM25 keyword)
- Metadata filtering (by file, date, type)
- Citations with source file + page number
- Document library UI (upload, preview, status, delete)
- Per-conversation document scoping
- Batch upload
- Auto-reindex on update

### Image Understanding
- Describe images, answer questions about photos
- OCR from photos
- Analyze charts, diagrams, screenshots
- Multiple images per message
- Paste from clipboard, drag & drop
- EXIF stripping for privacy

### System Prompts
- Global + per-conversation system prompts
- Prompt template library (save & reuse)
- Predefined personas
- Temperature / top-p / max tokens controls

---

## B4. Security Architecture (Production)

### Authentication & Authorization
- Local username/password (bcrypt, min 12 chars)
- **Two-Factor Authentication** (TOTP — Google Authenticator)
- Optional SSO (SAML 2.0 / OpenID Connect)
- Optional LDAP/Active Directory
- JWT tokens (access: 15min, refresh: 7d)
- Account lockout after 5 failed attempts
- Password reset via secure token

### RBAC
| Role | Permissions |
|------|------------|
| **Super Admin** | Everything: users, models, config, logs |
| **Admin** | User management, document management, view logs |
| **User** | Chat, upload docs, manage own conversations |
| **Viewer** | Read-only access to shared conversations |

### Data Security
- **TLS 1.3** for all data in transit
- **AES-256** encryption for data at rest (database, files)
- Encrypted backups with separate key management
- Per-user document namespaces (full isolation)
- Per-user vector store partitions
- Database row-level security
- File type validation (magic bytes, not just extension)
- Filename sanitization (path traversal prevention)
- Prompt injection defense
- Rate limiting: 60 req/min per user
- CSP, HSTS, X-Frame-Options, CSRF tokens

### Audit Logging
Every action logged:
```json
{
  "timestamp": "2026-02-07T14:30:00Z",
  "user_id": "usr_abc123",
  "action": "chat_message_sent",
  "resource": "conversation_xyz",
  "ip_address": "192.168.1.100",
  "details": {
    "model_used": "llama3.3-70b",
    "tokens_used": 1523,
    "document_references": ["doc_001"]
  }
}
```
Events: login/logout, password changes, uploads/deletions, chat actions, admin actions, rate limit violations.

### Compliance
- GDPR: data export, data deletion, consent management
- Configurable retention policies (auto-delete after N days)
- Complete audit trail export

### Network Security
- Caddy with TLS termination (auto-HTTPS)
- No direct database exposure
- Internal Docker private network
- Optional VPN/WireGuard access only
- CORS whitelist
- Regular dependency vulnerability scanning

---

## B5. Docker Compose (Production)

```yaml
services:
  # --- Frontend ---
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]

  # --- Backend API ---
  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [postgres, redis, qdrant, ollama]
    environment:
      - LLM_PROVIDER=ollama
      - OLLAMA_BASE_URL=http://ollama:11434
      - DATABASE_URL=postgresql://chatbot:${DB_PASSWORD}@postgres:5432/chatbot
      - REDIS_URL=redis://redis:6379/0
      - QDRANT_HOST=qdrant
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}

  # --- Background Workers ---
  worker:
    build: ./backend
    command: celery -A app.workers.celery_app worker -l info
    depends_on: [redis, postgres, qdrant]

  # --- LLM Server (GPU) ---
  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes: ["ollama_data:/root/.ollama"]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  # --- PostgreSQL ---
  postgres:
    image: postgres:16-alpine
    volumes: ["pg_data:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: chatbot
      POSTGRES_USER: chatbot
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  # --- Redis ---
  redis:
    image: redis:7-alpine
    volumes: ["redis_data:/data"]
    command: redis-server --requirepass ${REDIS_PASSWORD}

  # --- Vector Database ---
  qdrant:
    image: qdrant/qdrant:latest
    volumes: ["qdrant_data:/qdrant/storage"]
    ports: ["6333:6333"]

  # --- File Storage ---
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    volumes: ["minio_data:/data"]
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}

  # --- Reverse Proxy ---
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./config/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

  # --- Monitoring ---
  prometheus:
    image: prom/prometheus:latest
    volumes: ["./config/prometheus.yml:/etc/prometheus/prometheus.yml"]

  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]

volumes:
  ollama_data:
  pg_data:
  redis_data:
  qdrant_data:
  minio_data:
  caddy_data:
```

---

## B6. Hardware Requirements (Production)

| Tier | Spec | Models Supported | Users | Est. Cost |
|------|------|-----------------|-------|-----------|
| **Starter** | 32GB RAM, RTX 3060 12GB, 512GB SSD | 7B-13B models | 5-10 | ~$1,200 GPU |
| **Recommended** | 64GB RAM, RTX 4090 24GB, 1TB NVMe | 70B quantized | 10-25 | ~$2,500 GPU |
| **Enterprise** | 128GB+ RAM, 2x A100 80GB, 2TB NVMe | 70B full precision | 50+ | ~$15,000+ |

**Model VRAM requirements (Q4 quantized):**
- 7B → ~4GB  |  13B → ~8GB  |  30B → ~18GB  |  70B → ~40GB

---

## B7. Implementation Phases (Production)

> **Prerequisite:** Showcase (Version A) is complete. Most frontend code and basic backend structure is reused.

### Phase P1 — Infrastructure Migration (Weeks 1-2)
- [ ] Set up dedicated server with GPU
- [ ] Docker Compose with all production services
- [ ] Migrate SQLite → PostgreSQL (Alembic migrations)
- [ ] Migrate ChromaDB embedded → Qdrant server
- [ ] Set up Redis for sessions + rate limiting
- [ ] Set up MinIO for file storage
- [ ] Install Ollama, pull models (Llama 3.3 70B, Mistral 7B, nomic-embed-text)
- [ ] Swap LLM provider config: Gemini → Ollama
- [ ] Verify all existing features work with Ollama backend

### Phase P2 — LangChain Integration (Week 3)
- [ ] Replace direct Gemini SDK with LangChain abstraction
- [ ] Implement model routing (choose model per conversation)
- [ ] Implement fallback logic (if primary model busy, use lighter model)
- [ ] Set up local embedding pipeline (nomic-embed-text via Ollama)
- [ ] Re-index all documents with local embeddings
- [ ] Add multimodal model (Qwen2.5-VL or LLaMA 3.2-Vision)
- [ ] Test RAG pipeline end-to-end with Ollama

### Phase P3 — Security Hardening (Weeks 4-5)
- [ ] 2FA implementation (TOTP)
- [ ] RBAC system (4 roles with permission checks)
- [ ] AES-256 encryption at rest (database fields, file storage)
- [ ] Comprehensive audit logging (all events)
- [ ] Rate limiting via Redis (per user, per IP)
- [ ] Input sanitization + prompt injection defense
- [ ] Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- [ ] CSRF protection
- [ ] File upload hardening (magic byte validation, size limits, path traversal prevention)
- [ ] Dependency vulnerability scanning (Trivy, Bandit)
- [ ] OWASP ZAP security scan

### Phase P4 — Advanced Features (Weeks 6-7)
- [ ] Conversation branching (edit & fork)
- [ ] Model comparison mode (side-by-side)
- [ ] Hybrid search (semantic + BM25)
- [ ] Cross-encoder reranking for RAG
- [ ] Conversation export (JSON, Markdown, PDF)
- [ ] Full-text conversation search
- [ ] Batch document upload
- [ ] OCR for scanned PDFs and images (Tesseract)
- [ ] Keyboard shortcuts

### Phase P5 — Admin & Operations (Weeks 8-9)
- [ ] Admin dashboard (user management, system stats, model status)
- [ ] Prometheus metrics endpoints
- [ ] Grafana dashboards (latency, error rate, tokens/day, disk usage)
- [ ] Loki log aggregation
- [ ] Automated database backup (pg_dump + encrypted, daily)
- [ ] Health check endpoints (/health, /ready)
- [ ] GDPR tools (data export, account deletion)
- [ ] Model management UI (pull/delete models, view VRAM usage)

### Phase P6 — Networking & Access (Week 10)
- [ ] Caddy reverse proxy with auto-HTTPS
- [ ] Optional VPN/WireGuard for restricted access
- [ ] SSO integration (OpenID Connect / SAML 2.0)
- [ ] Optional LDAP/Active Directory
- [ ] Custom domain setup

### Phase P7 — Testing & Hardening (Weeks 11-12)
- [ ] Unit tests: 80%+ backend, 70%+ frontend
- [ ] Integration tests: all API endpoints
- [ ] E2E tests: Playwright (login, chat, upload, RAG flows)
- [ ] Load testing: Locust (target: 50 concurrent users)
- [ ] Security penetration testing
- [ ] Performance optimization (caching, query tuning)
- [ ] Mobile responsiveness polish
- [ ] User documentation
- [ ] Final security audit
- [ ] Production deployment signoff

---

## B8. Production .env Configuration

```env
# === LLM Provider ===
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
DEFAULT_MODEL=llama3.3:70b
FAST_MODEL=mistral:7b
VISION_MODEL=qwen2.5-vl:72b
EMBEDDING_MODEL=nomic-embed-text

# === Security ===
JWT_SECRET=<generated-64-char-random>
ENCRYPTION_KEY=<generated-32-byte-key>
ALLOWED_ORIGINS=https://chat.yourdomain.com

# === Database ===
DATABASE_URL=postgresql://chatbot:${DB_PASSWORD}@postgres:5432/chatbot
DB_PASSWORD=<strong-random-password>

# === Redis ===
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
REDIS_PASSWORD=<strong-random-password>

# === Vector Store ===
QDRANT_HOST=qdrant
QDRANT_PORT=6333

# === File Storage ===
STORAGE_BACKEND=minio
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=<generated>
MINIO_SECRET_KEY=<generated>
UPLOAD_MAX_SIZE_MB=50

# === RAG ===
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
RAG_TOP_K=5
RAG_RELEVANCE_THRESHOLD=0.7

# === Rate Limiting ===
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_BURST=10

# === 2FA ===
TOTP_ISSUER=YourCompany-Chat

# === Monitoring ===
PROMETHEUS_ENABLED=true
LOG_LEVEL=INFO
```

---

## B9. Production Cost Summary

| Component | Cost |
|-----------|------|
| All software (Ollama, FastAPI, Next.js, PostgreSQL, Qdrant, Redis, MinIO, Caddy, Prometheus, Grafana) | **$0** |
| TLS certificates (Let's Encrypt) | **$0** |
| **Total Software** | **$0** |
| **Hardware (one-time)** | $1,200 - $15,000 depending on tier |
| **Electricity** | ~$10-30/month |
| **Domain name** | ~$12/year |

---

## B10. Maintenance & Operations (Production)

**Routine:**
- Weekly: `ollama pull` model updates
- Weekly: Dependency security scans
- Daily: Automated encrypted database backups
- Monthly: Audit log review
- Monthly: Rotate JWT secrets and API keys
- Quarterly: Full security audit

**Grafana Alerts:**
- LLM inference latency > 30s
- Error rate > 5%
- Disk > 80%, RAM > 90%
- Failed logins > 10/hour from same IP
- Ollama service down
- DB connection pool exhaustion

---

---

# SHARED: Components Used in Both Versions

## Database Schema

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('super_admin','admin','user','viewer')),
    totp_secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500),
    model VARCHAR(100) NOT NULL,
    system_prompt TEXT,
    settings JSONB DEFAULT '{}',
    is_pinned BOOLEAN DEFAULT false,
    folder VARCHAR(255),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    parent_message_id UUID REFERENCES messages(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    model VARCHAR(100),
    tokens_prompt INT,
    tokens_completion INT,
    attachments JSONB DEFAULT '[]',
    citations JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_key VARCHAR(1000) NOT NULL,
    status VARCHAR(20) DEFAULT 'processing'
        CHECK (status IN ('uploading','processing','indexed','failed')),
    chunk_count INT DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Chunks
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    page_number INT,
    section_heading VARCHAR(500),
    token_count INT,
    vector_id VARCHAR(255) NOT NULL
);

-- Audit Logs (production only — skip in showcase)
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Settings
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_model VARCHAR(100),
    default_system_prompt TEXT,
    theme VARCHAR(20) DEFAULT 'system',
    language VARCHAR(10) DEFAULT 'en',
    settings JSONB DEFAULT '{}'
);

-- Prompt Templates
CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_shared BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## REST API Endpoints (both versions)

```
Authentication
  POST   /api/v1/auth/register
  POST   /api/v1/auth/login
  POST   /api/v1/auth/refresh
  POST   /api/v1/auth/logout
  POST   /api/v1/auth/2fa/setup              ← production only
  POST   /api/v1/auth/2fa/verify             ← production only
  POST   /api/v1/auth/password/reset
  PUT    /api/v1/auth/password/change

Conversations
  GET    /api/v1/conversations
  POST   /api/v1/conversations
  GET    /api/v1/conversations/{id}
  PUT    /api/v1/conversations/{id}
  DELETE /api/v1/conversations/{id}
  POST   /api/v1/conversations/{id}/messages  ← SSE streaming
  POST   /api/v1/conversations/{id}/regenerate
  POST   /api/v1/conversations/{id}/stop
  GET    /api/v1/conversations/{id}/export
  POST   /api/v1/conversations/search

Documents
  POST   /api/v1/documents/upload
  GET    /api/v1/documents
  GET    /api/v1/documents/{id}
  DELETE /api/v1/documents/{id}
  GET    /api/v1/documents/{id}/status
  POST   /api/v1/documents/search

Models
  GET    /api/v1/models
  GET    /api/v1/models/{id}/status

Admin (production only)
  GET    /api/v1/admin/users
  PUT    /api/v1/admin/users/{id}
  DELETE /api/v1/admin/users/{id}
  GET    /api/v1/admin/audit-logs
  GET    /api/v1/admin/stats
  GET    /api/v1/admin/health
  PUT    /api/v1/admin/settings

User Settings
  GET    /api/v1/settings
  PUT    /api/v1/settings
  GET    /api/v1/settings/prompts
  POST   /api/v1/settings/prompts
```

---

## SSE Streaming Format (both versions)

```
event: token
data: {"content": "Hello", "finish_reason": null}

event: token
data: {"content": " world", "finish_reason": null}

event: citation
data: {"source": "report.pdf", "page": 3, "relevance": 0.92}

event: done
data: {"finish_reason": "stop", "usage": {"prompt_tokens": 150, "completion_tokens": 45}}

event: error
data: {"error": "Rate limit exceeded", "code": "RATE_LIMITED"}
```

---

## Project Structure (both versions)

```
secure-chatbot/
├── docker-compose.yml              ← production (Ollama + PostgreSQL + Redis + ...)
├── docker-compose.showcase.yml     ← showcase (just backend, SQLite)
├── .env.example
├── .env.showcase.example
├── Makefile
│
├── frontend/                        ← SHARED (identical for both)
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login, register
│   │   │   ├── (chat)/layout, page, [id]
│   │   │   ├── documents/
│   │   │   ├── settings/
│   │   │   └── admin/               ← production only pages
│   │   ├── components/
│   │   │   ├── chat/                 ← ChatMessage, ChatInput, StreamingText, CodeBlock
│   │   │   ├── sidebar/              ← Sidebar, ConversationList
│   │   │   ├── documents/            ← UploadPanel, DocumentList
│   │   │   └── ui/                   ← shadcn/ui
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── sse.ts
│   │   │   └── auth.ts
│   │   └── stores/
│
├── backend/                         ← SHARED (provider abstraction handles the switch)
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py                ← reads LLM_PROVIDER env var
│   │   ├── api/v1/                  ← all endpoints
│   │   ├── models/                  ← SQLAlchemy ORM
│   │   ├── schemas/                 ← Pydantic
│   │   ├── services/
│   │   │   ├── llm_service.py       ← PROVIDER ABSTRACTION
│   │   │   │                          if config.LLM_PROVIDER == "gemini": use Gemini
│   │   │   │                          if config.LLM_PROVIDER == "ollama": use Ollama
│   │   │   ├── rag_service.py
│   │   │   ├── document_service.py
│   │   │   └── auth_service.py
│   │   ├── workers/                 ← production only (Celery)
│   │   └── utils/
│   └── tests/
│
├── config/                          ← production only
│   ├── Caddyfile
│   ├── prometheus.yml
│   └── grafana/dashboards/
│
└── scripts/
    ├── setup-showcase.sh
    ├── setup-production.sh
    ├── pull-models.sh               ← production only
    └── backup.sh                    ← production only
```

---

## The Key Design: LLM Provider Abstraction

The core of the "same codebase, two versions" approach is one abstraction layer:

```python
# backend/app/services/llm_service.py

class LLMProvider(ABC):
    async def chat(self, messages, model, stream=True) -> AsyncGenerator:
        ...
    async def embed(self, text) -> list[float]:
        ...

class GeminiProvider(LLMProvider):
    """Showcase: calls Google Gemini API over the internet"""
    ...

class OllamaProvider(LLMProvider):
    """Production: calls local Ollama server, no internet needed"""
    ...

class OpenRouterProvider(LLMProvider):
    """Fallback: calls OpenRouter free models"""
    ...

def get_llm_provider() -> LLMProvider:
    if settings.LLM_PROVIDER == "gemini":
        return GeminiProvider(api_key=settings.GEMINI_API_KEY)
    elif settings.LLM_PROVIDER == "ollama":
        return OllamaProvider(base_url=settings.OLLAMA_BASE_URL)
    elif settings.LLM_PROVIDER == "openrouter":
        return OpenRouterProvider(api_key=settings.OPENROUTER_API_KEY)
```

**Switching from showcase to production = changing one env variable:**
```
LLM_PROVIDER=gemini   →   LLM_PROVIDER=ollama
```

Everything else (UI, RAG pipeline, auth, database) stays the same.

---

## Testing Strategy (both versions)

| Type | Tools | Showcase Target | Production Target |
|------|-------|----------------|-------------------|
| Unit Tests | pytest, Vitest | 50%+ | 80%+ backend, 70%+ frontend |
| Integration | pytest + httpx | Core endpoints | All endpoints |
| E2E | Playwright | Login + chat | All user flows |
| Load | Locust | N/A | 50 concurrent users |
| Security | OWASP ZAP, Bandit | Basic | Full scan |
| LLM Quality | Custom eval | Manual testing | Automated eval suite |
