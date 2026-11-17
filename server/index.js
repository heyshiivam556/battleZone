'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
const MAP_WIDTH = 2400;
const MAP_HEIGHT = 2400;
const LOOT_COUNT = 20;
const LOOT_RESPAWN_MS = 30_000;
const GAME_TICK_RATE = 20; // Hz
const GAME_TICK_MS = 1000 / GAME_TICK_RATE;
const PLAYER_RADIUS = 20; // px – used for hit-detection circles
const DEFAULT_HP = 100;
const HEALTH_PACK_RESTORE = 50;
const ARMOR_PACK_RESTORE = 50;
const ARMOR_DAMAGE_REDUCTION = 0.5; // armor absorbs 50% of incoming damage

/** All valid loot types. */
const LOOT_TYPES = [
  'pistol',
  'shotgun',
  'assault_rifle',
  'smg',
  'sniper',
  'health_pack',
  'armor_pack',
  'ammo_pack',
];

/** Weapon definitions. */
const WEAPON_STATS = {
  pistol: {
    damage: 25,
    range: 400,
    maxBullets: 12,
    reloadMs: 1500,
    spread: 0.05,
    pelletsPerShot: 1,
  },
  shotgun: {
    damage: 10, // 10 dmg × 8 pellets = 80 max
    range: 200,
    maxBullets: 2,
    reloadMs: 2500,
    spread: 0.3,
    pelletsPerShot: 8,
  },
  assault_rifle: {
    damage: 18,
    range: 500,
    maxBullets: 30,
    reloadMs: 2000,
    spread: 0.08,
    pelletsPerShot: 1,
  },
  smg: {
    damage: 12,
    range: 300,
    maxBullets: 40,
    reloadMs: 1800,
    spread: 0.12,
    pelletsPerShot: 1,
  },
  sniper: {
    damage: 95,
    range: 800,
    maxBullets: 5,
    reloadMs: 3000,
    spread: 0.01,
    pelletsPerShot: 1,
  },
};

const path = require('path');

// ─── App / Server Setup ───────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve static frontend if client folder is present
app.use(express.static(path.join(__dirname, '../client')));

/** Server status & health endpoints */
app.get('/', (_req, res) => {
  res.send(`
    <html>
      <head><title>BattleZone Server</title></head>
      <body style="background:#1a1a2e;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
        <h1 style="color:#e94560;">🎮 BattleZone Server is Online</h1>
        <p>Active rooms: ${rooms.size}</p>
        <p>Health endpoint: <a href="/health" style="color:#44aaff;">/health</a></p>
      </body>
    </html>
  `);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// ─── Room / Game State ────────────────────────────────────────────────────────

/**
 * @typedef {Object} LootItem
 * @property {string} id
 * @property {string} type
 * @property {number} x
 * @property {number} y
 * @property {boolean} available
 */

/**
 * @typedef {Object} PlayerState
 * @property {string} id        socket.id
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} angle
 * @property {number} hp
 * @property {number} armor
 * @property {string|null} weapon  current weapon type
 * @property {Object.<string,number>} ammo  per-weapon ammo counts
 * @property {boolean} alive
 * @property {boolean} ready
 * @property {number} kills
 * @property {number} deaths
 */

/**
 * @typedef {Object} Room
 * @property {string} code
 * @property {string} hostId
 * @property {boolean} started
 * @property {Map<string, PlayerState>} players
 * @property {Map<string, LootItem>} loot
 * @property {NodeJS.Timeout|null} tickInterval
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a random 4-letter uppercase room code. */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // omit confusable I/O
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
  } while (rooms.has(code));
  return code;
}

/** Clamp a number between min and max. */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Euclidean distance between two 2D points. */
function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Generate a fresh player state.
 * @param {string} socketId
 * @param {string} name
 * @returns {PlayerState}
 */
function createPlayer(socketId, name) {
  return {
    id: socketId,
    name: name || `Player-${socketId.slice(0, 4)}`,
    x: Math.random() * (MAP_WIDTH - 100) + 50,
    y: Math.random() * (MAP_HEIGHT - 100) + 50,
    angle: 0,
    hp: DEFAULT_HP,
    armor: 0,
    weapon: 'pistol',
    ammo: { pistol: 12, shotgun: 0, assault_rifle: 0, smg: 0, sniper: 0 },
    alive: true,
    ready: false,
    kills: 0,
    deaths: 0,
  };
}

/**
 * Generate LOOT_COUNT loot items spread across the map.
 * @returns {Map<string, LootItem>}
 */
function generateLoot() {
  const loot = new Map();
  for (let i = 0; i < LOOT_COUNT; i++) {
    const id = uuidv4();
    loot.set(id, {
      id,
      type: LOOT_TYPES[Math.floor(Math.random() * LOOT_TYPES.length)],
      x: Math.random() * (MAP_WIDTH - 100) + 50,
      y: Math.random() * (MAP_HEIGHT - 100) + 50,
      available: true,
    });
  }
  return loot;
}

/**
 * Schedule a single loot item to respawn after LOOT_RESPAWN_MS.
 * Respawns at a fresh random position with the same type.
 * @param {Room} room
 * @param {string} lootId
 */
function scheduleLootRespawn(room, lootId) {
  setTimeout(() => {
    const item = room.loot.get(lootId);
    if (!item) return; // room may have been destroyed
    item.x = Math.random() * (MAP_WIDTH - 100) + 50;
    item.y = Math.random() * (MAP_HEIGHT - 100) + 50;
    item.available = true;
    io.to(room.code).emit('loot_respawn', { loot: item });
  }, LOOT_RESPAWN_MS);
}

/**
 * Build a serialisable snapshot of the room state.
 * @param {Room} room
 */
function roomSnapshot(room) {
  return {
    code: room.code,
    started: room.started,
    players: Array.from(room.players.values()),
    loot: Array.from(room.loot.values()).filter((l) => l.available),
  };
}

/**
 * Build the leaderboard for a room.
 * @param {Room} room
 */
function leaderboard(room) {
  return Array.from(room.players.values())
    .map(({ id, name, kills, deaths }) => ({ id, name, kills, deaths }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
}

/**
 * Apply damage to a target player (armor-aware).
 * Returns the actual HP removed (after armor mitigation).
 * @param {PlayerState} target
 * @param {number} rawDamage
 * @returns {number} finalDamage applied to HP
 */
function applyDamage(target, rawDamage) {
  let hpDamage = rawDamage;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, rawDamage * ARMOR_DAMAGE_REDUCTION);
    target.armor = Math.max(0, target.armor - absorbed);
    hpDamage = rawDamage - absorbed;
  }
  target.hp = Math.max(0, target.hp - hpDamage);
  return hpDamage;
}

/**
 * Start the 20 Hz game-tick broadcast for a room.
 * @param {Room} room
 */
function startTick(room) {
  if (room.tickInterval) return;
  room.tickInterval = setInterval(() => {
    if (!rooms.has(room.code)) {
      clearInterval(room.tickInterval);
      return;
    }
    io.to(room.code).emit('game_tick', {
      players: Array.from(room.players.values()).map(
        ({ id, x, y, angle, hp, armor, alive, weapon }) => ({
          id,
          x,
          y,
          angle,
          hp,
          armor,
          alive,
          weapon,
        })
      ),
    });
  }, GAME_TICK_MS);
}

/**
 * Stop and clean up a room entirely.
 * @param {string} code
 */
function destroyRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.tickInterval) {
    clearInterval(room.tickInterval);
    room.tickInterval = null;
  }
  rooms.delete(code);
  console.log(`[Room] ${code} destroyed`);
}

// ─── Socket.io Event Handling ─────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Utility: resolve the room a socket belongs to ─────────────────────────
  function getPlayerRoom() {
    for (const [, room] of rooms) {
      if (room.players.has(socket.id)) return room;
    }
    return null;
  }

  // ── create_room ───────────────────────────────────────────────────────────
  socket.on('create_room', ({ name } = {}, callback) => {
    try {
      const code = generateRoomCode();
      /** @type {Room} */
      const room = {
        code,
        hostId: socket.id,
        started: false,
        players: new Map(),
        loot: new Map(),
        tickInterval: null,
      };

      const player = createPlayer(socket.id, name);
      room.players.set(socket.id, player);
      rooms.set(code, room);
      socket.join(code);

      console.log(`[Room] ${code} created by ${socket.id}`);
      if (typeof callback === 'function') {
        callback({ success: true, roomCode: code, playerId: socket.id, player });
      } else {
        socket.emit('room_created', { roomCode: code, playerId: socket.id, player });
      }
    } catch (err) {
      console.error('[create_room]', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ── join_room ─────────────────────────────────────────────────────────────
  socket.on('join_room', ({ code, name } = {}, callback) => {
    try {
      const room = code && rooms.get(code.toUpperCase());
      if (!room) {
        const msg = 'Room not found';
        if (typeof callback === 'function') return callback({ success: false, error: msg });
        return socket.emit('error', { message: msg });
      }
      if (room.started) {
        const msg = 'Game already in progress';
        if (typeof callback === 'function') return callback({ success: false, error: msg });
        return socket.emit('error', { message: msg });
      }

      const player = createPlayer(socket.id, name);
      room.players.set(socket.id, player);
      socket.join(room.code);

      // Notify existing players of the new joiner
      socket.to(room.code).emit('player_joined', { player });

      console.log(`[Room] ${socket.id} joined ${room.code}`);
      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode: room.code,
          playerId: socket.id,
          state: roomSnapshot(room),
        });
      } else {
        socket.emit('room_joined', {
          roomCode: room.code,
          playerId: socket.id,
          state: roomSnapshot(room),
        });
      }
    } catch (err) {
      console.error('[join_room]', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ── room_state ────────────────────────────────────────────────────────────
  socket.on('room_state', (_, callback) => {
    try {
      const room = getPlayerRoom();
      if (!room) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Not in a room' });
        return socket.emit('error', { message: 'Not in a room' });
      }
      const state = roomSnapshot(room);
      if (typeof callback === 'function') {
        callback({ success: true, state });
      } else {
        socket.emit('room_state_response', { state });
      }
    } catch (err) {
      console.error('[room_state]', err);
    }
  });

  // ── player_ready ──────────────────────────────────────────────────────────
  socket.on('player_ready', (_, callback) => {
    try {
      const room = getPlayerRoom();
      if (!room) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Not in a room' });
        return;
      }
      if (room.started) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Already started' });
        return;
      }

      const player = room.players.get(socket.id);
      if (player) player.ready = true;

      io.to(room.code).emit('player_ready_update', {
        playerId: socket.id,
        readyPlayers: Array.from(room.players.values()).filter((p) => p.ready).length,
        totalPlayers: room.players.size,
      });

      // Start when everyone is ready (minimum 1)
      const allReady =
        room.players.size >= 1 &&
        Array.from(room.players.values()).every((p) => p.ready);

      if (allReady && !room.started) {
        room.started = true;
        room.loot = generateLoot();
        startTick(room);

        io.to(room.code).emit('game_start', {
          loot: Array.from(room.loot.values()),
          players: Array.from(room.players.values()),
        });
        console.log(`[Room] ${room.code} game started`);
      }

      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      console.error('[player_ready]', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ── player_move ───────────────────────────────────────────────────────────
  socket.on('player_move', ({ x, y, angle } = {}) => {
    const room = getPlayerRoom();
    if (!room || !room.started) return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    // Clamp to map bounds
    player.x = clamp(Number(x) || 0, 0, MAP_WIDTH);
    player.y = clamp(Number(y) || 0, 0, MAP_HEIGHT);
    player.angle = Number(angle) || 0;

    // Lightweight broadcast (full state goes via game_tick)
    socket.to(room.code).emit('player_moved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
    });
  });

  // ── player_shoot ──────────────────────────────────────────────────────────
  socket.on('player_shoot', ({ x, y, angle, weaponType } = {}) => {
    const room = getPlayerRoom();
    if (!room || !room.started) return;
    const shooter = room.players.get(socket.id);
    if (!shooter || !shooter.alive) return;

    const stats = WEAPON_STATS[weaponType];
    if (!stats) return; // unknown weapon

    // Ammo check
    const currentAmmo = shooter.ammo[weaponType] ?? 0;
    if (currentAmmo <= 0) {
      socket.emit('out_of_ammo', { weaponType });
      return;
    }
    shooter.ammo[weaponType] = currentAmmo - 1;

    const originX = Number(x) || shooter.x;
    const originY = Number(y) || shooter.y;
    const baseAngle = Number(angle) || shooter.angle;

    // ── Pellet loop (shotgun fires 8 pellets, others fire 1) ─────────────
    const hitResults = [];
    for (let p = 0; p < stats.pelletsPerShot; p++) {
      const pelletAngle =
        baseAngle + (Math.random() - 0.5) * stats.spread * 2;
      const endX = originX + Math.cos(pelletAngle) * stats.range;
      const endY = originY + Math.sin(pelletAngle) * stats.range;

      // ── Hit detection: circle vs line segment ─────────────────────────
      for (const [targetId, target] of room.players) {
        if (targetId === socket.id || !target.alive) continue;

        // Project target position onto the ray [origin → end]
        const dx = endX - originX;
        const dy = endY - originY;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;

        const t = clamp(
          ((target.x - originX) * dx + (target.y - originY) * dy) / len2,
          0,
          1
        );
        const closestX = originX + t * dx;
        const closestY = originY + t * dy;
        const d = dist(closestX, closestY, target.x, target.y);

        if (d <= PLAYER_RADIUS) {
          const hpDamage = applyDamage(target, stats.damage);

          const hitInfo = {
            targetId,
            damage: hpDamage,
            newHp: target.hp,
            newArmor: target.armor,
            shooterId: socket.id,
          };
          hitResults.push(hitInfo);

          // Notify the target
          io.to(targetId).emit('you_were_hit', hitInfo);

          if (target.hp <= 0) {
            target.alive = false;
            target.deaths += 1;
            shooter.kills += 1;

            io.to(room.code).emit('player_died', {
              playerId: targetId,
              killedBy: socket.id,
              killerName: shooter.name,
              victimName: target.name,
            });

            io.to(room.code).emit('leaderboard_update', {
              leaderboard: leaderboard(room),
            });

            console.log(
              `[Kill] ${shooter.name} killed ${target.name} in room ${room.code}`
            );
          }
        }
      }
    }

    // Broadcast the shot to all players in the room (for visual/audio effects)
    io.to(room.code).emit('bullet_fired', {
      shooterId: socket.id,
      x: originX,
      y: originY,
      angle: baseAngle,
      weaponType,
      range: stats.range,
      hits: hitResults,
      ammoLeft: shooter.ammo[weaponType],
    });
  });

  // ── player_loot ───────────────────────────────────────────────────────────
  socket.on('player_loot', ({ lootId } = {}, callback) => {
    try {
      const room = getPlayerRoom();
      if (!room || !room.started) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Not in game' });
        return;
      }
      const player = room.players.get(socket.id);
      if (!player || !player.alive) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Player dead' });
        return;
      }

      const item = room.loot.get(lootId);
      if (!item || !item.available) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Loot not available' });
        return;
      }

      // Proximity check: player must be within 80px of the loot
      if (dist(player.x, player.y, item.x, item.y) > 80) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Too far from loot' });
        return;
      }

      item.available = false;

      let effect = {};
      switch (item.type) {
        case 'health_pack':
          player.hp = Math.min(DEFAULT_HP, player.hp + HEALTH_PACK_RESTORE);
          effect = { hp: player.hp };
          break;
        case 'armor_pack':
          player.armor = Math.min(100, player.armor + ARMOR_PACK_RESTORE);
          effect = { armor: player.armor };
          break;
        case 'ammo_pack': {
          // Give 50% of max ammo for the current weapon
          const currentWeapon = player.weapon || 'pistol';
          const ws = WEAPON_STATS[currentWeapon];
          if (ws) {
            const refill = Math.floor(ws.maxBullets * 0.5);
            player.ammo[currentWeapon] = Math.min(
              ws.maxBullets * 3, // carry up to 3× magazine
              (player.ammo[currentWeapon] || 0) + refill
            );
            effect = { ammo: player.ammo };
          }
          break;
        }
        default:
          // It's a weapon pickup
          if (WEAPON_STATS[item.type]) {
            player.weapon = item.type;
            // Give a full magazine if they have none
            if (!player.ammo[item.type]) {
              player.ammo[item.type] = WEAPON_STATS[item.type].maxBullets;
            }
            effect = { weapon: player.weapon, ammo: player.ammo };
          }
      }

      // Notify room that loot was taken
      io.to(room.code).emit('loot_taken', {
        lootId,
        takenBy: socket.id,
        effect,
      });

      // Schedule respawn
      scheduleLootRespawn(room, lootId);

      if (typeof callback === 'function') {
        callback({ success: true, effect });
      }
    } catch (err) {
      console.error('[player_loot]', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ── player_hit (client-reported, server-authoritative re-calculation) ─────
  socket.on('player_hit', ({ targetId, weaponType } = {}) => {
    // We honour the hit only if the same shooter and target are confirmed
    // in a room together. Damage is calculated authoritatively by the server.
    const room = getPlayerRoom();
    if (!room || !room.started) return;

    const shooter = room.players.get(socket.id);
    const target = room.players.get(targetId);
    if (!shooter || !target || !target.alive) return;

    const stats = WEAPON_STATS[weaponType];
    if (!stats) return;

    const hpDamage = applyDamage(target, stats.damage);

    const hitInfo = {
      targetId,
      damage: hpDamage,
      newHp: target.hp,
      newArmor: target.armor,
      shooterId: socket.id,
    };

    io.to(targetId).emit('you_were_hit', hitInfo);
    io.to(room.code).emit('player_hit_confirmed', hitInfo);

    if (target.hp <= 0) {
      target.alive = false;
      target.deaths += 1;
      shooter.kills += 1;

      io.to(room.code).emit('player_died', {
        playerId: targetId,
        killedBy: socket.id,
        killerName: shooter.name,
        victimName: target.name,
      });

      io.to(room.code).emit('leaderboard_update', {
        leaderboard: leaderboard(room),
      });
    }
  });

  // ── player_respawn ────────────────────────────────────────────────────────
  socket.on('player_respawn', (_, callback) => {
    try {
      const room = getPlayerRoom();
      if (!room || !room.started) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Not in game' });
        return;
      }
      const player = room.players.get(socket.id);
      if (!player) {
        if (typeof callback === 'function') return callback({ success: false, error: 'Player not found' });
        return;
      }

      // Respawn
      player.hp = DEFAULT_HP;
      player.armor = 0;
      player.alive = true;
      player.weapon = 'pistol';
      player.ammo = { pistol: 12, shotgun: 0, assault_rifle: 0, smg: 0, sniper: 0 };
      player.x = Math.random() * (MAP_WIDTH - 100) + 50;
      player.y = Math.random() * (MAP_HEIGHT - 100) + 50;

      io.to(room.code).emit('player_respawned', {
        playerId: socket.id,
        x: player.x,
        y: player.y,
        hp: player.hp,
        armor: player.armor,
      });

      if (typeof callback === 'function') {
        callback({ success: true, player });
      }
    } catch (err) {
      console.error('[player_respawn]', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);

    for (const [code, room] of rooms) {
      if (!room.players.has(socket.id)) continue;

      room.players.delete(socket.id);

      if (room.players.size === 0) {
        // Last player left – clean up
        destroyRoom(code);
      } else {
        // Elect a new host if needed
        if (room.hostId === socket.id) {
          room.hostId = room.players.keys().next().value;
        }
        io.to(code).emit('player_left', {
          playerId: socket.id,
          newHostId: room.hostId,
          remainingPlayers: room.players.size,
        });
        // Broadcast updated leaderboard
        io.to(code).emit('leaderboard_update', {
          leaderboard: leaderboard(room),
        });
      }
      break;
    }
  });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully`);
  io.emit('server_shutdown', { message: 'Server is shutting down' });
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[Server] Solo Shooter backend running on http://localhost:${PORT}`);
  console.log(`[Server] CORS: all origins  |  Tick: ${GAME_TICK_RATE} Hz`);
});
