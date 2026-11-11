# BloomCycle API

Express + MongoDB backend for a period-tracking app (package name `period-tracker-server`). It provides user accounts, cycle logging with simple next-period prediction, daily wellness tasks that earn "trees", a tree leaderboard, and static education/FAQ content.

## Features

- **Auth** – email/password sign-up and login (bcrypt hashing, JWT valid for 7 days). Auth endpoints are rate-limited in memory (12 attempts per email per 10 minutes).
- **Cycle logging** – one entry per date with flow, mood, up to 8 symptoms and a period-start flag. Returns a summary with average cycle length and next expected period (needs at least two logged period starts).
- **Daily tasks & trees** – completing a daily task adds a tree; the user's rank is derived from tree count (Seedling → Sapling Nurturer → Tree Builder → Forest Keeper → Rainforest Guardian) and a daily-completion streak is computed.
- **Leaderboard** – top 10 users by trees.
- **Content** – static education articles, common questions and the daily task list live in `src/content.js`.

## Tech stack

- Node.js (ES modules), Express 4
- MongoDB via Mongoose 8
- `jsonwebtoken`, `bcryptjs`, `dayjs`, `uuid`, `dotenv`, `cors`

## Project structure

```
src/
  index.js        # Express app, routes and helpers
  mongo.js        # MongoDB connection (loads .env via dotenv)
  models/User.js  # User schema (cycle logs, completed tasks, trees)
  content.js      # Static articles, questions and daily tasks
```

## Getting started

Prerequisites: Node.js (a version with `--watch` support, i.e. 18.11+, for `npm run dev`) and a MongoDB instance.

```bash
npm install
# create a .env file with the variables below
npm run dev     # node --watch src/index.js
# or
npm start       # node src/index.js
```

The server listens on `PORT` (default `4000`) and exits if it cannot connect to MongoDB.

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string. |
| `MONGODB_DB` | No | Database name (defaults to `bloomcycle`). |
| `JWT_SECRET` | Recommended | Secret used to sign JWTs. Falls back to an insecure development default if unset — always set it outside local development. |
| `PORT` | No | HTTP port (defaults to `4000`). |

Do not commit real values; keep `.env` out of version control.

## API

All routes are prefixed with `/api`. Routes marked 🔒 require an `Authorization: Bearer <token>` header.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check. |
| POST | `/api/auth/signup` | Body: `name`, `email`, `password` (min 8 chars). Returns `{ token, user }`. |
| POST | `/api/auth/login` | Body: `email`, `password`. Returns `{ token, user }`. |
| GET | `/api/content/education` | Education articles. |
| GET | `/api/content/questions` | Common questions and answers. |
| GET | `/api/leaderboard` | Top 10 users by trees. |
| GET 🔒 | `/api/tasks/daily` | Today's tasks with completion status. |
| POST 🔒 | `/api/tasks/complete` | Body: `taskId`, optional `date` (`YYYY-MM-DD`). Marks a task done and awards a tree. |
| POST 🔒 | `/api/cycle/log` | Body: `date`, `flow`, `mood`, `symptoms[]`, `isPeriodStart`. Creates or replaces the log for that date. |
| GET 🔒 | `/api/cycle/logs` | All cycle logs plus summary. |
| GET 🔒 | `/api/profile` | Public profile, stats and cycle summary. |

## Notes

- CORS is currently open to all origins.
- There are no automated tests or lint scripts in this repository.
