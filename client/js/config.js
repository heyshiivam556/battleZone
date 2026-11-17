// ============================================================
// config.js - Global game constants
// ============================================================

const MAP_WIDTH  = 2400;
const MAP_HEIGHT = 2400;
const TILE_SIZE  = 48;
const SERVER_URL = 'https://battlezone-txsp.onrender.com';

const PLAYER_SPEED = 220;
const PLAYER_SIZE  = 24;

// Weapon stats — must stay in sync with server/index.js
const WEAPON_STATS = {
  pistol: {
    name:        'Pistol',
    dmg:         25,
    range:       400,
    fireRate:    400,   // ms between shots
    reload:      1500,  // ms
    spread:      0.05,
    color:       0xf0c040,
    bulletSpeed: 600,
    bullets:     12
  },
  shotgun: {
    name:        'Shotgun',
    dmg:         80,    // total (8 pellets x 10)
    pellets:     8,
    range:       200,
    fireRate:    900,
    reload:      2500,
    spread:      0.3,
    color:       0xe05c00,
    bulletSpeed: 500,
    bullets:     2
  },
  assault_rifle: {
    name:        'Assault Rifle',
    dmg:         18,
    range:       500,
    fireRate:    110,
    reload:      2000,
    spread:      0.08,
    color:       0x44aaff,
    bulletSpeed: 800,
    bullets:     30
  },
  smg: {
    name:        'SMG',
    dmg:         12,
    range:       300,
    fireRate:    80,
    reload:      1800,
    spread:      0.12,
    color:       0xaa44ff,
    bulletSpeed: 700,
    bullets:     40
  },
  sniper: {
    name:        'Sniper',
    dmg:         95,
    range:       800,
    fireRate:    1200,
    reload:      3000,
    spread:      0.01,
    color:       0x00ffcc,
    bulletSpeed: 1400,
    bullets:     5
  }
};

// Loot color map
const LOOT_COLORS = {
  pistol:        0xf0c040,
  shotgun:       0xe05c00,
  assault_rifle: 0x44aaff,
  smg:           0xaa44ff,
  sniper:        0x00ffcc,
  health_pack:   0xff4466,
  armor_pack:    0x4488ff,
  ammo_pack:     0xffcc00
};

// Player palette — up to 8 players
const PLAYER_COLORS = [
  0xe94560, // red-pink (local player default)
  0x44aaff, // blue
  0x44ff88, // green
  0xffcc00, // yellow
  0xff8844, // orange
  0xcc44ff, // purple
  0x00ffcc, // cyan
  0xff44cc  // magenta
];

// Zone config
const ZONE_CONFIG = {
  shrinkStart:    120,  // seconds after game start
  shrinkDuration: 300,  // seconds to fully close
  damage:         5     // HP/s outside zone
};
