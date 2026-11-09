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
  const LIGHT_DURATION = 0.18;
  const LIGHT_COOLDOWN = 0.1;
  const LIGHT_DAMAGE_MIN = 40000;
  const LIGHT_DAMAGE_MAX = 48000;
  const HEAVY_HIT_RANGE_X = 48;
  const COUNTER_SLASH_DURATION = 0.3;
  const HEAVY_COOLDOWN = 1.5;
  const HEAVY_MAX_CHARGE = 0.25;
  const ULTIMATE_COOLDOWN = 45;
  const FIREBALL_SPEED = MOVE_SPEED * 1.2;
  const CRITICAL_RATE = 0.1;
  const PARRY_COOLDOWN = 13;
  const PERFECT_PARRY_COOLDOWN = 5;
  const BREAK_PARRY_COOLDOWN = 18;
  const PARRY_WINDOW = 0.36; // 略微放宽普通防反窗口
  const PARRY_LATE_GRACE = 0.22; // 受击后的短暂宽限：刚被打中时按空格可补判为完美防反
  const PARRY_THREAT_BUFFER = 0.12; // 对正在接近的攻击增加少量预判距离
  const PARRY_EFFECT_DURATION = 0.34;
  const PARRY_DAMAGE_MIN = 10000;
  const PARRY_DAMAGE_MAX = 20000;
  const LIGHT_LAUNCH = 180;
  const HEAVY_LAUNCH = 500;
  const ULTIMATE_LAUNCH = 510;
  const ULTIMATE_X_KNOCKBACK = 1520;
  const BREAK_PARRY_KNOCKBACK = 760;
  const AI_LEVELS = {
    easy:   {think: 0.42, react: 0.30, aggression: 0.35, parry: 0.08},
    normal: {think: 0.24, react: 0.19, aggression: 0.58, parry: 0.22},
    hard:   {think: 0.13, react: 0.11, aggression: 0.78, parry: 0.48},
    master: {think: 0.07, react: 0.055, aggression: 0.92, parry: 0.72}
  };

  const keys = Object.create(null);

  function createPlayer(x, color, lightColor, isLeft) {
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
      facing: isLeft ? 1 : -1,
      color,
      lightColor,
      isLeft,
      crouching: false,

      // 血量与受击状态
      hp: MAX_HP,
      maxHp: MAX_HP,
      whiteHp: MAX_HP,
      hitstunTime: 0,
      flashTime: 0,
      grabbed: null,

      // 防反
      parryCooldown: 0,
      parryTime: 0,
      parryEffectTime: 0,
      parryPerfect: false,
      breakParryTime: 0,
      lastHitInfo: null,
      aiThink: 0.2,
      aiCharge: false,

      // 攻击动画
      lightCooldown: 0,
      attackTime: 0,
      attackHitDone: false,
      attackDuration: LIGHT_DURATION,
      attackType: 'light',
      attackFacing: isLeft ? 1 : -1,

      // 重击
      heavyCooldown: 0,
      chargingHeavy: false,
      chargeTime: 0,
      dash: null,

      // 大招
      ultimateCooldown: 0
    };
  }

  let p1;
  let p2;

  // ===== 全局游戏状态 =====
  let remainTime = ROUND_TIME;
  let gameOver = false;
  let resultText = '';

  let damageTexts = [];
  let particles = [];
  let dashTrails = [];
  let fireballs = [];
  let goldSlashes = [];
  let clashEffects = [];

  let hitStopTime = 0;
  let cameraShakeTime = 0;
  let cameraShakePower = 0;
  let gameStarted = false;
  let aiDifficulty = 'normal';
  // 完美防反演出：slowing -> choice -> resuming，全程在原 canvas 内完成。
  let cinematicMode = null;
  let cinematicTimer = 0;
  let cinematicDefender = null;
  let cinematicChoiceNotice = '';
  let cinematicChoiceNoticeTime = 0;
  let cinematicAIWait = 0;
  const CINEMATIC_SLOW_DURATION = 0.72;
  const CINEMATIC_RESUME_DURATION = 0.42;

  function resetGame() {
    p1 = createPlayer(90, '#22c55e', '#86efac', true);
    p2 = createPlayer(W - 90 - NORMAL_W, '#ef4444', '#fca5a5', false);

    remainTime = ROUND_TIME;
    gameOver = false;
    resultText = '';

    damageTexts = [];
    particles = [];
    dashTrails = [];
    fireballs = [];
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
    if (!p.onGround || p.hitstunTime > 0 || p.grabbed || p.dash) return;

    if (p.crouching) {
      p.crouching = false;
      setPlayerSize(p, p.normalW, p.normalH);
    }

    p.vy = -JUMP_SPEED;
    p.onGround = false;
  }

  // ===== 玩家移动与受击后的物理 =====
  function updatePlayer(p, dt, allowInput) {
    if (p.grabbed) return;

    if (allowInput && p.hitstunTime <= 0 && !p.dash) {
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
        const speed = p.crouching ? MOVE_SPEED * CROUCH_SPEED_MULT : MOVE_SPEED;
        p.x += dir * speed * dt;
        clampX(p);
      }
    }

    if (dt <= 0) return;

    p.hitstunTime = Math.max(0, p.hitstunTime - dt);

    // 击退产生的水平速度，逐渐衰减
    if (!p.dash && Math.abs(p.vx) > 1) {
      p.x += p.vx * dt;
      p.vx *= Math.pow(0.10, dt);
    } else if (Math.abs(p.vx) <= 1) {
      p.vx = 0;
    }

    // 撞墙后按当前水平速度反弹
    if (p.x < 0) {
      p.x = 0;
      if (p.vx < 0) p.vx = -p.vx * 0.58;
    } else if (p.x + p.width > W) {
      p.x = W - p.width;
      if (p.vx > 0) p.vx = -p.vx * 0.58;
    }

    // 重力和垂直运动
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;

    if (p.y + p.height >= GROUND_Y) {
      p.y = GROUND_Y - p.height;
      p.vy = 0;
      p.onGround = true;
    } else {
      p.onGround = false;
    }
  }

  // ===== 碰撞箱 =====
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

    if (!rectsOverlap(a, b)) return;

    const overlapX =
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY =
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

    if (overlapX <= 0 || overlapY <= 0) return;

    if (overlapX < overlapY) {
      const dir = a.x + a.width / 2 <= b.x + b.width / 2 ? -1 : 1;
      a.x += (dir * overlapX) / 2;
      b.x -= (dir * overlapX) / 2;
      clampX(a);
      clampX(b);

      const rest =
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);

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

  // ===== 胜负判定 =====
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
    // S 按下后的同一帧也立即视为蹲防，避免按键时序造成攻击漏拦。
    return !!(p.crouching || (p === p1 && p.onGround && keys['s']));
  }

  function randomInt(l, r) {
    return Math.floor(Math.random() * (r - l + 1)) + l;
  }

  function spawnHitParticles(x, y) {
    // 一团亮光 + 少量白色碎屑
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomInt(70, 230);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomInt(2, 4),
        life: 0.22 + Math.random() * 0.12,
        maxLife: 0.34,
        color: '#ffffff'
      });
    }
  }

  // 完美防反的金色火花
  function spawnParrySparks(x, y) {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomInt(130, 360);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomInt(2, 5),
        life: 0.28 + Math.random() * 0.2,
        maxLife: 0.48,
        color: Math.random() < 0.35 ? '#fff7ae' : '#fbbf24'
      });
    }
  }

  // 防反斩：在目标身上生成一条随机角度的金色斩击。
  function spawnGoldSlash(x, y) {
    goldSlashes.push({
      x, y,
      angle: Math.random() * Math.PI,
      life: COUNTER_SLASH_DURATION,
      maxLife: COUNTER_SLASH_DURATION
    });
  }

  // 双方攻击判定相撞时，在交点绘制交叉刀光。
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

  // 防反成功：取消本次来袭攻击，并对攻击者进行重击级反击
  function performPerfectParry(defender, attacker, incomingDir) {
    if (!defender || !attacker || attacker.hp <= 0) return;

    defender.parryTime = 0;
    defender.hitstunTime = 0;
    defender.lastHitInfo = null;
    defender.parryCooldown = PERFECT_PARRY_COOLDOWN;
    defender.parryEffectTime = PARRY_EFFECT_DURATION;
    defender.parryPerfect = true;

    const x = defender.x + defender.width / 2 - incomingDir * 16;
    const y = defender.y + defender.height / 2;
    spawnParrySparks(x, y);
    triggerImpact(10, 9);
    // 只进行子弹时间：逐渐减速，随后冻结等待选择追击方式，不改变镜头。
    cinematicMode = 'slowing';
    cinematicTimer = 0;
    cinematicDefender = defender;
    cinematicChoiceNotice = '';
    cinematicChoiceNoticeTime = 0;
    cinematicAIWait = defender === p2 ? 0.42 : 0;

    // 防反反击伤害：重击同等级击退，攻击者僵直 1.25 秒
    applyDamage(defender, attacker, randomInt(PARRY_DAMAGE_MIN, PARRY_DAMAGE_MAX), {
      dir: -incomingDir,
      knockback: 560,
      launch: HEAVY_LAUNCH,
      stun: 1.25,
      attackerPush: 0,
      hitStop: 0,
      shake: 0,
      ignoreParry: true
    });
  }

  // 在真正受到攻击的瞬间检查 0.2 秒防反窗口
  function tryPerfectParry(defender, attacker, incomingDir) {
    if (!defender || defender.parryTime <= 0 || defender.hp <= 0) return false;
    performPerfectParry(defender, attacker, incomingDir);
    return true;
  }

  // 判断对手是否有攻击会在当前防反窗口内到达。
  // 受击僵直中若确实有重击即将命中，优先开启完美防反窗口，而不是误判为红色脱身。
  function isIncomingThreatWithinParryWindow(defender) {
    const attacker = defender === p1 ? p2 : p1;
    if (!attacker || attacker.hp <= 0) return false;

    const defenderCenterX = defender.x + defender.width / 2;
    const attackerCenterX = attacker.x + attacker.width / 2;
    const dx = defenderCenterX - attackerCenterX;
    const verticalOverlap =
      attacker.y < defender.y + defender.height &&
      attacker.y + attacker.height > defender.y;

    // 正在突进的重击：按剩余冲刺距离和防反窗口预测攻击是否会接近。
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

    // 对手正在蓄重击且距离足够近：允许提前举盾等候释放。
    if (attacker.chargingHeavy && verticalOverlap &&
        dx * attacker.attackFacing > 0 && Math.abs(dx) <= 340) {
      return true;
    }

    // 正在挥出的轻击已进入可命中距离。
    if (attacker.attackTime > 0 && attacker.attackType === 'light' &&
        lightAttackCanHit(attacker, defender)) {
      return true;
    }

    // 飞行中的火球将在防反窗口内到达。
    for (const ball of fireballs) {
      if (ball.attacker !== attacker) continue;
      const bx = (defenderCenterX - ball.x) * ball.dir;
      const by = Math.abs((defender.y + defender.height / 2) - ball.y);
      const maxX = FIREBALL_SPEED * (PARRY_WINDOW + PARRY_THREAT_BUFFER)
        + defender.width / 2 + ball.r;
      if (bx >= -ball.r && bx <= maxX && by <= defender.height / 2 + ball.r) {
        return true;
      }
    }

    return false;
  }

  // 若按键刚好晚于受击结算一帧，在很短的宽限内撤销刚才那次受击，再按完美防反处理。
  function tryLatePerfectParry(defender) {
    const hit = defender && defender.lastHitInfo;
    if (!hit || hit.timeLeft <= 0 || !hit.attacker || hit.attacker.hp <= 0) return false;

    defender.hp = hit.hpBefore;
    defender.whiteHp = hit.whiteHpBefore;
    defender.vx = hit.vxBefore;
    defender.vy = hit.vyBefore;
    defender.onGround = hit.onGroundBefore;
    defender.hitstunTime = 0;
    defender.flashTime = hit.flashTimeBefore;
    defender.chargingHeavy = hit.chargingHeavyBefore;
    defender.chargeTime = hit.chargeTimeBefore;
    defender.dash = hit.dashBefore;
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

  // 按下空格：开启加宽后的防反窗口；僵直中若有即将命中的攻击则优先尝试完美防反。
  function startParry() {
    if (!gameStarted || gameOver || p1.hp <= 0 || p1.parryCooldown > 0 ||
        p1.grabbed || p1.dash || p1.chargingHeavy) return;

    // 僵直中按空格：若对手攻击即将到达，优先开普通防反窗口。
    // 若刚好晚于受击结算，则在短暂宽限内回滚该次受击并补判完美防反。
    if (p1.hitstunTime > 0) {
      if (isIncomingThreatWithinParryWindow(p1)) {
        p1.parryCooldown = PARRY_COOLDOWN;
        p1.parryTime = PARRY_WINDOW;
        p1.parryEffectTime = PARRY_WINDOW;
        p1.parryPerfect = false;
        return;
      }
      if (tryLatePerfectParry(p1)) return;

      // 没有即将命中的攻击且已错过完美防反宽限，才执行红色脱身。
      p1.parryCooldown = BREAK_PARRY_COOLDOWN;
      p1.hitstunTime = 0;
      p1.breakParryTime = 0.34;
      p1.parryEffectTime = 0.34;
      p1.parryPerfect = false;
      // 脱困时击退对手，而不是自己；只施加水平速度，不改变垂直速度。
      const dir = p2.x + p2.width / 2 >= p1.x + p1.width / 2 ? 1 : -1;
      p2.vx = dir * BREAK_PARRY_KNOCKBACK;
      const cx = p1.x + p1.width / 2;
      const cy = p1.y + p1.height / 2;
      damageTexts.push({x: p2.x + p2.width / 2, y: p2.y - 13, text: '1', color: '#ffffff', life: 0.85, maxLife: 0.85});
      p2.hp = Math.max(0, p2.hp - 1);
      p2.whiteHp = Math.max(p2.whiteHp, p2.hp + 1);
      spawnHitParticles(p1.x + p1.width / 2, p1.y + p1.height / 2);
      triggerImpact(3, 6);
      checkGameOver();
      return;
    }

    p1.parryCooldown = PARRY_COOLDOWN;
    p1.parryTime = PARRY_WINDOW;
    p1.parryEffectTime = PARRY_WINDOW;
    p1.parryPerfect = false;
  }

  // 统一伤害入口：普通伤害白字，暴击红字
  function applyDamage(attacker, target, baseDamage, opt = {}) {
    if (gameOver || target.hp <= 0) return 0;

    const incomingDir = opt.dir !== undefined
      ? opt.dir
      : ((target.x + target.width / 2) >= (attacker.x + attacker.width / 2) ? 1 : -1);

    // 命中瞬间恰好处于防反窗口：取消原伤害，转为完美防反
    if (!opt.ignoreParry && tryPerfectParry(target, attacker, incomingDir)) return 0;

    // 记录受击前状态。若玩家在攻击命中后极短时间内按下空格，可回滚该次受击。
    const stateBeforeHit = {
      hpBefore: target.hp,
      whiteHpBefore: target.whiteHp,
      vxBefore: target.vx,
      vyBefore: target.vy,
      onGroundBefore: target.onGround,
      hitstunBefore: target.hitstunTime,
      flashTimeBefore: target.flashTime,
      chargingHeavyBefore: target.chargingHeavy,
      chargeTimeBefore: target.chargeTime,
      dashBefore: target.dash
    };
    // 新命中覆盖旧的“刚受击”宽限记录，避免回滚时漏掉后续伤害。
    target.lastHitInfo = null;

    const critical = opt.noCritical ? false : Math.random() < CRITICAL_RATE;
    const rawDamage = critical ? baseDamage * 2 : baseDamage;
    // 蹲防拥有霸体，并将受到的最终伤害（含暴击）降低 20%。
    const crouching = isCrouching(target);
    const damage = crouching ? Math.round(rawDamage * 0.8) : rawDamage;
    const oldHp = target.hp;
    const realDamage = Math.min(oldHp, damage);

    target.hp = Math.max(0, oldHp - damage);
    target.whiteHp = Math.max(target.whiteHp, oldHp);

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

    if (opt.knockback > 0) {
      target.vx = dir * opt.knockback;
      target.vy = -opt.launch;
      // 蹲防期间保留击退/击飞物理效果，但不会增加受击僵直。
      if (!crouching) {
        target.hitstunTime = Math.max(target.hitstunTime, opt.stun || 0.12);
      }
      target.onGround = false;

      // 受击僵直期间取消蓄力和突进，不能继续操作
      target.chargingHeavy = false;
      target.chargeTime = 0;
      target.dash = null;

      if (!crouching) {
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

  // ===== 轻击：原地挥出竖向圆弧，无冷却；命中在 updateCombat 中统一判定 =====
  function lightAttackFor(p) {
    if (gameOver || p.hp <= 0 || isCrouching(p) ||
    p.hitstunTime > 0 || p.grabbed || p.dash ||
    p.lightCooldown > 0) return;
    p.lightCooldown = LIGHT_COOLDOWN;
    p.attackTime = LIGHT_DURATION;
    p.attackDuration = LIGHT_DURATION;
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

  // 对撞伤害：同时结算双方伤害，只施加水平击退，不改变 y 速度，也不额外增加僵直。
  function applyClashDamage(attacker, target, baseDamage, dir, xKnockback) {
    if (!target || target.hp <= 0) return;
    const critical = Math.random() < CRITICAL_RATE;
    const rawDamage = critical ? baseDamage * 2 : baseDamage;
    const damage = isCrouching(target) ? Math.round(rawDamage * 0.8) : rawDamage;
    const oldHp = target.hp;
    const realDamage = Math.min(oldHp, damage);

    target.hp = Math.max(0, oldHp - damage);
    target.whiteHp = Math.max(target.whiteHp, oldHp);
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
    // 保留 target.vy：对撞只产生水平击退。
    target.chargingHeavy = false;
    target.chargeTime = 0;
    target.dash = null;
  }

  function resolveLightAttacks() {
    const bothActive = p1.attackTime > 0 && p2.attackTime > 0 &&
      p1.attackType === 'light' && p2.attackType === 'light' &&
      !p1.attackHitDone && !p2.attackHitDone;

    if (bothActive && lightAttackCanHit(p1, p2) && lightAttackCanHit(p2, p1)) {
      p1.attackHitDone = true;
      p2.attackHitDone = true;
      const dir = (p2.x + p2.width / 2) >= (p1.x + p1.width / 2) ? 1 : -1;
      const clashX = (p1.x + p1.width / 2 + p2.x + p2.width / 2) / 2;
      const clashY = (p1.y + p1.height / 2 + p2.y + p2.height / 2) / 2;
      spawnClashEffect(clashX, clashY, 'light');
      applyClashDamage(p1, p2, randomInt(LIGHT_DAMAGE_MIN, LIGHT_DAMAGE_MAX), dir, 560);
      applyClashDamage(p2, p1, randomInt(LIGHT_DAMAGE_MIN, LIGHT_DAMAGE_MAX), -dir, 560);
      triggerImpact(5, 8);
      checkGameOver();
      return;
    }

    for (const attacker of [p1, p2]) {
      if (attacker.attackTime <= 0 || attacker.attackType !== 'light' || attacker.attackHitDone) continue;
      const target = attacker === p1 ? p2 : p1;
      if (!lightAttackCanHit(attacker, target)) continue;
      attacker.attackHitDone = true;
      applyDamage(attacker, target, randomInt(LIGHT_DAMAGE_MIN, LIGHT_DAMAGE_MAX), {
        dir: attacker.attackFacing, knockback: 300, launch: LIGHT_LAUNCH,
        stun: 0.17, attackerPush: 8, hitStop: 3, shake: 4
      });
    }
  }

  function lightAttack() { lightAttackFor(p1); }

  // ===== 重击：按住 K 蓄力，松开后突进 =====
  function startHeavyChargeFor(p) {
    if (gameOver || p.hp <= 0 || isCrouching(p) || p.heavyCooldown > 0 || p.hitstunTime > 0 || p.grabbed || p.dash) return;
    p.chargingHeavy = true;
    p.chargeTime = 0;
    p.attackFacing = p.facing;
  }

  function startHeavyCharge() { startHeavyChargeFor(p1); }

  function releaseHeavyChargeFor(p) {
    if (!p.chargingHeavy) return;
    p.chargingHeavy = false;
    if (gameOver || p.hp <= 0 || isCrouching(p)) { p.chargeTime = 0; return; }
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

  // 完美防反后的第四种追击：随机方向金色斩击，直接命中敌人。
  function parryFollowupAttackFor(p) {
    const target = p === p1 ? p2 : p1;
    if (gameOver || p.hp <= 0 || isCrouching(p) || p.hitstunTime > 0 || p.grabbed || p.dash || target.hp <= 0) return;

    const attackerX = p.x + p.width / 2;
    const targetX = target.x + target.width / 2;
    const dir = targetX >= attackerX ? 1 : -1;
    const targetXCenter = targetX;
    const targetYCenter = target.y + target.height / 2;

    // 不再检查距离、朝向或高度：防反斩必定锁定并命中对手。
    p.attackTime = 0; // 取消可能残留的普通攻击特效，只显示目标身上的金色斩击。
    p.attackType = 'counter';
    p.attackFacing = dir;
    spawnGoldSlash(targetXCenter, targetYCenter);

    applyDamage(p, target, randomInt(100000, 150000), {
      dir,
      knockback: 560,
      launch: HEAVY_LAUNCH,
      stun: 1.5,
      attackerPush: 4,
      hitStop: 8,
      shake: 8,
      ignoreParry: true
    });
  }

  function executeParryFollowup(actor, key) {
    if (key === 'j') {
      lightAttackFor(actor);
    } else if (key === 'k') {
      if (actor.heavyCooldown > 0) return false;
      startHeavyChargeFor(actor);
      if (actor.chargingHeavy) { actor.chargeTime = HEAVY_MAX_CHARGE; releaseHeavyChargeFor(actor); }
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

  // 玩家触发完美防反时，按 J/K/L/I 选择追击；AI 触发时由 AI 自行选择。
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

  // ===== 大招：发射火球 =====
  function ultimateAttackFor(p) {
    if (gameOver || p.hp <= 0 || isCrouching(p) || p.ultimateCooldown > 0 || p.hitstunTime > 0 || p.grabbed || p.dash || p.chargingHeavy) return;
    p.ultimateCooldown = ULTIMATE_COOLDOWN;
    p.attackFacing = p.facing;
    fireballs.push({attacker: p, x: p.x + p.width / 2 + p.facing * 30, y: p.y + p.height * 0.48, vx: p.facing * FIREBALL_SPEED, dir: p.facing, r: 13, life: 2.5});
  }

  function ultimateAttack() { ultimateAttackFor(p1); }

  function startUltimateCapture(ball, target) {
    // 火球命中也属于攻击判定，防反成功则不进入卷入阶段
    const attacker = ball.attacker || p1;
    if (tryPerfectParry(target, attacker, ball.dir)) return false;
    target.grabbed = {
      attacker,
      dir: ball.dir,
      centerX: ball.x,
      centerY: ball.y,
      elapsed: 0,
      tickTimer: 0.08,
      ticks: 0
    };
    target.vx = 0;
    target.vy = 0;
    target.hitstunTime = 0;
    target.flashTime = 0.05;
    spawnHitParticles(ball.x, ball.y);
    triggerImpact(3, 5);
    return true;
  }

  // ===== P2 AI：根据难度调整反应、进攻频率和防反概率 =====
  function updateAI(dt) {
    if (!gameStarted || gameOver || p2.hp <= 0 || p2.hitstunTime > 0 || p2.grabbed) return;
    const cfg = AI_LEVELS[aiDifficulty] || AI_LEVELS.normal;
    p2.aiThink -= dt;
    const dx = (p1.x + p1.width / 2) - (p2.x + p2.width / 2);
    const dist = Math.abs(dx);
    const dir = dx >= 0 ? 1 : -1;
    p2.facing = dir;

    // 连续走位，不等思考计时器跳动，避免一顿一顿地移动
    if (dist > 155) {
      const moveFactor = aiDifficulty === 'easy' ? 0.48 : aiDifficulty === 'normal' ? 0.62 : 0.78;
      p2.x += dir * MOVE_SPEED * moveFactor * dt;
      clampX(p2);
    } else if (dist < 78 && Math.random() < 0.18) {
      p2.x -= dir * MOVE_SPEED * 0.35 * dt;
      clampX(p2);
    }

    // 读招防反：难度越高，反应越快、成功率越高
    const playerThreat = p1.attackTime > 0 || !!p1.dash || fireballs.some(b => b.attacker === p1 && Math.abs(b.x - (p2.x + p2.width / 2)) < 95);
    if (playerThreat && p2.parryCooldown <= 0 && p2.parryTime <= 0 && Math.random() < cfg.parry * dt * 12) {
      p2.parryCooldown = PARRY_COOLDOWN;
      p2.parryTime = PARRY_WINDOW;
      p2.parryEffectTime = PARRY_WINDOW;
      p2.parryPerfect = false;
    }

    if (p2.aiThink > 0) return;
    p2.aiThink = cfg.think;

    // 有大招且距离合适时优先施放
    if (p2.ultimateCooldown <= 0 && dist < 560 && Math.random() < cfg.aggression * 0.55) {
      ultimateAttackFor(p2);
      return;
    }

    // 近距离轻击：与玩家共用同一套短暂判定窗口，支持双方同时轻击对撞。
    if (dist <= 125 && p2.attackTime <= 0 && Math.random() < cfg.aggression) {
      lightAttackFor(p2);
      return;
    }

    // 中距离重击：蓄力后自动释放
    if (dist < 300 && p2.heavyCooldown <= 0 && Math.random() < cfg.aggression * 0.72) {
      if (!p2.chargingHeavy) startHeavyChargeFor(p2);
      else if (p2.chargeTime >= HEAVY_MAX_CHARGE * (0.55 + Math.random() * 0.45)) releaseHeavyChargeFor(p2);
      return;
    }

  }

  // 计算重击突进本帧结束时的位置和对应的前向判定框。
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

  // 双方重击突进判定框互相覆盖时，先同时结算，避免循环顺序让一方攻击被提前取消。
  function resolveHeavyClash(dt) {
    if (!p1.dash || !p2.dash) return false;
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

  // ===== 重击突进、火球和大招连续伤害 =====
  function updateCombat(dt) {
    if (dt <= 0 || gameOver) return;

    for (const p of [p1, p2]) {
      p.parryCooldown = Math.max(0, p.parryCooldown - dt);
      p.parryTime = Math.max(0, p.parryTime - dt);
    }

    for (const p of [p1, p2]) {
      p.heavyCooldown = Math.max(0, p.heavyCooldown - dt);
      p.ultimateCooldown = Math.max(0, p.ultimateCooldown - dt);
      p.lightCooldown = Math.max(0, p.lightCooldown - dt);
      if (p.chargingHeavy) p.chargeTime = Math.min(HEAVY_MAX_CHARGE, p.chargeTime + dt);
    }

    // 轻击判定先处理：两边同时命中时优先结算刀光对撞。
    resolveLightAttacks();
    if (gameOver) return;

    // 双方重击突进
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
        d.damageDone = true;
        applyDamage(attacker, target, randomInt(100000, 120000), {dir: d.dir, knockback: 560, launch: HEAVY_LAUNCH, stun: 0.25, attackerPush: 4, hitStop: 10, shake: 8});
        attacker.dash = null;
      } else if (d.moved >= d.distance - 0.1 || moved + 0.1 < step) {
        attacker.dash = null;
      }
    }

    // 火球飞行与命中检测
    for (let i = fireballs.length - 1; i >= 0; i--) {
      const b = fireballs[i];
      b.x += b.vx * dt;
      b.life -= dt;

      const hitBox = {
        x: b.x - b.r,
        y: b.y - b.r,
        width: b.r * 2,
        height: b.r * 2
      };

      const target = b.attacker === p1 ? p2 : p1;
      if (rectsOverlap(hitBox, target)) {
        startUltimateCapture(b, target);
        fireballs.splice(i, 1);
      } else if (b.life <= 0 || b.x < -40 || b.x > W + 40) {
        fireballs.splice(i, 1);
      }
    }

    // 大招：被卷入后连续 10 段伤害，最后甩出
    for (const grabbedTarget of [p1, p2]) {
      if (!grabbedTarget.grabbed) continue;
      const g = grabbedTarget.grabbed;
      g.elapsed += dt;
      g.tickTimer -= dt;

      const pcx = grabbedTarget.x + grabbedTarget.width / 2;
      const pcy = grabbedTarget.y + grabbedTarget.height / 2;
      const pull = Math.min(1, dt * 11);
      grabbedTarget.x += (g.centerX - pcx) * pull;
      grabbedTarget.y += (g.centerY - pcy) * pull;

      while (g.tickTimer <= 0 && g.ticks < 10 && !gameOver) {
        applyDamage(g.attacker, grabbedTarget, randomInt(10000, 20000), {
          dir: g.dir,
          knockback: 0,
          launch: 0,
          hitStop: 0
        });
        g.ticks++;
        g.tickTimer += 0.08;
      }

      if (g.ticks >= 10 || gameOver) {
        grabbedTarget.grabbed = null;

        if (!gameOver) {
          applyDamage(g.attacker, grabbedTarget, randomInt(250000, 300000), {
            dir: g.dir,
            knockback: ULTIMATE_X_KNOCKBACK,
            launch: ULTIMATE_LAUNCH,
            stun: 1.0,
            hitStop: 10,
            shake: 10
          });
        }
      }
    }
  }

  // ===== 更新动画与特效 =====
  function updateEffects(worldDt, realDt) {
    for (const p of [p1, p2]) {
      if (worldDt > 0) {
        if (p.whiteHp > p.hp) {
          const k = Math.min(1, worldDt * 9);
          p.whiteHp += (p.hp - p.whiteHp) * k;
        }

        if (p.attackTime > 0) {
          p.attackTime = Math.max(0, p.attackTime - worldDt);
        }
      }

      if (p.lastHitInfo && worldDt > 0) {
        p.lastHitInfo.timeLeft = Math.max(0, p.lastHitInfo.timeLeft - worldDt);
        if (p.lastHitInfo.timeLeft <= 0) p.lastHitInfo = null;
      }

      p.flashTime = Math.max(0, p.flashTime - realDt);
      p.parryEffectTime = Math.max(0, p.parryEffectTime - realDt);
      p.breakParryTime = Math.max(0, p.breakParryTime - realDt);
      if (p.parryEffectTime <= 0) p.parryPerfect = false;
    }

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

    for (const s of goldSlashes) s.life -= realDt;
    goldSlashes = goldSlashes.filter(s => s.life > 0);

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
    if (p.grabbed) {
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(p.grabbed.elapsed * 25) * 0.28);
      ctx.translate(-cx, -cy);
    }

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

    // 受击闪白，持续 50ms
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

  // ===== 轻击竖向圆弧 =====
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
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = '#fde68a';
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

  // 防反光罩：普通防反为白色，完美防反后扩散为金色
  function drawParryEffect(p) {
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
      ctx.fill(); ctx.stroke();
    } else if (perfect) {
      const progress = 1 - p.parryEffectTime / PARRY_EFFECT_DURATION;
      const radius = 25 + progress * 58;
      const alpha = Math.max(0, 1 - progress);

      // 金色扩散光环
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
      // 防反窗口内的白色防护罩
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

  // 在敌人身上绘制一条随机角度、带金色辉光的斩击。
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

  // 对撞刀光：轻击为蓝白交叉光刃，重击为更粗、更亮的金白交叉斩。
  function drawClashEffects() {
    for (const e of clashEffects) {
      const progress = 1 - e.life / e.maxLife;
      const alpha = Math.max(0, 1 - progress);
      const heavy = e.type === 'heavy';
      const length = (heavy ? 48 : 36) + progress * (heavy ? 28 : 18);
      const width = (heavy ? 12 : 7) * (1 - progress * 0.55);
      const outer = heavy ? '#fbbf24' : '#7dd3fc';
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

  function drawFireballs() {
    for (const b of fireballs) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.dir, 1);

      ctx.shadowColor = '#fb923c';
      ctx.shadowBlur = 24;
      const g = ctx.createRadialGradient(-3, 0, 2, 0, 0, b.r * 1.7);
      g.addColorStop(0, '#fff7ed');
      g.addColorStop(0.35, '#facc15');
      g.addColorStop(0.72, '#f97316');
      g.addColorStop(1, 'rgba(239,68,68,0.1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(255,245,220,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-b.r * 2.8, 0);
      ctx.quadraticCurveTo(-b.r * 1.5, -8, -b.r * 0.7, 0);
      ctx.stroke();
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
    ctx.restore();
  }

  function updateSkillHUD() {
    const bar = document.getElementById('skillBar');
    if (bar) bar.style.display = gameStarted ? 'flex' : 'none';
    const entries = [
      ['skillLight', p1 ? p1.lightCooldown : 0, '0.1s'],
      ['skillHeavy', p1 ? p1.heavyCooldown : 0, '1.5s'],
      ['skillUltimate', p1 ? p1.ultimateCooldown : 0, '45s'],
      ['skillParry', p1 ? p1.parryCooldown : 0, '13s']
    ];
    for (const [id, remaining, readyText] of entries) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (id === 'skillLight') {
        el.textContent = '就绪';
        el.classList.add('ready');
        el.classList.remove('cooling');
      } else if (remaining <= 0.001) {
        el.textContent = '就绪';
        el.classList.add('ready');
        el.classList.remove('cooling');
      } else {
        el.textContent = remaining.toFixed(1) + 's';
        el.classList.add('cooling');
        el.classList.remove('ready');
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
      {key:'L', name:'大招', desc:(cinematicDefender || p1).ultimateCooldown > 0 ? '冷却中' : '火球连续追击', color:'#fb923c', disabled:(cinematicDefender || p1).ultimateCooldown > 0},
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

    // 不进行镜头聚焦或放大；子弹时间只影响游戏世界的时间流速。

    // 150ms 镜头震动，并通过剩余时间平方衰减
    if (cameraShakeTime > 0) {
      const ratio = cameraShakeTime / 0.15;
      const power = cameraShakePower * ratio * ratio;
      ctx.translate((Math.random() * 2 - 1) * power, (Math.random() * 2 - 1) * power);
    }

    drawBackground();
    drawDashTrails();
    drawFireballs();
    drawShadow(p1);
    drawShadow(p2);
    drawPlayer(p2);
    drawPlayer(p1);
    drawParryEffect(p1);
    drawParryEffect(p2);
    drawAttackEffect(p2);
    drawAttackEffect(p1);
    drawGoldSlashes();
    drawClashEffects();
    drawChargeEffect();
    drawParticles();
    drawDamageTexts();
    ctx.restore();

    // 固定 HUD 不跟随镜头放大，仍处于原来的游戏窗口中。
    drawFightHUD();
    if (cinematicMode === 'choice') drawCinematicChoice();
    if (gameOver) drawResult();
  }

  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.033);
    lastTime = now;

    // 完美防反：先逐步减速到零，再完全冻结等待选择，确认后平滑恢复。
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
          const dx = Math.abs((p1.x + p1.width / 2) - (p2.x + p2.width / 2));
          let aiKey = 'i';
          if (p2.ultimateCooldown <= 0 && dx < 560 && Math.random() < 0.55) aiKey = 'l';
          else if (p2.heavyCooldown <= 0 && dx > 125) aiKey = 'k';
          else if (dx <= 125) aiKey = 'j';
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

  // ===== 键盘输入：只控制左边 P1 =====
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

    // 完美防反选择阶段只接受 J/K/L/I，其他操作全部锁定。
    if (cinematicMode === 'choice') {
      if (cinematicDefender === p1 && !e.repeat && chooseParryFollowup(k)) e.preventDefault();
      return;
    }

    if (k === 'w' && !e.repeat) tryJump(p1);
    if (k === ' ' && !e.repeat) startParry();
    if (k === 'j' && !e.repeat) lightAttack();
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

  // 开始界面由 index.html 的按钮控制
  resetGame();
  gameStarted = false;
  const startButton = document.getElementById('startButton');
  const difficultySelect = document.getElementById('difficulty');
  const startScreen = document.getElementById('startScreen');
  if (startButton) startButton.addEventListener('click', () => {
    aiDifficulty = difficultySelect ? difficultySelect.value : 'normal';
    resetGame();
    gameStarted = true;
    if (startScreen) startScreen.classList.add('hidden');
  });
  const backButton = document.getElementById('menuButton');
  if (backButton) backButton.addEventListener('click', () => {
    gameStarted = false;
    if (startScreen) startScreen.classList.remove('hidden');
  });
  requestAnimationFrame(loop);
})();
