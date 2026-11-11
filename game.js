(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 78;

  const GRAVITY = 2200;
  const MOVE_SPEED = 280;
  const CROUCH_SPEED_MULT = 0.45;
  const JUMP_SPEED = 760;

  const NORMAL_W = 48;
  const NORMAL_H = 48;
  const CROUCH_W = 58;
  const CROUCH_H = 26;

  // ===== 战斗参数 =====
  const MAX_HP = 5000000;
  const ROUND_TIME = 90;
  const LIGHT_WINDUP = 0.00;
  const LIGHT_DURATION = 0.18;
  const LIGHT_COOLDOWN = 0.3;
  const LIGHT_CHAIN_LIMIT = 25;
  const LIGHT_CHAIN_COOLDOWN = 1.0;
  const LIGHT_STUN = 0.75;
  const COMBO_TIMEOUT = 1.6;
  const LIGHT_DAMAGE_MIN = Math.round(40000 * 0.85);
  const LIGHT_DAMAGE_MAX = Math.round(48000 * 0.85);
  const HEAVY_HIT_RANGE_X = 48;
  const COUNTER_SLASH_DURATION = 0.3;
  const HEAVY_COOLDOWN = 1.5;
  const HEAVY_MAX_CHARGE = 0.25;
  const PISTOL_COOLDOWN = 0.3;
  const FULL_HEAVY_DISTANCE = 115 + 155;
  const FULL_HEAVY_DURATION = 0.17 + 0.10;
  const FULL_HEAVY_SPEED = FULL_HEAVY_DISTANCE / FULL_HEAVY_DURATION;
  const PISTOL_SPEED = FULL_HEAVY_SPEED * 1.5;
  const PISTOL_DAMAGE_MULTIPLIER = 2.5;
  const PISTOL_LIFE = 2.0;
  const ULTIMATE_COOLDOWN = 45;
  const ULTIMATE_DISTANCE = FULL_HEAVY_DISTANCE * 1.5;
  const ULTIMATE_SPEED = FULL_HEAVY_SPEED * 2;
  const ULTIMATE_DURATION = ULTIMATE_DISTANCE / ULTIMATE_SPEED;
  const ULTIMATE_DAMAGE_MULTIPLIER = 10;
  const ULTIMATE_HIT_RANGE_X = 62;
  const CRITICAL_RATE = 0.1;

  const PHASE_COOLDOWN = 13;
  const PERFECT_PHASE_COOLDOWN = 2;
  const PHASE_DURATION = 1.0;
  const PHASE_PERFECT_WINDOW = 0.36;
  const PHASE_BUFF_DURATION = 3.0;
  const PHASE_EYE_DURATION = 0.9;
  const PHASE_HIT_ESCAPE_PENALTY = 5.0;
  const PHASE_HIT_ESCAPE_PAUSE = 0.5;
  const PHASE_HIT_ESCAPE_INVULN = 1.0;
  const PHASE_TRAIL_INTERVAL = 0.032;
  const PHASE_TRAIL_LIFE = 0.24;

  const PARRY_COOLDOWN = 13;
  const PERFECT_PARRY_COOLDOWN = 2;
  const BREAK_PARRY_COOLDOWN = 18;
  const PARRY_WINDOW = 0.36;
  const PARRY_LATE_GRACE = 0.22;
  const PARRY_THREAT_BUFFER = 0.12;
  const PARRY_EFFECT_DURATION = 0.34;
  const PARRY_DAMAGE_MIN = 10000;
  const PARRY_DAMAGE_MAX = 20000;

  const LIGHT_LAUNCH = 500;
  const HEAVY_KNOCKBACK = 560 * 0.8;
  const HEAVY_LAUNCH = 500 * 0.8 * 2;
  const ULTIMATE_LAUNCH = 800;
  const ULTIMATE_X_KNOCKBACK = 1520;
  const BREAK_PARRY_KNOCKBACK = 760;

  const AI_LEVELS = {
    easy: {
      think: 0.18, react: 0.19, aggression: 0.68,
      phaseSkill: 0.22, phaseLead: 0.045,
      parrySkill: 0.22, parryLead: 0.045, breakChance: 0.00,
      moveFactor: 0.62, preferredRange: 158,
      jumpDodge: 0.00, crouchDefense: 0.00, comboPressure: 0.12,
      chargeRelease: 0.78, ultimateUse: 0.48, pistolUse: 0.20
    },
    normal: {
      think: 0.095, react: 0.11, aggression: 0.86,
      phaseSkill: 0.48, phaseLead: 0.075,
      parrySkill: 0.48, parryLead: 0.075, breakChance: 0.12,
      moveFactor: 0.78, preferredRange: 142,
      jumpDodge: 0.10, crouchDefense: 0.12, comboPressure: 0.32,
      chargeRelease: 0.88, ultimateUse: 0.62, pistolUse: 0.32
    },
    hard: {
      think: 0.052, react: 0.055, aggression: 0.95,
      phaseSkill: 0.72, phaseLead: 0.105,
      parrySkill: 0.72, parryLead: 0.105, breakChance: 0.28,
      moveFactor: 0.90, preferredRange: 128,
      jumpDodge: 0.22, crouchDefense: 0.24, comboPressure: 0.55,
      chargeRelease: 0.94, ultimateUse: 0.72, pistolUse: 0.48
    },
    master: {
      think: 0.038, react: 0.040, aggression: 0.98,
      phaseSkill: 0.88, phaseLead: 0.145,
      parrySkill: 0.88, parryLead: 0.145, breakChance: 0.62,
      moveFactor: 0.96, preferredRange: 138,
      jumpDodge: 0.48, crouchDefense: 0.48, comboPressure: 0.78,
      chargeRelease: 0.96, ultimateUse: 0.82, pistolUse: 0.62
    },
    expert: {
      think: 0.022, react: 0.018, aggression: 0.995,
      phaseSkill: 0.98, phaseLead: 0.185,
      parrySkill: 0.98, parryLead: 0.185, breakChance: 0.92,
      moveFactor: 1.00, preferredRange: 122,
      jumpDodge: 0.82, crouchDefense: 0.72, comboPressure: 0.96,
      chargeRelease: 0.985, ultimateUse: 0.94, pistolUse: 0.76
    }
  };

  const keys = Object.create(null);

  function createPlayer(x, color, lightColor, isLeft, skillMode = 'phase') {
    return {
      x,
      y: GROUND_Y - NORMAL_H,
      width: NORMAL_W,
      height: NORMAL_H,
      normalW: NORMAL_W,
      normalH: NORMAL_H,
      crouchW: CROUCH_W,
      crouchH: CROUCH_H,
      vy: 0,
      vx: 0,
      onGround: true,
      jumpsUsed: 0,
      facing: isLeft ? 1 : -1,
      color,
      lightColor,
      isLeft,
      crouching: false,
      skillMode,

      hp: MAX_HP,
      maxHp: MAX_HP,
      whiteHp: MAX_HP,
      hitstunTime: 0,
      combatState: 'normal',
      knockbackAnimTime: 0,
      flashTime: 0,
      grabbed: null,

      // 虚化
      phaseCooldown: 0,
      phaseTime: 0,
      phasePerfectWindow: 0,
      phaseBuffTime: 0,
      phaseEmergencyInvulnTime: 0,
      phaseTrailTimer: 0,
      phaseEnhancedSlashReady: false,

      // 防反
      parryCooldown: 0,
      parryTime: 0,
      parryEffectTime: 0,
      parryPerfect: false,
      breakParryTime: 0,
      lastHitInfo: null,

      ultimateStateTime: 0,
      aiThink: 0.05,
      aiCharge: false,
      aiCrouchDecision: false,

      lightCooldown: 0,
      lightChainHits: 0,
      lightChainTimer: 0,
      lightChainTarget: null,
      lightChainOverflow: false,
      comboTarget: null,
      comboCount: 0,
      comboTimer: 0,
      attackTime: 0,
      attackStartupTime: 0,
      attackHitDone: false,
      attackDuration: LIGHT_DURATION,
      attackType: 'light',
      attackFacing: isLeft ? 1 : -1,

      heavyCooldown: 0,
      chargingHeavy: false,
      chargeTime: 0,
      dash: null,

      pistolCooldown: 0,

      ultimateCooldown: 0,
      ultimateDash: null
    };
  }

  let p1;
  let p2;
  let playerSkillMode = 'parry';
  let aiDifficulty = 'normal';
  let gameStarted = false;

  let remainTime = ROUND_TIME;
  let gameOver = false;
  let resultText = '';

  let damageTexts = [];
  let particles = [];
  let dashTrails = [];
  let pistolBullets = [];
  let ultimateFlames = [];
  let phaseSlashes = [];
  let phaseEyes = [];
  let phaseTrails = [];
  let goldSlashes = [];
  let clashEffects = [];

  let hitStopTime = 0;
  let cameraShakeTime = 0;
  let cameraShakePower = 0;

  let cinematicMode = null;
  let cinematicTimer = 0;
  let cinematicDefender = null;
  let cinematicChoiceNotice = '';
  let cinematicChoiceNoticeTime = 0;
  let cinematicAIWait = 0;
  const CINEMATIC_SLOW_DURATION = 0.72;
  const CINEMATIC_RESUME_DURATION = 0.42;

  function resetGame() {
    p1 = createPlayer(90, '#22c55e', '#86efac', true, playerSkillMode);
    p2 = createPlayer(W - 90 - NORMAL_W, '#ef4444', '#fca5a5', false, 'parry');

    remainTime = ROUND_TIME;
    gameOver = false;
    resultText = '';

    damageTexts = [];
    particles = [];
    dashTrails = [];
    pistolBullets = [];
    ultimateFlames = [];
    phaseSlashes = [];
    phaseEyes = [];
    phaseTrails = [];
    goldSlashes = [];
    clashEffects = [];

    hitStopTime = 0;
    cameraShakeTime = 0;
    cameraShakePower = 0;

    cinematicMode = null;
    cinematicTimer = 0;
    cinematicDefender = null;
    cinematicChoiceNotice = '';
    cinematicChoiceNoticeTime = 0;
    cinematicAIWait = 0;

    for (const k in keys) keys[k] = false;
  }

  function clampX(p) {
    p.x = Math.max(0, Math.min(W - p.width, p.x));
  }

  function setPlayerSize(p, w, h) {
    const bottom = p.y + p.height;
    const centerX = p.x + p.width / 2;
    p.width = w;
    p.height = h;
    p.x = centerX - w / 2;
    p.y = bottom - h;
    clampX(p);
  }

  function tryJump(p) {
    if (p.hitstunTime > 0 || p.grabbed || p.dash || p.ultimateDash || p.combatState === 'knockback') return;
    if ((p.jumpsUsed || 0) >= 2) return;
    if (!p.onGround && (p.jumpsUsed || 0) === 0) return;

    if (p.crouching) {
      p.crouching = false;
      setPlayerSize(p, p.normalW, p.normalH);
    }

    p.vy = -JUMP_SPEED;
    p.onGround = false;
    p.jumpsUsed = (p.jumpsUsed || 0) + 1;
  }

  function updatePlayer(p, dt, allowInput) {
    if (p.grabbed) return;

    if (allowInput && p.hitstunTime <= 0 && !p.dash && !p.ultimateDash && p.combatState !== 'knockback') {
      const dir = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
      const wantCrouch = p.onGround && !!keys['s'];

      if (wantCrouch && !p.crouching && p.chargingHeavy) {
        p.chargingHeavy = false;
        p.chargeTime = 0;
      }

      if (wantCrouch !== p.crouching) {
        p.crouching = wantCrouch;
        setPlayerSize(
          p,
          wantCrouch ? p.crouchW : p.normalW,
          wantCrouch ? p.crouchH : p.normalH
        );
      }

      if (dir !== 0) {
        p.facing = dir;
        const phaseSpeed = p.phaseBuffTime > 0 ? 2 : 1;
        const speed = (p.crouching ? MOVE_SPEED * CROUCH_SPEED_MULT : MOVE_SPEED) * phaseSpeed;
        p.x += dir * speed * dt;
        clampX(p);
      }
    }

    if (dt <= 0) return;

    p.hitstunTime = Math.max(0, p.hitstunTime - dt);

    if (!p.dash && Math.abs(p.vx) > 1) {
      p.x += p.vx * dt;
      p.vx *= Math.pow(0.10, dt);
    } else if (Math.abs(p.vx) <= 1) {
      p.vx = 0;
    }

    if (p.x < 0) {
      p.x = 0;
      if (p.vx < 0) p.vx = -p.vx * 0.58;
    } else if (p.x + p.width > W) {
      p.x = W - p.width;
      if (p.vx > 0) p.vx = -p.vx * 0.58;
    }

    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;

    if (p.y + p.height >= GROUND_Y) {
      p.y = GROUND_Y - p.height;
      p.vy = 0;
      p.onGround = true;
      p.jumpsUsed = 0;
    } else {
      p.onGround = false;
    }

    if (p.combatState === 'knockback' && p.onGround) {
      p.combatState = p.hitstunTime > 0 ? 'stun' : 'normal';
      p.knockbackAnimTime = 0;
    } else if (p.combatState === 'stun' && p.hitstunTime <= 0) {
      p.combatState = 'normal';
    }
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function resolvePlayerCollision() {
    const a = p1;
    const b = p2;
    if (isPhased(a) || isPhased(b)) return;
    if (!rectsOverlap(a, b)) return;

    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (overlapX <= 0 || overlapY <= 0) return;

    if (overlapX < overlapY) {
      const dir = a.x + a.width / 2 <= b.x + b.width / 2 ? -1 : 1;
      a.x += (dir * overlapX) / 2;
      b.x -= (dir * overlapX) / 2;
      clampX(a);
      clampX(b);

      const rest = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      if (rest > 0) {
        const dir2 = a.x + a.width / 2 <= b.x + b.width / 2 ? -1 : 1;
        a.x += dir2 * rest;
        clampX(a);
      }
    } else {
      const aAbove = a.y + a.height / 2 < b.y + b.height / 2;
      if (aAbove) {
        a.y = b.y - a.height;
        if (a.vy > 0) a.vy = 0;
        a.onGround = true;
      } else {
        b.y = a.y - b.height;
        if (b.vy > 0) b.vy = 0;
        b.onGround = true;
      }
    }
  }

  function checkGameOver() {
    if (gameOver) return;

    if (p1.hp <= 0 || p2.hp <= 0) {
      gameOver = true;
      if (p1.hp > 0 && p2.hp <= 0) resultText = 'P1 获胜';
      else if (p2.hp > 0 && p1.hp <= 0) resultText = 'P2 获胜';
      else resultText = '平局';
      return;
    }

    if (remainTime <= 0) {
      gameOver = true;
      if (p1.hp > p2.hp) resultText = 'P1 获胜';
      else if (p2.hp > p1.hp) resultText = 'P2 获胜';
      else resultText = '平局';
    }
  }

  function isCrouching(p) {
    return !!(p.crouching || (p === p1 && p.onGround && keys['s']));
  }

  function isPhased(p) {
    return !!p && ((p.phaseTime || 0) > 0 || (p.phaseEmergencyInvulnTime || 0) > 0);
  }

  function cancelPhaseForAttack(p) {
    if (!p) return false;
    const wasPhased = isPhased(p) || (p.phaseBuffTime || 0) > 0;
    p.phaseTime = 0;
    p.phasePerfectWindow = 0;
    p.phaseBuffTime = 0;
    p.phaseEmergencyInvulnTime = 0;
    p.phaseEnhancedSlashReady = false;
    p.phaseTrailTimer = 0;
    return wasPhased;
  }

  function getHiddenStatePriority(target) {
    if (!target) return 0;
    if ((target.ultimateStateTime || 0) > 0 || target.ultimateDash) return 3;
    if (isCrouching(target) || isPhased(target) ||
        (target.parryTime || 0) > 0 || (target.breakParryTime || 0) > 0 ||
        target.dash) return 2;
    if (target.chargingHeavy) return 1;
    return 0;
  }

  function canAttackCauseStun(attackClass, target) {
    const priority = getHiddenStatePriority(target);
    switch (attackClass) {
      case 'light':
        return priority === 0;
      case 'heavy':
      case 'bullet':
      case 'ultimate':
        return priority === 0 || priority === 1;
      case 'counter':
        return priority === 0 || priority === 1 || priority === 2;
      default:
        return priority === 0 || priority === 1;
    }
  }

  function randomInt(l, r) {
    return Math.floor(Math.random() * (r - l + 1)) + l;
  }

  function spawnHitParticles(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomInt(70, 230);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomInt(2, 4),
        life: 0.22 + Math.random() * 0.12,
        maxLife: 0.34,
        color: '#ffffff'
      });
    }
  }

  function spawnPhaseSlash(x, y) {
    phaseSlashes.push({
      x, y,
      angle: Math.random() * Math.PI,
      life: COUNTER_SLASH_DURATION,
      maxLife: COUNTER_SLASH_DURATION
    });
  }

  function spawnGoldSlash(x, y) {
    goldSlashes.push({
      x, y,
      angle: Math.random() * Math.PI,
      life: COUNTER_SLASH_DURATION,
      maxLife: COUNTER_SLASH_DURATION
    });
  }

  function spawnParrySparks(x, y) {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomInt(130, 360);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomInt(2, 5),
        life: 0.28 + Math.random() * 0.2,
        maxLife: 0.48,
        color: Math.random() < 0.35 ? '#fff7ae' : '#fbbf24'
      });
    }
  }

  function spawnClashEffect(x, y, type) {
    const duration = type === 'heavy' ? 0.34 : 0.24;
    clashEffects.push({x, y, type, life: duration, maxLife: duration, angle: Math.random() * 0.35 - 0.175});
    const colors = type === 'heavy' ? ['#fef08a', '#fbbf24'] : ['#ffffff', '#7dd3fc'];
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomInt(type === 'heavy' ? 150 : 90, type === 'heavy' ? 330 : 230);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomInt(2, 4),
        life: duration * (0.65 + Math.random() * 0.35),
        maxLife: duration,
        color: colors[randomInt(0, colors.length - 1)]
      });
    }
  }

  function triggerImpact(frames, shakePower) {
    hitStopTime = Math.max(hitStopTime, frames / 60);
    cameraShakeTime = 0.15;
    cameraShakePower = Math.max(cameraShakePower, shakePower);
  }

  // ===== 虚化系统 =====
  function clampPositionX(x, width) {
    return Math.max(0, Math.min(W - width, x));
  }

  function teleportToSafePosition(p) {
    const enemy = p === p1 ? p2 : p1;
    if (p.crouching) {
      p.crouching = false;
      setPlayerSize(p, p.normalW, p.normalH);
    }

    const enemyCenter = enemy.x + enemy.width / 2;
    const leftX = clampPositionX(enemy.x - p.width - 130, p.width);
    const rightX = clampPositionX(enemy.x + enemy.width + 130, p.width);
    const candidates = [leftX, rightX, 0, W - p.width];
    let bestX = p.x;
    let bestDistance = -1;
    for (const candidate of candidates) {
      const distance = Math.abs(candidate + p.width / 2 - enemyCenter);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestX = candidate;
      }
    }

    p.x = bestX;
    p.y = GROUND_Y - p.height;
    p.vx = 0;
    p.vy = 0;
    p.onGround = true;
    p.jumpsUsed = 0;
    p.facing = enemyCenter >= p.x + p.width / 2 ? 1 : -1;

    p.hitstunTime = 0;
    p.combatState = 'normal';
    p.knockbackAnimTime = 0;
    p.lastHitInfo = null;
    p.chargingHeavy = false;
    p.chargeTime = 0;
    p.dash = null;
    p.ultimateDash = null;
    p.attackTime = 0;
    p.attackStartupTime = 0;
    p.attackHitDone = false;
    p.grabbed = null;

    if (enemy.lightChainTarget === p) {
      enemy.lightChainTarget = null;
      enemy.lightChainHits = 0;
      enemy.lightChainTimer = 0;
      enemy.lightChainOverflow = false;
    }
    if (enemy.comboTarget === p) {
      enemy.comboTarget = null;
      enemy.comboCount = 0;
      enemy.comboTimer = 0;
    }
  }

  function activateHitEscapePhase(p) {
    const eyeX = p.x + p.width / 2 - p.facing * (p.width * 0.72);
    const eyeY = p.y + p.height * 0.34;

    phaseEyes.push({
      x: eyeX,
      y: eyeY,
      color: '#ef4444',
      fadeIn: 0.38,
      life: 1.15,
      maxLife: 1.15
    });

    p.phaseCooldown = PHASE_COOLDOWN + PHASE_HIT_ESCAPE_PENALTY;
    p.phaseTime = 0;
    p.phasePerfectWindow = 0;
    p.phaseBuffTime = 0;
    p.phaseEnhancedSlashReady = false;
    p.phaseTrailTimer = 0;
    p.phaseEmergencyInvulnTime = PHASE_HIT_ESCAPE_INVULN;

    teleportToSafePosition(p);

    hitStopTime = Math.max(hitStopTime, PHASE_HIT_ESCAPE_PAUSE);
    for (let i = 0; i < 12; i++) {
      const angle = Math.PI * 2 * i / 12;
      const speed = randomInt(45, 130);
      particles.push({
        x: p.x + p.width / 2,
        y: p.y + p.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomInt(2, 4),
        life: 0.32,
        maxLife: 0.32,
        color: i % 2 ? '#f87171' : '#fecaca'
      });
    }
    return true;
  }
  function tryLatePerfectPhase(defender) {
    const hit = defender && defender.lastHitInfo;
    if (!hit || hit.timeLeft <= 0 || !hit.attacker || hit.attacker.hp <= 0) return false;

    // 撤销刚刚的受击伤害和硬直
    defender.hp = hit.hpBefore; defender.whiteHp = hit.whiteHpBefore;
    defender.vx = hit.vxBefore; defender.vy = hit.vyBefore;
    defender.onGround = hit.onGroundBefore; defender.hitstunTime = 0;
    defender.combatState = hit.combatStateBefore || 'normal';
    defender.knockbackAnimTime = hit.knockbackAnimTimeBefore || 0; defender.flashTime = hit.flashTimeBefore;
    defender.chargingHeavy = hit.chargingHeavyBefore; defender.chargeTime = hit.chargeTimeBefore;
    defender.dash = hit.dashBefore; defender.attackTime = hit.attackTimeBefore || 0;
    defender.attackStartupTime = hit.attackStartupTimeBefore || 0; defender.attackType = hit.attackTypeBefore || 'light';
    defender.attackHitDone = !!hit.attackHitDoneBefore; defender.attackDuration = hit.attackDurationBefore || LIGHT_DURATION;
    defender.lastHitInfo = null;

    // 清除飘字和粒子
    if (hit.damageText) {
      const textIndex = damageTexts.indexOf(hit.damageText);
      if (textIndex >= 0) damageTexts.splice(textIndex, 1);
    }
    if (hit.hitParticles && hit.hitParticles.length) {
      const hitParticleSet = new Set(hit.hitParticles);
      particles = particles.filter(particle => !hitParticleSet.has(particle));
    }

    // 直接赋予完美虚化状态
    defender.phaseCooldown = PERFECT_PHASE_COOLDOWN;
    defender.phaseTime = PHASE_BUFF_DURATION;
    defender.phasePerfectWindow = 0;
    defender.phaseBuffTime = PHASE_BUFF_DURATION;
    defender.phaseEmergencyInvulnTime = 0;
    defender.phaseTrailTimer = 0;
    defender.phaseEnhancedSlashReady = true;

    // 播放完美虚化的紫眼特效和粒子
    phaseEyes.push({
      x: defender.x + defender.width / 2, y: defender.y + defender.height / 2,
      color: '#a855f7', fadeIn: 0, life: PHASE_EYE_DURATION, maxLife: PHASE_EYE_DURATION
    });
    for (let i = 0; i < 16; i++) {
      const angle = Math.PI * 2 * i / 16;
      const speed = randomInt(70, 190);
      particles.push({
        x: defender.x + defender.width / 2, y: defender.y + defender.height / 2,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        size: randomInt(2, 4), life: 0.32, maxLife: 0.32, color: i % 2 ? '#c084fc' : '#f3e8ff'
      });
    }
    triggerImpact(5, 7);
    return true;
  }
    function activatePhaseFor(p) {
    if (!p || p.skillMode !== 'phase' || gameOver || p.hp <= 0 || p.phaseCooldown > 0 || isPhased(p)) return false;

    const isBeingHit = (p.hitstunTime || 0) > 0 || p.combatState === 'stun' || p.combatState === 'knockback';
    
    if (isBeingHit) {
      // 1. 如果对方有即将命中的攻击，优先给完美窗口
      if (isIncomingThreatWithinParryWindow(p)) {
        p.hitstunTime = 0; // 强行解除硬直
        p.combatState = 'normal';
        p.lastHitInfo = null;
        p.phaseCooldown = PHASE_COOLDOWN; 
        p.phaseTime = PHASE_DURATION;
        p.phasePerfectWindow = PHASE_PERFECT_WINDOW; // 给予完美判定
        p.phaseEmergencyInvulnTime = 0;
        return true;
      }
      
      // 2. 如果刚挨打一帧内，尝试回滚这瞬间的伤害并进入完美虚化
      if (tryLatePerfectPhase(p)) {
        return true;
      }

      // 3. 只有在完全没有威胁且错过时机时，才使用脱身虚化（传送）
      return activateHitEscapePhase(p);
    }

    // 没受击时的普通虚化
    p.phaseCooldown = PHASE_COOLDOWN; p.phaseTime = PHASE_DURATION;
    p.phasePerfectWindow = PHASE_PERFECT_WINDOW; p.phaseBuffTime = 0;
    p.phaseEmergencyInvulnTime = 0; p.phaseTrailTimer = 0; p.phaseEnhancedSlashReady = false;
    return true;
  }

  function startPhase() {
    if (!gameStarted || gameOver || !p1 || p1.hp <= 0 || p1.skillMode !== 'phase') return;

    if (p1.phaseBuffTime > 0 && p1.phaseEnhancedSlashReady) {
      phaseEnhancedSlashFor(p1);
      return;
    }
    activatePhaseFor(p1);
  }

  function handlePhaseContact(attacker, target) {
    if (!target || target.skillMode !== 'phase') return false;
    if (!isPhased(target)) return false;
    if (target.phasePerfectWindow > 0) triggerPerfectPhase(target, attacker);
    return true;
  }

  function triggerPerfectPhase(defender, attacker) {
    if (!defender || defender.skillMode !== 'phase' || !isPhased(defender) || defender.phasePerfectWindow <= 0) return false;

    defender.phasePerfectWindow = 0;
    defender.phaseTime = PHASE_BUFF_DURATION;
    defender.phaseEmergencyInvulnTime = 0;
    defender.phaseBuffTime = PHASE_BUFF_DURATION;
    defender.phaseTrailTimer = 0;
    defender.phaseEnhancedSlashReady = true;
    defender.phaseCooldown = PERFECT_PHASE_COOLDOWN;

    phaseEyes.push({
      x: defender.x + defender.width / 2,
      y: defender.y + defender.height / 2,
      color: '#a855f7',
      fadeIn: 0,
      life: PHASE_EYE_DURATION,
      maxLife: PHASE_EYE_DURATION
    });

    for (let i = 0; i < 16; i++) {
      const angle = Math.PI * 2 * i / 16;
      const speed = randomInt(70, 190);
      particles.push({
        x: defender.x + defender.width / 2,
        y: defender.y + defender.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomInt(2, 4),
        life: 0.32,
        maxLife: 0.32,
        color: i % 2 ? '#c084fc' : '#f3e8ff'
      });
    }

    triggerImpact(5, 7);
    return true;
  }

  function phaseEnhancedSlashFor(p) {
    const target = p === p1 ? p2 : p1;
    if (!p || !target || p.skillMode !== 'phase' || gameOver || p.hp <= 0 || target.hp <= 0 ||
        p.phaseBuffTime <= 0 || !p.phaseEnhancedSlashReady) return false;

    cancelPhaseForAttack(p);
    const dir = target.x + target.width / 2 >= p.x + p.width / 2 ? 1 : -1;
    const targetX = target.x + target.width / 2;
    const targetY = target.y + target.height / 2;

    p.attackTime = 0;
    p.attackStartupTime = 0;
    p.attackType = 'counter';
    p.attackFacing = dir;
    spawnPhaseSlash(targetX, targetY);

    applyDamage(p, target, randomInt(100000, 150000), {
      dir,
      knockback: 0,
      launch: 0,
      stun: 2.0,
      attackClass: 'counter',
      attackerPush: 4,
      hitStop: 8,
      shake: 8
    });
    return true;
  }

  // ===== 防反系统 =====
  function performPerfectParry(defender, attacker, incomingDir) {
    if (!defender || defender.skillMode !== 'parry' || !attacker || attacker.hp <= 0) return;

    defender.parryTime = 0;
    defender.hitstunTime = 0;
    defender.combatState = 'normal';
    defender.lastHitInfo = null;
    defender.parryCooldown = PERFECT_PARRY_COOLDOWN;
    defender.parryEffectTime = PARRY_EFFECT_DURATION;
    defender.parryPerfect = true;

    const x = defender.x + defender.width / 2 - incomingDir * 16;
    const y = defender.y + defender.height / 2;
    spawnParrySparks(x, y);
    triggerImpact(10, 9);

    cinematicMode = 'slowing';
    cinematicTimer = 0;
    cinematicDefender = defender;
    cinematicChoiceNotice = '';
    cinematicChoiceNoticeTime = 0;
    cinematicAIWait = defender === p2 ? 0.42 : 0;

    applyDamage(defender, attacker, randomInt(PARRY_DAMAGE_MIN, PARRY_DAMAGE_MAX), {
      dir: -incomingDir,
      knockback: 0,
      launch: 0,
      stun: 1.25,
      attackClass: 'counter',
      attackerPush: 0,
      hitStop: 0,
      shake: 0,
      ignoreParry: true
    });
  }

  function tryPerfectParry(defender, attacker, incomingDir) {
    if (!defender || defender.skillMode !== 'parry' || defender.parryTime <= 0 || defender.hp <= 0) return false;
    performPerfectParry(defender, attacker, incomingDir);
    return true;
  }

  function isIncomingThreatWithinParryWindow(defender) {
    const attacker = defender === p1 ? p2 : p1;
    if (!attacker || attacker.hp <= 0) return false;

    const defenderCenterX = defender.x + defender.width / 2;
    const attackerCenterX = attacker.x + attacker.width / 2;
    const dx = defenderCenterX - attackerCenterX;
    const verticalOverlap =
      attacker.y < defender.y + defender.height &&
      attacker.y + attacker.height > defender.y;

    if (attacker.dash && verticalOverlap) {
      const d = attacker.dash;
      const towardDefender = dx * d.dir > 0;
      if (towardDefender) {
        const gap = d.dir > 0
          ? defender.x - (attacker.x + attacker.width)
          : attacker.x - (defender.x + defender.width);
        const remaining = Math.max(0, d.distance - d.moved);
        const reach = Math.min(remaining, d.speed * (PARRY_WINDOW + PARRY_THREAT_BUFFER))
          + HEAVY_HIT_RANGE_X;
        if (gap <= reach && gap >= -defender.width - HEAVY_HIT_RANGE_X) return true;
      }
    }

    if (attacker.chargingHeavy && verticalOverlap &&
        dx * attacker.attackFacing > 0 && Math.abs(dx) <= 340) {
      return true;
    }

    if (attacker.attackTime > 0 && attacker.attackType === 'light' &&
        lightAttackCanHit(attacker, defender)) {
      return true;
    }

    for (const bullet of pistolBullets) {
      if (bullet.attacker !== attacker) continue;
      const bx = (defenderCenterX - bullet.x) * bullet.dir;
      const by = Math.abs((defender.y + defender.height / 2) - bullet.y);
      const maxX = Math.abs(bullet.vx) * (PARRY_WINDOW + PARRY_THREAT_BUFFER)
        + defender.width / 2 + bullet.r;
      if (bx >= -bullet.r && bx <= maxX && by <= defender.height / 2 + bullet.r) {
        return true;
      }
    }

    if (attacker.ultimateDash) {
      const d = attacker.ultimateDash;
      const gap = d.dir > 0
        ? defender.x - (attacker.x + attacker.width)
        : attacker.x - (defender.x + defender.width);
      const remaining = Math.max(0, d.distance - d.moved);
      const reach = Math.min(remaining, d.speed * (PARRY_WINDOW + PARRY_THREAT_BUFFER))
        + ULTIMATE_HIT_RANGE_X;
      if (gap <= reach && gap >= -defender.width - ULTIMATE_HIT_RANGE_X) return true;
    }

    return false;
  }

  function tryLatePerfectParry(defender) {
    const hit = defender && defender.lastHitInfo;
    if (!hit || hit.timeLeft <= 0 || !hit.attacker || hit.attacker.hp <= 0) return false;

    defender.hp = hit.hpBefore;
    defender.whiteHp = hit.whiteHpBefore;
    defender.vx = hit.vxBefore;
    defender.vy = hit.vyBefore;
    defender.onGround = hit.onGroundBefore;
    defender.hitstunTime = 0;
    defender.combatState = hit.combatStateBefore || 'normal';
    defender.knockbackAnimTime = hit.knockbackAnimTimeBefore || 0;
    defender.flashTime = hit.flashTimeBefore;
    defender.chargingHeavy = hit.chargingHeavyBefore;
    defender.chargeTime = hit.chargeTimeBefore;
    defender.dash = hit.dashBefore;
    defender.attackTime = hit.attackTimeBefore || 0;
    defender.attackStartupTime = hit.attackStartupTimeBefore || 0;
    defender.attackType = hit.attackTypeBefore || 'light';
    defender.attackHitDone = !!hit.attackHitDoneBefore;
    defender.attackDuration = hit.attackDurationBefore || LIGHT_DURATION;
    defender.lastHitInfo = null;

    if (hit.damageText) {
      const textIndex = damageTexts.indexOf(hit.damageText);
      if (textIndex >= 0) damageTexts.splice(textIndex, 1);
    }
    if (hit.hitParticles && hit.hitParticles.length) {
      const hitParticleSet = new Set(hit.hitParticles);
      particles = particles.filter(particle => !hitParticleSet.has(particle));
    }

    performPerfectParry(defender, hit.attacker, hit.incomingDir);
    return true;
  }

  function performBreakParry(defender, attacker) {
    if (!defender || defender.skillMode !== 'parry' || !attacker ||
        defender.parryCooldown > 0 || defender.hitstunTime <= 0) return false;
    defender.parryCooldown = BREAK_PARRY_COOLDOWN;
    defender.hitstunTime = 0;
    defender.combatState = 'normal';
    defender.lastHitInfo = null;
    defender.breakParryTime = 0.34;
    defender.parryEffectTime = 0.34;
    defender.parryPerfect = false;
    const dir = attacker.x + attacker.width / 2 >= defender.x + defender.width / 2 ? 1 : -1;
    attacker.vx = dir * BREAK_PARRY_KNOCKBACK;
    damageTexts.push({x: attacker.x + attacker.width / 2, y: attacker.y - 13, text: '1', color: '#ffffff', life: 0.85, maxLife: 0.85});
    attacker.hp = Math.max(0, attacker.hp - 1);
    attacker.whiteHp = Math.max(attacker.whiteHp, attacker.hp + 1);
    spawnHitParticles(defender.x + defender.width / 2, defender.y + defender.height / 2);
    triggerImpact(3, 6);
    checkGameOver();
    return true;
  }

  function startParry() {
    if (!gameStarted || gameOver || !p1 || p1.hp <= 0 || p1.skillMode !== 'parry' ||
        p1.parryCooldown > 0 || p1.grabbed || p1.dash || p1.ultimateDash || p1.chargingHeavy) return;

    if (p1.hitstunTime > 0) {
      if (isIncomingThreatWithinParryWindow(p1)) {
        p1.parryCooldown = PARRY_COOLDOWN;
        p1.parryTime = PARRY_WINDOW;
        p1.parryEffectTime = PARRY_WINDOW;
        p1.parryPerfect = false;
        return;
      }
      if (tryLatePerfectParry(p1)) return;
      performBreakParry(p1, p2);
      return;
    }

    p1.parryCooldown = PARRY_COOLDOWN;
    p1.parryTime = PARRY_WINDOW;
    p1.parryEffectTime = PARRY_WINDOW;
    p1.parryPerfect = false;
  }

  function parryFollowupAttackFor(p) {
    const target = p === p1 ? p2 : p1;
    if (gameOver || p.hp <= 0 || p.skillMode !== 'parry' || isCrouching(p) ||
        p.hitstunTime > 0 || p.combatState === 'knockback' || p.grabbed ||
        p.dash || p.ultimateDash || target.hp <= 0) return;

    const attackerX = p.x + p.width / 2;
    const targetX = target.x + target.width / 2;
    const dir = targetX >= attackerX ? 1 : -1;
    const targetYCenter = target.y + target.height / 2;

    p.attackTime = 0;
    p.attackStartupTime = 0;
    p.attackType = 'counter';
    p.attackFacing = dir;
    spawnGoldSlash(targetX, targetYCenter);

    applyDamage(p, target, randomInt(100000, 150000), {
      dir,
      knockback: 0,
      launch: 0,
      stun: 2.0,
      attackClass: 'counter',
      attackerPush: 4,
      hitStop: 8,
      shake: 8,
      ignoreParry: true
    });
  }

  function executeParryFollowup(actor, key) {
    if (!actor || actor.skillMode !== 'parry') return false;
    if (key === 'j') {
      lightAttackFor(actor);
    } else if (key === 'k') {
      if (actor.heavyCooldown > 0) return false;
      startHeavyChargeFor(actor);
      if (actor.chargingHeavy) {
        actor.chargeTime = HEAVY_MAX_CHARGE;
        releaseHeavyChargeFor(actor);
      }
    } else if (key === 'l') {
      if (actor.ultimateCooldown > 0) return false;
      ultimateAttackFor(actor);
    } else if (key === 'i') {
      parryFollowupAttackFor(actor);
    } else {
      return false;
    }
    return true;
  }

  function chooseParryFollowup(key) {
    if (cinematicMode !== 'choice' || cinematicDefender !== p1) return false;
    if (!executeParryFollowup(p1, key)) {
      cinematicChoiceNotice = key === 'k' ? '重击冷却中' : '大招冷却中';
      cinematicChoiceNoticeTime = 0.8;
      return true;
    }
    cinematicMode = 'resuming';
    cinematicTimer = 0;
    cinematicChoiceNotice = '';
    return true;
  }

  // ===== COMBO 与伤害 =====
  function registerComboHit(attacker, target, isLightHit = false) {
    if (!attacker || !target) return;

    attacker.comboCount = (attacker.comboCount || 0) + 1;
    attacker.comboTimer = COMBO_TIMEOUT;
    attacker.comboTarget = target;

    if (!isLightHit) return;

    if (attacker.lightChainTarget && attacker.lightChainTarget !== target) {
      attacker.lightChainHits = 0;
      attacker.lightChainOverflow = false;
    }
    attacker.lightChainTarget = target;
    attacker.lightChainHits = (attacker.lightChainHits || 0) + 1;
    attacker.lightChainTimer = COMBO_TIMEOUT;

    if (attacker.lightChainHits >= LIGHT_CHAIN_LIMIT) {
      if (isCrouching(target)) {
        attacker.lightChainOverflow = true;
      } else {
        attacker.lightCooldown = Math.max(attacker.lightCooldown || 0, LIGHT_CHAIN_COOLDOWN);
        attacker.lightChainHits = 0;
        attacker.lightChainTimer = 0;
        attacker.lightChainTarget = null;
        attacker.lightChainOverflow = false;
      }
    }
  }

  function applyDamage(attacker, target, baseDamage, opt = {}) {
    if (gameOver || !target || target.hp <= 0) return 0;

    const incomingDir = opt.dir !== undefined
      ? opt.dir
      : ((target.x + target.width / 2) >= (attacker.x + attacker.width / 2) ? 1 : -1);

    if (target.skillMode === 'phase') {
      if (isPhased(target)) {
        if (target.phasePerfectWindow > 0) triggerPerfectPhase(target, attacker);
        return 0;
      }
    } else {
      if (!opt.ignoreParry && tryPerfectParry(target, attacker, incomingDir)) return 0;
    }

    const stateBeforeHit = {
      hpBefore: target.hp,
      whiteHpBefore: target.whiteHp,
      vxBefore: target.vx,
      vyBefore: target.vy,
      onGroundBefore: target.onGround,
      hitstunBefore: target.hitstunTime,
      combatStateBefore: target.combatState,
      knockbackAnimTimeBefore: target.knockbackAnimTime,
      flashTimeBefore: target.flashTime,
      chargingHeavyBefore: target.chargingHeavy,
      chargeTimeBefore: target.chargeTime,
      dashBefore: target.dash,
      attackTimeBefore: target.attackTime,
      attackStartupTimeBefore: target.attackStartupTime,
      attackTypeBefore: target.attackType,
      attackHitDoneBefore: target.attackHitDone,
      attackDurationBefore: target.attackDuration
    };
    target.lastHitInfo = null;

    const critical = opt.noCritical ? false : Math.random() < CRITICAL_RATE;
    const rawDamage = critical ? baseDamage * 2 : baseDamage;
    const damage = isCrouching(target) ? Math.round(rawDamage * 0.8) : rawDamage;
    const oldHp = target.hp;
    const realDamage = Math.min(oldHp, damage);

    target.hp = Math.max(0, oldHp - damage);
    target.whiteHp = Math.max(target.whiteHp, oldHp);

    const attackClass = opt.attackClass || (opt.comboType === 'light' ? 'light' : 'heavy');
    const canStunTarget = canAttackCauseStun(attackClass, target);
    if (realDamage > 0) registerComboHit(attacker, target, opt.lightChainHit === true);

    const cx = target.x + target.width / 2;
    const cy = target.y + target.height / 2;
    const hitDamageText = {
      x: cx,
      y: target.y - 13,
      text: realDamage.toLocaleString(),
      color: critical ? '#ff3030' : '#ffffff',
      life: 0.85,
      maxLife: 0.85
    };
    damageTexts.push(hitDamageText);

    target.flashTime = 0.05;
    const particleStart = particles.length;
    spawnHitParticles(cx, cy);
    const hitParticles = particles.slice(particleStart);

    const dir = opt.dir !== undefined
      ? opt.dir
      : (cx >= attacker.x + attacker.width / 2 ? 1 : -1);
    const hasHorizontalKnockback = opt.knockback > 0;

    if (!canStunTarget) {
      if (hasHorizontalKnockback) target.vx = dir * opt.knockback;
    } else if (attackClass === 'counter') {
      target.hitstunTime = Math.max(target.hitstunTime || 0, opt.stun || 2.0);
      target.combatState = 'stun';
      target.attackTime = 0;
      target.attackStartupTime = 0;
      target.chargingHeavy = false;
      target.chargeTime = 0;
      target.dash = null;
    } else if (attackClass === 'light') {
      if (hasHorizontalKnockback) target.vx = dir * opt.knockback;

      const targetIsGrounded = target.onGround &&
        Math.abs((target.y + target.height) - GROUND_Y) <= 1;

      if (targetIsGrounded) {
        target.hitstunTime = Math.max(target.hitstunTime || 0, opt.stun || LIGHT_STUN);
        target.combatState = 'stun';
      } else if ((opt.launch || 0) > 0 && hasHorizontalKnockback) {
        target.vy = -opt.launch;
        target.onGround = false;
        target.combatState = 'knockback';
        target.knockbackAnimTime = Math.max(target.knockbackAnimTime || 0, 0.42);
        target.hitstunTime = 0;
      } else {
        target.hitstunTime = Math.max(target.hitstunTime || 0, opt.stun || LIGHT_STUN);
        target.combatState = 'stun';
      }

      target.attackTime = 0;
      target.attackStartupTime = 0;
      target.chargingHeavy = false;
      target.chargeTime = 0;
      target.dash = null;

      if (targetIsGrounded) {
        target.lastHitInfo = {
          ...stateBeforeHit,
          attacker,
          incomingDir: dir,
          timeLeft: PARRY_LATE_GRACE,
          damageText: hitDamageText,
          hitParticles
        };
      }
    } else if (hasHorizontalKnockback || (opt.stun || 0) > 0) {
      if (hasHorizontalKnockback) target.vx = dir * opt.knockback;

      if ((opt.launch || 0) > 0 && hasHorizontalKnockback) {
        target.vy = -opt.launch;
        target.onGround = false;
        target.combatState = 'knockback';
        target.knockbackAnimTime = 0.42;
      } else {
        target.combatState = 'stun';
      }

      if ((opt.stun || 0) > 0) {
        target.hitstunTime = Math.max(target.hitstunTime || 0, opt.stun);
      }
      target.attackTime = 0;
      target.attackStartupTime = 0;
      target.chargingHeavy = false;
      target.chargeTime = 0;
      target.dash = null;

      if (attackClass !== 'counter') {
        target.lastHitInfo = {
          ...stateBeforeHit,
          attacker,
          incomingDir: dir,
          timeLeft: PARRY_LATE_GRACE,
          damageText: hitDamageText,
          hitParticles
        };
      }
    }

    if (opt.attackerPush) {
      attacker.x += dir * opt.attackerPush;
      clampX(attacker);
    }

    if (opt.hitStop > 0) triggerImpact(opt.hitStop, opt.shake || 4);
    checkGameOver();
    return realDamage;
  }

  // ===== 轻击 =====
  function lightAttackFor(p) {
    const target = p === p1 ? p2 : p1;
    if (p.lightChainOverflow && p.lightChainTarget === target && !isCrouching(target)) {
      if (p.lightChainHits >= LIGHT_CHAIN_LIMIT) {
        p.lightCooldown = Math.max(p.lightCooldown || 0, LIGHT_CHAIN_COOLDOWN);
        p.lightChainHits = 0;
        p.lightChainTimer = 0;
        p.lightChainTarget = null;
        p.lightChainOverflow = false;
      } else {
        p.lightChainOverflow = false;
      }
    }
    const sameTargetChain = p.lightChainTarget === target &&
      (p.lightChainTimer || 0) > 0 &&
      ((p.lightChainHits || 0) < LIGHT_CHAIN_LIMIT ||
       (p.lightChainOverflow && isCrouching(target)));

    if (gameOver || p.hp <= 0 || isCrouching(p) ||
        p.hitstunTime > 0 || p.combatState === 'knockback' ||
        p.grabbed || p.dash || p.ultimateDash || p.chargingHeavy ||
        p.attackTime > 0 || (p.lightCooldown > 0 && !sameTargetChain)) return;

    cancelPhaseForAttack(p);
    if (sameTargetChain) p.lightCooldown = 0;
    else p.lightCooldown = LIGHT_COOLDOWN;

    p.attackTime = LIGHT_WINDUP + LIGHT_DURATION;
    p.attackDuration = LIGHT_WINDUP + LIGHT_DURATION;
    p.attackStartupTime = LIGHT_WINDUP;
    p.attackType = 'light';
    p.attackFacing = p.facing;
    p.attackHitDone = false;
  }

  function lightAttackCanHit(attacker, target) {
    const dx = (target.x + target.width / 2) - (attacker.x + attacker.width / 2);
    const inFront = dx * attacker.attackFacing > 0;
    const verticalOverlap = attacker.y < target.y + target.height && attacker.y + attacker.height > target.y;
    return inFront && Math.abs(dx) <= 125 && verticalOverlap;
  }

  function applyClashDamage(attacker, target, baseDamage, dir, xKnockback, isLight = false) {
    if (!target || target.hp <= 0) return;
    if (target.skillMode === 'phase' && isPhased(target)) {
      if (target.phasePerfectWindow > 0) triggerPerfectPhase(target, attacker);
      return;
    }
    const critical = Math.random() < CRITICAL_RATE;
    const rawDamage = critical ? baseDamage * 2 : baseDamage;
    const damage = isCrouching(target) ? Math.round(rawDamage * 0.8) : rawDamage;
    const oldHp = target.hp;
    const realDamage = Math.min(oldHp, damage);

    target.hp = Math.max(0, oldHp - damage);
    target.whiteHp = Math.max(target.whiteHp, oldHp);
    if (realDamage > 0) registerComboHit(attacker, target, isLight);
    damageTexts.push({
      x: target.x + target.width / 2,
      y: target.y - 13,
      text: realDamage.toLocaleString(),
      color: critical ? '#ff3030' : '#ffffff',
      life: 0.85,
      maxLife: 0.85
    });
    target.flashTime = 0.05;
    spawnHitParticles(target.x + target.width / 2, target.y + target.height / 2);
    target.vx = dir * xKnockback;
    target.chargingHeavy = false;
    target.chargeTime = 0;
    target.dash = null;
  }

  function resolveLightAttacks() {
    for (const attacker of [p1, p2]) {
      if (attacker.attackTime <= 0 || attacker.attackStartupTime > 0 ||
          attacker.attackType !== 'light') continue;
      const centerX = attacker.x + attacker.width / 2;
      const centerY = attacker.y + attacker.height * 0.48;
      for (let i = pistolBullets.length - 1; i >= 0; i--) {
        const bullet = pistolBullets[i];
        if (bullet.attacker === attacker) continue;
        const dx = (bullet.x - centerX) * attacker.attackFacing;
        const dy = Math.abs(bullet.y - centerY);
        if (dx >= -bullet.r && dx <= 125 && dy <= 58 + bullet.r) {
          spawnClashEffect(bullet.x, bullet.y, 'bullet');
          for (let k = 0; k < 7; k++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = randomInt(80, 220);
            particles.push({
              x: bullet.x, y: bullet.y,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              size: randomInt(2, 4), life: 0.20, maxLife: 0.20,
              color: k % 2 ? '#facc15' : '#ffffff'
            });
          }
          pistolBullets.splice(i, 1);
        }
      }
    }

    const bothActive = p1.attackTime > 0 && p2.attackTime > 0 &&
      p1.attackStartupTime <= 0 && p2.attackStartupTime <= 0 &&
      p1.attackType === 'light' && p2.attackType === 'light' &&
      !p1.attackHitDone && !p2.attackHitDone;

    if (bothActive && !isPhased(p1) && !isPhased(p2) &&
        lightAttackCanHit(p1, p2) && lightAttackCanHit(p2, p1)) {
      p1.attackHitDone = true;
      p2.attackHitDone = true;
      const dir = (p2.x + p2.width / 2) >= (p1.x + p1.width / 2) ? 1 : -1;
      const clashX = (p1.x + p1.width / 2 + p2.x + p2.width / 2) / 2;
      const clashY = (p1.y + p1.height / 2 + p2.y + p2.height / 2) / 2;
      spawnClashEffect(clashX, clashY, 'light');
      applyClashDamage(p1, p2, randomInt(LIGHT_DAMAGE_MIN, LIGHT_DAMAGE_MAX), dir, 560, true);
      applyClashDamage(p2, p1, randomInt(LIGHT_DAMAGE_MIN, LIGHT_DAMAGE_MAX), -dir, 560, true);
      triggerImpact(5, 8);
      checkGameOver();
      return;
    }

    for (const attacker of [p1, p2]) {
      if (attacker.attackTime <= 0 || attacker.attackStartupTime > 0 || attacker.attackType !== 'light' || attacker.attackHitDone) continue;
      const target = attacker === p1 ? p2 : p1;
      if (!lightAttackCanHit(attacker, target)) continue;
      if (handlePhaseContact(attacker, target)) continue;
      attacker.attackHitDone = true;
      applyDamage(attacker, target, randomInt(LIGHT_DAMAGE_MIN, LIGHT_DAMAGE_MAX), {
        dir: attacker.attackFacing,
        knockback: 300,
        launch: LIGHT_LAUNCH,
        stun: LIGHT_STUN,
        attackerPush: 8,
        hitStop: 3,
        shake: 4,
        comboType: 'light',
        attackClass: 'light',
        lightChainHit: true
      });
    }
  }

  function lightAttack() { lightAttackFor(p1); }

  // ===== 重击 =====
  function startHeavyChargeFor(p) {
    if (gameOver || p.hp <= 0 || isCrouching(p) || p.heavyCooldown > 0 ||
        p.hitstunTime > 0 || p.combatState === 'knockback' || p.grabbed ||
        p.dash || p.ultimateDash || p.attackTime > 0) return;
    cancelPhaseForAttack(p);
    p.chargingHeavy = true;
    p.chargeTime = 0;
    p.attackFacing = p.facing;
  }

  function startHeavyCharge() { startHeavyChargeFor(p1); }

  function releaseHeavyChargeFor(p) {
    if (!p.chargingHeavy) return;
    p.chargingHeavy = false;
    if (gameOver || p.hp <= 0 || isCrouching(p)) { p.chargeTime = 0; return; }
    cancelPhaseForAttack(p);
    const charge = Math.min(1, p.chargeTime / HEAVY_MAX_CHARGE);
    p.chargeTime = 0;
    p.heavyCooldown = HEAVY_COOLDOWN;
    p.attackTime = 0.26;
    p.attackDuration = 0.26;
    p.attackType = 'heavy';
    p.attackFacing = p.facing;
    p.attackHitDone = false;
    const distance = 115 + charge * 155;
    const duration = 0.17 + charge * 0.10;
    p.dash = {dir: p.attackFacing, distance, moved: 0, speed: distance / duration, damageDone: false};
  }

  function releaseHeavyCharge() { releaseHeavyChargeFor(p1); }

  // ===== 手枪 =====
  function pistolAttackFor(p) {
    if (gameOver || p.hp <= 0 || isCrouching(p) || p.pistolCooldown > 0 ||
        p.hitstunTime > 0 || p.combatState === 'knockback' || p.grabbed ||
        p.dash || p.ultimateDash || p.chargingHeavy) return;

    cancelPhaseForAttack(p);
    p.pistolCooldown = PISTOL_COOLDOWN;
    const dir = p.facing;
    const x = p.x + p.width / 2 + dir * (p.width / 2 + 8);
    const y = p.y + p.height * 0.48;
    pistolBullets.push({
      attacker: p, x, y, vx: dir * PISTOL_SPEED, dir,
      r: 5, life: PISTOL_LIFE
    });

    for (let i = 0; i < 4; i++) {
      particles.push({
        x, y, vx: dir * (80 + i * 24), vy: (i - 1.5) * 28,
        size: 2 + (i % 2), life: 0.10, maxLife: 0.10, color: '#facc15'
      });
    }
  }

  function pistolAttack() { pistolAttackFor(p1); }

  // ===== 大招 =====
  function ultimateAttackFor(p) {
    if (gameOver || p.hp <= 0 || isCrouching(p) || p.ultimateCooldown > 0 ||
        p.hitstunTime > 0 || p.combatState === 'knockback' || p.grabbed ||
        p.dash || p.ultimateDash || p.chargingHeavy || p.attackTime > 0) return;

    cancelPhaseForAttack(p);
    p.ultimateCooldown = ULTIMATE_COOLDOWN;
    p.ultimateStateTime = ULTIMATE_DURATION + 0.10;
    p.attackFacing = p.facing;
    p.attackType = 'ultimate';
    p.attackTime = ULTIMATE_DURATION + 0.10;
    p.attackDuration = ULTIMATE_DURATION + 0.10;
    p.attackStartupTime = 0;
    p.ultimateDash = {
      dir: p.facing,
      distance: ULTIMATE_DISTANCE,
      moved: 0,
      speed: ULTIMATE_SPEED,
      damageDone: false
    };
  }

  function ultimateAttack() { ultimateAttackFor(p1); }

  // ===== AI 预测 =====
  function getAIIncomingThreat() {
    const threats = [];
    const p2x = p2.x + p2.width / 2;
    const p1x = p1.x + p1.width / 2;
    const dx = p2x - p1x;
    const verticalOverlap = p1.y < p2.y + p2.height && p1.y + p1.height > p2.y;

    if (p1.attackTime > 0 && p1.attackType === 'light' && lightAttackCanHit(p1, p2)) {
      threats.push({type: 'light', eta: Math.max(0, p1.attackStartupTime || 0)});
    }

    if (p1.dash && verticalOverlap) {
      const d = p1.dash;
      const gap = d.dir > 0
        ? p2.x - (p1.x + p1.width)
        : p1.x - (p2.x + p2.width);
      const remaining = Math.max(0, d.distance - d.moved);
      const toward = dx * d.dir > 0;
      const possibleReach = remaining + HEAVY_HIT_RANGE_X + p2.width;
      if (toward && gap <= possibleReach) {
        const eta = Math.max(0, gap - HEAVY_HIT_RANGE_X) / Math.max(1, d.speed);
        threats.push({type: 'heavy', eta});
      }
    }

    if (p1.chargingHeavy && verticalOverlap && dx * p1.attackFacing > 0 && Math.abs(dx) <= 380) {
      const chargeWait = Math.max(0, HEAVY_MAX_CHARGE - p1.chargeTime);
      const dashWait = Math.max(0, Math.abs(dx) - 105) / (MOVE_SPEED * 2.1);
      threats.push({type: 'charge', eta: chargeWait + dashWait});
    }

    for (const bullet of pistolBullets) {
      if (bullet.attacker !== p1) continue;
      const ahead = (p2x - bullet.x) * bullet.dir;
      const verticalGap = Math.abs((p2.y + p2.height / 2) - bullet.y);
      const maxX = Math.abs(bullet.vx) * 1.1 + p2.width / 2 + bullet.r;
      if (ahead >= -bullet.r && ahead <= maxX &&
          verticalGap <= p2.height / 2 + bullet.r + 8) {
        const eta = Math.max(0, ahead - bullet.r) / Math.max(1, Math.abs(bullet.vx));
        threats.push({type: 'pistol', eta});
      }
    }

    if (p1.ultimateDash) {
      const d = p1.ultimateDash;
      const gap = d.dir > 0
        ? p2.x - (p1.x + p1.width)
        : p1.x - (p2.x + p2.width);
      const reach = Math.max(0, d.distance - d.moved) + ULTIMATE_HIT_RANGE_X;
      if (gap <= reach && dx * d.dir > 0) {
        const eta = Math.max(0, gap - ULTIMATE_HIT_RANGE_X) / Math.max(1, d.speed);
        threats.push({type: 'ultimate', eta});
      }
    }

    if (!threats.length) return null;
    threats.sort((a, b) => a.eta - b.eta);
    return threats[0];
  }

  function setAICrouch(p, enabled) {
    if (p.crouching === enabled) return;
    p.crouching = enabled;
    setPlayerSize(p, enabled ? p.crouchW : p.normalW, enabled ? p.crouchH : p.normalH);
  }

  function chooseAIFollowupKey(actor) {
    const cfg = AI_LEVELS[aiDifficulty] || AI_LEVELS.normal;
    const target = actor === p1 ? p2 : p1;
    const dist = Math.abs((target.x + target.width / 2) - (actor.x + actor.width / 2));
    if (aiDifficulty === 'expert') {
      if (target.hp <= 320000 && actor.ultimateCooldown <= 0 && dist < 560) return 'l';
      if (Math.random() < 0.78) return 'i';
      if (actor.heavyCooldown <= 0 && dist > 125 && dist < 330) return 'k';
      if (dist <= 125) return 'j';
      return 'i';
    }
    if (aiDifficulty === 'master') {
      if (Math.random() < 0.62) return 'i';
      if (actor.ultimateCooldown <= 0 && dist < 520 && Math.random() < 0.55) return 'l';
      if (actor.heavyCooldown <= 0 && dist > 125 && dist < 330) return 'k';
      if (dist <= 125) return 'j';
      return 'i';
    }
    if (actor.ultimateCooldown <= 0 && dist < 520 && Math.random() < cfg.ultimateUse * 0.5) return 'l';
    if (actor.heavyCooldown <= 0 && dist > 125 && dist < 320) return 'k';
    if (dist <= 125) return 'j';
    return 'i';
  }

  // ===== AI：防反模式 =====
  function updateAIParry(dt) {
    if (!gameStarted || gameOver || p2.hp <= 0 || p2.grabbed || p2.ultimateDash || p2.combatState === 'knockback') return;
    if (aiDifficulty === 'dummy') return;

    const cfg = AI_LEVELS[aiDifficulty] || AI_LEVELS.normal;
    const dx = (p1.x + p1.width / 2) - (p2.x + p2.width / 2);
    const dist = Math.abs(dx);
    const toward = dx >= 0 ? 1 : -1;
    const away = -toward;
    p2.facing = toward;

    if (p2.hitstunTime > 0) {
      const pressure = getAIIncomingThreat() || p1.attackTime > 0 || !!p1.dash || p1.chargingHeavy;
      if (pressure && p2.parryCooldown <= 0 && cfg.breakChance > 0 &&
          Math.random() < Math.min(1, cfg.breakChance * dt * 22)) {
        performBreakParry(p2, p1);
      }
      return;
    }

    p2.aiThink -= dt;
    const threat = getAIIncomingThreat();

    const parryLead = cfg.parryLead + cfg.react * 0.22;
    if (threat && threat.eta <= parryLead && threat.eta >= -0.025 &&
        p2.parryCooldown <= 0 && p2.parryTime <= 0) {
      const chance = Math.min(1, cfg.parrySkill * dt * 30);
      if (Math.random() < chance) {
        p2.parryCooldown = PARRY_COOLDOWN;
        p2.parryTime = PARRY_WINDOW;
        p2.parryEffectTime = PARRY_WINDOW;
        p2.parryPerfect = false;
      }
    }

    let crouchNow = false;
    if (threat && p2.parryCooldown > 0 && threat.eta < 0.13 && cfg.crouchDefense > 0) {
      crouchNow = (threat.type === 'light' || threat.type === 'pistol' || threat.type === 'ultimate') &&
        Math.random() < cfg.crouchDefense;
    }
    setAICrouch(p2, crouchNow);

    if (threat && p2.parryCooldown > 0 && threat.eta < 0.22 &&
        (threat.type === 'heavy' || threat.type === 'charge' || threat.type === 'pistol' || threat.type === 'ultimate') &&
        p2.onGround && Math.random() < cfg.jumpDodge * dt * 18) {
      setAICrouch(p2, false);
      tryJump(p2);
    }

    const enemyDefenseActive = (p1.skillMode === 'parry' && p1.parryTime > 0) || isPhased(p1);
    let moveDir = 0;
    if (threat && p2.parryCooldown > 0 && threat.eta < 0.18) {
      moveDir = away;
    } else if (enemyDefenseActive && dist < cfg.preferredRange + 110) {
      moveDir = away;
    } else if (dist > cfg.preferredRange + 22) {
      moveDir = toward;
    } else if (dist < cfg.preferredRange - 34 && Math.random() < 0.18 + cfg.aggression * 0.18) {
      moveDir = away;
    }
    if (moveDir !== 0 && !p2.dash && !p2.chargingHeavy) {
      p2.x += moveDir * MOVE_SPEED * cfg.moveFactor * dt;
      clampX(p2);
    }

    if (p2.aiThink > 0) return;
    p2.aiThink = cfg.think * (0.82 + Math.random() * 0.36);

    if (enemyDefenseActive) return;

    if (p2.ultimateCooldown <= 0 && dist < 560 &&
        Math.random() < cfg.ultimateUse * cfg.aggression) {
      setAICrouch(p2, false);
      ultimateAttackFor(p2);
      return;
    }

    const targetIsCrouching = isCrouching(p1);
    const continuingCombo = p2.lightChainTarget === p1 && p2.lightChainTimer > 0 && p2.lightChainHits > 0;
    const shouldPressureCrouch = continuingCombo &&
      Math.random() < (cfg.comboPressure || 0);
    if (dist <= 125 && p2.attackTime <= 0 &&
        (!targetIsCrouching || shouldPressureCrouch) &&
        Math.random() < cfg.aggression) {
      setAICrouch(p2, false);
      lightAttackFor(p2);
      return;
    }

    if (dist < 340 && p2.heavyCooldown <= 0 && Math.random() < cfg.aggression * 0.82) {
      setAICrouch(p2, false);
      if (!p2.chargingHeavy) startHeavyChargeFor(p2);
      else if (p2.chargeTime >= HEAVY_MAX_CHARGE * cfg.chargeRelease) releaseHeavyChargeFor(p2);
      return;
    }

    if (dist > 125 && dist < 520 && p2.pistolCooldown <= 0 &&
        Math.random() < (cfg.pistolUse || 0.2) * cfg.aggression) {
      setAICrouch(p2, false);
      pistolAttackFor(p2);
      return;
    }
  }

  // ===== AI：虚化模式（保留，当前 AI 默认防反） =====
  function updateAIPhase(dt) {
    if (!gameStarted || gameOver || p2.hp <= 0 || p2.grabbed || p2.ultimateDash) return;
    if (aiDifficulty === 'dummy') return;
    const cfg = AI_LEVELS[aiDifficulty] || AI_LEVELS.normal;

    if (p2.hitstunTime > 0 || p2.combatState === 'stun' || p2.combatState === 'knockback') {
      if (p2.phaseCooldown <= 0 && !isPhased(p2)) {
        const escapeChance = Math.min(1, cfg.phaseSkill * dt * 30);
        if (Math.random() < escapeChance) activatePhaseFor(p2);
      }
      return;
    }

    if (p2.phaseBuffTime > 0 && p2.phaseEnhancedSlashReady) {
      phaseEnhancedSlashFor(p2);
      return;
    }

    const dx = (p1.x + p1.width / 2) - (p2.x + p2.width / 2);
    const dist = Math.abs(dx);
    const toward = dx >= 0 ? 1 : -1;
    const away = -toward;
    p2.facing = toward;

    p2.aiThink -= dt;
    const threat = getAIIncomingThreat();

    const phaseLead = cfg.phaseLead + cfg.react * 0.22;
    if (threat && threat.eta <= phaseLead && threat.eta >= -0.025 &&
        p2.phaseCooldown <= 0 && !isPhased(p2)) {
      const chance = Math.min(1, cfg.phaseSkill * dt * 30);
      if (Math.random() < chance) activatePhaseFor(p2);
    }

    let crouchNow = false;
    if (threat && p2.phaseCooldown > 0 && threat.eta < 0.13 && cfg.crouchDefense > 0) {
      crouchNow = (threat.type === 'light' || threat.type === 'pistol' || threat.type === 'ultimate') &&
        Math.random() < cfg.crouchDefense;
    }
    setAICrouch(p2, crouchNow);

    if (threat && p2.phaseCooldown > 0 && threat.eta < 0.22 &&
        (threat.type === 'heavy' || threat.type === 'charge' || threat.type === 'pistol' || threat.type === 'ultimate') &&
        p2.onGround && Math.random() < cfg.jumpDodge * dt * 18) {
      setAICrouch(p2, false);
      tryJump(p2);
    }

    const enemyPhaseActive = isPhased(p1) || (p1.skillMode === 'parry' && p1.parryTime > 0);
    let moveDir = 0;
    if (threat && p2.phaseCooldown > 0 && threat.eta < 0.18) {
      moveDir = away;
    } else if (enemyPhaseActive && dist < cfg.preferredRange + 110) {
      moveDir = away;
    } else if (dist > cfg.preferredRange + 22) {
      moveDir = toward;
    } else if (dist < cfg.preferredRange - 34 && Math.random() < 0.18 + cfg.aggression * 0.18) {
      moveDir = away;
    }
    if (moveDir !== 0 && !p2.dash && !p2.chargingHeavy) {
      const phaseSpeed = p2.phaseBuffTime > 0 ? 2 : 1;
      p2.x += moveDir * MOVE_SPEED * cfg.moveFactor * phaseSpeed * dt;
      clampX(p2);
    }

    if (p2.aiThink > 0) return;
    p2.aiThink = cfg.think * (0.82 + Math.random() * 0.36);

    if (enemyPhaseActive) return;

    if (p2.ultimateCooldown <= 0 && dist < 560 &&
        Math.random() < cfg.ultimateUse * cfg.aggression) {
      setAICrouch(p2, false);
      ultimateAttackFor(p2);
      return;
    }

    const targetIsCrouching = isCrouching(p1);
    const continuingCombo = p2.lightChainTarget === p1 && p2.lightChainTimer > 0 && p2.lightChainHits > 0;
    const shouldPressureCrouch = continuingCombo &&
      Math.random() < (cfg.comboPressure || 0);
    if (dist <= 125 && p2.attackTime <= 0 &&
        (!targetIsCrouching || shouldPressureCrouch) &&
        Math.random() < cfg.aggression) {
      setAICrouch(p2, false);
      lightAttackFor(p2);
      return;
    }

    if (dist < 340 && p2.heavyCooldown <= 0 && Math.random() < cfg.aggression * 0.82) {
      setAICrouch(p2, false);
      if (!p2.chargingHeavy) startHeavyChargeFor(p2);
      else if (p2.chargeTime >= HEAVY_MAX_CHARGE * cfg.chargeRelease) releaseHeavyChargeFor(p2);
      return;
    }

    if (dist > 125 && dist < 520 && p2.pistolCooldown <= 0 &&
        Math.random() < (cfg.pistolUse || 0.2) * cfg.aggression) {
      setAICrouch(p2, false);
      pistolAttackFor(p2);
      return;
    }
  }

  function updateAI(dt) {
    if (p2 && p2.skillMode === 'parry') updateAIParry(dt);
    else updateAIPhase(dt);
  }

  // ===== 重击对撞 =====
  function projectHeavyDash(attacker, dt) {
    const d = attacker.dash;
    const step = Math.min(Math.max(0, d.distance - d.moved), d.speed * dt);
    const nextX = Math.max(0, Math.min(W - attacker.width, attacker.x + d.dir * step));
    const moved = Math.abs(nextX - attacker.x);
    return {
      x: nextX,
      moved,
      hitbox: {
        x: nextX + (d.dir > 0 ? 0 : -HEAVY_HIT_RANGE_X),
        y: attacker.y,
        width: attacker.width + HEAVY_HIT_RANGE_X,
        height: attacker.height
      },
      body: {x: nextX, y: attacker.y, width: attacker.width, height: attacker.height}
    };
  }

  function resolveHeavyClash(dt) {
    if (!p1.dash || !p2.dash || isPhased(p1) || isPhased(p2)) return false;
    const d1 = p1.dash, d2 = p2.dash;
    if (d1.dir !== -d2.dir) return false;

    const a = projectHeavyDash(p1, dt);
    const b = projectHeavyDash(p2, dt);
    if (!rectsOverlap(a.hitbox, b.body) || !rectsOverlap(b.hitbox, a.body)) return false;

    p1.x = a.x;
    p2.x = b.x;
    dashTrails.push({x: p1.x + p1.width / 2 - d1.dir * 10, y: p1.y + p1.height * 0.55, dir: d1.dir, life: 0.34, maxLife: 0.34});
    dashTrails.push({x: p2.x + p2.width / 2 - d2.dir * 10, y: p2.y + p2.height * 0.55, dir: d2.dir, life: 0.34, maxLife: 0.34});

    p1.dash = null;
    p2.dash = null;
    const dir = (p2.x + p2.width / 2) >= (p1.x + p1.width / 2) ? 1 : -1;
    const clashX = (p1.x + p1.width / 2 + p2.x + p2.width / 2) / 2;
    const clashY = (p1.y + p1.height / 2 + p2.y + p2.height / 2) / 2;
    spawnClashEffect(clashX, clashY, 'heavy');
    applyClashDamage(p1, p2, randomInt(100000, 120000), dir, ULTIMATE_X_KNOCKBACK);
    applyClashDamage(p2, p1, randomInt(100000, 120000), -dir, ULTIMATE_X_KNOCKBACK);
    triggerImpact(10, 12);
    checkGameOver();
    return true;
  }

  // ===== 战斗更新 =====
  function updateCombat(dt) {
    if (dt <= 0 || gameOver) return;

    for (const p of [p1, p2]) {
      if (isPhased(p) && (p.attackTime > 0 || p.chargingHeavy || p.dash || p.ultimateDash)) {
        cancelPhaseForAttack(p);
      }
      p.phaseCooldown = Math.max(0, p.phaseCooldown - dt);
      p.phaseTime = Math.max(0, p.phaseTime - dt);
      p.phaseEmergencyInvulnTime = Math.max(0, (p.phaseEmergencyInvulnTime || 0) - dt);
      p.phasePerfectWindow = Math.max(0, p.phasePerfectWindow - dt);
      p.phaseBuffTime = Math.max(0, p.phaseBuffTime - dt);
      if (p.phaseTime <= 0 && p.phaseEmergencyInvulnTime <= 0) {
        p.phasePerfectWindow = 0;
        p.phaseBuffTime = 0;
        p.phaseEnhancedSlashReady = false;
      }

      p.parryCooldown = Math.max(0, p.parryCooldown - dt);
      p.parryTime = Math.max(0, p.parryTime - dt);
      p.breakParryTime = Math.max(0, (p.breakParryTime || 0) - dt);

      p.ultimateStateTime = Math.max(0, (p.ultimateStateTime || 0) - dt);
    }

    for (const p of [p1, p2]) {
      p.heavyCooldown = Math.max(0, p.heavyCooldown - dt);
      p.pistolCooldown = Math.max(0, (p.pistolCooldown || 0) - dt);
      p.ultimateCooldown = Math.max(0, p.ultimateCooldown - dt);
      p.lightCooldown = Math.max(0, p.lightCooldown - dt);
      p.comboTimer = Math.max(0, (p.comboTimer || 0) - dt);
      if (p.comboTimer <= 0) p.comboCount = 0;
      p.lightChainTimer = Math.max(0, (p.lightChainTimer || 0) - dt);
      if (p.lightChainTimer <= 0) {
        p.lightChainHits = 0;
        p.lightChainTarget = null;
        p.lightChainOverflow = false;
      } else if (p.lightChainOverflow && p.lightChainTarget && !isCrouching(p.lightChainTarget)) {
        if (p.lightChainHits >= LIGHT_CHAIN_LIMIT) {
          p.lightCooldown = Math.max(p.lightCooldown || 0, LIGHT_CHAIN_COOLDOWN);
          p.lightChainHits = 0;
          p.lightChainTimer = 0;
          p.lightChainTarget = null;
          p.lightChainOverflow = false;
        } else {
          p.lightChainOverflow = false;
        }
      }
      if (p.chargingHeavy) p.chargeTime = Math.min(HEAVY_MAX_CHARGE, p.chargeTime + dt);
    }

    resolveLightAttacks();
    if (gameOver) return;

    const heavyClashHandled = resolveHeavyClash(dt);
    if (!heavyClashHandled) for (const attacker of [p1, p2]) {
      if (!attacker.dash) continue;
      const target = attacker === p1 ? p2 : p1;
      const d = attacker.dash;
      const step = Math.min(d.distance - d.moved, d.speed * dt);
      const oldX = attacker.x;
      attacker.x += d.dir * step;
      clampX(attacker);
      const moved = Math.abs(attacker.x - oldX);
      d.moved += moved;
      dashTrails.push({x: attacker.x + attacker.width / 2 - d.dir * 10, y: attacker.y + attacker.height * 0.55, dir: d.dir, life: 0.34, maxLife: 0.34});
      const heavyHitbox = {
        x: attacker.x + (d.dir > 0 ? 0 : -HEAVY_HIT_RANGE_X),
        y: attacker.y,
        width: attacker.width + HEAVY_HIT_RANGE_X,
        height: attacker.height
      };
      if (rectsOverlap(heavyHitbox, target) && !d.damageDone) {
        if (handlePhaseContact(attacker, target)) {
          // 虚化穿过
        } else {
          d.damageDone = true;
          applyDamage(attacker, target, randomInt(100000, 120000), {
            dir: d.dir,
            knockback: HEAVY_KNOCKBACK,
            launch: HEAVY_LAUNCH,
            stun: 0.25,
            attackClass: 'heavy',
            attackerPush: 4,
            hitStop: 10,
            shake: 8
          });
          attacker.dash = null;
        }
      } else if (d.moved >= d.distance - 0.1 || moved + 0.1 < step) {
        attacker.dash = null;
      }
    }

    for (let i = pistolBullets.length - 1; i >= 0; i--) {
      const bullet = pistolBullets[i];
      bullet.x += bullet.vx * dt;
      bullet.life -= dt;

      const hitBox = {
        x: bullet.x - bullet.r,
        y: bullet.y - bullet.r,
        width: bullet.r * 2,
        height: bullet.r * 2
      };
      const target = bullet.attacker === p1 ? p2 : p1;
      if (rectsOverlap(hitBox, target)) {
        if (handlePhaseContact(bullet.attacker, target)) {
          // 虚化穿过
        } else {
          const targetIsGrounded = target.onGround || target.y + target.height >= GROUND_Y - 1;
          applyDamage(bullet.attacker, target,
            Math.round(randomInt(LIGHT_DAMAGE_MIN, LIGHT_DAMAGE_MAX) * PISTOL_DAMAGE_MULTIPLIER), {
              dir: bullet.dir,
              knockback: targetIsGrounded ? 500 : HEAVY_KNOCKBACK,
              launch: targetIsGrounded ? LIGHT_LAUNCH : HEAVY_LAUNCH,
              stun: 0.2,
              attackClass: 'bullet',
              attackerPush: 0,
              hitStop: 3,
              shake: 4
            });
          pistolBullets.splice(i, 1);
        }
      } else if (bullet.life <= 0 || bullet.x < -30 || bullet.x > W + 30) {
        pistolBullets.splice(i, 1);
      }
    }

    for (const attacker of [p1, p2]) {
      const d = attacker.ultimateDash;
      if (!d) continue;
      const target = attacker === p1 ? p2 : p1;
      const step = Math.min(Math.max(0, d.distance - d.moved), d.speed * dt);
      const oldX = attacker.x;
      attacker.x += d.dir * step;
      clampX(attacker);
      const moved = Math.abs(attacker.x - oldX);
      d.moved += moved;

      ultimateFlames.push({
        x: attacker.x + attacker.width / 2 - d.dir * 16,
        y: attacker.y + attacker.height * 0.52,
        dir: d.dir,
        size: 24 + Math.random() * 14,
        life: 0.24,
        maxLife: 0.24
      });

      const punchHitbox = {
        x: attacker.x + (d.dir > 0 ? 0 : -ULTIMATE_HIT_RANGE_X),
        y: attacker.y - 12,
        width: attacker.width + ULTIMATE_HIT_RANGE_X,
        height: attacker.height + 24
      };

      if (!d.damageDone && rectsOverlap(punchHitbox, target)) {
        if (handlePhaseContact(attacker, target)) {
          // 虚化穿过
        } else {
          d.damageDone = true;
          const heavyBaseDamage = randomInt(100000, 120000);
          applyDamage(attacker, target, heavyBaseDamage * ULTIMATE_DAMAGE_MULTIPLIER, {
            dir: d.dir,
            knockback: ULTIMATE_X_KNOCKBACK,
            launch: ULTIMATE_LAUNCH,
            stun: 1.0,
            attackClass: 'ultimate',
            attackerPush: 0,
            hitStop: 10,
            shake: 12
          });
          triggerImpact(10, 12);
        }
      }

      if (d.moved >= d.distance - 0.1 || moved + 0.1 < step || d.damageDone) {
        attacker.ultimateDash = null;
      }
    }
  }

  // ===== 特效更新 =====
  function updateEffects(worldDt, realDt) {
    for (const p of [p1, p2]) {
      if (worldDt > 0) {
        if (p.whiteHp > p.hp) {
          const k = Math.min(1, worldDt * 9);
          p.whiteHp += (p.hp - p.whiteHp) * k;
        }

        if (p.attackTime > 0) p.attackTime = Math.max(0, p.attackTime - worldDt);
        if (p.attackStartupTime > 0) p.attackStartupTime = Math.max(0, p.attackStartupTime - worldDt);
        if (p.knockbackAnimTime > 0) p.knockbackAnimTime = Math.max(0, p.knockbackAnimTime - worldDt);

        if (p.lastHitInfo) {
          p.lastHitInfo.timeLeft = Math.max(0, p.lastHitInfo.timeLeft - worldDt);
          if (p.lastHitInfo.timeLeft <= 0) p.lastHitInfo = null;
        }

        if (p.phaseBuffTime > 0) {
          p.phaseTrailTimer = (p.phaseTrailTimer || 0) - worldDt;
          if (p.phaseTrailTimer <= 0) {
            phaseTrails.push({
              owner: p,
              x: p.x,
              y: p.y,
              width: p.width,
              height: p.height,
              crouching: p.crouching,
              life: PHASE_TRAIL_LIFE,
              maxLife: PHASE_TRAIL_LIFE
            });
            p.phaseTrailTimer = PHASE_TRAIL_INTERVAL;
          }
        } else if (p.phaseBuffTime <= 0) {
          p.phaseTrailTimer = 0;
        }
      }

      p.flashTime = Math.max(0, p.flashTime - realDt);
      p.parryEffectTime = Math.max(0, p.parryEffectTime - realDt);
      p.breakParryTime = Math.max(0, p.breakParryTime - realDt);
      if (p.parryEffectTime <= 0) p.parryPerfect = false;
    }

    for (const trail of phaseTrails) trail.life -= realDt;
    phaseTrails = phaseTrails.filter(trail => trail.life > 0);

    for (const t of damageTexts) {
      t.y -= 42 * worldDt;
      t.life -= realDt;
    }
    damageTexts = damageTexts.filter(t => t.life > 0);

    for (const q of particles) {
      q.x += q.vx * realDt;
      q.y += q.vy * realDt;
      q.vx *= Math.pow(0.12, realDt);
      q.vy *= Math.pow(0.12, realDt);
      q.life -= realDt;
    }
    particles = particles.filter(q => q.life > 0);

    for (const t of dashTrails) t.life -= realDt;
    dashTrails = dashTrails.filter(t => t.life > 0);

    for (const f of ultimateFlames) f.life -= realDt;
    ultimateFlames = ultimateFlames.filter(f => f.life > 0);

    for (const s of phaseSlashes) s.life -= realDt;
    phaseSlashes = phaseSlashes.filter(s => s.life > 0);

    for (const s of goldSlashes) s.life -= realDt;
    goldSlashes = goldSlashes.filter(s => s.life > 0);

    for (const eye of phaseEyes) eye.life -= realDt;
    phaseEyes = phaseEyes.filter(eye => eye.life > 0);

    for (const e of clashEffects) e.life -= realDt;
    clashEffects = clashEffects.filter(e => e.life > 0);

    cameraShakeTime = Math.max(0, cameraShakeTime - realDt);
    if (cameraShakeTime <= 0) cameraShakePower = 0;
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x + radius, y + h, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1224');
    g.addColorStop(0.62, '#0f172a');
    g.addColorStop(1, '#0a0f1d');

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= W; x += 60) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GROUND_Y);
    }
    for (let y = 0; y <= GROUND_Y; y += 60) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#111a2e';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    const glow = ctx.createRadialGradient(
      W / 2, GROUND_Y - 30, 20,
      W / 2, GROUND_Y - 30, W * 0.65
    );
    glow.addColorStop(0, 'rgba(74, 222, 128, 0.06)');
    glow.addColorStop(1, 'rgba(74, 222, 128, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, GROUND_Y);
  }

  function drawShadow(p) {
    const altitude = Math.max(0, GROUND_Y - (p.y + p.height));
    const alpha = Math.max(0.08, 0.34 - altitude * 0.00035);
    const rx = p.width * 0.52 + altitude * 0.08;
    const ry = 6 + p.width * 0.06;

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(
      p.x + p.width / 2,
      GROUND_Y + 5,
      rx,
      ry,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(p) {
    const r = p.crouching ? 7 : 9;
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;

    ctx.save();

    if (p.phaseBuffTime > 0) {
      for (const trail of phaseTrails) {
        if (trail.owner !== p) continue;
        const alpha = Math.max(0, trail.life / trail.maxLife) * 0.24;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 18;
        roundRect(trail.x, trail.y, trail.width, trail.height, trail.crouching ? 7 : 9);
        ctx.fillStyle = 'rgba(147, 51, 234, 0.58)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(216, 180, 254, 0.82)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }

    if (p.grabbed) {
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(p.grabbed.elapsed * 25) * 0.28);
      ctx.translate(-cx, -cy);
    } else if (p.combatState === 'knockback') {
      const tilt = Math.max(-0.48, Math.min(0.48, (p.vx || 0) / 1200));
      ctx.translate(cx, cy);
      ctx.rotate(tilt + Math.sin((p.knockbackAnimTime || 0) * 22) * 0.16);
      ctx.translate(-cx, -cy);
    }

    ctx.globalAlpha = isPhased(p) ? 0.5 : 1;

    const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.height);
    grad.addColorStop(0, p.lightColor);
    grad.addColorStop(1, p.color);

    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.crouching ? 12 : 18;
    roundRect(p.x, p.y, p.width, p.height, r);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    if (p.flashTime > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.flashTime / 0.05);
      roundRect(p.x, p.y, p.width, p.height, r);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    roundRect(p.x, p.y, p.width, p.height, r);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    roundRect(
      p.x + 4,
      p.y + 4,
      p.width - 8,
      Math.max(3, Math.min(9, p.height * 0.22)),
      Math.max(3, r - 4)
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fill();
    ctx.restore();

    const eyeY = p.y + p.height * 0.4;
    const eyeSpacing = p.width * 0.16;
    const eyeR = Math.max(2.2, Math.min(4.6, p.width * 0.075));
    const pupilOffset = p.facing * eyeR * 0.4;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
    ctx.arc(cx + eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx - eyeSpacing + pupilOffset, eyeY, eyeR * 0.46, 0, Math.PI * 2);
    ctx.arc(cx + eyeSpacing + pupilOffset, eyeY, eyeR * 0.46, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
    ctx.fillText(p.isLeft ? 'P1' : 'P2', cx, p.y - 8);

    ctx.restore();
  }

  function drawAttackEffect(p) {
    if (p.attackTime <= 0) return;

    const progress = 1 - p.attackTime / p.attackDuration;
    const alpha = Math.sin(progress * Math.PI);

    const cx = p.x + p.width / 2;
    const cy = p.y + p.height * 0.48;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(p.attackFacing, 1);
    ctx.globalAlpha = alpha;

    if (p.attackType === 'counter') {
      const isParryCounter = p.skillMode === 'parry';
      ctx.shadowColor = isParryCounter ? '#facc15' : '#c084fc';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = isParryCounter ? '#fde68a' : '#d8b4fe';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4, 28);
      ctx.quadraticCurveTo(48, -58, 100, -12);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(12, 25);
      ctx.quadraticCurveTo(52, -42, 92, -10);
      ctx.stroke();
    } else if (p.attackType === 'ultimate') {
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 30;
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(112, 0);
      ctx.stroke();
      ctx.shadowColor = '#fef3c7';
      ctx.strokeStyle = '#fff7ed';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(10, -4);
      ctx.lineTo(102, -4);
      ctx.stroke();
    } else if (p.attackType === 'light') {
      ctx.shadowColor = '#e0f2fe';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(12, -43);
      ctx.quadraticCurveTo(91, 0, 12, 43);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, -34);
      ctx.quadraticCurveTo(77, 0, 20, 34);
      ctx.stroke();
    } else {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(4, -34);
      ctx.lineTo(76, 25);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPhaseEyes() {
    for (const eye of phaseEyes) {
      const elapsed = eye.maxLife - eye.life;
      const progress = Math.max(0, Math.min(1, elapsed / eye.maxLife));
      const fadeInTime = eye.fadeIn || 0;
      const appear = fadeInTime > 0 ? Math.min(1, elapsed / fadeInTime) : 1;
      const fadeOut = Math.max(0, 1 - Math.max(0, progress - (fadeInTime / eye.maxLife)) * 1.15);
      const alpha = appear * fadeOut;
      const spread = eye.color === '#ef4444'
        ? 0.72 + Math.min(1, elapsed / Math.max(0.01, fadeInTime)) * 0.45
        : 1 + progress * 2.2;
      const main = eye.color || '#a855f7';
      const pale = eye.color === '#ef4444' ? '#fecaca' : '#e9d5ff';
      const inner = eye.color === '#ef4444' ? '#991b1b' : '#7e22ce';

      ctx.save();
      ctx.translate(eye.x, eye.y);
      ctx.scale(spread, spread);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = main;
      ctx.shadowBlur = eye.color === '#ef4444' ? 30 : 26;
      ctx.strokeStyle = main;
      ctx.lineWidth = 3 * (1 - progress * 0.55);
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.quadraticCurveTo(0, -19, 25, 0);
      ctx.quadraticCurveTo(0, 19, -25, 0);
      ctx.stroke();
      ctx.fillStyle = eye.color === '#ef4444'
        ? 'rgba(239, 68, 68, 0.20)'
        : 'rgba(168, 85, 247, 0.18)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 7 + progress * 5, 0, Math.PI * 2);
      ctx.fillStyle = pale;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 3.2 + progress * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = inner;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParryEffect(p) {
    if (!p || p.skillMode !== 'parry') return;

    const breakActive = p.breakParryTime > 0;
    const active = p.parryTime > 0;
    const perfect = p.parryEffectTime > 0 && p.parryPerfect;
    if (!active && !perfect && !breakActive) return;

    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;

    ctx.save();
    ctx.translate(cx, cy);

    if (breakActive) {
      const progress = 1 - p.breakParryTime / 0.34;
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = '#fb334b';
      ctx.fillStyle = 'rgba(239,68,68,0.20)';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.ellipse(0, 0, 28 + progress * 55, 34 + progress * 55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (perfect) {
      const progress = 1 - p.parryEffectTime / PARRY_EFFECT_DURATION;
      const radius = 25 + progress * 58;
      const alpha = Math.max(0, 1 - progress);

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 5 * (1 - progress) + 1;
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 26;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(0, 0, 23 + progress * 22, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const progress = Math.max(0, p.parryTime / PARRY_WINDOW);
      ctx.globalAlpha = 0.35 + 0.65 * progress;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.ellipse(0, 0, 35, 39, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawDashTrails() {
    for (const t of dashTrails) {
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.translate(t.x, t.y);
      ctx.scale(t.dir, 1);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 13;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 * alpha + 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.quadraticCurveTo(-5, -7, 23, 1);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawUltimateFlames() {
    for (const f of ultimateFlames) {
      const alpha = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.88;
      ctx.translate(f.x, f.y);
      ctx.scale(f.dir, 1);
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 22;
      ctx.lineCap = 'round';

      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = f.size * 0.42 * alpha;
      ctx.beginPath();
      ctx.moveTo(-f.size * 1.7, -f.size * 0.5);
      ctx.quadraticCurveTo(-f.size * 0.5, 0, f.size * 0.35, -f.size * 0.08);
      ctx.stroke();

      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = f.size * 0.20 * alpha;
      ctx.beginPath();
      ctx.moveTo(-f.size * 1.2, f.size * 0.35);
      ctx.quadraticCurveTo(-f.size * 0.2, -f.size * 0.18, f.size * 0.55, 0);
      ctx.stroke();

      ctx.strokeStyle = '#fff7ed';
      ctx.lineWidth = Math.max(1.5, f.size * 0.08 * alpha);
      ctx.beginPath();
      ctx.moveTo(-f.size * 0.7, 0);
      ctx.lineTo(f.size * 0.4, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPhaseSlashes() {
    for (const s of phaseSlashes) {
      const progress = 1 - s.life / s.maxLife;
      const alpha = Math.max(0, 1 - progress);
      const halfLength = 62 + progress * 8;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.lineCap = 'round';

      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 13 * (1 - progress * 0.55);
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.moveTo(-halfLength, -5);
      ctx.lineTo(halfLength, 5);
      ctx.stroke();

      ctx.strokeStyle = '#f3e8ff';
      ctx.lineWidth = 4 * (1 - progress * 0.45);
      ctx.shadowColor = '#e9d5ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-halfLength + 5, -5);
      ctx.lineTo(halfLength - 5, 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawGoldSlashes() {
    for (const s of goldSlashes) {
      const progress = 1 - s.life / s.maxLife;
      const alpha = Math.max(0, 1 - progress);
      const halfLength = 62 + progress * 8;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.lineCap = 'round';

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 13 * (1 - progress * 0.55);
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.moveTo(-halfLength, -5);
      ctx.lineTo(halfLength, 5);
      ctx.stroke();

      ctx.strokeStyle = '#fff7c2';
      ctx.lineWidth = 4 * (1 - progress * 0.45);
      ctx.shadowColor = '#fff1a6';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-halfLength + 5, -5);
      ctx.lineTo(halfLength - 5, 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawClashEffects() {
    for (const e of clashEffects) {
      const progress = 1 - e.life / e.maxLife;
      const alpha = Math.max(0, 1 - progress);
      const heavy = e.type === 'heavy';
      const bullet = e.type === 'bullet';
      const length = (heavy ? 48 : bullet ? 28 : 36) + progress * (heavy ? 28 : bullet ? 18 : 18);
      const width = (heavy ? 12 : bullet ? 9 : 7) * (1 - progress * 0.55);
      const outer = heavy ? '#fbbf24' : bullet ? '#facc15' : '#7dd3fc';
      const inner = heavy ? '#fff7c2' : '#ffffff';

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.lineCap = 'round';
      ctx.shadowColor = outer;
      ctx.shadowBlur = heavy ? 26 : 18;
      ctx.strokeStyle = outer;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(-length, -length * 0.62);
      ctx.lineTo(length, length * 0.62);
      ctx.moveTo(-length, length * 0.62);
      ctx.lineTo(length, -length * 0.62);
      ctx.stroke();

      ctx.shadowColor = inner;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = inner;
      ctx.lineWidth = Math.max(2, width * 0.32);
      ctx.beginPath();
      ctx.moveTo(-length * 0.82, -length * 0.5);
      ctx.lineTo(length * 0.82, length * 0.5);
      ctx.moveTo(-length * 0.82, length * 0.5);
      ctx.lineTo(length * 0.82, -length * 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawChargeEffect() {
    for (const p of [p1, p2]) {
      if (!p.chargingHeavy) continue;
      const ratio = Math.min(1, p.chargeTime / HEAVY_MAX_CHARGE);
      const cx = p.x + p.width / 2;
      const cy = p.y - 13;

      ctx.save();
      ctx.globalAlpha = 0.55 + ratio * 0.45;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8 + ratio * 15;
      ctx.beginPath();
      ctx.arc(cx, cy, 10 + ratio * 13, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(cx - 20, cy - 23, 40 * ratio, 3);
      ctx.restore();
    }
  }

  function drawPistolBullets() {
    for (const b of pistolBullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.dir, 1);
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(250,204,21,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-b.r * 4, 0);
      ctx.lineTo(-b.r * 0.8, 0);
      ctx.stroke();
      ctx.fillStyle = '#fff7ae';
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const q of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, q.life / q.maxLife);
      ctx.fillStyle = q.color || '#ffffff';
      ctx.shadowColor = q.color || '#ffffff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDamageTexts() {
    ctx.save();
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const t of damageTexts) {
      ctx.globalAlpha = Math.min(1, t.life / t.maxLife);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function drawHealthBar(p, x, y, w, h, isLeft, name) {
    const hpRatio = Math.max(0, Math.min(1, p.hp / p.maxHp));
    const whiteRatio = Math.max(
      0,
      Math.min(1 - hpRatio, (p.whiteHp - p.hp) / p.maxHp)
    );
    const redW = w * hpRatio;
    const whiteW = w * whiteRatio;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    roundRect(x, y, w, h, 7);
    ctx.fill();

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 8;

    if (isLeft) {
      ctx.fillRect(x, y, redW, h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + redW, y, whiteW, h);
    } else {
      ctx.fillRect(x + w - redW, y, redW, h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + w - redW - whiteW, y, whiteW, h);
    }
    ctx.restore();

    roundRect(x, y, w, h, 7);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = isLeft ? 'left' : 'right';
    ctx.fillText(name + '  ' + p.hp.toLocaleString(), isLeft ? x : x + w, y - 4);
    if (p.comboCount > 0) {
      const ratio = Math.max(0, Math.min(1, (p.comboCount - 1) / 24));
      const r = 255;
      const g = Math.round(220 * (1 - ratio) + 35 * ratio);
      const b = Math.round(35 * (1 - ratio));
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 7;
      ctx.fillText(p.comboCount + ' COMBO', isLeft ? x : x + w, y + h + 5);
    }
    ctx.restore();
  }

  function updateSkillHUD() {
    const bar = document.getElementById('skillBar');
    if (bar) bar.style.display = gameStarted ? 'flex' : 'none';

    const card = document.getElementById('skillSpaceCard');
    const nameEl = document.getElementById('skillSpaceName');
    const phaseIcon = document.getElementById('skillPhaseIcon');
    const parryIcon = document.getElementById('skillParryIcon');

    if (p1) {
      const isParry = p1.skillMode === 'parry';
      if (card) {
        card.classList.toggle('parry', isParry);
        card.classList.toggle('phase', !isParry);
      }
      if (nameEl) nameEl.textContent = isParry ? '防反' : '虚化';
      if (phaseIcon) phaseIcon.style.display = isParry ? 'none' : '';
      if (parryIcon) parryIcon.style.display = isParry ? '' : 'none';
    }

    const entries = [
      ['skillLight', p1 ? p1.lightCooldown : 0],
      ['skillPistol', p1 ? p1.pistolCooldown : 0],
      ['skillHeavy', p1 ? p1.heavyCooldown : 0],
      ['skillUltimate', p1 ? p1.ultimateCooldown : 0],
      ['skillSpace', p1 ? (p1.skillMode === 'parry' ? p1.parryCooldown : p1.phaseCooldown) : 0]
    ];
    for (const [id, remaining] of entries) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (remaining <= 0.001) {
        el.textContent = '就绪';
        el.classList.add('ready');
        el.classList.remove('cooling');
      } else {
        el.textContent = remaining.toFixed(1) + 's';
        el.classList.add('cooling');
        el.classList.remove('ready');
      }
    }

    const spaceEl = document.getElementById('skillSpace');
    if (spaceEl && p1 && p1.skillMode === 'phase') {
      if (p1.phaseBuffTime > 0) {
        spaceEl.textContent = '强化 ' + p1.phaseBuffTime.toFixed(1) + 's';
        spaceEl.classList.add('cooling');
        spaceEl.classList.remove('ready');
      } else if (p1.phaseEmergencyInvulnTime > 0) {
        spaceEl.textContent = '脱身 ' + p1.phaseEmergencyInvulnTime.toFixed(1) + 's';
        spaceEl.classList.add('cooling');
        spaceEl.classList.remove('ready');
      } else if (p1.phaseTime > 0) {
        spaceEl.textContent = '虚化 ' + p1.phaseTime.toFixed(1) + 's';
        spaceEl.classList.add('cooling');
        spaceEl.classList.remove('ready');
      }
    }
  }

  function drawFightHUD() {
    updateSkillHUD();
    drawHealthBar(p1, 28, 27, 360, 18, true, 'P1');
    drawHealthBar(p2, W - 28 - 360, 27, 360, 18, false, 'P2');

    ctx.save();
    ctx.fillStyle = 'rgba(8, 15, 30, 0.95)';
    roundRect(W / 2 - 55, 8, 110, 47, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('TIME', W / 2, 20);

    ctx.font = 'bold 23px system-ui, sans-serif';
    ctx.fillStyle = remainTime <= 10 ? '#f87171' : '#ffffff';
    ctx.fillText(remainTime.toFixed(1) + 's', W / 2, 40);
    ctx.restore();
  }

  function drawResult() {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    roundRect(W / 2 - 180, H / 2 - 65, 360, 130, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(resultText, W / 2, H / 2 - 15);

    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('按 R 重新开始', W / 2, H / 2 + 35);
    ctx.restore();
  }

  function drawCinematicChoice() {
    if (cinematicMode !== 'choice') return;
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 18, 0.68)';
    ctx.fillRect(0, 0, W, H);

    const panelW = 650, panelH = 218;
    const x = (W - panelW) / 2, y = H - panelH - 34;
    ctx.fillStyle = 'rgba(8, 15, 30, 0.96)';
    roundRect(x, y, panelW, panelH, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.82)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 25px system-ui, sans-serif';
    const playerChooses = cinematicDefender === p1;
    ctx.fillText(playerChooses ? '完美防反！选择追击方式' : 'AI 完美防反！正在选择追击', W / 2, y + 34);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(playerChooses ? '时间已暂停 · 按对应按键确认，确认后时间恢复' : '时间已暂停 · AI 将自动选择反击方式', W / 2, y + 62);

    const options = [
      {key:'J', name:'轻击', desc:'快速近身打击', color:'#e2e8f0'},
      {key:'K', name:'重击', desc:(cinematicDefender || p1).heavyCooldown > 0 ? '冷却中' : '满蓄力突进', color:'#60a5fa', disabled:(cinematicDefender || p1).heavyCooldown > 0},
      {key:'L', name:'大招', desc:(cinematicDefender || p1).ultimateCooldown > 0 ? '冷却中' : '高速火焰冲拳', color:'#fb923c', disabled:(cinematicDefender || p1).ultimateCooldown > 0},
      {key:'I', name:'反击斩', desc:'中距离追加伤害', color:'#facc15'}
    ];
    const gap = 10, cardW = 148, cardH = 88;
    const totalW = cardW * 4 + gap * 3;
    const sx = (W - totalW) / 2;
    for (let i = 0; i < options.length; i++) {
      const o = options[i], cx = sx + i * (cardW + gap), cy = y + 91;
      ctx.globalAlpha = o.disabled ? 0.42 : 1;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.96)';
      roundRect(cx, cy, cardW, cardH, 10);
      ctx.fill();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = o.color;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(o.key, cx + cardW / 2, cy + 19);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillText(o.name, cx + cardW / 2, cy + 43);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(o.desc, cx + cardW / 2, cy + 67);
      ctx.globalAlpha = 1;
    }

    if (cinematicChoiceNoticeTime > 0 && cinematicChoiceNotice) {
      ctx.fillStyle = '#fca5a5';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(cinematicChoiceNotice, W / 2, y + panelH - 10);
    }
    ctx.restore();
  }

  function draw() {
    ctx.save();

    if (cameraShakeTime > 0) {
      const ratio = cameraShakeTime / 0.15;
      const power = cameraShakePower * ratio * ratio;
      ctx.translate((Math.random() * 2 - 1) * power, (Math.random() * 2 - 1) * power);
    }

    drawBackground();
    drawDashTrails();
    drawUltimateFlames();
    drawPistolBullets();
    drawShadow(p1);
    drawShadow(p2);
    drawPhaseEyes();
    drawPlayer(p2);
    drawPlayer(p1);
    drawParryEffect(p1);
    drawParryEffect(p2);
    drawAttackEffect(p2);
    drawAttackEffect(p1);
    drawPhaseSlashes();
    drawGoldSlashes();
    drawClashEffects();
    drawChargeEffect();
    drawParticles();
    drawDamageTexts();
    ctx.restore();

    drawFightHUD();
    if (cinematicMode === 'choice') drawCinematicChoice();
    if (gameOver) drawResult();
  }

  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.033);
    lastTime = now;

    let cinematicScale = 1;
    if (cinematicMode === 'slowing') {
      cinematicTimer += dt;
      cinematicScale = Math.max(0, 1 - cinematicTimer / CINEMATIC_SLOW_DURATION);
      if (cinematicTimer >= CINEMATIC_SLOW_DURATION) {
        cinematicMode = 'choice';
        cinematicTimer = 0;
        cinematicScale = 0;
      }
    } else if (cinematicMode === 'choice') {
      cinematicScale = 0;
      if (cinematicDefender === p2) {
        cinematicAIWait -= dt;
        if (cinematicAIWait <= 0) {
          setAICrouch(p2, false);
          const aiKey = chooseAIFollowupKey(p2);
          executeParryFollowup(p2, aiKey);
          cinematicMode = 'resuming';
          cinematicTimer = 0;
        }
      }
    } else if (cinematicMode === 'resuming') {
      cinematicTimer += dt;
      cinematicScale = Math.min(1, cinematicTimer / CINEMATIC_RESUME_DURATION);
      if (cinematicTimer >= CINEMATIC_RESUME_DURATION) {
        cinematicMode = null;
        cinematicTimer = 0;
        cinematicDefender = null;
        cinematicScale = 1;
      }
    }

    let worldDt = gameStarted ? dt * cinematicScale : 0;
    if (cinematicMode === 'choice') worldDt = 0;
    if (hitStopTime > 0 && worldDt > 0) {
      hitStopTime = Math.max(0, hitStopTime - dt);
      worldDt = 0;
    }

    if (!gameOver && worldDt > 0) {
      updatePlayer(p1, worldDt, true);
      updatePlayer(p2, worldDt, false);
      updateAI(worldDt);
      updateCombat(worldDt);
      resolvePlayerCollision();

      remainTime = Math.max(0, remainTime - worldDt);
      if (remainTime <= 0) checkGameOver();
    }

    updateEffects(worldDt, dt);
    cinematicChoiceNoticeTime = Math.max(0, cinematicChoiceNoticeTime - dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ===== 键盘输入 =====
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();

    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === ' ') {
        e.preventDefault();
      }
    }

    if (k === 'r' && !e.repeat && gameStarted && cinematicMode !== 'choice') {
      resetGame();
      return;
    }
    if (!gameStarted) return;

    if (cinematicMode === 'choice') {
      if (cinematicDefender === p1 && !e.repeat && chooseParryFollowup(k)) e.preventDefault();
      return;
    }

    if (k === 'w' && !e.repeat) tryJump(p1);
    if (k === ' ' && !e.repeat) {
      if (p1.skillMode === 'parry') startParry();
      else startPhase();
    }
    if (k === 'j' && !e.repeat) lightAttack();
    if (k === 'i' && !e.repeat) pistolAttack();
    if (k === 'k' && !e.repeat) startHeavyCharge();
    if (k === 'l' && !e.repeat) ultimateAttack();

    keys[k] = true;
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'k') releaseHeavyCharge();
    keys[k] = false;
  });

  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    if (p1) {
      p1.chargingHeavy = false;
      p1.chargeTime = 0;
    }
  });

  // ===== 开始界面 =====
  resetGame();
  gameStarted = false;

  const startButton = document.getElementById('startButton');
  const difficultySelect = document.getElementById('difficulty');
  const skillModeSelect = document.getElementById('skillMode');
  const startScreen = document.getElementById('startScreen');
  const spaceHelp = document.getElementById('spaceHelp');

  function updateSpaceHelpText() {
    if (!spaceHelp || !p1) return;
    spaceHelp.textContent = p1.skillMode === 'parry'
      ? '防反 / 僵直脱困'
      : '虚化 / 受击脱身 / 强化斩击';
  }

  if (startButton) startButton.addEventListener('click', () => {
    aiDifficulty = difficultySelect ? difficultySelect.value : 'normal';
    playerSkillMode = skillModeSelect ? skillModeSelect.value : 'parry';
    resetGame();
    gameStarted = true;
    updateSpaceHelpText();
    if (startScreen) startScreen.classList.add('hidden');
  });

  const backButton = document.getElementById('menuButton');
  if (backButton) backButton.addEventListener('click', () => {
    gameStarted = false;
    if (startScreen) startScreen.classList.remove('hidden');
  });

  requestAnimationFrame(loop);
})();