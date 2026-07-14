# Real-Time Code Review Dashboard with WebSockets

## Complete Implementation Guide

---

# 1. Project Overview

## Objective

Build a full-stack real-time dashboard that receives simulated GitHub webhook events, securely validates them using HMAC-SHA256, stores Pull Request (PR) state in Redis, and broadcasts updates to connected frontend clients using WebSockets.

The project demonstrates several important backend engineering concepts:

- Secure Webhook Processing
- HMAC Signature Verification
- Redis Storage
- Redis Pub/Sub
- WebSockets
- State Management
- Docker Containerization
- Real-Time Dashboard Development

---

# 2. Technology Stack

| Component        | Technology              |
| ---------------- | ----------------------- |
| Backend          | Node.js                 |
| Framework        | Express.js              |
| Database         | Redis                   |
| Pub/Sub          | Redis Pub/Sub           |
| WebSocket        | ws                      |
| Frontend         | HTML + CSS + JavaScript |
| Charts           | Chart.js                |
| Web Server       | Nginx                   |
| Containerization | Docker                  |
| Orchestration    | Docker Compose          |

---

# 3. High-Level Workflow

```text
Simulation Script
        │
        │ POST /api/webhook
        ▼
Express Backend
        │
        ▼
HMAC Verification
        │
        ▼
Event Processor
        │
        ▼
Redis Database
        │
        ├──────────────► Store PR State
        │
        └──────────────► Publish Event
                              │
                              ▼
                     Redis Pub/Sub
                              │
                              ▼
                    WebSocket Server
                              │
                              ▼
                     Connected Browsers
```

---

# 4. Project Structure

```text
code-review-dashboard/

├── backend/
│   ├── routes/
│   │      webhook.js
│   │      pulls.js
│   │      reviewers.js
│   │
│   ├── services/
│   │      redis.js
│   │      prService.js
│   │      webhookService.js
│   │
│   ├── websocket/
│   │      websocket.js
│   │
│   ├── utils/
│   │      verifySignature.js
│   │
│   ├── app.js
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── nginx.conf
│   └── Dockerfile
│
├── scripts/
│   └── simulate.js
│
├── docker-compose.yml
├── .env.example
├── README.md
└── .gitignore
```

---

# 5. Development Roadmap

The implementation is divided into thirteen phases.

---

# Phase 1 – Environment Setup

## Goals

- Initialize backend
- Initialize frontend
- Install dependencies
- Configure Docker

### Install Packages

Backend

```
express
redis
ws
dotenv
cors
crypto
```

Development Packages

```
nodemon
```

---

Deliverables

✔ Express project created

✔ Frontend folder created

✔ Docker files created

✔ Redis service configured

---

# Phase 2 – Express Backend

Create

```
server.js
```

Responsibilities

- Start Express
- Load environment variables
- Connect Redis
- Start WebSocket server

---

Create

```
app.js
```

Responsibilities

- Register middleware
- Register routes
- Register error handler

---

Health Endpoint

```
GET /health
```

Response

```json
{
  "status": "healthy"
}
```

Docker healthcheck will use this endpoint.

---

# Phase 3 – Redis Setup

Redis has two responsibilities.

## Storage

Store PR information.

Example

```
PR:101
```

Value

```json
{
  "id": 101,
  "title": "Login API",
  "author": "John",
  "status": "opened",
  "reviewers": ["Alice", "Bob"],
  "url": "https://github...",
  "createdAt": "",
  "updatedAt": ""
}
```

---

## Pub/Sub

Publisher

```
publish("pr_events")
```

Subscriber

```
subscribe("pr_events")
```

Purpose

Decouple

Webhook Processing

from

WebSocket Broadcasting.

---

# Phase 4 – Secure Webhook Endpoint

Create

```
POST /api/webhook
```

Workflow

```
Receive Request
      │
      ▼
Read Raw Body
      │
      ▼
Read X-Hub-Signature-256
      │
      ▼
Generate HMAC
      │
      ▼
Compare Signatures
      │
      ▼
Valid?
   │
No ─────────► 403
   │
Yes
   │
   ▼
Process Event
```

---

# Phase 5 – HMAC Verification

Steps

1. Read raw request body.
2. Read WEBHOOK_SECRET.
3. Generate SHA256 HMAC.
4. Convert to hexadecimal.
5. Prefix with

```
sha256=
```

6. Compare using

```
crypto.timingSafeEqual()
```

If comparison fails

```
403 Forbidden
```

Otherwise continue.

---

# Phase 6 – Event Processing

Supported Events

## PR Opened

Condition

```
pull_request

action = opened
```

Logic

```
Check Redis

↓

Exists?

↓

YES

Ignore

↓

NO

Create PR

↓

Store

↓

Publish

↓

Broadcast
```

Status becomes

```
opened
```

---

## Review Submitted

Condition

```
pull_request_review

action = submitted
```

Logic

```
Find PR

↓

Exists?

↓

NO

Ignore

↓

YES

status=in_review

↓

Save

↓

Publish
```

---

## PR Merged

Condition

```
pull_request

action=closed

AND

merged=true
```

Logic

```
Find PR

↓

status=merged

↓

Save

↓

Publish
```

---

# Phase 7 – Idempotency

Duplicate events should never create duplicate PRs.

Example

```
PR Opened

↓

PR Already Exists?

↓

YES

Ignore

↓

NO

Create
```

Review events

If PR does not exist

```
Ignore

Log warning
```

---

# Phase 8 – WebSocket Server

Responsibilities

- Accept connections
- Store clients
- Remove disconnected clients
- Broadcast updates

Connection

```
ws://localhost:3000/ws
```

Workflow

```
Browser Connects

↓

Save Client

↓

Redis Subscriber Receives Event

↓

Broadcast

↓

Browser Updates
```

---

# Phase 9 – WebSocket Messages

PR Opened

```json
{
  "type": "pr:opened",
  "payload": {
    "id": 101,
    "title": "Login API",
    "author": "John",
    "status": "opened",
    "url": "https://github..."
  }
}
```

---

Review Submitted

```json
{
  "type": "pr:updated",
  "payload": {
    "id": 101,
    "status": "in_review"
  }
}
```

---

Merged

```json
{
  "type": "pr:updated",
  "payload": {
    "id": 101,
    "status": "merged"
  }
}
```

---

# Phase 10 – REST APIs

## GET /api/pulls

Purpose

Return active PRs.

Should include

```
opened

in_review
```

Should exclude

```
merged

closed
```

---

Example Response

```json
[
  {
    "id": 101,
    "title": "Login",
    "author": "John",
    "status": "opened",
    "url": "..."
  }
]
```

---

## GET /api/reviewers/load

Purpose

Calculate reviewer workload.

Algorithm

```
Loop Active PRs

↓

Loop Reviewers

↓

Increment Count
```

Example

```json
[
  {
    "reviewer": "Alice",
    "load": 3
  },
  {
    "reviewer": "Bob",
    "load": 1
  }
]
```

---

# Phase 11 – Frontend Dashboard

Sections

```
Header

↓

Kanban Board

↓

Reviewer Chart

↓

Activity Feed
```

---

Kanban Columns

```
Opened

In Review

Merged
```

Cards automatically move after WebSocket events.

---

Startup Flow

```
Page Opens

↓

GET /api/pulls

↓

Render Board

↓

Connect WebSocket

↓

Listen Forever
```

---

# Phase 12 – Chart.js

Chart

```
Reviewer

↓

Load
```

Example

```
Alice

██████

Bob

████
```

Update

- Page Load
- Every WebSocket Event
- Optional periodic refresh

---

# Phase 13 – Activity Feed

Display

```
10:20

PR #100 opened
```

```
10:25

Alice reviewed PR #100
```

```
10:30

PR #100 merged
```

Newest events appear at the top.

---

# Phase 14 – Simulation Script

Location

```
scripts/simulate.js
```

Responsibilities

Generate

- PR Opened
- Review Submitted
- PR Merged

Workflow

```
Create Payload

↓

Generate Signature

↓

POST Request

↓

Delay

↓

Next Event
```

---

# Phase 15 – Docker

Containers

```
backend

frontend

redis
```

Health Checks

Backend

```
GET /health
```

Redis

```
redis-cli ping
```

Frontend

```
HTTP GET /
```

Run

```
docker compose up --build
```

Verify

```
docker compose ps
```

Expected

```
healthy
```

---

# Phase 16 – Environment Variables

```
WEBHOOK_SECRET=your-secret
API_PORT=3000
REDIS_URL=redis://redis:6379
WS_PORT=3000
```

---

# Phase 17 – Testing

## HMAC

✔ Valid signature → 202

✔ Invalid signature → 403

---

## WebSocket

Open two browsers.

Run simulator.

Both browsers update simultaneously.

---

## Idempotency

Run simulator twice.

Only one copy of every PR should exist.

---

## REST APIs

GET

```
/api/pulls
```

Returns active PRs.

GET

```
/api/reviewers/load
```

Returns reviewer summary.

---

## Docker

Run

```
docker compose ps
```

Every service should be

```
healthy
```

---

# Phase 18 – Final Deliverables

Repository should contain

```
backend/

frontend/

scripts/

docker-compose.yml

.env.example

README.md

Dockerfile (Backend)

Dockerfile (Frontend)
```

---

# Recommended Development Order

1. Create project structure.
2. Configure Docker and Docker Compose.
3. Build the Express backend and `/health` endpoint.
4. Connect Redis and define the PR data model.
5. Implement HMAC verification for `POST /api/webhook`.
6. Add business logic for `pull_request` and `pull_request_review` events with idempotency.
7. Integrate Redis Pub/Sub.
8. Implement the WebSocket server and broadcasting.
9. Develop `GET /api/pulls` and `GET /api/reviewers/load`.
10. Build the frontend dashboard with Kanban board, activity feed, and Chart.js.
11. Create the webhook simulation script.
12. Write the README, `.env.example`, and perform end-to-end testing.

---

# Success Criteria

Your implementation is complete when:

- Docker starts the entire stack successfully.
- HMAC validation accepts only authentic webhook requests.
- PR state is stored and updated correctly in Redis.
- Redis Pub/Sub propagates events to the WebSocket server.
- Connected clients receive real-time updates without refreshing.
- The frontend displays active PRs, reviewer load, and a live activity feed.
- The simulation script demonstrates the full lifecycle of a pull request (opened → in review → merged).
- All automated verification requirements in the assignment are satisfied.
