# Automatic Chaser Agent

Automated deadline chasing system built with React + Express + Boltic DB + Boltic Workflows.

The app continuously monitors tasks, sends reminders/escalations, logs every chase attempt, tracks acknowledgments, and reports completed work with filters.

## What Problem This Solves

Teams often miss deadlines because follow-ups are manual and inconsistent. This project automates that follow-up loop.

Use cases:
- Program managers who need automatic nudges before/after due dates.
- Teams that want auditability of every reminder sent.
- Leadership that wants completion visibility by member and date range.

## End-to-End Chaser Flow

### 1) Task creation and tracking
- Tasks are stored in Boltic DB (`tasks` table).
- Task includes assignee, status, due date, priority, and chase counters.
- `completed_at` is managed by backend when status transitions to/from `done`.

### 2) Triggering a chase
There are two paths:
1. Automatic scan:
- Cron or webhook trigger starts scan (`/api/run-chaser` or `/api/webhooks/boltic/cron-trigger`).
- Engine evaluates active tasks against chaser rules.
- Cooldown and snooze checks prevent spam.

2. Manual chase:
- User clicks `Send chase` in UI.
- Backend calls manual chase path for that task.
- Tone changes based on previous chase count (friendly -> firm -> urgent).

### 3) Delivery attempt
- Backend sends payload to Boltic workflow webhook (email/slack path).
- If webhook URL is missing or call fails, delivery is marked failed.
- If success, delivery is marked sent.

### 4) Logging and counters
- Each attempt is written to `chaser_logs` with status (`sent`, `failed`, `acknowledged`).
- On success, task counters update (`times_chased`, `times_escalated`, `last_chased_at`).
- Activity Log page reads from `/api/chaser-logs`.

### 5) Completion and acknowledgment
- When task moves to `done` (API patch or webhook update), backend sets `completed_at`.
- Backend triggers acknowledgment workflow.
- If task reopens (done -> non-done), backend clears `completed_at`.

### 6) Dashboard reporting
- Overdue card shows open overdue tasks.
- Completed Tasks card uses `/api/tasks/completed` with filters:
  - Presets: Today, Last 7 Days, Last 30 Days (default)
  - Custom From/To date range
  - Member filter by assignee email
- Completed results are sorted by latest `completed_at` first.

## Architecture

```text
Frontend (React, Vercel)
  -> /api/* rewrite
Backend (Express, Render)
  -> Boltic DB (tasks, rules, logs, users)
  -> Boltic Workflows (manual chase, ack, escalation, digest)
```

## Repo Structure

```text
backend/
  db/
  routes/
  services/
  scripts/
  server.js
frontend/
  src/
  public/
README.md
```

## Local Development

### Prerequisites
- Node.js 18+
- npm
- Boltic account + API key + database

### Install

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Configure backend env (`backend/.env`)

Required for full functionality:
- `BOLTIC_API_KEY`
- `BOLTIC_DATABASE_ID`
- `APP_BASE_URL`
- `FRONTEND_URL`
- `BOLTIC_WEBHOOK_MANUAL_CHASER`
- `BOLTIC_WEBHOOK_ACKNOWLEDGMENT`

Optional but commonly used:
- `BOLTIC_WEBHOOK_ESCALATION`
- `BOLTIC_WEBHOOK_WEEKLY_DIGEST`
- `BOLTIC_WEBHOOK_BULK_CHASER`
- `CHASER_CRON_SCHEDULE` (default `0 * * * *`)
- `BOLTIC_CRON_COOLDOWN_MINUTES` (default `10`)

### Init and seed DB

```bash
cd backend
npm run db:init
npm run db:seed
```

### Completed timestamp migration

```bash
cd backend
npm run db:migrate:completed-at
```

### Run app

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm start
```

Backend health check:
- `GET http://localhost:5000/api/health`

## Backend Scripts

From `backend/`:
- `npm start` -> start API server
- `npm run dev` -> start with nodemon
- `npm run db:init` -> create DB schema
- `npm run db:seed` -> insert sample data
- `npm run db:migrate:completed-at` -> add/backfill `completed_at`

## API Overview

### Core
- `GET /api/health`
- `POST /api/run-chaser`
- `GET /api/users`

### Tasks
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET /api/tasks/stats`
- `GET /api/tasks/due-soon?hours=24`
- `GET /api/tasks/overdue`
- `GET /api/tasks/weekly-digest`
- `GET /api/tasks/completed`
- `POST /api/tasks/:id/chase`
- `POST /api/tasks/:id/snooze`
- `POST /api/tasks/:id/acknowledge`
- `POST /api/tasks/bulk-chase`

### Rules and Logs
- `GET /api/chaser-rules`
- `POST /api/chaser-rules`
- `PATCH /api/chaser-rules/:id`
- `DELETE /api/chaser-rules/:id`
- `GET /api/chaser-logs`

### Webhooks
- `POST /api/webhooks/boltic/cron-trigger`
- `POST /api/webhooks/boltic/delivery-confirm`
- `POST /api/webhooks/boltic/task-updated`
- `POST /api/webhooks/manual-chase`
- `GET /api/webhooks/snooze?task_id=<id>&hours=4`

## Frontend Pages

- `/` Dashboard:
  - KPI cards
  - Overdue Tasks panel
  - Completed Tasks panel with date/member filters
- `/tasks` Task Board
- `/log` Activity Log
- `/rules` Chaser Rules

## Deployment (Current Recommended)

### Backend on Render

Service settings:
- Root directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`

Set Render env vars:
- `NODE_ENV=production`
- `BOLTIC_API_KEY=...`
- `BOLTIC_DATABASE_ID=...`
- `APP_BASE_URL=https://<your-render-service>.onrender.com`
- `FRONTEND_URL=https://<your-vercel-domain>.vercel.app`
- workflow vars as needed

Health URL:
- `https://<your-render-service>.onrender.com/api/health`

Note:
- `GET /` on backend returns 404 by design (`Route not found`), because backend is API-only.

### Frontend on Vercel

Project settings:
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `build`

Create `frontend/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://<your-render-service>.onrender.com/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This rewrite keeps frontend API calls as relative `/api/...`.

## Troubleshooting

### Empty dashboard after Vercel deploy
- Ensure `frontend/vercel.json` is committed and deployed.
- Ensure Vercel root directory is `frontend`.
- Check `https://<vercel-domain>/api/health` returns backend response.
- Check Render service is awake and env vars are set.

### Chases show in UI but email not sent
- Usually workflow webhook URL is missing/disabled or credits exhausted.
- Check backend logs for workflow trigger errors/skips.
- In this app, delivery failures are logged in `chaser_logs` with `status=failed`.

### Overdue/completed count confusion
- Dashboard `Active Tasks` currently reflects total chaser-enabled tasks, not only open tasks.

## Tech Stack

- Frontend: React 18, React Query, React Router, Axios
- Backend: Node.js, Express, node-cron
- Data: Boltic DB via `@boltic/sdk`
- Automation: Boltic Workflows (webhooks + schedules)

## License

For internal/hackathon use. Add a formal license if you plan public distribution.
