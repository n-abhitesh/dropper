# Backend Deployment Guide (Railway)

## Environment Variables

Railway automatically sets `PORT`. No additional environment variables required.

## Deployment Steps

1. Connect your GitHub repository to Railway
2. Set root directory to `dropper-be`
3. Railway will auto-detect Node.js
4. Deploy

## Configuration

The server automatically uses `process.env.PORT` provided by Railway.

## WebSocket URL

After deployment, Railway will provide a URL like:
- `dropper-be-production.up.railway.app`

Use this URL (with `wss://` protocol) in your frontend's `VITE_SIGNALING_URL` environment variable.

## Testing

The server logs will show:
```
Signaling server running on :<PORT>
```

Where `<PORT>` is the port Railway assigns.
