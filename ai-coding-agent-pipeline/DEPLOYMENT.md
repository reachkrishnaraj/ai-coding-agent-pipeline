# Deployment Guide

This document describes how to deploy the AI Pipeline to Railway.

## Prerequisites

- Railway account (sign up at https://railway.app)
- GitHub repository connected to Railway
- All environment variables configured

## Railway Setup

### 1. Create Railway Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose the `ai-pipeline` repository
5. Railway will automatically detect the Dockerfile and build settings from `railway.toml`

### 2. Add PostgreSQL Service

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will provision a managed PostgreSQL instance
4. Copy the `DATABASE_URL` from the PostgreSQL service variables

### 3. Configure Environment Variables

In your Railway app service, add the following environment variables:

#### Required Variables

```bash
# Database (automatically set by Railway when you connect the PostgreSQL service)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Server
NODE_ENV=production
PORT=3000

# OpenAI
OPENAI_API_KEY=sk-...

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GITHUB_OAUTH_CALLBACK_URL=https://your-app.up.railway.app/api/auth/github/callback
GITHUB_WEBHOOK_SECRET=...

# Session
SESSION_SECRET=your-random-secret-here

# Default Repository
DEFAULT_REPO=mothership/finance-service
```

#### Optional Variables (Slack Integration)

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_DEFAULT_USER_ID=U0A6VN4J3PW
```

### 4. Deploy

Railway will automatically deploy when you push to the main branch.

Manual deployment:
1. Click "Deploy" in the Railway dashboard
2. Railway will:
   - Build the Docker image using the Dockerfile
   - Run database migrations (if configured)
   - Start the application
   - Perform health checks on `/api/health`

### 5. Run Database Migrations

After the first deployment, you need to run migrations:

1. In Railway dashboard, go to your app service
2. Click on "Settings" → "Deploy"
3. Add a custom start command:
   ```bash
   npx prisma migrate deploy && node dist/main.js
   ```

Or run migrations manually via Railway CLI:
```bash
railway run npx prisma migrate deploy
```

### 6. Set Up GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Create a new OAuth App:
   - Application name: AI Pipeline
   - Homepage URL: https://your-app.up.railway.app
   - Authorization callback URL: https://your-app.up.railway.app/api/auth/github/callback
3. Copy the Client ID and Client Secret
4. Add them to Railway environment variables

### 7. Configure GitHub Webhooks

For each repository you want to integrate:

1. Go to Repository Settings → Webhooks
2. Add webhook:
   - Payload URL: https://your-app.up.railway.app/api/webhooks/github
   - Content type: application/json
   - Secret: (same as GITHUB_WEBHOOK_SECRET)
   - Events: Pull requests, Issue comments
3. Save webhook

## Build Configuration

The application uses a multi-stage Docker build:

1. **Builder stage**: Installs dependencies, builds NestJS backend and React frontend
2. **Production stage**: Copies only production artifacts and dependencies

Build is configured in:
- `Dockerfile` - Multi-stage build definition
- `railway.toml` - Railway-specific configuration
- `.dockerignore` - Files to exclude from build

## Health Checks

Railway performs health checks on `/api/health` endpoint:
- Interval: 30 seconds
- Timeout: 30 seconds
- The endpoint checks database connectivity

## Local Development with Docker

### Using Docker Compose

```bash
# Start all services (app + postgres)
pnpm run docker:up

# View logs
pnpm run docker:logs

# Stop all services
pnpm run docker:down
```

### Manual Docker Build

```bash
# Build the Docker image
pnpm run docker:build

# Run the container
docker run -p 3000:3000 --env-file .env ai-pipeline
```

## Troubleshooting

### Build Failures

If the build fails:
1. Check Railway build logs for errors
2. Verify all dependencies are in `package.json`
3. Ensure `pnpm-lock.yaml` is committed
4. Check that Prisma schema is valid

### Health Check Failures

If health checks fail:
1. Verify `DATABASE_URL` is correct
2. Check that database is accessible
3. Review application logs in Railway
4. Ensure port 3000 is properly exposed

### Database Connection Issues

If unable to connect to database:
1. Verify PostgreSQL service is running
2. Check `DATABASE_URL` format
3. Ensure migrations have been run
4. Check Railway service logs

### GitHub OAuth Issues

If authentication fails:
1. Verify OAuth callback URL matches Railway deployment URL
2. Check Client ID and Secret are correct
3. Ensure user is a member of the `mothership` organization

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NODE_ENV` | Yes | Environment (production/development) |
| `PORT` | Yes | Server port (default: 3000) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM analysis |
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token |
| `GITHUB_OAUTH_CLIENT_ID` | Yes | GitHub OAuth App Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | Yes | GitHub OAuth App Client Secret |
| `GITHUB_OAUTH_CALLBACK_URL` | Yes | OAuth callback URL |
| `GITHUB_WEBHOOK_SECRET` | Yes | GitHub webhook secret |
| `SESSION_SECRET` | Yes | Session encryption secret |
| `DEFAULT_REPO` | Yes | Default repository (e.g., mothership/finance-service) |
| `SLACK_BOT_TOKEN` | No | Slack Bot token (xoxb-...) |
| `SLACK_SIGNING_SECRET` | No | Slack signing secret |
| `SLACK_DEFAULT_USER_ID` | No | Default Slack user ID for notifications |
| `FRONTEND_URL` | No | Frontend URL for CORS (dev only) |

## Monitoring

### Railway Metrics

Railway provides built-in metrics:
- CPU usage
- Memory usage
- Network traffic
- Request volume

Access metrics in the Railway dashboard under your service.

### Application Logs

View logs in Railway:
```bash
railway logs
```

Or in the Railway dashboard under your service → Logs.

## Scaling

Railway automatically scales based on usage. To adjust:
1. Go to service Settings
2. Adjust resource limits if needed
3. Railway handles autoscaling within those limits

## Continuous Deployment

Railway automatically deploys on every push to main branch:
1. Push changes to GitHub
2. Railway detects the push
3. Builds Docker image
4. Runs tests (via GitHub Actions)
5. Deploys to production
6. Performs health checks

To disable auto-deploy:
1. Go to service Settings
2. Uncheck "Auto-deploy"
