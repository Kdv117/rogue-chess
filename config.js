// =====================================================================
//  LIMP LONGBOW - CONFIG
//  Everything you'd want to tweak or mod lives in this file.
//  - CONFIG:   numbers for physics, player, enemies, rewards
//  - UPGRADES: things you can buy levels of in the shop
//  - ARROWS:   arrow types (add new ones here, with hooks)
//  - DEFAULT_MODS: the defaults for the in-game "Mods" menu
// =====================================================================

const CONFIG = {
  world: { width: 1600, height: 900 },
  gravity: 0.35,          // per physics step (60 steps / sec)
  arrowGravity: 1.0,      // multiplier on gravity for arrows
  airDrag: 0.9995,

  player: {
    baseHp: 100, hpPerLevel: 25,
    baseDamage: 25, damagePerLevel: 6,
    basePower: 22, powerPerLevel: 1.2,     // max arrow speed
    baseReload: 0.9, reloadPerLevel: 0.06, // seconds between shots
    maxDrag: 220,                          // drag distance for full power
  },

  enemy: {
    baseHp: 60, hpPerStage: 18,
    baseDamage: 12, damagePerStage: 1.5,
    arrowSpeed: 22,
    baseCooldown: 3.0, cooldownPerStage: 0.08, minCooldown: 1.1,
    baseAimError: 0.12, aimErrorPerStage: 0.006, minAimError: 0.02,
    bossEvery: 5, bossHpMult: 3, bossScale: 1.35,
  },

  hitMultipliers: { head: 3, torso: 1, arm: 0.6, leg: 0.7 },
  rewards: { kill: 40, perStage: 10, headshotKill: 25, bossMult: 3 },
  maxUpgradeLevel: 10,
};

const UPGRADES = [
  { id: 'damage', name: 'Damage',    desc: 'Arrows hit harder',      cost: lvl => 60 + lvl * 45 },
  { id: 'health', name: 'Health',    desc: 'More max HP',            cost: lvl => 60 + lvl * 45 },
  { id: 'power',  name: 'Bow Power', desc: 'Faster, longer shots',   cost: lvl => 80 + lvl * 50 },
  { id: 'reload', name: 'Reload',    desc: 'Shoot more often',       cost: lvl => 80 + lvl * 50 },
];

// Arrow hooks (all optional):
//   spread: [angles]           fire several arrows at once (radians)
//   damageMult: number         multiplies damage
//   knockback: number          multiplies the ragdoll shove
//   onHitFighter(api, arrow, fighter, part)
//   onImpact(api, arrow)        any hit (body or wall). return 'remove' to delete the arrow
// api has: explode(x, y, radius, damage, ownerSide), particles(x, y, color, n, speed), text(x, y, str, color)
const ARROWS = [
  { id: 'normal', name: 'Normal', color: '#e9e4d8', price: 0 },
  {
    id: 'fire', name: 'Fire', color: '#ff7a2f', price: 300,
    onHitFighter(api, arrow, f) { f.burn = 4; },
  },
  {
    id: 'ice', name: 'Ice', color: '#7fd8ff', price: 300,
    onHitFighter(api, arrow, f) { f.freeze = 4; },
  },
  {
    id: 'explosive', name: 'Boom', color: '#ffd23f', price: 600, damageMult: 0.5,
    onImpact(api, arrow) { api.explode(arrow.x, arrow.y, 140, 45, arrow.ownerSide); return 'remove'; },
  },
  {
    id: 'triple', name: 'Triple', color: '#c58bff', price: 800,
    spread: [-0.07, 0, 0.07], damageMult: 0.6,
  },
];

const DEFAULT_MODS = {
  gravityMult: 1,      // world gravity multiplier
  timeScale: 1,        // < 1 = slow motion
  aimPreview: 'full',  // 'off' | 'short' | 'full'
  enemyFireMult: 1,    // 0 = enemies never shoot
  godMode: false,
  oneHitKill: false,
  bigHeads: false,
  gore: true,
};
