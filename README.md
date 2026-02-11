# ⚡ Automatic Chaser Agent
> Automated deadline-chasing system powered by Express.js + Boltic + React

An intelligent program manager that never sleeps — automatically sends personalized reminders, escalations, and acknowledgments so your team never misses a deadline.

---

## 🏗️ Architecture

```
React Frontend (Port 3000)
    ↓ REST API
Express.js Backend (Port 5000)
    ↓ Boltic DB API         ↓ Boltic Webhooks
Boltic Database        Boltic Workflows
 (tasks, logs,          (email/slack/cron
  rules, users)          automations)
```

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
# backend/.env  (copy from .env.example)
cp .env.example .env
```

Fill in:
- `BOLTIC_API_KEY` — from Boltic Settings → API Keys
- `BOLTIC_WORKSPACE_ID` — from Boltic workspace URL
- `BOLTIC_DATABASE_ID` — from Boltic DB settings
- Webhook URLs (see Boltic Setup below)

### 3. Initialize Boltic Database

```bash
cd backend
npm run db:init   # Creates collections in Boltic
npm run db:seed   # Adds sample data
```

### 4. Start Development

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm start

# Terminal 3 — Expose local server to Boltic (for webhooks)
npx ngrok http 5000
# Copy the https URL → use in Boltic webhook configs
```

---

## 🔧 Boltic Setup Guide

### A. Create the Database

1. Go to **Boltic → Databases → New Database**
2. Name it `chaser-agent`
3. Copy the **Database ID** to your `.env`

### B. Set Up Workflows

You need **4 workflows** in Boltic:

---

#### Workflow 1: `hourly-chaser-cron`
**Purpose**: Automatically scan tasks every hour

| Step | Action |
|------|--------|
| Trigger | ⏰ Schedule — Every 1 hour |
| Step 1 | HTTP Request → POST `{YOUR_API}/api/webhooks/boltic/cron-trigger` |
| Done | Backend runs the full scan |

**Env var**: No webhook needed for this one (it calls your API)

---

#### Workflow 2: `manual-chaser-webhook`
**Purpose**: Send notification when a task is chased

| Step | Action |
|------|--------|
| Trigger | 🔗 Webhook (copy URL → `BOLTIC_WEBHOOK_MANUAL_CHASER`) |
| Step 1 | Parse payload — get `channel`, `message`, `assignee_email` |
| Step 2 | Branch: if `channel == email` → Gmail step |
| Step 3a | Gmail: Send to `{{assignee_email}}`, subject `Re: {{task_title}}`, body `{{message}}` |
| Step 3b | Slack: Post message to `#general` or DM |
| Step 4 | HTTP POST → `{YOUR_API}/api/webhooks/boltic/delivery-confirm` with `task_id`, `status: delivered` |

**Env var**: `BOLTIC_WEBHOOK_MANUAL_CHASER=https://your-boltic-webhook-url`

---

#### Workflow 3: `task-acknowledgment`
**Purpose**: Celebrate when a task is completed

| Step | Action |
|------|--------|
| Trigger | 🔗 Webhook (copy URL → `BOLTIC_WEBHOOK_ACKNOWLEDGMENT`) |
| Step 1 | Send email to `{{assignee_email}}`: "🎉 Well done completing {{task_title}}!" |
| Step 2 | Send email to `{{reporter_email}}` (if different): "✅ {{assignee_name}} completed {{task_title}}" |

**Env var**: `BOLTIC_WEBHOOK_ACKNOWLEDGMENT=https://your-boltic-webhook-url`

---

#### Workflow 4: `weekly-digest` *(optional but impressive)*
**Purpose**: Monday morning task summary

| Step | Action |
|------|--------|
| Trigger | ⏰ Schedule — Every Monday 9:00 AM |
| Step 1 | HTTP GET `{YOUR_API}/api/tasks/weekly-digest` |
| Step 2 | For each user in response, send personalized digest email |

---

### C. Database Collections

The `npm run db:init` script creates these automatically:

| Collection | Purpose |
|-----------|---------|
| `tasks` | All tasks with due dates, assignees, status |
| `users` | Team members |
| `projects` | Project groupings |
| `chaser_rules` | Automation rules (when/how to chase) |
| `chaser_logs` | Every chaser event ever fired |
| `notifications` | In-app notification inbox |

---

## 📡 API Reference

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks (filterable) |
| GET | `/api/tasks/stats` | Dashboard KPI stats |
| GET | `/api/tasks/due-soon?hours=24` | Tasks due within N hours |
| GET | `/api/tasks/overdue` | All overdue tasks |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/:id` | Update task (auto-fires ack on done) |
| POST | `/api/tasks/:id/chase` | Manual chase trigger |
| POST | `/api/tasks/:id/snooze` | Snooze chaser |
| POST | `/api/tasks/:id/acknowledge` | Mark as acknowledged |
| POST | `/api/tasks/bulk-chase` | Chase multiple tasks at once |

### Chaser
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chaser-rules` | List all rules |
| POST | `/api/chaser-rules` | Create rule |
| PATCH | `/api/chaser-rules/:id` | Update rule |
| GET | `/api/chaser-logs` | Activity log |
| POST | `/api/run-chaser` | Manually trigger full scan |

### Webhooks (called by Boltic)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/boltic/cron-trigger` | Boltic's cron hits this |
| POST | `/api/webhooks/boltic/delivery-confirm` | After email sent |
| POST | `/api/webhooks/boltic/task-updated` | Status change events |
| GET | `/api/webhooks/snooze?task_id=X&hours=4` | Snooze link in emails |

---

## 🧠 Chaser Engine Logic

The `ChaserEngine` service:

1. **Loads** all non-done tasks with `chaser_enabled: true`
2. **Loads** all active chaser rules
3. **For each task**, evaluates every rule:
   - `deadline_proximity`: hours until due ≤ threshold?
   - `overdue`: days overdue ≥ threshold?
4. **Spam protection**: skips tasks chased within last 6 hours
5. **Snooze respect**: skips tasks with active snooze
6. **Fires** Boltic webhook with full context
7. **Logs** every event to `chaser_logs` collection
8. **Updates** task's `chaser_count` and `last_chased_at`

### Context-Aware Tone (Manual Chase)
| Chase Count | Tone | Example |
|------------|------|---------|
| 0 | Friendly | "Hey! Just checking in 😊" |
| 1-2 | Firm | "Follow-up on pending task" |
| 3+ | Urgent | "⚠️ Critical — immediate action required" |

---

## 🗺️ Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | KPI stats, overdue list, activity feed, "Run Chaser" button |
| Task Board | `/tasks` | Kanban by status, Chase buttons, bulk select, create task |
| Activity Log | `/log` | Full timeline of all chaser events, filterable |
| Chaser Rules | `/rules` | Create/edit/toggle automation rules |

---

## 🏆 Key Features

- ⚡ **One-click chase** on any task card
- 📦 **Bulk chase** — select multiple tasks and chase at once  
- 💤 **Snooze** — stop chasing a task for N hours
- 📈 **Context-aware tone** — tone escalates with each follow-up
- 🚨 **Escalation** — auto-CC manager when critically overdue
- 📬 **Weekly digest** — Monday summary via Boltic cron
- 📋 **Activity log** — every chaser event logged and auditable
- ⚙️ **Configurable rules** — no-code rule builder in UI

---

## 🔌 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Query, React Router |
| Backend | Express.js, Node.js, node-cron |
| Database | Boltic Database (via REST API) |
| Automation | Boltic Workflows (webhooks + cron) |
| Notifications | Boltic Gmail/Slack connectors |
| Tunnel (dev) | ngrok |
