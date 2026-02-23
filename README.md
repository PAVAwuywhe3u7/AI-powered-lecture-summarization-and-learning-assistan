# Edu Simplify

AI-powered lecture summarization and learning assistant built with FastAPI and React.

Edu Simplify converts lecture sources into structured study material and interactive practice:
- Topic-structured summaries
- Retrieval-grounded contextual chat
- Solver chat with optional image input
- MCQ generation with explanations
- Exportable PDF revision sheet

## Highlights

- Multiple input modes: YouTube lecture URL, pasted text, text file, PDF
- AI fallback chain for reliability: Gemini -> Ollama -> offline local logic
- Session-based learning workflow: summarize -> chat -> MCQ -> PDF
- JWT authentication with MongoDB-backed user profiles
- Responsive frontend built with Vite + TailwindCSS + Framer Motion

## Tech Stack

- Backend: FastAPI, Pydantic, PyJWT, MongoDB (PyMongo)
- Frontend: React 18, Vite, TailwindCSS, Framer Motion
- AI Integration: Google Gemini, optional Ollama local model
- Document Export: ReportLab

## Architecture

- `backend/` exposes REST APIs for summarization, chat, MCQ, PDF export, and auth.
- `frontend/` provides the single-page learning interface.
- Session state for lecture context is held in backend memory with TTL.
- Auth users are persisted in MongoDB.

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- MongoDB connection string (for auth endpoints)
- Gemini API key (recommended)
- Optional: Ollama running locally for local LLM fallback

### 1) Backend setup (`http://localhost:8000`)

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

Set values in `backend/.env`, then run:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2) Frontend setup (`http://localhost:3000`)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)

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
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=edu_simplify
```

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:8000
```

## API Overview

- `GET /health` - service health check
- `POST /extract_captions` - extract transcript from YouTube URL
- `POST /video_meta` - fetch YouTube title/thumbnail/channel metadata
- `POST /summarize` - generate structured notes from transcript text
- `POST /chat` - contextual Q&A against lecture summary and chunks
- `POST /solver_chat` - solver assistant (supports base64 image data URL)
- `POST /mcq` - generate lecture-grounded MCQs
- `GET /pdf?session_id=...` - download summary and MCQ PDF
- `POST /auth/register` - register user
- `POST /auth/login` - sign in and get JWT
- `GET /auth/me` - validate JWT and fetch user profile

## Reliability Model

For summarization, chat, solver chat, and MCQ generation, the backend uses:

1. Gemini (primary)
2. Ollama local model (secondary)
3. Built-in offline local logic (final fallback)

This keeps core functionality available even when cloud APIs fail.

## Docker (Backend)

```bash
cd backend
docker build -t edu-simplify-api .
docker run --rm -p 8000:8000 --env-file .env edu-simplify-api
```

## Build Validation

```bash
# Backend
cd backend
python -m compileall app

# Frontend
cd ../frontend
npm run build
```

## Project Structure

```text
backend/
  app/
    api/
    core/
    models/
    services/
    main.py
  .env.example
  requirements.txt
  Dockerfile

frontend/
  src/
    components/
    context/
    hooks/
    pages/
    services/
  .env.example
  package.json
  vite.config.js
  tailwind.config.js

sample/
  sample_corpus.txt
```

## License

This project is licensed under the MIT License. See `LICENSE`.
