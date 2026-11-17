// ============================================================
// BootScene.js — Title / lobby screen
// ============================================================

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
    this._overlay = null;
    this._listeners = [];
  }

  create() {
    this._buildOverlay();
    this._bindNetworkEvents();
  }

  // ── Build HTML overlay ────────────────────────────────────
  _buildOverlay() {
    const div = document.createElement('div');
    div.id = 'boot-overlay';
    div.innerHTML = `
      <div class="boot-bg"></div>
      <div class="boot-card" id="boot-card">

        <!-- Title -->
        <h1 class="boot-title" id="boot-title">
          <span class="title-battle">Battle</span><span class="title-zone">Zone</span>
        </h1>
        <p class="boot-subtitle">Top-down multiplayer shooter</p>

        <!-- Name input -->
        <div class="boot-section" id="section-name">
          <input class="boot-input" id="input-name" type="text"
                 maxlength="16" placeholder="Enter your name…" autocomplete="off" />
        </div>

        <!-- Create / Join -->
        <div class="boot-section boot-actions" id="section-actions">
          <button class="btn btn-primary" id="btn-create">Create Room</button>
          <div class="boot-or">or</div>
          <div class="boot-join-row">
            <input class="boot-input boot-code-input" id="input-code" type="text"
                   maxlength="4" placeholder="ROOM" autocomplete="off" />
            <button class="btn btn-secondary" id="btn-join">Join Room</button>
          </div>
        </div>

        <!-- Error message -->
        <p class="boot-error" id="boot-error"></p>

        <!-- Room code display (after create) -->
        <div class="boot-section hidden" id="section-roomcode">
          <div class="roomcode-label">Your Room Code</div>
          <div class="roomcode-display" id="roomcode-display">----</div>
          <p class="roomcode-hint">Share this code with friends!</p>
        </div>

        <!-- Lobby -->
        <div class="boot-section hidden" id="section-lobby">
          <div class="lobby-title">Players in Room</div>
          <ul class="lobby-list" id="lobby-list"></ul>
          <button class="btn btn-start hidden" id="btn-start">▶ Start Game</button>
          <p class="lobby-waiting" id="lobby-waiting">Waiting for host to start…</p>
        </div>

      </div>
    `;
    document.body.appendChild(div);
    this._overlay = div;

    // ── Wire up buttons ──────────────────────────────────────
    document.getElementById('btn-create').addEventListener('click', () => this._onCreateRoom());
    document.getElementById('btn-join').addEventListener('click',   () => this._onJoinRoom());
    document.getElementById('btn-start').addEventListener('click',  () => this._onStartGame());

    // Allow Enter key in join input
    document.getElementById('input-code').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._onJoinRoom();
    });
    document.getElementById('input-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('input-code').focus();
    });

    // Uppercase code input
    document.getElementById('input-code').addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase();
    });

    // Animated title pulse
    this._animateTitle();
  }

  _animateTitle() {
    const title = document.getElementById('boot-title');
    if (!title) return;
    let dir = 1;
    setInterval(() => {
      const scale = 1 + (dir * 0.01);
      title.style.transform = `scale(${scale})`;
      dir *= -1;
    }, 800);
  }

  // ── Actions ───────────────────────────────────────────────
  _getPlayerName() {
    const val = (document.getElementById('input-name').value || '').trim();
    return val || 'Player' + Math.floor(Math.random() * 999);
  }

  _showError(msg) {
    const el = document.getElementById('boot-error');
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
  }

  _onCreateRoom() {
    const name = this._getPlayerName();
    this._showError('');
    // Connect then create
    Network.connect(name);
    // If already connected, createRoom immediately; else wait for connect event
    if (Network.connected) {
      Network.createRoom(name);
    }
    // The net:connected event handler will also try createRoom (idempotent check below)
  }

  _onJoinRoom() {
    const code = document.getElementById('input-code').value.trim().toUpperCase();
    if (code.length !== 4) { this._showError('Enter a 4-letter room code.'); return; }
    const name = this._getPlayerName();
    this._showError('');
    Network.connect(name);
    if (Network.connected) {
      Network.joinRoom(code, name);
    }
  }

  _onStartGame() {
    Network.startGame();
  }

  // ── Network event handlers ────────────────────────────────
  _bindNetworkEvents() {
    const on = (evt, fn) => {
      window.addEventListener(evt, fn);
      this._listeners.push({ evt, fn });
    };

    on('net:connected', (e) => {
      // Auto-trigger pending action
      if (_pendingCreate) {
        _pendingCreate = false;
        Network.createRoom(Network.playerName);
      } else if (_pendingJoin) {
        const code = _pendingJoin;
        _pendingJoin = null;
        Network.joinRoom(code, Network.playerName);
      }
    });

    on('net:room_created', (e) => {
      const { roomCode } = e.detail;
      document.getElementById('roomcode-display').textContent = roomCode;
      document.getElementById('section-roomcode').classList.remove('hidden');
      document.getElementById('section-actions').classList.add('hidden');
      document.getElementById('section-lobby').classList.remove('hidden');
      document.getElementById('btn-start').classList.remove('hidden');
      document.getElementById('lobby-waiting').classList.add('hidden');
      this._updateLobbyList([{ name: Network.playerName, id: Network.playerId }]);
    });

    on('net:room_joined', (e) => {
      const { roomCode, players } = e.detail;
      document.getElementById('section-roomcode').classList.remove('hidden');
      document.getElementById('roomcode-display').textContent = roomCode;
      document.getElementById('section-actions').classList.add('hidden');
      document.getElementById('section-lobby').classList.remove('hidden');
      if (players) this._updateLobbyList(players);
    });

    on('net:room_error', (e) => {
      this._showError(e.detail.message || 'Room error. Try again.');
    });

    on('net:lobby_update', (e) => {
      const { players } = e.detail;
      this._updateLobbyList(players || []);
    });

    on('net:player_joined', (e) => {
      // lobby_update from server should cover this
    });

    on('net:game_start', (e) => {
      this._removeOverlay();
      this._unbindNetworkEvents();
      this.scene.start('GameScene', e.detail);
      this.scene.launch('UIScene');
    });

    on('net:error', (e) => {
      this._showError('Connection error: ' + (e.detail.message || 'unknown'));
    });

    on('net:disconnected', () => {
      this._showError('Disconnected from server.');
    });
  }

  _updateLobbyList(players) {
    const ul = document.getElementById('lobby-list');
    if (!ul) return;
    ul.innerHTML = players.map(p =>
      `<li class="lobby-player${p.id === Network.playerId ? ' lobby-you' : ''}">
         ${this._escapeHtml(p.name || 'Player')}
         ${p.id === Network.playerId ? ' <span class="you-tag">(You)</span>' : ''}
       </li>`
    ).join('');
  }

  _escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  _removeOverlay() {
    if (this._overlay) {
      this._overlay.style.opacity = '0';
      this._overlay.style.transition = 'opacity 0.4s';
      setTimeout(() => { if (this._overlay) this._overlay.remove(); this._overlay = null; }, 450);
    }
  }

  _unbindNetworkEvents() {
    this._listeners.forEach(({ evt, fn }) => window.removeEventListener(evt, fn));
    this._listeners = [];
  }

  shutdown() {
    this._removeOverlay();
    this._unbindNetworkEvents();
  }
}

// Flags used before network connects
let _pendingCreate = false;
let _pendingJoin   = null;

// Patch create/join to handle race condition between button press and connect
const _origCreate = Network.connect;
