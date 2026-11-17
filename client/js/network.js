// ============================================================
// network.js - Singleton Socket.io manager
// All game scenes communicate with the server through this.
// ============================================================

const Network = (() => {
  let socket = null;
  let _roomCode = null;
  let _isHost   = false;
  let _playerId = null;
  let _playerName = 'Player';

  // ── Helpers ──────────────────────────────────────────────
  function emit(event, data) {
    if (socket && socket.connected) {
      socket.emit(event, data);
    } else {
      console.warn('[Network] emit called but socket not connected:', event);
    }
  }

  function dispatch(eventName, detail) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  // ── Connect ───────────────────────────────────────────────
  function connect(playerName) {
    if (socket) return; // already connected

    _playerName = playerName || 'Player';

    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay:    1000
    });

    socket.on('connect', () => {
      _playerId = socket.id;
      console.log('[Network] Connected:', _playerId);
      dispatch('net:connected', { id: _playerId });
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Network] Disconnected:', reason);
      dispatch('net:disconnected', { reason });
    });

    socket.on('connect_error', (err) => {
      console.error('[Network] Connection error:', err.message);
      dispatch('net:error', { message: err.message });
    });

    // ── Room events ──────────────────────────────────────────
    socket.on('room_created', (data) => {
      _roomCode = data.roomCode;
      _isHost   = true;
      dispatch('net:room_created', data);
    });

    socket.on('room_joined', (data) => {
      _roomCode = data.roomCode;
      _isHost   = data.isHost || false;
      dispatch('net:room_joined', data);
    });

    socket.on('room_error', (data) => {
      dispatch('net:room_error', data);
    });

    socket.on('player_joined', (data) => {
      dispatch('net:player_joined', data);
    });

    socket.on('player_left', (data) => {
      dispatch('net:player_left', data);
    });

    socket.on('lobby_update', (data) => {
      dispatch('net:lobby_update', data);
    });

    // ── Game start ───────────────────────────────────────────
    socket.on('game_start', (data) => {
      dispatch('net:game_start', data);
    });

    // ── Game tick (positions) ────────────────────────────────
    socket.on('game_tick', (data) => {
      dispatch('net:game_tick', data);
    });

    // ── Loot ─────────────────────────────────────────────────
    socket.on('loot_spawned', (data) => {
      dispatch('net:loot_spawned', data);
    });

    socket.on('loot_removed', (data) => {
      dispatch('net:loot_removed', data);
    });

    socket.on('loot_collected', (data) => {
      dispatch('net:loot_collected', data);
    });

    // ── Bullets / combat ─────────────────────────────────────
    socket.on('bullet_fired', (data) => {
      dispatch('net:bullet_fired', data);
    });

    socket.on('player_hit', (data) => {
      dispatch('net:player_hit', data);
    });

    socket.on('player_died', (data) => {
      dispatch('net:player_died', data);
    });

    socket.on('player_respawned', (data) => {
      dispatch('net:player_respawned', data);
    });

    // ── Stats ─────────────────────────────────────────────────
    socket.on('leaderboard', (data) => {
      dispatch('net:leaderboard', data);
    });

    socket.on('kill_feed', (data) => {
      dispatch('net:kill_feed', data);
    });

    // ── Room state (for late joiners) ─────────────────────────
    socket.on('room_state', (data) => {
      dispatch('net:room_state', data);
    });

    // ── Zone ──────────────────────────────────────────────────
    socket.on('zone_update', (data) => {
      dispatch('net:zone_update', data);
    });
  }

  // ── Public API ────────────────────────────────────────────
  function createRoom(playerName) {
    _playerName = playerName || _playerName;
    emit('create_room', { playerName: _playerName });
  }

  function joinRoom(code, playerName) {
    _playerName = playerName || _playerName;
    emit('join_room', { roomCode: code.toUpperCase(), playerName: _playerName });
  }

  function ready() {
    emit('player_ready', { roomCode: _roomCode });
  }

  function startGame() {
    emit('start_game', { roomCode: _roomCode });
  }

  function sendMove(x, y, angle) {
    emit('player_move', { x, y, angle, roomCode: _roomCode });
  }

  function sendShoot(x, y, angle, weapon) {
    emit('player_shoot', { x, y, angle, weaponType: weapon, roomCode: _roomCode });
  }

  function sendLoot(id) {
    emit('player_loot', { lootId: id, roomCode: _roomCode });
  }

  function sendRespawn() {
    emit('player_respawn', { roomCode: _roomCode });
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  return {
    connect,
    disconnect,
    createRoom,
    joinRoom,
    ready,
    startGame,
    sendMove,
    sendShoot,
    sendLoot,
    sendRespawn,
    get roomCode()   { return _roomCode; },
    get isHost()     { return _isHost; },
    get playerId()   { return _playerId; },
    get playerName() { return _playerName; },
    get connected()  { return socket && socket.connected; }
  };
})();
