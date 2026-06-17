# Dekunu Backend — Setup Guide

## Prerequisites

- [Node.js 20+](https://nodejs.org/en/download) — download and install the macOS pkg
- [PostgreSQL 15+](https://www.postgresql.org/download/macosx/) — or use [Postgres.app](https://postgresapp.com) (easiest on Mac)

## 1. Install dependencies

```bash
cd ~/Desktop/dekunu-backend
npm install
```

## 2. Create the database

Open the Postgres CLI (or Postgres.app):

```sql
CREATE DATABASE dekunu;
```

## 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
PORT=3000
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/dekunu
JWT_SECRET=some-long-random-string-here
UPLOAD_DIR=./uploads
```

## 4. Run migrations (creates all tables)

```bash
npm run migrate
```

## 5. Start the server

```bash
# Development (auto-restarts on file change)
npm run dev

# Production
npm start
```

---

## API Reference

### Auth

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | `{ dekunu_user_id, password, full_name?, email? }` | Create account |
| POST | `/auth/login` | `{ dekunu_user_id, password }` | Get JWT token |

All other endpoints require `Authorization: Bearer <token>`.

---

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me` | Your profile |
| PATCH | `/users/me` | Update name / email / password / next_jump_number |
| GET | `/users/me/stats` | Jump totals, highest exit, fastest speed, total freefall time |

---

### Jumps

| Method | Path | Description |
|--------|------|-------------|
| POST | `/jumps/upload` | Upload CSV files (multipart, field `files[]`, up to 50 at once) |
| GET | `/jumps` | List jumps (`?limit=20&offset=0`) |
| GET | `/jumps/:id` | Single jump metadata |
| GET | `/jumps/:id/track` | Full per-second sensor track (GPS + altitude + speed) |
| PATCH | `/jumps/:id` | Add notes, discipline, jump number |
| DELETE | `/jumps/:id` | Remove jump + sensor data |

---

### Devices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/devices` | Your registered devices |
| POST | `/devices` | Register / update a device |
| GET | `/devices/:deviceId/jumps` | Jumps recorded on a specific device |

---

### System Logs

| Method | Path | Description |
|--------|------|-------------|
| POST | `/logs/upload` | Upload syslog .txt files (multipart, field `files[]`) |
| GET | `/logs` | List uploaded logs (preview first 200 chars) |
| GET | `/logs/:id` | Full log content |

---

## Upload your existing logs

```bash
# Register your account (use your Dekunu user ID 469)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"dekunu_user_id": 469, "full_name": "Donte Caul", "password": "yourpassword"}'

# Save the token
TOKEN="<paste token here>"

# Upload all your jump CSVs from the Donte folder
curl -X POST http://localhost:3000/jumps/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "files[]=@/Users/dontecaul/Desktop/Dekunu/jumpLogs/Donte/action_469_20260418_1511-240.csv" \
  -F "files[]=@/Users/dontecaul/Desktop/Dekunu/jumpLogs/Donte/action_469_20260418_1706-240.csv"

# Or use a shell loop to upload all at once:
cd "/Users/dontecaul/Desktop/Dekunu/jumpLogs/Donte"
FILES=$(ls *.csv | xargs -I{} echo "-F files[]=@{}")
curl -X POST http://localhost:3000/jumps/upload \
  -H "Authorization: Bearer $TOKEN" \
  $FILES

# Upload system logs
cd "/Users/dontecaul/Desktop/Dekunu/system/sysLogs"
curl -X POST http://localhost:3000/logs/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "files[]=@syslog.txt.last" \
  -F "files[]=@syslog_esp32.txt"
```
