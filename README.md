# ARGUS.AI

### Panoptic Surveillance & Intelligent Crisis Response System

> "Turning Chaos into Order."
> An AI-powered command center that turns unstructured citizen reports (posts, images, voice calls) into actionable incidents for emergency response.

![CI](https://github.com/krrishrastogi05/Argus.AI/actions/workflows/ci.yml/badge.svg)

---

## Architecture

<img width="1672" height="941" alt="Architecture diagram" src="https://github.com/user-attachments/assets/ba37a55b-4432-46c2-807e-be42e2b15cbe" />

```
Citizen app ──POST /reports──▶ Express API ──▶ AI harness ──▶ Gemini (or rule-based fallback)
                                   │                │
                                   │                └─ timeout · retry · schema check · repair · fallback
                                   ▼
                        MongoDB replica set  (transactions, unique + compound + 2dsphere indexes)
                                   │
                                   ▼  (after commit)
                         Socket.IO rooms ──▶ admins: incident/unit deltas
                                         └──▶ user:<id>: status of *their* report
```

## The Problem

In the first minutes after a disaster (fire, riot, flood), control rooms drown in noise: thousands of posts and panic calls, mixed images, audio and text, and no fast way to verify or locate them.

## The Solution

Citizens report through a social feed or a voice helpline. The server analyses each report with a multimodal LLM, extracts type, severity and location, and pushes it to a live command dashboard. Operators dispatch the nearest unit and publish public advisories, and the citizen sees the status of their report change in real time.

---

## Roles

| | Citizen | Admin (command centre) |
|---|---|---|
| Sign up | Public `/auth/register` | Provisioned by `npm run seed` |
| Screens | Social feed, Emergency helpline | Live dashboard, Unit manager |
| Can | File reports, see *own* reports + official advisories | See all incidents, dispatch/resolve/remove, add units, draft + publish advisories, reset |

Access is enforced on the server (`requireRole`) for every REST route and every socket room; the client only mirrors it.

## Key Features

- **Live command dashboard**: incidents appear instantly on a Leaflet map; nearest idle unit per type comes from a geospatial query.
- **Multimodal AI triage**: text, image and audio reports become structured incidents with evidence breakdown and action plan.
- **Resilient AI harness**: if the model is slow, wrong or down, reports are still triaged by deterministic rules and flagged as such.
- **Safe dispatch**: transactions + compare-and-set mean two operators can never send one unit to two incidents.
- **Human-in-the-loop advisories**: the AI drafts, an operator approves, every citizen receives it.
- **Live citizen feedback**: "Under review → Help is on the way → Resolved" without refreshing.

## Engineering Highlights

| Area | What it does | Where |
|---|---|---|
| Transactions | Dispatch/resolve/remove/reset are atomic across incidents, units and the audit log | [incidentService.js](server/src/services/incidentService.js) |
| Concurrency | Compare-and-set filters (`status: IDLE`) → 409 on conflict, full rollback | same |
| Idempotency | `clientRequestId` + partial unique index; retries never duplicate incidents | [reportController.js](server/src/controllers/reportController.js) |
| Indexes | Compound indexes for dashboard and "my reports", 2dsphere for units | [models/](server/src/models) |
| Pagination | Keyset cursor on `(createdAt, _id)`, no `skip` | [pagination.js](server/src/utils/pagination.js) |
| AI harness | Timeout, retry with backoff, zod-validated output, repair loop, fallback | [ai/](server/src/ai) |
| Realtime | JWT socket auth, role rooms, single-document deltas, resync on reconnect | [socket.js](server/src/realtime/socket.js) |
| Auth | scrypt password hashing, stateless JWT, per-user rate limits | [auth.js](server/src/middleware/auth.js) |

The full write-up of what changed and why is in [docs/INTERVIEW_NOTES.md](docs/INTERVIEW_NOTES.md).

---

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Leaflet, Socket.IO client
- **Backend:** Node.js, Express 5, Socket.IO, zod, jsonwebtoken
- **Database:** MongoDB (replica set: Atlas or local `--replSet`)
- **AI:** Google Gemini (`gemini-flash-latest`) behind a provider-agnostic harness
- **Tests/CI:** `node:test`, mongodb-memory-server, GitHub Actions

---

## Setup

### Prerequisites

- Node.js 20+
- MongoDB **replica set** (transactions need one). Atlas works as-is. Locally:
  ```bash
  mongod --replSet rs0 --dbpath ./data
  ```
  then once, in `mongosh`: `rs.initiate()`
- Gemini API key (optional: without it every report uses the rule-based fallback)

### 1. Server

```bash
cd server
cp .env.example .env    # fill in JWT_SECRET, GEMINI_API_KEY, SEED_* passwords
npm install
npm run seed            # creates admin + demo citizen, demo units and all indexes
npm run dev             # http://localhost:3001
```

### 2. Client

```bash
cd client
cp .env.example .env
npm install
npm run dev             # http://localhost:5173
```

### 3. Demo

Open the app twice side by side, one window as the citizen and one as the admin (use a private window or a second browser so the sessions don't share storage). Post from the citizen feed and watch the alert land on the dashboard; dispatch a unit and watch the citizen's report change status.

### Tests

```bash
cd server
npm test
```

Covers the AI harness (fake provider) and the transactional dispatch on a real in-memory replica set, including a 10-way race for one unit.

---

## API

| Method | Path | Role |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | public |
| GET | `/api/auth/me`, `/api/advisories` | any signed-in |
| POST | `/api/reports` | citizen |
| GET | `/api/reports/mine` | citizen |
| GET | `/api/incidents?status=&limit=&cursor=` | admin |
| GET | `/api/incidents/:id/nearest-units` | admin |
| POST | `/api/incidents/:id/dispatch`, `/api/incidents/:id/resolve` | admin |
| DELETE | `/api/incidents/:id` | admin |
| GET/POST | `/api/units` | admin |
| POST | `/api/advisories/draft`, `/api/advisories` | admin |
| POST | `/api/admin/reset` | admin |

Socket events: `incident:created|updated|removed`, `unit:updated` (admins), `report:updated|removed` (owner), `advisory:published`, `system:reset` (everyone).
