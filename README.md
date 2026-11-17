# BattleZone 🎮

> **Cross-platform 2D multiplayer top-down browser shooter — no install required!**

## 🌐 Live Server: [battlezone-txsp.onrender.com](https://battlezone-txsp.onrender.com)

![BattleZone](https://img.shields.io/badge/BattleZone-Multiplayer%20Shooter-e94560?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Mobile%20%7C%20Desktop-0f3460?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Ready-4CAF50?style=for-the-badge)

---

## ✨ Features

- 🌐 **Real-time Multiplayer** — Create or join rooms with a 4-letter code and play with friends instantly
- 🔫 **5 Unique Weapons** — Pistol, Shotgun, Assault Rifle, SMG, and Sniper Rifle, each with distinct stats
- 📦 **Dynamic Loot System** — Weapons, health packs, armor packs, and ammo spawn across the 2400×2400 map
- 📱 **Mobile + Desktop** — Full touch controls with virtual joysticks on mobile; keyboard + mouse on desktop
- 📲 **PWA Ready** — Add to home screen on any mobile device and play like a native app
- 🏆 **Live Leaderboard** — Kills and deaths tracked and broadcast in real-time
- 🗺️ **Minimap** — Always know where your enemies are
- 🔵 **Shrinking Safe Zone** — Battle-royale-style zone that closes in over time

---

## 🎮 How to Play

### Controls

| Action | Desktop | Mobile |
|---|---|---|
| **Move** | `W A S D` / Arrow Keys | Left virtual joystick |
| **Aim** | Mouse cursor | Right virtual joystick |
| **Fire** | Left mouse click | Tap fire button |
| **Switch Weapon** | `1` `2` `3` `4` `5` | Tap weapon slot |
| **Pick up Loot** | Walk over item or press `E` | Walk over item |
| **Respawn** | Click Respawn button | Tap Respawn button |

### Gameplay Tips

- 💊 **Health Packs** restore 50 HP — grab them before fighting
- 🛡️ **Armor Packs** absorb 50% of incoming damage — always worth picking up
- 🎯 **Sniper Rifle** has the highest damage (95) but slowest reload — use from a distance
- 🔫 **Shotgun** deals massive close-range burst damage — great for indoor fights
- Stay inside the **blue safe zone** — the zone shrinks over time and deals damage outside it

---

## 🚀 Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v16+ installed

### Quick Start (Windows)

Just double-click **`start.bat`** in the project root — it starts the server and opens the game automatically.

### Quick Start (Mac/Linux)

```bash
chmod +x start.sh
./start.sh
```

### Manual Setup

**1. Start the server:**

```bash
cd server
npm install
node index.js
```

The server starts on **http://localhost:3001**

**2. Open the game:**

Option A — open directly in browser:
```
client/index.html
```

Option B — serve with a static server (recommended for PWA features):
```bash
npx serve client -p 8080
```
Then open **http://localhost:8080**

---

## 🔫 Weapons Guide

| Weapon | Damage | Range | Ammo | Fire Rate | Description |
|---|---|---|---|---|---|
| 🔫 **Pistol** | 25 | 400 | 12 | Medium | Reliable sidearm, accurate at range. Good starter weapon. |
| 💥 **Shotgun** | 80 (8 pellets) | 200 | 2 | Slow | Devastating at close range. Each pellet deals 10 dmg. |
| ⚡ **Assault Rifle** | 18 | 500 | 30 | Fast | Full-auto versatile rifle. Great all-round choice. |
| 🌀 **SMG** | 12 | 300 | 40 | Very Fast | Spray-and-pray. Excellent for rushing enemies up close. |
| 🎯 **Sniper Rifle** | 95 | 800 | 5 | Very Slow | Near-instant kill. High skill, high reward. Use cover. |

> All weapons can be found as loot drops on the map. Ammo packs refill your current weapon.

---

## 📡 Deployment

### Server (Backend)

Deploy `server/` to any Node.js host:

**[Railway](https://railway.app/)** (recommended — free tier available):
1. Push repo to GitHub
2. Connect Railway to your repo
3. Set root directory to `server/`
4. Railway auto-detects Node.js and deploys

**[Render](https://render.com/)**:
1. New → Web Service → connect GitHub repo
2. Root Directory: `server`
3. Build Command: `npm install`
4. Start Command: `node index.js`

> After deploying, update `SERVER_URL` in `client/js/config.js` to your live server URL.

### Client (Frontend)

Deploy `client/` to any static host:

**[Netlify](https://netlify.com/)** (drag & drop):
1. Go to [app.netlify.com](https://app.netlify.com)
2. Drag the `client/` folder onto the deploy zone
3. Done — your game is live!

**[Vercel](https://vercel.com/)**:
```bash
npx vercel client/
```

**[GitHub Pages](https://pages.github.com/)**:
1. Push `client/` contents to a `gh-pages` branch
2. Enable GitHub Pages in repo settings

---

## 🗂️ Project Structure

```
solo shooter/
├── server/
│   ├── package.json        # Node.js dependencies
│   ├── index.js            # Express + Socket.io server
│   └── .env.example        # Environment variables
├── client/
│   ├── index.html          # Main entry point
│   ├── manifest.json       # PWA manifest
│   ├── css/
│   │   └── style.css       # Dark theme styles
│   └── js/
│       ├── config.js       # Game constants & weapon stats
│       ├── network.js      # Socket.io connection manager
│       ├── input.js        # Keyboard/mouse/touch input
│       └── scenes/
│           ├── BootScene.js    # Lobby & room selection
│           ├── GameScene.js    # Main game world
│           └── UIScene.js      # HUD overlay
├── README.md               # This file
├── start.bat               # Windows launcher
└── start.sh                # Mac/Linux launcher
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Phaser 3, Vanilla JS, HTML5 Canvas |
| **Backend** | Node.js, Express, Socket.io |
| **Networking** | WebSockets (Socket.io) |
| **Styling** | CSS3, dark theme |
| **PWA** | Web App Manifest |

---

## 🤝 Multiplayer Flow

1. **Player A** opens the game → clicks **Create Room** → shares the 4-letter code
2. **Player B** enters the code → clicks **Join Room** → appears in lobby
3. Host clicks **Start Game** → all players spawn on the map
4. Fight! Last one standing (or most kills in time limit) wins

---

*Built with ❤️ using Phaser 3 + Node.js + Socket.io*
