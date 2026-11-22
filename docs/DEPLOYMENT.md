# Deployment & Operations

Deployment instructions and production environment reference for StudyRoom.

## Environment Variables Reference

| Variable | Default | Target | Purpose |
| --- | --- | --- | --- |
| `PORT` | `3001` | server | HTTP server and Socket.io listening port |
| `CORS_ORIGIN` | `http://localhost:5173` | server | Comma-separated allowed origins for HTTP and WebSocket requests |
| `DATABASE_URL` | — | server | PostgreSQL connection URI (required when `STORE=prisma`) |
| `STORE` | `prisma` | server | Storage backend: `prisma` (PostgreSQL) or `memory` (in-process) |
| `PRESENCE_GRACE_MS` | `15000` | server | Grace window in milliseconds before dropping disconnected members |
| `MAX_MEMBERS` | `30` | server | Maximum concurrent members allowed per room (hard cap 30) |
| `ROOM_TTL_DAYS` | `7` | server | Retention period in days for inactive rooms |
| `TRUST_PROXY` | `0` | server | Number of reverse proxy hops to trust for rate-limiting client IPs |
| `VITE_SERVER_URL` | *(empty)* | client | Base backend URL in production (leave empty in local dev to use Vite proxy) |

## Production Docker Deployment

### Multi-Container Stack (Docker Compose)

The repository provides a production-ready `docker-compose.yml` defining the PostgreSQL database and Node.js server services.

1. Create production environment configuration:
   ```bash
   cp .env.example .env
   ```
2. Configure strong passwords and correct hosts in `.env`:
   ```env
   DATABASE_URL=postgresql://studyroom:YOUR_SECURE_PASSWORD@db:5432/studyroom?schema=public
   CORS_ORIGIN=https://your-domain.com
   TRUST_PROXY=1
   ```
3. Start the stack:
   ```bash
   docker compose up -d
   ```

### Standalone Server Container

Build and run the standalone server image with an external PostgreSQL instance:

```bash
docker build -t studyroom-server -f server/Dockerfile .
docker run -d \
  -p 3001:3001 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e CORS_ORIGIN="https://your-domain.com" \
  -e TRUST_PROXY=1 \
  studyroom-server
```

## Static Client Hosting

The client is a single-page React application that compiles to static assets:

```bash
npm run build -w client
```

Output directory: `client/dist`

### Web Server Configuration (Nginx)

When serving `client/dist`, ensure all non-file routes fall back to `/index.html`:

```nginx
server {
    listen 80;
    server_name studyroom.example.com;
    root /var/www/studyroom/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Database Schema Updates

Schema updates are managed with Prisma:

```bash
# Push schema changes to target database
DATABASE_URL="postgresql://..." npm run db:push -w server
```
