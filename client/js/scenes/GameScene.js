// ============================================================
// GameScene.js — Main gameplay scene
// ============================================================

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    // Players map: id -> { container, body, dir, nameText, hp, armor, alive, color }
    this.players       = {};
    this.localPlayer   = null;
    this.localId       = null;

    // Bullets: array of { obj, vx, vy, life }
    this.bullets       = [];

    // Loot: id -> { obj, glow, type }
    this.lootItems     = {};

    // Particle emitter (manual pool)
    this.particles     = [];

    // HUD state
    this.hp            = 100;
    this.armor         = 0;
    this.weapons       = [null, null, null, null, null];
    this.currentSlot   = 0;
    this.ammo          = 0;
    this.reloading     = false;
    this.kills         = 0;
    this.deaths        = 0;
    this.killFeed      = [];
    this.roomCode      = '';
    this.alive         = true;

    // Zone
    this.zoneRadius    = Math.max(MAP_WIDTH, MAP_HEIGHT);
    this.zoneCenterX   = MAP_WIDTH  / 2;
    this.zoneCenterY   = MAP_HEIGHT / 2;
    this.zoneGraphic   = null;

    // Networking rate limiters
    this._lastMoveTime = 0;
    this._lastShootTime = 0;
    this._shootCooldown = 0;

    // Minimap graphics
    this._minimapBg    = null;
    this._minimapGfx   = null;

    // Event listeners store
    this._netListeners = [];
  }

  // ── Init ──────────────────────────────────────────────────
  init(data) {
    this.localId   = Network.playerId;
    this.roomCode  = Network.roomCode || '';
    // Merge in any initial room state passed from BootScene
    if (data && data.players) {
      this._initialPlayers = data.players;
    }
    if (data && data.loot) {
      this._initialLoot = data.loot;
    }
  }

  // ── Create ────────────────────────────────────────────────
  create() {
    InputManager.init();

    // ── World ─────────────────────────────────────────────
    this._buildWorld();

    // ── Zone ring ─────────────────────────────────────────
    this.zoneGraphic = this.add.graphics();
    this._drawZone();

    // ── HUD overlay (HTML) ────────────────────────────────
    this._buildHUD();

    // ── Minimap ───────────────────────────────────────────
    this._buildMinimap();

    // ── Camera ────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // ── Network ───────────────────────────────────────────
    this._bindNetwork();

    // ── Spawn local player ────────────────────────────────
    const startX = MAP_WIDTH  / 2 + Phaser.Math.Between(-200, 200);
    const startY = MAP_HEIGHT / 2 + Phaser.Math.Between(-200, 200);
    this._spawnLocalPlayer(startX, startY);

    // ── Input: weapon slots ───────────────────────────────
    InputManager.onWeaponSwitch(slot => this._switchWeapon(slot));

    // Apply initial state if any
    if (this._initialLoot) {
      this._initialLoot.forEach(l => this._addLoot(l));
    }

    // ── HUD initial refresh ────────────────────────────────
    this._refreshHUD();
    this._updateRoomCodeDisplay();

    // ── Reload key (R) ────────────────────────────────────
    this.input.keyboard.on('keydown-R', () => this._startReload());
  }

  // ── World generation ──────────────────────────────────────
  _buildWorld() {
    const gfx = this.add.graphics();

    // Floor tiles
    gfx.fillStyle(0x1a1a2e, 1);
    gfx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Grid lines (subtle)
    gfx.lineStyle(1, 0x0f0f1e, 0.6);
    for (let x = 0; x <= MAP_WIDTH; x += TILE_SIZE) {
      gfx.strokeLineShape(new Phaser.Geom.Line(x, 0, x, MAP_HEIGHT));
    }
    for (let y = 0; y <= MAP_HEIGHT; y += TILE_SIZE) {
      gfx.strokeLineShape(new Phaser.Geom.Line(0, y, MAP_WIDTH, y));
    }

    // Random wall clusters
    const wallGfx = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(TILE_SIZE * 2, MAP_WIDTH  - TILE_SIZE * 4);
      const y = Phaser.Math.Between(TILE_SIZE * 2, MAP_HEIGHT - TILE_SIZE * 4);
      const w = Phaser.Math.Between(2, 5) * TILE_SIZE;
      const h = Phaser.Math.Between(2, 4) * TILE_SIZE;
      wallGfx.fillStyle(0x2a2a3e, 1);
      wallGfx.fillRect(x, y, w, h);
      wallGfx.lineStyle(2, 0x3a3a5e, 1);
      wallGfx.strokeRect(x, y, w, h);
    }

    // Building outlines
    const buildGfx = this.add.graphics();
    for (let i = 0; i < 15; i++) {
      const x = Phaser.Math.Between(TILE_SIZE * 3, MAP_WIDTH  - TILE_SIZE * 6);
      const y = Phaser.Math.Between(TILE_SIZE * 3, MAP_HEIGHT - TILE_SIZE * 6);
      const w = Phaser.Math.Between(4, 8) * TILE_SIZE;
      const h = Phaser.Math.Between(4, 7) * TILE_SIZE;
      buildGfx.lineStyle(3, 0x0f3460, 1);
      buildGfx.strokeRect(x, y, w, h);
      // Door gap
      buildGfx.fillStyle(0x0a0a1e, 1);
      buildGfx.fillRect(x + w * 0.4, y + h - 4, TILE_SIZE, 4);
    }

    // Trees / bushes
    const treeGfx = this.add.graphics();
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(TILE_SIZE, MAP_WIDTH  - TILE_SIZE);
      const y = Phaser.Math.Between(TILE_SIZE, MAP_HEIGHT - TILE_SIZE);
      const r = Phaser.Math.Between(10, 22);
      treeGfx.fillStyle(0x1a4a2e, 0.85);
      treeGfx.fillCircle(x, y, r);
      treeGfx.lineStyle(1, 0x2a6a3e, 0.9);
      treeGfx.strokeCircle(x, y, r);
    }
  }

  // ── Zone ──────────────────────────────────────────────────
  _drawZone() {
    if (!this.zoneGraphic) return;
    this.zoneGraphic.clear();
    // Outer dark overlay outside zone
    this.zoneGraphic.fillStyle(0x000020, 0.35);
    this.zoneGraphic.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    // Clear inside zone
    this.zoneGraphic.fillStyle(0x000020, 0);
    this.zoneGraphic.fillCircle(this.zoneCenterX, this.zoneCenterY, this.zoneRadius);
    // Ring
    this.zoneGraphic.lineStyle(4, 0x4488ff, 0.9);
    this.zoneGraphic.strokeCircle(this.zoneCenterX, this.zoneCenterY, this.zoneRadius);
  }

  // ── Player helpers ─────────────────────────────────────────
  _spawnLocalPlayer(x, y) {
    const color = PLAYER_COLORS[0];
    const container = this._createPlayerVisual(x, y, color, Network.playerName || 'You', true);
    this.localPlayer = container;

    this.players[this.localId] = {
      container,
      x, y,
      angle:  0,
      hp:     100,
      armor:  0,
      alive:  true,
      color,
      name:   Network.playerName || 'You'
    };

    // Camera follow
    this.cameras.main.startFollow(container, true, 0.08, 0.08);
  }

  _createPlayerVisual(x, y, color, name, isLocal) {
    const container = this.add.container(x, y);

    // Shadow
    const shadow = this.add.ellipse(2, 4, PLAYER_SIZE * 1.8, PLAYER_SIZE * 0.9, 0x000000, 0.3);
    container.add(shadow);

    // Body (outer circle)
    const body = this.add.circle(0, 0, PLAYER_SIZE, color, 1);
    container.add(body);

    // Inner circle (darker)
    const inner = this.add.circle(0, 0, PLAYER_SIZE * 0.65, Phaser.Display.Color.ValueToColor(color).darken(40).color, 1);
    container.add(inner);

    // Direction pointer (triangle)
    const tri = this.add.triangle(PLAYER_SIZE * 0.75, 0,
      0, -7, 14, 0, 0, 7,
      0xffffff, 0.9);
    container.add(tri);

    // Gun rectangle
    const gun = this.add.rectangle(PLAYER_SIZE * 0.5, 0, 18, 7, isLocal ? 0xf0c040 : 0xdddddd, 1);
    gun.setOrigin(0, 0.5);
    container.add(gun);

    // Name label
    const nameText = this.add.text(0, -(PLAYER_SIZE + 14), name, {
      fontSize:   '11px',
      fontFamily: 'Arial, sans-serif',
      fill:       '#ffffff',
      stroke:     '#000000',
      strokeThickness: 3,
      align:      'center'
    }).setOrigin(0.5, 1);
    container.add(nameText);

    // Health bar (above name)
    const hpBg  = this.add.rectangle(0, -(PLAYER_SIZE + 28), 40, 5, 0x333333, 0.8);
    const hpBar = this.add.rectangle(-20, -(PLAYER_SIZE + 28), 40, 5, 0xff4466, 1);
    hpBar.setOrigin(0, 0.5);
    container.add(hpBg);
    container.add(hpBar);

    container._body    = body;
    container._inner   = inner;
    container._tri     = tri;
    container._gun     = gun;
    container._name    = nameText;
    container._hpBar   = hpBar;
    container._hpBg    = hpBg;
    container._baseColor = color;

    container.setDepth(10);
    return container;
  }

  _updatePlayerVisual(id, data) {
    const p = this.players[id];
    if (!p || !p.container) return;
    const c = p.container;

    c.x = data.x;
    c.y = data.y;
    c.rotation = 0; // container stays upright

    // Rotate direction pointer + gun to face angle
    if (c._tri) {
      c._tri.x = Math.cos(data.angle) * PLAYER_SIZE * 0.75;
      c._tri.y = Math.sin(data.angle) * PLAYER_SIZE * 0.75;
      c._tri.rotation = data.angle;
    }
    if (c._gun) {
      c._gun.x = Math.cos(data.angle) * PLAYER_SIZE * 0.5;
      c._gun.y = Math.sin(data.angle) * PLAYER_SIZE * 0.5;
      c._gun.rotation = data.angle;
    }

    // HP bar
    if (c._hpBar && data.hp !== undefined) {
      const pct = Math.max(0, data.hp) / 100;
      c._hpBar.width = 40 * pct;
      c._hpBar.fillColor = pct > 0.5 ? 0x44ff66 : pct > 0.25 ? 0xffcc00 : 0xff4444;
    }

    p.x = data.x;
    p.y = data.y;
    p.angle = data.angle;
    if (data.hp !== undefined) p.hp = data.hp;
  }

  // ── Loot ──────────────────────────────────────────────────
  _addLoot(lootData) {
    if (this.lootItems[lootData.id]) return;

    const color  = LOOT_COLORS[lootData.type] || 0xffffff;
    const gfx    = this.add.graphics();

    gfx.fillStyle(color, 0.9);
    gfx.fillCircle(0, 0, 14);
    gfx.lineStyle(2, 0xffffff, 0.6);
    gfx.strokeCircle(0, 0, 14);
    gfx.x = lootData.x;
    gfx.y = lootData.y;
    gfx.setDepth(5);

    // Pulsing tween
    this.tweens.add({
      targets: gfx,
      scaleX: 1.2, scaleY: 1.2,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.lootItems[lootData.id] = {
      obj:  gfx,
      type: lootData.type,
      x:    lootData.x,
      y:    lootData.y
    };
  }

  _removeLoot(id) {
    const item = this.lootItems[id];
    if (!item) return;
    this.tweens.killTweensOf(item.obj);
    item.obj.destroy();
    delete this.lootItems[id];
  }

  // ── Bullets ───────────────────────────────────────────────
  _spawnBullet(x, y, angle, weaponType, fromId) {
    const stats = WEAPON_STATS[weaponType] || WEAPON_STATS.pistol;
    const isLocal = fromId === this.localId;

    // For shotgun, spawn multiple pellets
    const pellets = stats.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const spread = (Math.random() - 0.5) * stats.spread;
      const a = angle + spread;
      const speed = stats.bulletSpeed || 600;
      const vx = Math.cos(a) * speed;
      const vy = Math.sin(a) * speed;

      const gfx = this.add.graphics();
      gfx.fillStyle(stats.color || 0xffffff, 1);
      gfx.fillCircle(0, 0, pellets > 1 ? 3 : 4);
      gfx.x = x;
      gfx.y = y;
      gfx.setDepth(8);

      this.bullets.push({
        obj:  gfx,
        vx, vy,
        life: (stats.range || 400) / speed,  // seconds to live
        fromId
      });
    }
  }

  // ── Hit effect ────────────────────────────────────────────
  _hitEffect(id) {
    const p = this.players[id];
    if (!p || !p.container || !p.container._body) return;
    const body = p.container._body;
    const orig = p.color;
    body.fillColor = 0xff0000;
    this.time.delayedCall(120, () => {
      if (body && body.scene) body.fillColor = orig;
    });
  }

  _deathEffect(x, y) {
    // Explosion particles
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const speed = Phaser.Math.Between(80, 220);
      const gfx = this.add.graphics();
      gfx.fillStyle(Phaser.Math.RND.pick([0xff4466, 0xff8844, 0xffcc00, 0xffffff]), 1);
      gfx.fillCircle(0, 0, Phaser.Math.Between(3, 7));
      gfx.x = x; gfx.y = y;
      gfx.setDepth(15);
      this.tweens.add({
        targets: gfx,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: Phaser.Math.Between(400, 900),
        ease: 'Power2',
        onComplete: () => gfx.destroy()
      });
    }
  }

  // ── HUD ───────────────────────────────────────────────────
  _buildHUD() {
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    hud.innerHTML = `
      <!-- Kill feed top-left -->
      <div id="hud-killfeed"></div>

      <!-- Room code top-center -->
      <div id="hud-roomcode"></div>

      <!-- K/D top-right -->
      <div id="hud-kd">K: 0 / D: 0</div>

      <!-- Bottom-left: HP + Armor -->
      <div id="hud-bars">
        <div class="bar-label">HP</div>
        <div class="bar-bg"><div class="bar-fill hp-fill" id="hud-hp-fill"></div></div>
        <div class="bar-label" style="margin-top:4px">ARMOR</div>
        <div class="bar-bg"><div class="bar-fill armor-fill" id="hud-armor-fill"></div></div>
      </div>

      <!-- Bottom-center: Weapon info -->
      <div id="hud-weapon">
        <div id="hud-weapon-name">—</div>
        <div id="hud-ammo">— / —</div>
        <div id="hud-reload-bar" class="hidden"><div id="hud-reload-fill"></div></div>
      </div>

      <!-- Bottom-right: Weapon slots -->
      <div id="hud-slots"></div>

      <!-- Death screen -->
      <div id="death-screen" class="hidden">
        <div class="death-card">
          <h2>You were eliminated</h2>
          <p id="death-killer"></p>
          <button class="btn btn-primary" id="btn-respawn">Respawn</button>
        </div>
      </div>
    `;
    document.body.appendChild(hud);
    this._hud = hud;

    document.getElementById('btn-respawn').addEventListener('click', () => {
      Network.sendRespawn();
      document.getElementById('death-screen').classList.add('hidden');
    });

    this._buildWeaponSlots();
  }

  _buildWeaponSlots() {
    const slots = document.getElementById('hud-slots');
    if (!slots) return;
    slots.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div');
      s.className = 'weapon-slot' + (i === this.currentSlot ? ' active' : '');
      s.id = `slot-${i}`;
      s.innerHTML = `<span class="slot-num">${i+1}</span><span class="slot-name" id="slot-name-${i}">—</span>`;
      s.addEventListener('click', () => this._switchWeapon(i));
      slots.appendChild(s);
    }
  }

  _refreshHUD() {
    const hpFill    = document.getElementById('hud-hp-fill');
    const armorFill = document.getElementById('hud-armor-fill');
    if (hpFill)    hpFill.style.width    = Math.max(0, Math.min(100, this.hp)) + '%';
    if (armorFill) armorFill.style.width = Math.max(0, Math.min(100, this.armor)) + '%';

    const kd = document.getElementById('hud-kd');
    if (kd) kd.textContent = `K: ${this.kills} / D: ${this.deaths}`;

    const weapon = this.weapons[this.currentSlot];
    const wName  = document.getElementById('hud-weapon-name');
    const wAmmo  = document.getElementById('hud-ammo');
    if (wName) wName.textContent = weapon ? WEAPON_STATS[weapon.type]?.name || weapon.type : '—';
    if (wAmmo) wAmmo.textContent = weapon ? `${weapon.ammo} / ${WEAPON_STATS[weapon.type]?.bullets || '?'}` : '—';

    // Slots
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById(`slot-${i}`);
      if (el) {
        el.className = 'weapon-slot' + (i === this.currentSlot ? ' active' : '');
      }
      const nm = document.getElementById(`slot-name-${i}`);
      if (nm) nm.textContent = this.weapons[i] ? WEAPON_STATS[this.weapons[i].type]?.name || this.weapons[i].type : '—';
    }
  }

  _updateRoomCodeDisplay() {
    const el = document.getElementById('hud-roomcode');
    if (el) el.textContent = this.roomCode ? `Room: ${this.roomCode}` : '';
  }

  _pushKillFeed(msg) {
    this.killFeed.unshift(msg);
    if (this.killFeed.length > 5) this.killFeed.pop();
    const el = document.getElementById('hud-killfeed');
    if (el) {
      el.innerHTML = this.killFeed
        .map(m => `<div class="killfeed-entry">${m}</div>`)
        .join('');
    }
  }

  _showDeathScreen(killerName) {
    const ds = document.getElementById('death-screen');
    if (ds) ds.classList.remove('hidden');
    const dk = document.getElementById('death-killer');
    if (dk) dk.textContent = killerName ? `Eliminated by ${killerName}` : '';
  }

  // ── Weapon switching ──────────────────────────────────────
  _switchWeapon(slot) {
    if (slot < 0 || slot > 4) return;
    this.currentSlot = slot;
    this._refreshHUD();
  }

  _startReload() {
    const weapon = this.weapons[this.currentSlot];
    if (!weapon || this.reloading) return;
    const stats = WEAPON_STATS[weapon.type];
    if (!stats) return;
    this.reloading = true;

    const bar  = document.getElementById('hud-reload-bar');
    const fill = document.getElementById('hud-reload-fill');
    if (bar) bar.classList.remove('hidden');
    if (fill) fill.style.width = '0%';

    const dur = stats.reload;
    const start = Date.now();
    const tick = () => {
      const pct = Math.min(1, (Date.now() - start) / dur) * 100;
      if (fill) fill.style.width = pct + '%';
      if (pct < 100) {
        requestAnimationFrame(tick);
      } else {
        weapon.ammo = stats.bullets;
        this.reloading = false;
        if (bar) bar.classList.add('hidden');
        this._refreshHUD();
      }
    };
    requestAnimationFrame(tick);
  }

  // ── Minimap ───────────────────────────────────────────────
  _buildMinimap() {
    const cam    = this.cameras.main;
    const mmW    = 150;
    const mmH    = 150;
    const mmX    = this.scale.width  - mmW - 10;
    const mmY    = this.scale.height - mmH - 10;

    const cam2 = this.cameras.add(mmX, mmY, mmW, mmH);
    cam2.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    cam2.setZoom(mmW / MAP_WIDTH);
    cam2.setBackgroundColor('#0d0d1a');
    cam2.setAlpha(0.85);
    cam2.ignore([]); // show everything
    this._minimapCam = cam2;

    // Minimap border (render texture trick — simpler: just a fixed div)
    const border = document.createElement('div');
    border.id = 'minimap-border';
    Object.assign(border.style, {
      position:     'fixed',
      right:        '10px',
      bottom:       '10px',
      width:        mmW + 'px',
      height:       mmH + 'px',
      border:       '2px solid #e94560',
      borderRadius: '4px',
      pointerEvents:'none',
      zIndex:       '500'
    });
    document.body.appendChild(border);
  }

  // ── Network bindings ──────────────────────────────────────
  _bindNetwork() {
    const on = (evt, fn) => {
      window.addEventListener(evt, fn);
      this._netListeners.push({ evt, fn });
    };

    on('net:game_tick', e => this._onGameTick(e.detail));
    on('net:loot_spawned', e => { e.detail.forEach ? e.detail.forEach(l => this._addLoot(l)) : this._addLoot(e.detail); });
    on('net:loot_removed', e => this._removeLoot(e.detail.id));
    on('net:loot_collected', e => {
      this._removeLoot(e.detail.lootId);
      if (e.detail.playerId === this.localId) {
        this._onLootCollected(e.detail);
      }
    });
    on('net:bullet_fired', e => {
      const d = e.detail;
      this._spawnBullet(d.x, d.y, d.angle, d.weaponType, d.playerId);
    });
    on('net:player_hit', e => {
      const d = e.detail;
      this._hitEffect(d.playerId);
      if (d.playerId === this.localId) {
        this.hp    = d.hp;
        this.armor = d.armor;
        this._refreshHUD();
      }
    });
    on('net:player_died', e => {
      const d = e.detail;
      const p = this.players[d.playerId];
      if (p && p.container) {
        this._deathEffect(p.container.x, p.container.y);
        p.container.setVisible(false);
        p.alive = false;
      }
      if (d.playerId === this.localId) {
        this.alive = false;
        this.deaths++;
        this._refreshHUD();
        this._showDeathScreen(d.killerName);
      }
      this._pushKillFeed(`${d.killerName || '?'} ⚔ ${d.playerName || '?'}`);
    });
    on('net:player_respawned', e => {
      const d = e.detail;
      if (d.playerId === this.localId) {
        this.hp    = d.hp    || 100;
        this.armor = d.armor || 0;
        this.alive = true;
        this._refreshHUD();
        document.getElementById('death-screen')?.classList.add('hidden');
        if (this.localPlayer) {
          this.localPlayer.x = d.x;
          this.localPlayer.y = d.y;
          this.localPlayer.setVisible(true);
        }
      }
      const p = this.players[d.playerId];
      if (p) {
        if (p.container) p.container.setVisible(true);
        p.alive = true;
      }
    });
    on('net:leaderboard', e => {
      const me = e.detail.find(p => p.id === this.localId);
      if (me) { this.kills = me.kills; this.deaths = me.deaths; this._refreshHUD(); }
    });
    on('net:kill_feed', e => {
      this._pushKillFeed(e.detail.message || '');
    });
    on('net:room_state', e => {
      const { players, loot } = e.detail;
      if (loot) loot.forEach(l => this._addLoot(l));
      if (players) players.forEach(p => {
        if (p.id !== this.localId) this._ensureRemotePlayer(p);
      });
    });
    on('net:zone_update', e => {
      this.zoneRadius  = e.detail.radius;
      this.zoneCenterX = e.detail.x || this.zoneCenterX;
      this.zoneCenterY = e.detail.y || this.zoneCenterY;
      this._drawZone();
    });
    on('net:player_joined', e => {
      if (e.detail.id !== this.localId) this._ensureRemotePlayer(e.detail);
    });
    on('net:player_left', e => {
      this._removeRemotePlayer(e.detail.id);
    });
  }

  _ensureRemotePlayer(data) {
    if (this.players[data.id]) return;
    const idx   = Object.keys(this.players).length % PLAYER_COLORS.length;
    const color = PLAYER_COLORS[idx] || 0x44aaff;
    const container = this._createPlayerVisual(
      data.x || MAP_WIDTH / 2,
      data.y || MAP_HEIGHT / 2,
      color,
      data.name || 'Player',
      false
    );
    this.players[data.id] = {
      container,
      x: data.x || 0,
      y: data.y || 0,
      angle: 0,
      hp:    data.hp    || 100,
      armor: data.armor || 0,
      alive: true,
      color,
      name:  data.name  || 'Player'
    };
  }

  _removeRemotePlayer(id) {
    const p = this.players[id];
    if (!p) return;
    if (p.container) p.container.destroy();
    delete this.players[id];
  }

  _onGameTick(data) {
    // data.players: array of { id, x, y, angle, hp, armor }
    if (!data || !data.players) return;
    data.players.forEach(pd => {
      if (pd.id === this.localId) return; // local player driven by input
      if (!this.players[pd.id]) {
        this._ensureRemotePlayer(pd);
      } else {
        this._updatePlayerVisual(pd.id, pd);
      }
    });
  }

  _onLootCollected(data) {
    const type = data.lootType;
    if (!type) return;

    if (type === 'health_pack') {
      this.hp = Math.min(100, this.hp + 50);
    } else if (type === 'armor_pack') {
      this.armor = Math.min(100, this.armor + 50);
    } else if (type === 'ammo_pack') {
      const w = this.weapons[this.currentSlot];
      if (w) w.ammo = Math.min(999, w.ammo + 30);
    } else if (WEAPON_STATS[type]) {
      // Pick up weapon
      const emptySlot = this.weapons.findIndex(w => w === null);
      const slot = emptySlot >= 0 ? emptySlot : this.currentSlot;
      this.weapons[slot] = { type, ammo: WEAPON_STATS[type].bullets };
      this.currentSlot = slot;
    }
    this._refreshHUD();
  }

  // ── Auto-loot proximity check ─────────────────────────────
  _checkLootPickup() {
    if (!this.localPlayer || !this.alive) return;
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;
    const pickupRange = 36;

    for (const [id, item] of Object.entries(this.lootItems)) {
      const dx = item.x - px;
      const dy = item.y - py;
      if (dx*dx + dy*dy < pickupRange*pickupRange) {
        Network.sendLoot(id);
        return; // one per frame
      }
    }
  }

  // ── Update (game loop) ────────────────────────────────────
  update(time, delta) {
    const dt   = delta / 1000;
    const inp  = InputManager.update(this);

    // ── Move local player ──────────────────────────────────
    if (this.localPlayer && this.alive) {
      const speed = PLAYER_SPEED;
      const nx = this.localPlayer.x + inp.moveX * speed * dt;
      const ny = this.localPlayer.y + inp.moveY * speed * dt;

      this.localPlayer.x = Phaser.Math.Clamp(nx, PLAYER_SIZE, MAP_WIDTH  - PLAYER_SIZE);
      this.localPlayer.y = Phaser.Math.Clamp(ny, PLAYER_SIZE, MAP_HEIGHT - PLAYER_SIZE);

      // Rotate direction indicators
      const a = inp.aimAngle;
      const lp = this.localPlayer;
      if (lp._tri) {
        lp._tri.x = Math.cos(a) * PLAYER_SIZE * 0.75;
        lp._tri.y = Math.sin(a) * PLAYER_SIZE * 0.75;
        lp._tri.rotation = a;
      }
      if (lp._gun) {
        lp._gun.x = Math.cos(a) * PLAYER_SIZE * 0.5;
        lp._gun.y = Math.sin(a) * PLAYER_SIZE * 0.5;
        lp._gun.rotation = a;
      }

      // Send position to server (20 Hz)
      if (time - this._lastMoveTime > 50) {
        Network.sendMove(this.localPlayer.x, this.localPlayer.y, a);
        this._lastMoveTime = time;
      }

      // ── Shooting ────────────────────────────────────────
      if (inp.shooting) {
        const weapon = this.weapons[this.currentSlot];
        const stats  = weapon ? WEAPON_STATS[weapon.type] : null;
        const cooldown = stats ? stats.fireRate : 400;

        if (!this.reloading && weapon && weapon.ammo > 0 && time - this._lastShootTime > cooldown) {
          this._lastShootTime = time;
          weapon.ammo--;
          if (weapon.ammo === 0) this._startReload();

          Network.sendShoot(this.localPlayer.x, this.localPlayer.y, a, weapon.type);
          // Local bullet visual
          this._spawnBullet(this.localPlayer.x, this.localPlayer.y, a, weapon.type, this.localId);
          this._refreshHUD();
        }
      }

      // ── Loot pickup ──────────────────────────────────────
      this._checkLootPickup();

      // ── Zone damage ──────────────────────────────────────
      const dx = this.localPlayer.x - this.zoneCenterX;
      const dy = this.localPlayer.y - this.zoneCenterY;
      if (Math.sqrt(dx*dx + dy*dy) > this.zoneRadius) {
        this.hp = Math.max(0, this.hp - ZONE_CONFIG.damage * dt);
        this._refreshHUD();
      }
    }

    // ── Update bullets ─────────────────────────────────────
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.obj.x += b.vx * dt;
      b.obj.y += b.vy * dt;
      b.life  -= dt;
      if (b.life <= 0 || b.obj.x < 0 || b.obj.y < 0 ||
          b.obj.x > MAP_WIDTH || b.obj.y > MAP_HEIGHT) {
        b.obj.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  // ── Shutdown ──────────────────────────────────────────────
  shutdown() {
    this._netListeners.forEach(({ evt, fn }) => window.removeEventListener(evt, fn));
    this._netListeners = [];
    if (this._hud) { this._hud.remove(); this._hud = null; }
    const mb = document.getElementById('minimap-border');
    if (mb) mb.remove();
  }
}
