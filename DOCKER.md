# Docker Development Guide

This guide covers local development using Docker and Docker Compose.

## Quick Start

### Start All Services

```bash
# Start PostgreSQL and the application
pnpm run docker:up

# Or manually
docker-compose up -d
```

### View Logs

```bash
# Follow logs for the app
pnpm run docker:logs

# Or manually
docker-compose logs -f app
```

### Stop All Services

```bash
pnpm run docker:down

# Or manually
docker-compose down
```

## Services

### App Service

The application service runs the NestJS backend with hot reload enabled.

- **Container**: ai-pipeline-app
- **Port**: 3000
- **Volumes**: Source code is mounted for live reload
- **Command**: `pnpm run start:dev`

### PostgreSQL Service

PostgreSQL 16 database for local development.

- **Container**: ai-pipeline-db
- **Port**: 5432
- **User**: postgres
- **Password**: postgres
- **Database**: ai_pipeline
- **Volume**: `pgdata` for data persistence

## Development Workflow

### 1. Initial Setup

```bash
# Clone the repository
git clone <repo-url>
cd ai-pipeline

# Copy environment file
cp .env.example .env

# Edit .env with your secrets
nano .env

# Start services
pnpm run docker:up

# Run migrations
docker-compose exec app npx prisma migrate deploy

# Generate Prisma client
docker-compose exec app npx prisma generate
```

### 2. Making Changes

Code changes in `src/` and `web/src/` are automatically reflected due to volume mounts.

### 3. Running Commands Inside Container

```bash
# Run Prisma migrations
docker-compose exec app npx prisma migrate dev

# Run tests
docker-compose exec app pnpm test

# Generate Prisma client
docker-compose exec app npx prisma generate

# Access database
docker-compose exec postgres psql -U postgres -d ai_pipeline
```

### 4. Rebuilding After Dependency Changes

If you add new dependencies, rebuild the container:

```bash
# Rebuild and restart
docker-compose up -d --build
```

## Docker Build Stages

The Dockerfile uses multi-stage builds:

### Stage 1: Builder

- Installs all dependencies (including dev dependencies)
- Builds NestJS backend
- Builds React frontend
- Generates Prisma client

### Stage 2: Production

- Installs only production dependencies
- Copies built artifacts from builder
- Minimal image size for production

## Environment Variables

Environment variables can be set in:

1. `.env` file (loaded by docker-compose)
2. `docker-compose.yml` environment section
3. Command line: `docker-compose up -e VAR=value`

Required variables:
- `DATABASE_URL` - Set automatically by docker-compose
- `OPENAI_API_KEY`
- `GITHUB_TOKEN`
- `SESSION_SECRET`

See `.env.example` for complete list.

## Database Management

### Access PostgreSQL CLI

```bash
docker-compose exec postgres psql -U postgres -d ai_pipeline
```

### Run Migrations

```bash
# Development migrations (creates migration files)
docker-compose exec app npx prisma migrate dev

# Production migrations (applies existing migrations)
docker-compose exec app npx prisma migrate deploy
```

### Reset Database

```bash
# Reset database and apply all migrations
docker-compose exec app npx prisma migrate reset
```

### Seed Database

```bash
docker-compose exec app pnpm run db:seed
```

## Troubleshooting

### Port Already in Use

If port 3000 or 5432 is already in use:

```bash
# Stop conflicting services
lsof -ti:3000 | xargs kill -9
lsof -ti:5432 | xargs kill -9

# Or change ports in docker-compose.yml
```

### Container Won't Start

```bash
# Check logs
docker-compose logs app

# Check PostgreSQL status
docker-compose logs postgres

# Verify database health
docker-compose exec postgres pg_isready -U postgres
```

### Database Connection Issues

```bash
# Verify DATABASE_URL
docker-compose exec app printenv DATABASE_URL

# Test database connection
docker-compose exec app npx prisma db pull
```

### Permission Issues

```bash
# Fix volume permissions (Linux/Mac)
sudo chown -R $USER:$USER pgdata
```

### Clean Start

To start completely fresh:

```bash
# Stop and remove all containers, networks, volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Start fresh
pnpm run docker:up
```

## Production Build

### Build Production Image

```bash
# Build production image
pnpm run docker:build

# Or manually
docker build -t ai-pipeline:latest .
```

### Run Production Container

```bash
# Run with environment file
docker run -p 3000:3000 --env-file .env ai-pipeline:latest

# Or with environment variables
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e OPENAI_API_KEY=sk-... \
  ai-pipeline:latest
```

### Test Production Build

```bash
# Build and run production image
docker build -t ai-pipeline:test .
docker run -p 3000:3000 --env-file .env ai-pipeline:test

# Test health endpoint
curl http://localhost:3000/api/health
```

## Docker Compose Commands Reference

```bash
# Start services in background
docker-compose up -d

# Start services with logs
docker-compose up

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs -f [service]

# Execute command in container
docker-compose exec [service] [command]

# List running containers
docker-compose ps

# Remove stopped containers
docker-compose rm

# Pull latest images
docker-compose pull

# Build/rebuild services
docker-compose build
```

## Best Practices

1. **Use volume mounts for development**: Source code changes reflect immediately
2. **Use named volumes for data**: Persists database data across restarts
3. **Use .dockerignore**: Excludes unnecessary files from build
4. **Multi-stage builds**: Smaller production images
5. **Health checks**: Ensure services are ready before accepting traffic
6. **Environment variables**: Never hardcode secrets in Dockerfile

## Network Configuration

Docker Compose creates a custom network (`ai-pipeline-network`) where:
- Services can communicate by service name
- App connects to PostgreSQL via `postgres:5432`
- Isolated from host network

## Volume Management

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect ai-pipeline_pgdata

# Remove volume (data loss!)
docker volume rm ai-pipeline_pgdata

# Backup volume
docker run --rm -v ai-pipeline_pgdata:/data -v $(pwd):/backup ubuntu tar czf /backup/pgdata-backup.tar.gz /data
```
