# Dropper

A PairDrop-style local network file sharing application with radar-style UI.

## Features

- 🎯 Radar-style peer discovery UI
- 📡 Automatic LAN device discovery
- 📁 File transfer over WebRTC (any file type)
- 📊 Real-time transfer progress
- 🎨 Modern dark theme

## Local Development

### Backend (Signaling Server)

```bash
cd dropper-be
npm install
npm start
```

Server runs on `http://localhost:3001`

### Frontend

```bash
cd dropper-fe
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

## Production Deployment

### Backend (Railway)

1. Deploy `dropper-be` to Railway
2. Railway automatically sets `PORT` environment variable
3. Get your Railway URL (e.g., `dropper-be-production.up.railway.app`)

See [dropper-be/DEPLOYMENT.md](dropper-be/DEPLOYMENT.md) for details.

### Frontend (Vercel)

1. Deploy `dropper-fe` to Vercel
2. Set environment variable:
   - **Name:** `VITE_SIGNALING_URL`
   - **Value:** `wss://dropper-be-production.up.railway.app` (your Railway URL)
3. Redeploy

See [dropper-fe/DEPLOYMENT.md](dropper-fe/DEPLOYMENT.md) for details.

## Technology Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + WebSocket (ws)
- **P2P:** WebRTC Data Channels
- **Deployment:** Railway (backend) + Vercel (frontend)
