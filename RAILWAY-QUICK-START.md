# Railway Quick Start

This is a condensed guide to get the AI Pipeline deployed on Railway in under 10 minutes.

## 1. Create Railway Project (2 min)

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `ai-pipeline` repository
5. Railway auto-detects Dockerfile and railway.toml

## 2. Add PostgreSQL (1 min)

1. In Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Done! Railway provisions the database and sets `DATABASE_URL`

## 3. Set Environment Variables (3 min)

In your Railway app service, click "Variables" and add:

### Core Variables (Required)

```
NODE_ENV=production
PORT=3000
SESSION_SECRET=<generate-random-32-char-string>
DEFAULT_REPO=mothership/finance-service
```

### OpenAI

```
OPENAI_API_KEY=sk-...
```

### GitHub

```
GITHUB_TOKEN=ghp_...
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GITHUB_OAUTH_CALLBACK_URL=https://your-app.up.railway.app/api/auth/github/callback
GITHUB_WEBHOOK_SECRET=<generate-random-string>
```

### Slack (Optional)

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_DEFAULT_USER_ID=U...
```

## 4. Deploy & Migrate (2 min)

Railway auto-deploys. To run migrations:

1. Go to app service → Settings → Deploy
2. Update start command to:
   ```
   npx prisma migrate deploy && node dist/main.js
   ```
3. Redeploy

## 5. Configure GitHub OAuth (2 min)

1. GitHub Settings → Developer settings → OAuth Apps → New
2. Set:
   - Homepage URL: `https://your-app.up.railway.app`
   - Callback URL: `https://your-app.up.railway.app/api/auth/github/callback`
3. Copy Client ID and Secret to Railway variables
4. Redeploy

## Done!

Your app is live at: `https://your-app.up.railway.app`

Check health: `https://your-app.up.railway.app/api/health`

## Quick Reference

### Railway CLI Commands

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# View logs
railway logs

# Run migrations
railway run npx prisma migrate deploy

# Open in browser
railway open
```

### Environment Variable Checklist

- [ ] `DATABASE_URL` (auto-set by PostgreSQL service)
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `SESSION_SECRET`
- [ ] `OPENAI_API_KEY`
- [ ] `GITHUB_TOKEN`
- [ ] `GITHUB_OAUTH_CLIENT_ID`
- [ ] `GITHUB_OAUTH_CLIENT_SECRET`
- [ ] `GITHUB_OAUTH_CALLBACK_URL`
- [ ] `GITHUB_WEBHOOK_SECRET`
- [ ] `DEFAULT_REPO`

### Health Check

Railway monitors: `GET /api/health`

Response should be:
```json
{
  "status": "ok",
  "db": "connected"
}
```

### Troubleshooting

**Build fails**: Check Railway build logs, verify pnpm-lock.yaml is committed

**Health check fails**: Verify DATABASE_URL, check app logs

**Auth fails**: Verify OAuth callback URL matches Railway URL

**404 on all routes**: Ensure start command includes `node dist/main.js`

### Next Steps

1. Configure GitHub webhooks for repos
2. Set up Slack integration (optional)
3. Test task creation flow
4. Monitor via Railway dashboard

See `DEPLOYMENT.md` for detailed documentation.
