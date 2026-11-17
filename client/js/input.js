// ============================================================
// input.js - Unified input manager (desktop + mobile)
// ============================================================

const InputManager = (() => {
  const isMobile = /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1);

  // ── State ─────────────────────────────────────────────────
  let state = {
    moveX:    0,
    moveY:    0,
    aimAngle: 0,
    shooting: false
  };

  // Desktop key state
  const keys = {};

  // Mouse / aim
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  // Mobile touch trackers
  let leftTouch  = null;  // { id, startX, startY, curX, curY }
  let rightTouch = null;

  // Reference to Phaser scene for world coords (set externally)
  let _scene = null;

  // ── Desktop ───────────────────────────────────────────────
  function initDesktop() {
    window.addEventListener('keydown', e => { keys[e.code] = true; });
    window.addEventListener('keyup',   e => { keys[e.code] = false; });

    window.addEventListener('mousemove', e => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    window.addEventListener('mousedown', e => {
      if (e.button === 0) mouseDown = true;
    });

    window.addEventListener('mouseup', e => {
      if (e.button === 0) mouseDown = false;
    });

    // Prevent right-click menu in-game
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── Mobile virtual joysticks ──────────────────────────────
  const JOYSTICK_RADIUS = 60;

  function initMobile() {
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove',  onTouchMove,  { passive: false });
    document.addEventListener('touchend',   onTouchEnd,   { passive: false });
    document.addEventListener('touchcancel',onTouchEnd,   { passive: false });
    createJoystickUI();
  }

  function createJoystickUI() {
    // Left joystick (move)
    const leftBase  = createJoyElement('joy-left-base');
    const leftThumb = createJoyElement('joy-left-thumb');
    leftBase.appendChild(leftThumb);
    document.body.appendChild(leftBase);
    Object.assign(leftBase.style, {
      position:     'fixed',
      left:         '60px',
      bottom:       '100px',
      width:        JOYSTICK_RADIUS * 2 + 'px',
      height:       JOYSTICK_RADIUS * 2 + 'px',
      borderRadius: '50%',
      background:   'rgba(255,255,255,0.08)',
      border:       '2px solid rgba(255,255,255,0.2)',
      zIndex:       '1000',
      pointerEvents:'none'
    });
    Object.assign(leftThumb.style, {
      position:     'absolute',
      left:         '50%', top: '50%',
      transform:    'translate(-50%,-50%)',
      width:        '40px', height: '40px',
      borderRadius: '50%',
      background:   'rgba(233,69,96,0.7)',
      transition:   'transform 0.05s'
    });
    window._joyLeftBase  = leftBase;
    window._joyLeftThumb = leftThumb;

    // Right joystick (aim)
    const rightBase  = createJoyElement('joy-right-base');
    const rightThumb = createJoyElement('joy-right-thumb');
    rightBase.appendChild(rightThumb);
    document.body.appendChild(rightBase);
    Object.assign(rightBase.style, {
      position:     'fixed',
      right:        '60px',
      bottom:       '100px',
      width:        JOYSTICK_RADIUS * 2 + 'px',
      height:       JOYSTICK_RADIUS * 2 + 'px',
      borderRadius: '50%',
      background:   'rgba(255,255,255,0.08)',
      border:       '2px solid rgba(255,255,255,0.2)',
      zIndex:       '1000',
      pointerEvents:'none'
    });
    Object.assign(rightThumb.style, {
      position:     'absolute',
      left:         '50%', top: '50%',
      transform:    'translate(-50%,-50%)',
      width:        '40px', height: '40px',
      borderRadius: '50%',
      background:   'rgba(68,170,255,0.7)',
      transition:   'transform 0.05s'
    });
    window._joyRightBase  = rightBase;
    window._joyRightThumb = rightThumb;
  }

  function createJoyElement(id) {
    const el = document.createElement('div');
    el.id = id;
    return el;
  }

  function getJoyBaseRect(side) {
    const el = side === 'left' ? window._joyLeftBase : window._joyRightBase;
    return el ? el.getBoundingClientRect() : null;
  }

  function updateJoyThumb(side, dx, dy) {
    const thumb = side === 'left' ? window._joyLeftThumb : window._joyRightThumb;
    if (!thumb) return;
    const r = JOYSTICK_RADIUS;
    const len = Math.sqrt(dx*dx + dy*dy);
    const cx = len > r ? (dx/len)*r : dx;
    const cy = len > r ? (dy/len)*r : dy;
    thumb.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
  }

  function resetJoyThumb(side) {
    const thumb = side === 'left' ? window._joyLeftThumb : window._joyRightThumb;
    if (thumb) thumb.style.transform = 'translate(-50%,-50%)';
  }

  function onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const halfW = window.innerWidth / 2;
      if (t.clientX < halfW && !leftTouch) {
        leftTouch = { id: t.identifier, startX: t.clientX, startY: t.clientY,
                      curX: t.clientX, curY: t.clientY };
      } else if (t.clientX >= halfW && !rightTouch) {
        rightTouch = { id: t.identifier, startX: t.clientX, startY: t.clientY,
                       curX: t.clientX, curY: t.clientY };
        state.shooting = true;
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (leftTouch && t.identifier === leftTouch.id) {
        leftTouch.curX = t.clientX;
        leftTouch.curY = t.clientY;
        const dx = leftTouch.curX - leftTouch.startX;
        const dy = leftTouch.curY - leftTouch.startY;
        updateJoyThumb('left', dx, dy);
      } else if (rightTouch && t.identifier === rightTouch.id) {
        rightTouch.curX = t.clientX;
        rightTouch.curY = t.clientY;
        const dx = rightTouch.curX - rightTouch.startX;
        const dy = rightTouch.curY - rightTouch.startY;
        updateJoyThumb('right', dx, dy);
        state.aimAngle = Math.atan2(dy, dx);
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (leftTouch && t.identifier === leftTouch.id) {
        leftTouch = null;
        state.moveX = 0;
        state.moveY = 0;
        resetJoyThumb('left');
      } else if (rightTouch && t.identifier === rightTouch.id) {
        rightTouch = null;
        state.shooting = false;
        resetJoyThumb('right');
      }
    }
  }

  // ── Weapon key switches (1-5) ──────────────────────────────
  const weaponSlotCallbacks = [];
  function onWeaponSwitch(cb) { weaponSlotCallbacks.push(cb); }

  window.addEventListener('keydown', e => {
    const slot = parseInt(e.key);
    if (slot >= 1 && slot <= 5) {
      weaponSlotCallbacks.forEach(cb => cb(slot - 1));
    }
  });

  // ── Update (called each frame by GameScene) ───────────────
  function update(scene) {
    _scene = scene;

    if (isMobile) {
      // Move from left joystick
      if (leftTouch) {
        const dx = leftTouch.curX - leftTouch.startX;
        const dy = leftTouch.curY - leftTouch.startY;
        const len = Math.sqrt(dx*dx + dy*dy);
        const r   = JOYSTICK_RADIUS;
        state.moveX = len > 5 ? Math.max(-1, Math.min(1, dx/r)) : 0;
        state.moveY = len > 5 ? Math.max(-1, Math.min(1, dy/r)) : 0;
      } else {
        state.moveX = 0;
        state.moveY = 0;
      }
      // aimAngle & shooting set in touch handlers
    } else {
      // Desktop keyboard
      let mx = 0, my = 0;
      if (keys['KeyW'] || keys['ArrowUp'])    my -= 1;
      if (keys['KeyS'] || keys['ArrowDown'])  my += 1;
      if (keys['KeyA'] || keys['ArrowLeft'])  mx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

      // Normalise diagonal
      if (mx !== 0 && my !== 0) {
        const len = Math.sqrt(mx*mx + my*my);
        mx /= len; my /= len;
      }
      state.moveX = mx;
      state.moveY = my;

      // Aim toward mouse in world coordinates
      if (_scene && _scene.cameras && _scene.cameras.main) {
        const cam = _scene.cameras.main;
        const worldX = mouseX + cam.scrollX;
        const worldY = mouseY + cam.scrollY;
        if (_scene.localPlayer) {
          const px = _scene.localPlayer.x;
          const py = _scene.localPlayer.y;
          state.aimAngle = Math.atan2(worldY - py, worldX - px);
        }
      }
      state.shooting = mouseDown;
    }

    return { ...state };
  }

  function getCurrentInput() { return { ...state }; }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    if (isMobile) initMobile();
    else           initDesktop();
  }

  return {
    init,
    update,
    getCurrentInput,
    onWeaponSwitch,
    get isMobile() { return isMobile; }
  };
})();
