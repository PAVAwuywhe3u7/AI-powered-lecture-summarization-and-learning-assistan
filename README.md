# Edu Simplify - AI-Powered Lecture Summarization and Learning System

Edu Simplify is a full-stack web application that converts lecture content into structured academic notes, contextual tutoring responses, MCQ practice, and downloadable PDF revision sheets.

The app includes a cinematic split-workspace UI with:
- Auto YouTube preview + metadata
- Source ingestion (YouTube, pasted text, text files, PDF)
- Sticky action rail for Summary / MCQ / Solver / PDF
- Separate contextual lecture chat and solver chat (with image upload)

## Tech Stack

- Backend: FastAPI (Python)
- Frontend: React.js (Vite)
- Styling: TailwindCSS
- Animation: Framer Motion
- AI: Gemini API + local model fallback chain (Gemini -> Ollama -> built-in offline model)
- State: In-memory backend session + React session state (no database)

## Folder Structure

```text
backend/
  app/
    api/
      routes.py
    core/
      config.py
      prompts.py
      session.py
    models/
      schemas.py
    services/
      gemini_service.py
      llm_utils.py
      local_ai_service.py
      ollama_service.py
      pdf_service.py
      transcript_service.py
    main.py
  .env.example
  Dockerfile
  requirements.txt

frontend/
  src/
    components/
      Navbar.jsx
      Footer.jsx
      InputForm.jsx
      SummaryCard.jsx
      SectionBlock.jsx
      ChatBox.jsx
      SolverChatBox.jsx
      MCQCard.jsx
      Loader.jsx
    context/
      SessionContext.jsx
    pages/
      HomePage.jsx
      SummaryPage.jsx
      ChatPage.jsx
      SolverPage.jsx
      MCQPage.jsx
    services/
      api.js
    App.jsx
    main.jsx
    index.css
  .env.example
  package.json
  tailwind.config.js
  postcss.config.cjs
  vite.config.js

sample/
  sample_corpus.txt
```

## Setup Instructions

### 1) Backend (Port 8000)

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# set GEMINI_API_KEY

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2) Frontend (Port 3000)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open: `http://localhost:3000`

## Environment Variables

### backend/.env

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=models/gemini-2.5-flash
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SESSION_TTL_MINUTES=240
JWT_SECRET=replace_with_secure_random_secret
JWT_EXP_MINUTES=10080
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=EduSimplify
MONGO_DB_NAME=edu_simplify
```

### frontend/.env

```env
VITE_API_BASE_URL=http://localhost:8000
```

## API Endpoints

- `POST /extract_captions` -> Extract plain-text captions from YouTube URL
- `POST /video_meta` -> Fetch YouTube title/thumbnail preview metadata
- `POST /summarize` -> Generate structured summary using multi-pass map-reduce pipeline
- `POST /chat` -> Retrieval-grounded contextual lecture chat
- `POST /solver_chat` -> Separate solver chatbot (supports image uploads)
- `POST /mcq` -> Retrieval-grounded 5 MCQs with explanations
- `GET /pdf?session_id=...` -> Download summary + MCQ PDF
- `POST /auth/register` -> Create account with name/email/password
- `POST /auth/login` -> Email/password login and JWT token issuance
- `GET /auth/me` -> Validate bearer token and fetch active user profile
- `GET /health` -> Health check

## Summarization Quality Pipeline

`/summarize` uses a multi-pass flow:
1. Transcript/PDF text cleaning
2. Topic-aware chunking
3. Map stage per chunk (definitions/concepts/examples/facts)
4. Reduce stage to merge deduped notes
5. Final synthesis into:
   - `overview_paragraphs` (3 coherent paragraphs)
   - `key_definitions`
   - `core_concepts`
   - `important_examples`
   - `exam_revision_points`
6. Validation pass for factual consistency, repetition removal, and clarity

Chat and MCQ endpoints use retrieval chunks from the active session so responses are grounded in the current lecture context.

## Example Payloads

### POST /extract_captions

```json
{
  "youtube_url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "language": "en"
}
```

### POST /summarize

```json
{
  "transcript": "Your lecture transcript text here",
  "session_id": "optional-session-id"
}
```

### POST /chat

```json
{
  "message": "Explain the core concept in simpler terms.",
  "session_id": "existing-session-id",
  "summary": {
    "overview_paragraphs": [],
    "key_definitions": [],
    "core_concepts": [],
    "important_examples": [],
    "exam_revision_points": []
  },
  "history": [
    { "role": "user", "content": "What is this lecture about?" },
    { "role": "assistant", "content": "It focuses on..." }
  ]
}
```

### POST /solver_chat

```json
{
  "message": "Solve this math problem.",
  "history": [],
  "image_data_url": "data:image/png;base64,..."
}
```

## Docker (Backend)

Build and run backend container:

```bash
cd backend
docker build -t edu-simplify-api .
docker run --rm -p 8000:8000 --env-file .env edu-simplify-api
```

## Deployment Guide

### Backend (Render / Railway / DigitalOcean App Platform)

1. Deploy `backend/` as a Python web service.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
4. Add env vars from `.env.example`.
5. Ensure CORS allows your frontend domain.

### Frontend (Vercel / Netlify)

1. Deploy `frontend/` as a Vite app.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Set `VITE_API_BASE_URL` to deployed backend URL.

## Build Validation

```bash
# backend
cd backend
python -m compileall app

# frontend
cd ../frontend
npm run build
```

## Notes

- Email/password authentication is supported with JWT bearer tokens.
- MongoDB stores authenticated user profiles.
- Lecture/session state is temporary and stored in backend memory.
- Closing/restarting backend clears in-memory session context.
- If captions are unavailable, backend falls back to title/metadata-based note generation.
- If external APIs are unavailable, the app still works through offline fallback logic.
- Fallback order for AI endpoints: `Gemini -> Ollama local model -> built-in offline model`.
- If Gemini is unavailable (quota/key/network), app still works automatically.
- For better offline quality, run Ollama locally and pull a model:
  - `ollama pull llama3.2:3b`

## Auth Setup

1. Ensure MongoDB credentials are configured in `backend/.env` (`MONGO_URI` and `MONGO_DB_NAME`).
2. Keep `JWT_SECRET` set to a secure random value.
3. Restart backend and frontend.
4. Open `http://localhost:3000/login` and create an account with Sign Up.
