// =====================================================================
//  LIMP LONGBOW - GAME
//  Verlet-physics ragdoll archery duel. Tunables live in config.js.
// =====================================================================
(() => {
  'use strict';

  const W = CONFIG.world.width, H = CONFIG.world.height;
  const SAVE_KEY = 'limpLongbow.save.v1';
  const MODS_KEY = 'limpLongbow.mods.v1';
  const STEP = 1 / 60;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  // ------------------------------------------------------------------ utils
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;

  function closestSegSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
    const rx = ax - cx, ry = ay - cy;
    const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
    let s, t;
    const EPS = 1e-9;
    if (a <= EPS && e <= EPS) { s = 0; t = 0; }
    else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
    else {
      const c = d1x * rx + d1y * ry;
      if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
      else {
        const b = d1x * d2x + d1y * d2y, den = a * e - b * b;
        s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
    const px = ax + d1x * s - (cx + d2x * t), py = ay + d1y * s - (cy + d2y * t);
    return { d2: px * px + py * py, s, t };
  }

  // ---------------------------------------------------------------- storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  function maxedSave() {
    const upgrades = {};
    UPGRADES.forEach(u => { upgrades[u.id] = CONFIG.maxUpgradeLevel; });
    return { coins: 99999, upgrades, arrows: ARROWS.map(a => a.id), arrow: 'normal', stage: 1, best: 1 };
  }
  function freshSave() {
    const upgrades = {};
    UPGRADES.forEach(u => { upgrades[u.id] = 0; });
    return { coins: 0, upgrades, arrows: ['normal'], arrow: 'normal', stage: 1, best: 1 };
  }
  function normalizeSave(s) {
    const base = freshSave();
    s = Object.assign(base, s || {});
    UPGRADES.forEach(u => { if (typeof s.upgrades[u.id] !== 'number') s.upgrades[u.id] = 0; });
    if (!s.arrows.includes('normal')) s.arrows.unshift('normal');
    if (!s.arrows.includes(s.arrow)) s.arrow = 'normal';
    return s;
  }

  // First launch starts with a maxed-out save.
  let save = normalizeSave(store.get(SAVE_KEY, null) || maxedSave());
  let mods = Object.assign({}, DEFAULT_MODS, store.get(MODS_KEY, {}));
  const persist = () => store.set(SAVE_KEY, save);
  const persistMods = () => store.set(MODS_KEY, mods);

  const upLvl = id => save.upgrades[id] || 0;
  const P = CONFIG.player, E = CONFIG.enemy;
  const playerMaxHp = () => P.baseHp + P.hpPerLevel * upLvl('health');
  const playerDamage = () => P.baseDamage + P.damagePerLevel * upLvl('damage');
  const playerPower = () => P.basePower + P.powerPerLevel * upLvl('power');
  const playerReload = () => Math.max(0.2, P.baseReload - P.reloadPerLevel * upLvl('reload'));
  const arrowType = id => ARROWS.find(a => a.id === id) || ARROWS[0];
  const gravity = () => CONFIG.gravity * mods.gravityMult;

  // ---------------------------------------------------------------- ragdoll
  const HEAD = 0, NECK = 1, PELVIS = 2, FEL = 3, FHA = 4, BEL = 5, BHA = 6, FKN = 7, FFO = 8, BKN = 9, BFO = 10;
  const STICKS = [[HEAD, NECK], [NECK, PELVIS], [NECK, FEL], [FEL, FHA], [NECK, BEL], [BEL, BHA],
    [PELVIS, FKN], [FKN, FFO], [PELVIS, BKN], [BKN, BFO]];
  const BONES = [
    { a: HEAD, b: HEAD, part: 'head', r: 14 },
    { a: NECK, b: PELVIS, part: 'torso', r: 9 },
    { a: NECK, b: FEL, part: 'arm', r: 6 }, { a: FEL, b: FHA, part: 'arm', r: 6 },
    { a: NECK, b: BEL, part: 'arm', r: 6 }, { a: BEL, b: BHA, part: 'arm', r: 6 },
    { a: PELVIS, b: FKN, part: 'leg', r: 7 }, { a: FKN, b: FFO, part: 'leg', r: 7 },
    { a: PELVIS, b: BKN, part: 'leg', r: 7 }, { a: BKN, b: BFO, part: 'leg', r: 7 },
  ];

  class Fighter {
    constructor(side, x, y, opts) {
      this.side = side;
      this.face = side === 'player' ? 1 : -1;
      this.s = opts.scale || 1;
      this.ax = x; this.ay = y;
      this.maxHp = this.hp = opts.hp;
      this.color = opts.color;
      this.boss = !!opts.boss;
      this.alive = true;
      this.limp = 0;
      this.aim = side === 'player' ? -0.35 : Math.PI + 0.35;
      this.draw = 0;
      this.burn = 0; this.burnTick = 0; this.freeze = 0;
      this.reload = 0; this.timer = 0; this.drawing = false; this.targetAim = this.aim;
      this.headshotKill = false;
      this.pts = this.targets().map(([tx, ty]) => ({ x: tx, y: ty, px: tx, py: ty }));
      const T = this.targets();
      this.len = STICKS.map(([a, b]) => Math.hypot(T[a][0] - T[b][0], T[a][1] - T[b][1]));
    }
    get headR() { return 14 * this.s * (mods.bigHeads ? 1.9 : 1); }

    targets() {
      const s = this.s, f = this.face, ax = this.ax, ay = this.ay;
      const at = (x, y) => [ax + x * f * s, ay + y * s];
      const neck = at(0, -128);
      const head = [neck[0], neck[1] - 24 * s - (this.headR - 14 * s)];
      const dx = Math.cos(this.aim), dy = Math.sin(this.aim);
      const sh = [neck[0], neck[1] + 6 * s];
      const fel = [sh[0] + dx * 26 * s, sh[1] + dy * 26 * s];
      const fha = [sh[0] + dx * 52 * s, sh[1] + dy * 52 * s];
      const back = (40 - this.draw * 36) * s;
      const bha = [sh[0] + dx * back, sh[1] + dy * back];
      const bel = [sh[0] + dx * back * 0.5 - dy * 14 * s * f, sh[1] + dy * back * 0.5 + 16 * s];
      return [head, neck, at(0, -74), fel, fha, bel, bha,
        at(10, -38), at(16, 0), at(-8, -38), at(-16, 0)];
    }

    step() {
      const g = gravity();
      const damp = this.alive ? 0.96 : 0.995;
      for (const p of this.pts) {
        const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + g;
      }
      if (this.alive) {
        const k = 0.2 * (1 - this.limp);
        const T = this.targets();
        this.pts.forEach((p, i) => {
          const kk = (i === FFO || i === BFO) ? Math.max(k, 0.5 * (1 - this.limp)) : k;
          const dx = (T[i][0] - p.x) * kk, dy = (T[i][1] - p.y) * kk;
          p.x += dx; p.y += dy; p.px += dx * 0.7; p.py += dy * 0.7;
        });
        this.limp = Math.max(0, this.limp - 0.02);
      }
      for (let it = 0; it < 6; it++) {
        STICKS.forEach(([a, b], i) => {
          const pa = this.pts[a], pb = this.pts[b];
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = (d - this.len[i]) / d * 0.5;
          pa.x += dx * diff; pa.y += dy * diff;
          pb.x -= dx * diff; pb.y -= dy * diff;
        });
        this.pts.forEach((p, i) => collidePoint(p, i === HEAD ? this.headR : 4));
      }
    }

    tick(dt) {
      if (this.freeze > 0) this.freeze -= dt;
      if (this.burn > 0) {
        this.burn -= dt;
        if (this.alive) {
          this.burnTick += dt;
          this.damage(6 * dt, false, true);
          if (this.burnTick > 0.5) { this.burnTick = 0; addText(this.pts[NECK].x, this.pts[HEAD].y - 30, '3', '#ff9a4d'); }
        }
        if (Math.random() < 0.5) {
          const p = this.pts[(Math.random() * this.pts.length) | 0];
          addParticle(p.x, p.y, rand(-0.5, 0.5), rand(-2.5, -1), '#ff8a2a', 0.6, 4, -0.02);
        }
      }
    }

    damage(amount, headshot, silent) {
      if (!this.alive) return;
      if (this.side === 'player' && mods.godMode) amount = 0;
      this.hp -= amount;
      if (!silent && amount > 0) {
        addText(this.pts[HEAD].x, this.pts[HEAD].y - 30, (headshot ? 'HEADSHOT! ' : '') + Math.round(amount),
          headshot ? '#ffd23f' : '#fff');
      }
      if (this.hp <= 0) {
        this.hp = 0; this.alive = false; this.limp = 1;
        this.headshotKill = !!headshot;
        onDeath(this);
      }
    }

    impulse(ix, iy, idx) {
      for (const i of idx) { const p = this.pts[i]; p.px -= ix; p.py -= iy; }
    }
  }

  // ------------------------------------------------------------------ world
  let platforms = [], fighters = [], arrows = [], particles = [], texts = [];
  let player = null, enemy = null, stage = 1, state = 'title', stateTimer = 0;
  let aiming = null, lastReward = 0;
  const stars = Array.from({ length: 90 }, () => ({ x: rand(0, W), y: rand(0, H * 0.7), r: rand(0.5, 2) }));
  const hills = Array.from({ length: 9 }, (_, i) => ({ x: i * 220 - 100, h: rand(120, 260) }));

  function collidePoint(p, r) {
    for (const pl of platforms) {
      if (p.x > pl.x - r && p.x < pl.x + pl.w + r && p.y > pl.y - r && p.y < pl.y + pl.h + r) {
        const top = p.y - (pl.y - r), bot = (pl.y + pl.h + r) - p.y;
        const left = p.x - (pl.x - r), right = (pl.x + pl.w + r) - p.x;
        const m = Math.min(top, bot, left, right);
        if (m === top) { p.y = pl.y - r; p.px = p.x - (p.x - p.px) * 0.7; }
        else if (m === bot) p.y = pl.y + pl.h + r;
        else if (m === left) p.x = pl.x - r;
        else p.x = pl.x + pl.w + r;
      }
    }
  }
  const inPlatform = (x, y) => platforms.find(pl => x > pl.x && x < pl.x + pl.w && y > pl.y && y < pl.y + pl.h);

  function addParticle(x, y, vx, vy, color, life, size, grav = 0.25) {
    if (particles.length > 600) return;
    particles.push({ x, y, vx, vy, color, life, max: life, size, grav });
  }
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.4, 0.9), rand(2, 4));
    }
  }
  function addText(x, y, text, color) { texts.push({ x, y, text, color, life: 1.2 }); }

  function explode(x, y, R, dmg, ownerSide) {
    burst(x, y, '#ffd23f', 40, 9); burst(x, y, '#ff6a2a', 30, 6);
    for (const f of fighters) {
      let minD = Infinity;
      for (const p of f.pts) {
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
        minD = Math.min(minD, d);
        if (d < R) { const k = (1 - d / R) * 16; p.px -= dx / d * k; p.py -= dy / d * k; }
      }
      if (minD < R) {
        f.limp = 1;
        if (f.side !== ownerSide) {
          const base = ownerSide === 'player' ? (mods.oneHitKill ? 1e9 : dmg + upLvl('damage') * 4) : dmg;
          f.damage(base * (1 - (minD / R) * 0.6), false);
        }
      }
    }
  }
  const api = { explode, particles: burst, text: addText };

  // ----------------------------------------------------------------- arrows
  function fireArrows(owner, x, y, angle, speed, typeId, dmg) {
    const t = arrowType(typeId);
    for (const sp of (t.spread || [0])) {
      arrows.push({
        x, y, px: x, py: y, vx: Math.cos(angle + sp) * speed, vy: Math.sin(angle + sp) * speed,
        ownerSide: owner.side, type: t, dmg: dmg * (t.damageMult || 1), stuck: null, landed: false, age: 0,
      });
    }
  }

  function boneRef(b) { return b.a === b.b ? [NECK, HEAD] : [b.a, b.b]; }

  function updateArrows() {
    const g = gravity() * CONFIG.arrowGravity;
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.age += STEP;
      if (a.stuck || a.landed) continue;
      a.px = a.x; a.py = a.y;
      a.vx *= CONFIG.airDrag; a.vy *= CONFIG.airDrag; a.vy += g;
      a.x += a.vx; a.y += a.vy;

      let best = null;
      for (const f of fighters) {
        if (f.side === a.ownerSide) continue;
        for (const b of BONES) {
          const pa = f.pts[b.a], pb = f.pts[b.b];
          const r = b.part === 'head' ? f.headR : b.r * f.s;
          const res = closestSegSeg(a.px, a.py, a.x, a.y, pa.x, pa.y, pb.x, pb.y);
          if (res.d2 < r * r && (!best || res.s < best.res.s)) best = { f, b, res };
        }
      }
      if (best) { if (hitFighter(a, best)) arrows.splice(i, 1); continue; }

      const pl = inPlatform(a.x, a.y);
      if (pl) {
        a.landed = true;
        burst(a.x, a.y, '#9a8f7a', 6, 2);
        if (a.type.onImpact && a.type.onImpact(api, a) === 'remove') arrows.splice(i, 1);
        continue;
      }
      if (a.x < -300 || a.x > W + 300 || a.y > H + 300) arrows.splice(i, 1);
    }
    // keep the arrow count sane
    const loose = arrows.filter(a => a.landed);
    if (loose.length > 40) arrows.splice(arrows.indexOf(loose[0]), 1);
  }

  function hitFighter(a, { f, b, res }) {
    const speed = Math.hypot(a.vx, a.vy) || 1;
    const dirx = a.vx / speed, diry = a.vy / speed;
    const pa = f.pts[b.a], pb = f.pts[b.b];
    const bx = lerp(pa.x, pb.x, res.t), by = lerp(pa.y, pb.y, res.t);
    const hx = lerp(a.px, a.x, res.s) + dirx * 10, hy = lerp(a.py, a.y, res.s) + diry * 10;
    const [ra, rb] = boneRef(b);
    const boneAng = Math.atan2(f.pts[rb].y - f.pts[ra].y, f.pts[rb].x - f.pts[ra].x);
    const c = Math.cos(-boneAng), s = Math.sin(-boneAng);
    const ox = hx - bx, oy = hy - by;
    a.x = hx; a.y = hy;
    a.stuck = { f, a: b.a, b: b.b, t: res.t, lx: ox * c - oy * s, ly: ox * s + oy * c, rel: Math.atan2(a.vy, a.vx) - boneAng, ra, rb };

    const imp = speed * 0.35 * (a.type.knockback || 1);
    f.impulse(dirx * imp, diry * imp, b.a === b.b ? [HEAD, NECK] : [b.a, b.b]);
    f.limp = Math.min(1, f.limp + 0.6);
    if (mods.gore) burst(hx, hy, '#c8283b', 12, 4);

    if (f.alive) {
      const headshot = b.part === 'head';
      let dmg = a.dmg * CONFIG.hitMultipliers[b.part] * clamp(speed / 22, 0.6, 1.3);
      if (a.ownerSide === 'player' && mods.oneHitKill) dmg = 1e9;
      f.damage(dmg, headshot);
    }
    if (a.type.onHitFighter) a.type.onHitFighter(api, a, f, b.part);
    if (a.type.onImpact && a.type.onImpact(api, a) === 'remove') return true;
    return false;
  }

  function arrowPose(a) {
    if (!a.stuck) return { x: a.x, y: a.y, ang: Math.atan2(a.vy, a.vx) };
    const st = a.stuck, f = st.f;
    const pa = f.pts[st.a], pb = f.pts[st.b];
    const boneAng = Math.atan2(f.pts[st.rb].y - f.pts[st.ra].y, f.pts[st.rb].x - f.pts[st.ra].x);
    const c = Math.cos(boneAng), s = Math.sin(boneAng);
    return {
      x: lerp(pa.x, pb.x, st.t) + st.lx * c - st.ly * s,
      y: lerp(pa.y, pb.y, st.t) + st.lx * s + st.ly * c,
      ang: boneAng + st.rel,
    };
  }

  // ---------------------------------------------------------------- stages
  function startStage(n) {
    stage = n; save.stage = n; persist();
    arrows = []; particles = []; texts = []; aiming = null;
    const boss = n % E.bossEvery === 0;
    platforms = [{ x: 110, y: 640, w: 220, h: 36 }];
    const ex = rand(1000, 1380), ey = rand(330, 700), ew = boss ? 230 : 170;
    platforms.push({ x: ex - ew / 2, y: ey, w: ew, h: 36 });
    if (n > 3 && Math.random() < 0.5) {
      const h = rand(90, 220);
      platforms.push({ x: rand(620, 860), y: rand(220, 640 - h), w: 34, h });
    }
    player = new Fighter('player', 220, 640, { hp: playerMaxHp(), color: '#e8f1ff' });
    const hp = (E.baseHp + E.hpPerStage * (n - 1)) * (boss ? E.bossHpMult : 1);
    enemy = new Fighter('enemy', ex, ey, { hp, scale: boss ? E.bossScale : 1, color: boss ? '#ff4d6d' : '#ff9a8a', boss });
    enemy.timer = rand(1.6, 2.6);
    fighters = [player, enemy];
    state = 'play';
    hideOverlay(); updateHud();
  }

  function onDeath(f) {
    if (f === enemy) {
      let reward = CONFIG.rewards.kill + CONFIG.rewards.perStage * stage;
      if (f.headshotKill) reward += CONFIG.rewards.headshotKill;
      if (f.boss) reward *= CONFIG.rewards.bossMult;
      lastReward = reward;
      save.coins += reward;
      save.best = Math.max(save.best, stage + 1);
      save.stage = stage + 1;
      persist();
      addText(f.pts[HEAD].x, f.pts[HEAD].y - 60, '+' + reward + ' coins', '#ffd23f');
      state = 'won'; stateTimer = 1.8;
      updateHud();
    } else if (f === player) {
      state = 'lost'; stateTimer = 1.8;
    }
  }

  // --------------------------------------------------------------- enemy AI
  function enemyAim(e) {
    const hand = e.pts[FHA];
    const tgt = player.pts[NECK], tgt2 = player.pts[PELVIS];
    const tx = (tgt.x + tgt2.x) / 2, ty = (tgt.y + tgt2.y) / 2;
    const v = E.arrowSpeed, g = gravity() * CONFIG.arrowGravity;
    const dx = tx - hand.x, dyUp = hand.y - ty;
    const disc = v ** 4 - g * (g * dx * dx + 2 * dyUp * v * v);
    let elev = Math.PI / 4;
    if (disc >= 0 && g > 0) elev = Math.atan((v * v - Math.sqrt(disc)) / (g * Math.abs(dx)));
    else if (g <= 0) elev = Math.atan2(dyUp, Math.abs(dx));
    const err = Math.max(E.minAimError, E.baseAimError - E.aimErrorPerStage * stage);
    const sx = Math.sign(dx) || -1;
    return Math.atan2(-Math.sin(elev), sx * Math.cos(elev)) + rand(-err, err);
  }

  function updateEnemy(dt) {
    const e = enemy;
    if (!e.alive || !player.alive || mods.enemyFireMult <= 0) { e.draw = Math.max(0, e.draw - dt * 3); return; }
    e.timer -= dt * (e.freeze > 0 ? 0.4 : 1) * mods.enemyFireMult;
    if (e.timer < 0.7 && !e.drawing) { e.drawing = true; e.targetAim = enemyAim(e); }
    if (e.drawing) {
      e.aim = lerp(e.aim, e.targetAim, 0.15);
      e.draw = Math.min(1, e.draw + dt * 2);
    }
    if (e.timer <= 0) {
      const dmg = E.baseDamage + E.damagePerStage * stage;
      const hand = e.pts[FHA];
      fireArrows(e, hand.x, hand.y, e.targetAim, E.arrowSpeed, 'normal', dmg);
      if (e.boss) fireArrows(e, hand.x, hand.y, e.targetAim + rand(-0.06, 0.06), E.arrowSpeed * 0.97, 'normal', dmg);
      const cd = Math.max(E.minCooldown, E.baseCooldown - E.cooldownPerStage * stage);
      e.timer = cd * rand(0.85, 1.15);
      e.drawing = false; e.draw = 0;
    }
  }

  // ------------------------------------------------------------------ input
  function toWorld(cx, cy) { return { x: (cx - view.ox) / view.scale, y: (cy - view.oy) / view.scale }; }
  canvas.addEventListener('pointerdown', ev => {
    if (state !== 'play' || !player.alive) return;
    canvas.setPointerCapture(ev.pointerId);
    const w = toWorld(ev.clientX, ev.clientY);
    aiming = { sx: w.x, sy: w.y, cx: w.x, cy: w.y, id: ev.pointerId };
  });
  canvas.addEventListener('pointermove', ev => {
    if (!aiming || ev.pointerId !== aiming.id) return;
    const w = toWorld(ev.clientX, ev.clientY);
    aiming.cx = w.x; aiming.cy = w.y;
  });
  const release = ev => {
    if (!aiming || ev.pointerId !== aiming.id) return;
    const a = aimInfo();
    aiming = null;
    if (state === 'play' && player.alive && a.power > 0.12 && player.reload <= 0) {
      const hand = player.pts[FHA];
      fireArrows(player, hand.x, hand.y, a.angle, a.power * playerPower(), save.arrow, playerDamage());
      player.reload = playerReload();
    }
    player.draw = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', ev => { if (aiming && ev.pointerId === aiming.id) { aiming = null; player.draw = 0; } });

  function aimInfo() {
    const px = aiming.sx - aiming.cx, py = aiming.sy - aiming.cy;
    const len = Math.hypot(px, py);
    return { angle: Math.atan2(py, px), power: clamp(len / P.maxDrag, 0, 1) };
  }

  // ----------------------------------------------------------------- update
  function update(dt) {
    if (!player) return;
    if (state === 'play' || state === 'won' || state === 'lost') {
      if (aiming && player.alive) {
        const a = aimInfo();
        if (a.power > 0.05) player.aim = a.angle;
        player.draw = a.power;
      }
      if (player.reload > 0) player.reload -= dt;
      updateEnemy(dt);
    }
    for (const f of fighters) {
      if (f.pts[PELVIS].y > H + 400) continue;
      f.step(); f.tick(dt);
    }
    updateArrows();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.grav; p.x += p.vx; p.y += p.vy; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      texts[i].y -= 0.6; texts[i].life -= dt;
      if (texts[i].life <= 0) texts.splice(i, 1);
    }
    if (state === 'won' || state === 'lost') {
      stateTimer -= dt;
      if (stateTimer <= 0) { showOverlay(state); state = state === 'won' ? 'wonMenu' : 'lostMenu'; }
    }
    updateHudBars();
  }

  // ----------------------------------------------------------------- render
  let view = { scale: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 };
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const s = Math.min(cw / W, ch / H);
    view = { scale: s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2, dpr, cw, ch };
    $('rotate').hidden = !(ch > cw * 1.1);
  }
  window.addEventListener('resize', resize);

  function render() {
    const { dpr, scale, ox, oy, cw, ch } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#141a33'); g.addColorStop(0.6, '#2c2547'); g.addColorStop(1, '#4a2e48');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const s of stars) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f4e3c1';
    ctx.beginPath(); ctx.arc(1280, 150, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#231d3a';
    ctx.beginPath(); ctx.moveTo(-200, H + 50);
    for (const h of hills) ctx.quadraticCurveTo(h.x + 110, H - h.h * 2, h.x + 220, H - 40);
    ctx.lineTo(W + 200, H + 50); ctx.fill();

    for (const pl of platforms) {
      ctx.fillStyle = '#4b3f5e'; roundRect(pl.x, pl.y, pl.w, pl.h, 8); ctx.fill();
      ctx.fillStyle = '#6fbf73'; roundRect(pl.x - 2, pl.y - 4, pl.w + 4, 10, 5); ctx.fill();
    }

    if (aiming && player && player.alive) drawAimPreview();

    for (const a of arrows) if (a.landed || a.stuck) drawArrow(a);
    for (const f of fighters) drawFighter(f);
    for (const a of arrows) if (!a.landed && !a.stuck) drawArrow(a);

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui, sans-serif';
    for (const t of texts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = '#000'; ctx.fillText(t.text, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawFighter(f) {
    const p = f.pts, s = f.s;
    let col = f.color;
    if (f.freeze > 0) col = '#9fe3ff';
    if (!f.alive) col = shade(col);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = col; ctx.lineWidth = 8 * s;
    const line = (...ids) => { ctx.beginPath(); ctx.moveTo(p[ids[0]].x, p[ids[0]].y); for (const i of ids.slice(1)) ctx.lineTo(p[i].x, p[i].y); ctx.stroke(); };
    ctx.globalAlpha = 0.75;
    line(PELVIS, BKN, BFO); line(NECK, BEL, BHA);
    ctx.globalAlpha = 1;
    line(NECK, PELVIS); line(PELVIS, FKN, FFO); line(NECK, FEL, FHA);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p[HEAD].x, p[HEAD].y, f.headR, 0, Math.PI * 2); ctx.fill();
    // face
    if (f.alive) {
      ctx.fillStyle = '#1b1830';
      ctx.beginPath(); ctx.arc(p[HEAD].x + 5 * s * f.face * (mods.bigHeads ? 1.8 : 1), p[HEAD].y - 2 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = '#1b1830'; ctx.lineWidth = 2;
      const hx = p[HEAD].x, hy = p[HEAD].y, e = 4 * s;
      ctx.beginPath(); ctx.moveTo(hx - e, hy - e); ctx.lineTo(hx + e, hy + e); ctx.moveTo(hx + e, hy - e); ctx.lineTo(hx - e, hy + e); ctx.stroke();
    }
    // bow
    const hand = p[FHA];
    const ang = Math.atan2(hand.y - p[NECK].y, hand.x - p[NECK].x);
    const R = 34 * s, cx = hand.x - Math.cos(ang) * 16 * s, cy = hand.y - Math.sin(ang) * 16 * s;
    const t1 = [cx + Math.cos(ang - 1.05) * R, cy + Math.sin(ang - 1.05) * R];
    const t2 = [cx + Math.cos(ang + 1.05) * R, cy + Math.sin(ang + 1.05) * R];
    ctx.strokeStyle = '#a0703f'; ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.arc(cx, cy, R, ang - 1.05, ang + 1.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(t1[0], t1[1]);
    if (f.alive && f.draw > 0.05) ctx.lineTo(p[BHA].x, p[BHA].y);
    ctx.lineTo(t2[0], t2[1]); ctx.stroke();
    if (f.alive && f.draw > 0.05 && (f !== player || player.reload <= 0)) {
      const type = f === player ? arrowType(save.arrow) : ARROWS[0];
      drawArrowShape(hand.x + Math.cos(ang) * 6, hand.y + Math.sin(ang) * 6, ang, type.color);
    }
    // hp bar
    if (f.alive) {
      const bw = 80 * s, bx = f.ax - bw / 2, by = f.ay - 205 * s - (mods.bigHeads ? 14 * s : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
      ctx.fillStyle = f.side === 'player' ? '#5fd67a' : '#ff5d6c';
      ctx.fillRect(bx, by, bw * (f.hp / f.maxHp), 8);
      if (f.boss) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('BOSS', f.ax, by - 8); }
    }
  }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) * 0.6 | 0, g = ((n >> 8) & 255) * 0.6 | 0, b = (n & 255) * 0.6 | 0;
    return `rgb(${r},${g},${b})`;
  }

  function drawArrow(a) {
    const { x, y, ang } = arrowPose(a);
    drawArrowShape(x, y, ang, a.type.color);
  }
  function drawArrowShape(x, y, ang, color) {
    const L = 46, c = Math.cos(ang), s = Math.sin(ang);
    const tx = x - c * L, ty = y - s * L;
    ctx.strokeStyle = '#d8c7a3'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x + c * 6, y + s * 6); ctx.lineTo(x - c * 4 - s * 4, y - s * 4 + c * 4); ctx.lineTo(x - c * 4 + s * 4, y - s * 4 - c * 4); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx + c * 8, ty + s * 8); ctx.lineTo(tx - s * 6, ty + c * 6);
    ctx.moveTo(tx + c * 8, ty + s * 8); ctx.lineTo(tx + s * 6, ty - c * 6);
    ctx.stroke();
  }

  function drawAimPreview() {
    const a = aimInfo();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(aiming.sx, aiming.sy); ctx.lineTo(aiming.cx, aiming.cy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(aiming.sx, aiming.sy, 8, 0, Math.PI * 2); ctx.fill();
    const steps = { off: 0, short: 22, full: 160 }[mods.aimPreview] || 0;
    if (!steps || a.power < 0.12) return;
    const hand = player.pts[FHA], g = gravity() * CONFIG.arrowGravity;
    let x = hand.x, y = hand.y, vx = Math.cos(a.angle) * a.power * playerPower(), vy = Math.sin(a.angle) * a.power * playerPower();
    ctx.fillStyle = player.reload > 0 ? 'rgba(255,120,120,0.7)' : 'rgba(255,214,120,0.9)';
    for (let i = 0; i < steps; i++) {
      vx *= CONFIG.airDrag; vy *= CONFIG.airDrag; vy += g; x += vx; y += vy;
      if (inPlatform(x, y) || y > H + 50) break;
      if (i % 4 === 0) { ctx.beginPath(); ctx.arc(x, y, 7 * (1 - i / (steps * 1.6)), 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // -------------------------------------------------------------------- HUD
  function updateHud() {
    $('stage').textContent = 'Stage ' + stage;
    $('coins').textContent = save.coins.toLocaleString() + ' coins';
    const bar = $('arrowbar');
    bar.innerHTML = '';
    for (const id of save.arrows) {
      const t = arrowType(id);
      const b = document.createElement('button');
      b.className = 'arrowbtn' + (save.arrow === id ? ' active' : '');
      b.innerHTML = `<span class="dot" style="background:${t.color}"></span>${t.name}`;
      b.onclick = () => { save.arrow = id; persist(); updateHud(); };
      bar.appendChild(b);
    }
  }
  function updateHudBars() {
    if (!player) return;
    const r = player.reload > 0 ? player.reload / playerReload() : 0;
    $('reload').style.width = ((1 - r) * 100) + '%';
  }

  // --------------------------------------------------------------- overlays
  const overlay = $('overlay'), panel = $('panel');
  function hideOverlay() { overlay.hidden = true; }
  function btn(label, fn, cls = '') {
    const b = document.createElement('button'); b.textContent = label; b.className = 'btn ' + cls; b.onclick = fn; return b;
  }
  function showOverlay(kind) {
    overlay.hidden = false;
    panel.innerHTML = '';
    const h = document.createElement('h1'), p = document.createElement('p'), row = document.createElement('div');
    row.className = 'row';
    panel.append(h, p, row);
    if (kind === 'title') {
      h.textContent = 'Limp Longbow';
      p.innerHTML = 'Drag anywhere and let go to shoot. Aim for the head.<br>Best stage: ' + save.best;
      row.append(btn('Play (stage ' + save.stage + ')', () => startStage(save.stage), 'primary'), btn('Shop', () => showShop('title')), btn('Mods', () => showMods('title')));
    } else if (kind === 'won') {
      h.textContent = 'Stage ' + stage + ' cleared';
      p.textContent = '+' + lastReward + ' coins';
      row.append(btn('Next stage', () => startStage(stage + 1), 'primary'), btn('Shop', () => showShop('won')), btn('Mods', () => showMods('won')));
    } else if (kind === 'lost') {
      h.textContent = 'You got floppified';
      p.textContent = 'Stage ' + stage;
      row.append(btn('Retry', () => startStage(stage), 'primary'), btn('Shop', () => showShop('lost')), btn('Mods', () => showMods('lost')));
    } else if (kind === 'pause') {
      h.textContent = 'Paused';
      row.append(btn('Resume', () => { state = 'play'; hideOverlay(); }, 'primary'), btn('Shop', () => showShop('pause')), btn('Mods', () => showMods('pause')), btn('Restart stage', () => startStage(stage)));
    }
  }

  function showShop(back) {
    overlay.hidden = false; panel.innerHTML = '';
    const h = document.createElement('h1'); h.textContent = 'Shop';
    const coins = document.createElement('p'); coins.textContent = save.coins.toLocaleString() + ' coins';
    panel.append(h, coins);
    const list = document.createElement('div'); list.className = 'list';
    for (const u of UPGRADES) {
      const lvl = upLvl(u.id), maxed = lvl >= CONFIG.maxUpgradeLevel, cost = u.cost(lvl);
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div><b>${u.name}</b> <span class="muted">Lv ${lvl}/${CONFIG.maxUpgradeLevel}</span><div class="muted">${u.desc}</div></div>`;
      const b = btn(maxed ? 'MAX' : cost + 'c', () => { save.coins -= cost; save.upgrades[u.id]++; persist(); updateHud(); showShop(back); });
      b.disabled = maxed || save.coins < cost;
      item.appendChild(b); list.appendChild(item);
    }
    for (const t of ARROWS) {
      if (t.price === 0) continue;
      const owned = save.arrows.includes(t.id);
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div><span class="dot" style="background:${t.color}"></span><b>${t.name} arrow</b></div>`;
      const b = btn(owned ? 'Owned' : t.price + 'c', () => { save.coins -= t.price; save.arrows.push(t.id); persist(); updateHud(); showShop(back); });
      b.disabled = owned || save.coins < t.price;
      item.appendChild(b); list.appendChild(item);
    }
    panel.appendChild(list);
    const row = document.createElement('div'); row.className = 'row';
    row.append(btn('Back', () => showOverlay(back), 'primary'));
    panel.appendChild(row);
  }

  function showMods(back) {
    overlay.hidden = false; panel.innerHTML = '';
    const h = document.createElement('h1'); h.textContent = 'Mods';
    panel.appendChild(h);
    const list = document.createElement('div'); list.className = 'list';
    const slider = (key, label, min, max, step) => {
      const item = document.createElement('label'); item.className = 'item';
      const val = document.createElement('span'); val.className = 'muted'; val.textContent = mods[key] + 'x';
      const inp = document.createElement('input');
      Object.assign(inp, { type: 'range', min, max, step, value: mods[key] });
      inp.oninput = () => { mods[key] = parseFloat(inp.value); val.textContent = mods[key] + 'x'; persistMods(); };
      const l = document.createElement('div'); l.innerHTML = `<b>${label}</b> `; l.appendChild(val);
      item.append(l, inp); list.appendChild(item);
    };
    const toggle = (key, label) => {
      const item = document.createElement('label'); item.className = 'item';
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!mods[key];
      inp.onchange = () => { mods[key] = inp.checked; persistMods(); };
      const l = document.createElement('b'); l.textContent = label;
      item.append(l, inp); list.appendChild(item);
    };
    slider('gravityMult', 'Gravity', 0, 2, 0.1);
    slider('timeScale', 'Game speed', 0.2, 2, 0.1);
    slider('enemyFireMult', 'Enemy fire rate', 0, 3, 0.1);
    const pv = document.createElement('label'); pv.className = 'item';
    pv.innerHTML = '<b>Aim preview</b>';
    const sel = document.createElement('select');
    ['off', 'short', 'full'].forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op); });
    sel.value = mods.aimPreview; sel.onchange = () => { mods.aimPreview = sel.value; persistMods(); };
    pv.appendChild(sel); list.appendChild(pv);
    toggle('godMode', 'God mode');
    toggle('oneHitKill', 'One-hit kills');
    toggle('bigHeads', 'Big heads');
    toggle('gore', 'Hit sparks');

    const jump = document.createElement('div'); jump.className = 'item';
    jump.innerHTML = '<b>Jump to stage</b>';
    const num = document.createElement('input'); Object.assign(num, { type: 'number', min: 1, max: 999, value: stage || save.stage });
    const go = btn('Go', () => startStage(clamp(parseInt(num.value, 10) || 1, 1, 999)));
    const wrap = document.createElement('div'); wrap.append(num, go); jump.appendChild(wrap);
    list.appendChild(jump);
    panel.appendChild(list);

    const row = document.createElement('div'); row.className = 'row';
    row.append(
      btn('Back', () => showOverlay(back), 'primary'),
      btn('Max out save', () => { const st = save.stage, best = save.best; save = maxedSave(); save.stage = st; save.best = best; persist(); updateHud(); showMods(back); }),
      btn('Reset save', () => { if (confirm('Wipe your save?')) { save = freshSave(); persist(); updateHud(); showMods(back); } }),
      btn('Reset mods', () => { mods = Object.assign({}, DEFAULT_MODS); persistMods(); showMods(back); }),
    );
    panel.appendChild(row);
  }

  $('pausebtn').onclick = () => { if (state === 'play') { state = 'paused'; aiming = null; showOverlay('pause'); } };

  // ------------------------------------------------------------------- loop
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state !== 'paused' && state !== 'title') {
      acc += dt * mods.timeScale;
      let n = 0;
      while (acc >= STEP && n < 8) { update(STEP); acc -= STEP; n++; }
      if (n === 8) acc = 0;
    }
    render();
    requestAnimationFrame(frame);
  }

  resize();
  stage = save.stage;
  startStage(save.stage);   // builds a scene behind the title screen
  state = 'title';
  showOverlay('title');
  requestAnimationFrame(frame);

  // handy for debugging / modding from the console
  window.LL = { get save() { return save; }, get mods() { return mods; }, get fighters() { return fighters; }, startStage, explode };
})();
