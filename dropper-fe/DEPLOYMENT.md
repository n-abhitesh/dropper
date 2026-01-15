# Frontend Deployment Guide (Vercel)

## Environment Variables

Set the following in Vercel Dashboard → Settings → Environment Variables:

### Production
- **Name:** `VITE_SIGNALING_URL`
- **Value:** `wss://dropper-be-production.up.railway.app`
- **Environment:** Production

### Preview (optional)
- **Name:** `VITE_SIGNALING_URL`
- **Value:** `wss://dropper-be-production.up.railway.app`
- **Environment:** Preview

## Local Development

For local development, create a `.env.local` file in `dropper-fe/`:

```env
# Leave empty to use localhost:3001, or set to test against remote backend
# VITE_SIGNALING_URL=ws://localhost:3001
```

## Build Configuration

Vercel will automatically detect Vite. No additional configuration needed.

## After Deployment

1. Verify the environment variable is set in Vercel
2. Redeploy to pick up the new environment variable
3. Check browser console to confirm WebSocket connects to Railway URL
