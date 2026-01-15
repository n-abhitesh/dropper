# Environment Variables Setup

## Quick Reference

### Vercel (Frontend) - Required

**Variable Name:** `VITE_SIGNALING_URL`

**Value:** `wss://dropper-be-production.up.railway.app`

**How to Set:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Click "Add New"
3. Name: `VITE_SIGNALING_URL`
4. Value: `wss://dropper-be-production.up.railway.app`
5. Select environments: Production (and Preview if desired)
6. Click "Save"
7. **Redeploy** your application for changes to take effect

### Railway (Backend) - Automatic

Railway automatically sets the `PORT` environment variable. No manual configuration needed.

## Verification

After setting the environment variable:

1. **Frontend:** Check browser console - WebSocket should connect to `wss://dropper-be-production.up.railway.app`
2. **Backend:** Check Railway logs - should show "Signaling server running on :<PORT>"

## Troubleshooting

- **WebSocket connection fails:** Verify the Railway URL is correct and includes `wss://` protocol
- **Still connecting to localhost:** Make sure you redeployed after setting the environment variable
- **CORS errors:** Railway should handle CORS automatically, but check if you see any errors
