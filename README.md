## Voting App

Web-based election platform with a Next.js front end and an Express/MySQL backend. It handles voter onboarding, secure session management, result publication, and live chat between admins and voters.

## Features

- Auth & onboarding flows with JWT sessions and optional Google identity.
- Admin dashboard for managing candidates, sessions, eligibility lists, and audit trails.
- Real-time updates via Socket.IO (session lifecycle, chat, and admin actions).
- Automated retention sweep (inactive users, chat history, orphaned uploads).
- MySQL schema bootstrap, migrations, and helper scripts for provisioning.

## Quick Start (Local)

1. **Clone & install**
   ```bash
   git clone https://github.com/your-org/voting-app.git
   cd voting-app
   npm install
   cd backend && npm install && cd ..
   ```

2. **Spin up MySQL** (skip if you already have an instance). The snippet below launches MySQL 8 with a matching database/user:
   ```bash
   docker run --name voting-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=votingapp \
     -e MYSQL_USER=voting -e MYSQL_PASSWORD=votingpw -p 3306:3306 -d mysql:8
   ```

3. **Create environment files** (copy from your own templates or create new ones):
   ```bash
   touch .env.local backend/.env
   ```
   Minimum values:
   ```env
   # .env.local
   NEXT_PUBLIC_API_URL=http://localhost:5050

   # backend/.env
   PORT=5050
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=voting
   DB_PASSWORD=votingpw
   DB_NAME=votingapp
   JWT_SECRET=change-me
   CORS_ORIGINS=http://localhost:3000
   ```

4. **Bootstrap the schema**
   ```bash
   cd backend
   npm run migrate
   ```

5. **Start both services** (two terminals):
   ```bash
   # Terminal 1
   cd backend
   npm run dev    # Express + Socket.IO on http://localhost:5050

   # Terminal 2 (repo root)
   npm run dev    # Next.js on http://localhost:3000
   ```

6. **Seed an admin** (optional, for first login):
   ```bash
   cd backend
   node DBRelated/create-admin.js
   ```

Once both servers are running, visit `http://localhost:3000`, log in with the seeded admin, and begin configuring sessions/candidates.

## Tech Stack

- Frontend: Next.js 15, React 18, Tailwind CSS 4, React Toastify.
- Backend: Node.js 20+, Express 4, Socket.IO 4, MySQL 8 (via mysql2).
- Tooling: Nodemon, Node test runner, dotenv, Helmet, compression.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `pages/`, `components/`, `lib/`, `styles/` | Next.js frontend source. |
| `backend/` | Express API, Socket.IO server, database layer, retention jobs. |
| `backend/DBRelated/` | SQL schema, admin bootstrap scripts, helper queries. |
| `backend/uploads/` | Runtime storage for uploaded profile and candidate images. |
| `tests/`, `backend/tests/` | Node-based unit and integration tests. |

## Prerequisites

- Node.js 20.x (match backend `engines` field) and npm 10.x.
- MySQL 8.x (or compatible service such as Aurora/MySQL on RDS).
- Optional: `nvm` for Node version management and `pm2`/`systemd` for production processes.

## 1. Install Dependencies

```bash
# from repo root
npm install

# install backend dependencies
cd backend
npm install
```

If you use `nvm`, run `nvm use 20` (or install it via `nvm install 20`) before installing.

## 2. Configure Environment Variables

Copy the provided samples or create files manually.

### Frontend (`.env.local`)

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the backend (include protocol and port). Defaults to `http://localhost:5050` if omitted. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | OAuth client for Google sign-in (optional). |

Place the file at repo root, e.g.:

```env
NEXT_PUBLIC_API_URL=http://localhost:5050
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Backend (`backend/.env`)

| Variable | Description |
| --- | --- |
| `HOST` / `PORT` | Bind address and port for the Express server (default `0.0.0.0:5050`). |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection settings. Ensure the user has DDL + DML privileges. |
| `DB_SSL`, `DB_SSL_CA`, `DB_SSL_CA_PATH` | Optional SSL settings; set `DB_SSL=allow` for managed MySQL instances. |
| `JWT_SECRET` | Long random string for signing session tokens. |
| `ADMIN_USERNAMES`, `ADMIN_EMAILS` | Comma-separated lists flagged as super-admins. |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API (e.g. `http://localhost:3000`). |
| `GOOGLE_CLIENT_ID` | Matches frontend client ID when Google sign-in is enabled. |

Never commit populated `.env` files; use your deployment platform’s secret manager instead.

## 3. Provision the Database

1. Create an empty database:

   ```sql
   CREATE DATABASE votingapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Run the schema bootstrap (from `backend/`):

   ```bash
   npm run migrate
   ```

   The backend also calls `ensureSchema()` on startup, but running the script up front validates access and schema.

3. (Optional) Test connectivity:

   ```bash
   node test-db.js
   ```

## 4. Seed an Initial Admin

Ensure the `ADMIN_USERNAMES` / `ADMIN_EMAILS` env values match your intended admin. To create the default admin included in the repo:

```bash
cd backend
node DBRelated/create-admin.js
```

This script upserts `voteadm / admin@techanalytics.org` with password `admin000`. Change the script or values before running in production.

## 5. Run the App Locally

Open two terminals after environment setup.

```bash
# Terminal 1 - backend
cd backend
npm run dev        # nodemon on http://localhost:5050

# Terminal 2 - frontend (from repo root)
npm run dev        # Next.js on http://localhost:3000
```

The frontend proxies API calls to `NEXT_PUBLIC_API_URL`. Authentication tokens are stored in local storage and cookies for session affinity with the API.

Socket.IO connections automatically reconnect to the backend and support `identify` + `chat:join` namespaces.

## 6. Running Tests

- Frontend utilities: `npm test`
- Backend logic (eligibility, etc.): `cd backend && npm test`

Both use Node’s built-in test runner. Add `NODE_OPTIONS=--test-only=<pattern>` to focus on specific suites.

## 7. Production Builds & Deployment

Frontend:

```bash
npm run build
npm run start   # serves .next/ standalone build
```

Backend:

```bash
cd backend
npm run start   # node server.js
```

Recommended production checklist:

- Provide production `.env` files via secrets manager (Vercel, Docker secrets, systemd drop-ins, etc.).
- Configure reverse proxy or load balancer (NGINX, ALB) to terminate TLS and forward to port 5050.
- Mount a persistent volume for `backend/uploads/` if you need durable media.
- Set up a process manager (`pm2`, systemd, ECS task) to restart the backend on failure.
- Schedule MySQL backups and review retention policy defaults (chat history 30 days, dormant users 90 days).

If deploying the frontend separately (e.g., Vercel + Render), expose the backend publicly and set `NEXT_PUBLIC_API_URL` to the public API URL.

## API Overview

All routes are prefixed with `/api`.

- `GET /api` — health check (`{ ok: true }`).
- `POST /api/auth/...` — registration, login, password resets, Google login.
- `GET /api/public/...` — public information (published periods, results, FAQs).
- `POST /api/vote/...` — ballot casting and verification (requires voter JWT).
- `GET/POST /api/profile/...` — profile management, photo uploads.
- `/api/admin/...` — candidate management, period scheduling, audit access (admin/super-admin only).
- `/api/chat/...` — live chat session management (paired with Socket.IO events).

Review `backend/routes/` for full details before adding or exposing endpoints.

## Background Tasks & Storage

- `backend/utils/retention.js` runs on server start to purge dormant accounts, stale chat history, and orphaned uploads.
- Uploaded media (profile photos, candidate images) lives under `backend/uploads/`. Back it up or offload to object storage in production.
- Audit and request logs capture admin actions; anonymisation runs as part of retention sweeps.

## Troubleshooting

- `ECONNREFUSED` or `ER_ACCESS_DENIED_ERROR`: verify MySQL credentials match `.env` and the DB user has required grants.
- Socket.IO CORS errors: ensure the frontend origin is listed in `CORS_ORIGINS`.
- Admin routes returning `403`: confirm the authenticated user is in `ADMIN_USERNAMES` / `ADMIN_EMAILS` or run the admin seeder script.
- Missing uploads: ensure the process has write access to `backend/uploads/` or mount a persistent volume.

## License

Distributed under the terms of the GNU General Public License v2.0. See `LICENSE` for full text.
