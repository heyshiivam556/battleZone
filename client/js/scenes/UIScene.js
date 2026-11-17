// ============================================================
// UIScene.js — Parallel overlay scene (Phaser HUD layer)
// Runs on top of GameScene for elements that must stay fixed
// in screen space (not scrolled with camera).
// ============================================================

class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene', active: false });
    this._listeners = [];
  }

  create() {
    // This scene's camera does NOT scroll — perfect for HUD
    this.cameras.main.setScroll(0, 0);

    // Zone timer display (top-left area)
    this._zoneTimer = this.add.text(10, 10, '', {
      fontSize:   '13px',
      fontFamily: 'monospace',
      fill:       '#4488ff',
      stroke:     '#000000',
      strokeThickness: 3
    }).setDepth(100).setScrollFactor(0);

    // Ping / FPS display (top-right, secondary info)
    this._fpsText = this.add.text(
      this.scale.width - 10, 10,
      '',
      {
        fontSize:   '11px',
        fontFamily: 'monospace',
        fill:       '#888888'
      }
    ).setOrigin(1, 0).setDepth(100).setScrollFactor(0);

    // Notification area (center screen for pickups / alerts)
    this._notifText = this.add.text(
      this.scale.width / 2,
      this.scale.height * 0.3,
      '',
      {
        fontSize:   '20px',
        fontFamily: 'Arial Black, sans-serif',
        fill:       '#ffcc00',
        stroke:     '#000000',
        strokeThickness: 4,
        align:      'center'
      }
    ).setOrigin(0.5).setDepth(100).setScrollFactor(0).setAlpha(0);

    this._bindEvents();

    // Update FPS every second
    this.time.addEvent({
      delay:    1000,
      loop:     true,
      callback: () => {
        this._fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
      }
    });

    // Handle window resize
    this.scale.on('resize', (gameSize) => {
      this._fpsText.x = gameSize.width - 10;
      this._notifText.x = gameSize.width / 2;
      this._notifText.y = gameSize.height * 0.3;
    });
  }

  // ── Show pickup notification ──────────────────────────────
  _showNotif(msg) {
    this._notifText.setText(msg);
    this.tweens.killTweensOf(this._notifText);
    this._notifText.setAlpha(1).setScale(1.3);
    this.tweens.add({
      targets:  this._notifText,
      alpha:    0,
      scaleX:   1,
      scaleY:   1,
      duration: 1800,
      ease:     'Power2'
    });
  }

  // ── Zone shrink timer display ─────────────────────────────
  _updateZoneTimer(secondsLeft) {
    if (secondsLeft <= 0) {
      this._zoneTimer.setText('⚠ ZONE CLOSING');
    } else {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      this._zoneTimer.setText(`Zone: ${m}:${s.toString().padStart(2,'0')}`);
    }
  }

  // ── Bind network events ───────────────────────────────────
  _bindEvents() {
    const on = (evt, fn) => {
      window.addEventListener(evt, fn);
      this._listeners.push({ evt, fn });
    };

    on('net:loot_collected', (e) => {
      const d = e.detail;
      if (d.playerId === Network.playerId) {
        const type = d.lootType || '';
        const stats = WEAPON_STATS[type];
        let msg = '';
        if (stats) {
          msg = `Picked up ${stats.name}!`;
        } else if (type === 'health_pack') {
          msg = '+50 HP';
        } else if (type === 'armor_pack') {
          msg = '+50 Armor';
        } else if (type === 'ammo_pack') {
          msg = '+Ammo';
        }
        if (msg) this._showNotif(msg);
      }
    });

    on('net:player_hit', (e) => {
      if (e.detail.playerId === Network.playerId) {
        this._flashRed();
      }
    });

    on('net:zone_update', (e) => {
      if (e.detail.secondsLeft !== undefined) {
        this._updateZoneTimer(e.detail.secondsLeft);
      }
    });

    on('net:player_died', (e) => {
      if (e.detail.playerId === Network.playerId) {
        this._showNotif('You were eliminated!');
      }
    });

    on('net:player_respawned', (e) => {
      if (e.detail.playerId === Network.playerId) {
        this._showNotif('Respawned!');
      }
    });

    on('net:kill_feed', (e) => {
      // Kill notifications handled by GameScene's HTML HUD
    });
  }

  // ── Red screen flash on damage ────────────────────────────
  _flashRed() {
    const rect = this.add.rectangle(
      0, 0,
      this.scale.width, this.scale.height,
      0xff0000, 0.35
    ).setOrigin(0).setDepth(200).setScrollFactor(0);

    this.tweens.add({
      targets:  rect,
      alpha:    0,
      duration: 300,
      ease:     'Power2',
      onComplete: () => rect.destroy()
    });
  }

  shutdown() {
    this._listeners.forEach(({ evt, fn }) => window.removeEventListener(evt, fn));
    this._listeners = [];
  }
}
