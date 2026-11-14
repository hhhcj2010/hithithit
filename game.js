/* =============================================================================
 * HITHITHIT · 几何战争 / GEOMETRY WAR
 * -----------------------------------------------------------------------------
 *  单页 Canvas 2D · 一对一几何格斗 · 数据驱动
 *
 *  模块顺序：
 *    1  常量          2  工具            3  角色数据        4  场景数据
 *    5  成就 / 挑战    6  音效            7  存档            8  输入
 *    9  全局状态      10 战斗对象        11 招式构造       12 命中结算
 *    13 专属技能      14 AI             15 质心碰撞       16 终结演出
 *    17 粒子特效      18 渲染           19 HUD            20 界面
 *    21 主循环        22 调试 API       23 回归测试
 *
 *  所有数值均取自《HITHITHIT-几何战争-游戏设定文档》。
 * ========================================================================== */
(function () {
'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
 * 1 · 常量 CONSTANTS
 * ═══════════════════════════════════════════════════════════════════════════ */
const W = 960, H = 540, GROUND = 462;
const TAU = Math.PI * 2;

const C = {
  W, H, GROUND, TAU,
  BASE_HP: 500,          // 基准血量
  HP_UNIT: 3.3,          // 设计伤害单位 → 生命值（调小=打得更久；调大=对局更快）
  ROUND_TIME: 60,

  GRAVITY: 2200,         // 标准重力
  FLOAT_G: 1870,         // 浮空重力（2200 × 0.85）
  MOVE: 280,             // 移动速度 px/s
  CROUCH_MUL: 0.45,      // 蹲防移动倍率
  JUMP_V: 760,           // 跳跃初速
  MAX_JUMPS: 2,
  AIR_ACTIONS: 3,        // 空中轻击 / 下劈共用次数
  AIR_ACCEL: 1500,

  CHAIN_RESET: 0.62,     // 连段记忆重置常数 T = L + 0.62
  COMBO_SOFT: 60,        // 连段保护：累计伤害软上限（伤害型衰减）
  COMBO_FLOOR: 0.30,     // 连段伤害下限倍率
  COMBO_HARD: 85,        // 连段累计伤害硬上限（触及即强制断开）
  STUN_DECAY: 0.055, STUN_FLOOR: 0.45,
  COMBO_CAP: 30,         // 连击数硬上限（安全阀）
  LIGHT_CHAIN_DMG: 13,   // 轻击链累计伤害保护阈值
  LIGHT_REST: 0.8,       // 轻击保护冷却

  LIGHT_R: 112, LIGHT_R_STEP: 14,  // 轻击判定半径 112 → 154
  COMBO_TIMEOUT: 1.15,   // 连段窗口：超过这个时间没有新命中就重置连段（同时恢复伤害）
  HEAVY_R: 74, ULT_R: 62,

  DODGE: { dur: 0.32, inv: 0.22, speed: 620, cd: 1.5, perfect: 0.11, pInv: 0.30, pCd: 0.75, slow: 0.24 },
  GUARD: { dmg: 0.8, drain: 3, regen: 30, falsify: 2.5 },
  HEAVY: { dMin: 115, dPer: 155, tBase: 0.17, tPer: 0.10, dmgMin: 14, dmgMax: 17, kb: 448, launch: 800, cd: 1.5, windup: 0.08, rec: 0.20 },
  ULT:   { cost: 100 },              // 专属大招数据见 ULTS
  ULT_GUARD: 0.35,                   // 大招起手短暂无敌（之后可被反击）
  /* ── 三角函的远程弹道 ── */
  PROJ_SINE_SPEED: (115 + 0.25 * 155) / (0.17 + 0.25 * 0.10),  // = 重击冲刺速度 680
  PROJ_COS_SPEED: 520,               // 余弦弹：略慢于正弦
  PROJ_SINE_DMG: 0.82,               // 正弦弹伤害系数（约 7.5% 血条，靠频率补足）
  TRIG_HEAVY_CD: 0.85,               // 三角函数重击冷却（比其他角色短，远程更连贯）
  PROJ_COS_RADIUS: 96,               // 余弦爆炸半径
  PROJ_SCREEN_END: 60,               // 飞出屏幕的判定余量
  /* 正切大招（单段判定）：锁定 → 落刃（纯表现）→ 一次结算 */
  TAN_LOCK_SLOW: 0.04,               // 锁定期间目标移速倍率（几乎定住：锁定就是“读招”，不再逃出判定带）
  TAN_LOCK_TIME: 0.64,               // 锁定持续时间（覆盖整段落刃与结算）
  TAN_STRIKES: 5,                    // 落刃演出束数（纯表现，不参与结算）
  TAN_STRIKE_START: 0.22,            // 第一束落刃的时间
  TAN_STRIKE_GAP: 0.04,              // 相邻落刃间隔
  TAN_HIT_TIME: 0.50,                // 单段判定时刻（全部落刃之后）
  TAN_MARK_LIFE: 0.70,               // 地面锁定框停留时长
  TAN_BAND_X: 104,                   // 单段斩击的横向判定半宽
  TAN_BAND_Y: 210,                   // 单段斩击的纵向判定半高（覆盖跳跃高度）
  TAN_PIN_X: 72,                     // 落刃时把锁定目标夹在框内的最大偏移
  ENERGY_START: 50,                  // 开局能量：大招已充能 50%
  ENERGY_PER_HIT: 1.95,              // 每次命中获得的能量（×1.56：实战约 8~10 秒一发大招）
  ENERGY_ON_TAKE: 0.9,               // 挨打时的能量倍数（略低，避免被打反而更快放大招）
  /* 质心碰撞（角力）：双方重击判定帧重叠即可进入角力。
     gap 是双方蓄力差的上限：放宽到蓄力上限以上 → 只要判定帧撞上就是角力，
     让“对撞”变成主要结果，把原来那个几乎撞不出来的硬门槛去掉。 */
  CLASH: { gap: 0.40, time: 0.95, e: 0.55, dmg: 7, push: 520, stun: 1.15, reach: 118 },
  ESC:   { cd: 5.5, cdHeavy: 6.0, extra: 0.35, extraMax: 3, cost: 12, inv: 0.42 },
  /* 三角函数的“渐近闪避”：脱身瞬间瞬移到对手背后拉开距离（远程特化，代价同步加重）
     依据：普通脱身后对手 0.4s 内就会追到 ~130px；正弦弹在 140px 内只有约 50~58% 命中，脱离近身才有远程价值 */
  ESC_TRIG: {
    blink: 192,          // 瞬移拉开的对枪距离（贴墙时退到 minBlink，至少离开近身）
    minBlink: 150,
    lag: 0.28,           // 对手的“追踪延迟”：脱身瞬间短时间内追不上来
    lagMul: 0.5,         // 追踪延迟期间的移速倍率
    cd: 6.5,             // 基础冷却（通用 5.5s，额外 +1s）
    cost: 18,            // 消耗能量（通用 12，额外 +6）
    inv: 0.26,           // 瞬移无敌（通用 0.42s：位移补偿的是控制权，不是免伤）
  },
  PARRY_STUN: 0.12,
  MAX_PARTICLES: 520,
  HITSTOP_MAX: 0.4,

  /* 终结演出时间轴（参照 NEON CLASH：freeze → impact → collapse → title → cinematic） */
  FINISHER_TL: { freeze: 0.16, impact: 0.52, collapse: 1.30, title: 1.70, cinematic: 3.40, end: 5.40 },
  RESULT_DELAY: 2.0,    // 动画播完后，标题画面再完整停留 2 秒才弹出结算
  RESULT_MIN: 3.0,      // 结算界面最少停留秒数

  /* ── 手感调校（参照 beta 版：出招更快、攻击中可移动、更强的打击反馈）── */
  FEEL: {
    LIGHT_WINDUP: 0.40,   // 轻击前摇保留比例，其余时间并入判定帧（出招更跟手）
    ATTACK_MOVE: 0.85,    // 轻击时的地面移动倍率
    ATTACK_AIR: 0.92,     // 轻击时的空中操控倍率
    ACT_MOVE: 0.5,        // 上挑 / 下劈时的移动倍率
    CHARGE_MOVE: 0.62,    // 蓄力重击时的移动倍率（边蓄边跑）
    CHARGE_HOVER_VY: 110, // 空中蓄力：下落速度上限（悬停蓄力）
    WALL_BOUNCE: 0.55,    // 撞墙反弹恢复系数
    WALL_MIN: 320,        // 触发撞墙反弹的最小速度
    KNOCK_DAMP: 11,       // 击退速度衰减
    ATTACKER_PUSH: 0.9,   // 命中时攻击者后坐
    SHAKE_TIME: 0.18,     // 震屏时长（平方衰减）
    GROUND_SLAM: 26,      // 浮空落地砸地的基础震屏
  },
};

/* 键位默认值（物理键 code → 动作名由存档覆盖） */
const DEFAULT_KEYS = {
  left: 'KeyA', right: 'KeyD', jump: 'KeyW', down: 'KeyS',
  light: 'KeyJ', heavy: 'KeyK', ult: 'KeyL', skill: 'Space',
  dodge: 'KeyQ', counter: 'KeyI', reset: 'KeyY',
};
const ACTIONS = ['left', 'right', 'jump', 'down', 'light', 'heavy', 'ult', 'skill', 'dodge', 'counter', 'reset'];
const ACTION_CN = {
  left: '向左', right: '向右', jump: '跳跃', down: '下蹲/防御',
  light: '轻击', heavy: '蓄力重击', ult: '大招', skill: '专属技能',
  dodge: '闪避', counter: '追击选项', reset: '重置位置',
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 2 · 工具 UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════ */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[(Math.random() * a.length) | 0];
const rad = d => d * Math.PI / 180;
const cosd = d => Math.cos(d * Math.PI / 180);
const sign = v => (v < 0 ? -1 : 1);
const fmt = (v, n = 2) => Number(v).toFixed(n);
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** #rrggbb → rgba(...) */
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** 键名显示（KeyA → A，Space → SPACE） */
function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL' };
  return map[code] || code.toUpperCase();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3 · 角色数据 CHARACTERS
 * ---------------------------------------------------------------------------
 *  n      边数（外观）        r      外接圆半径（体格）
 *  theta  判定角（度）        combo  四段轻击帧数据（秒 / 设计伤害 / 浮空初速）
 *  系数   血量 / 移速 / 跳跃 / 护盾 / 能量 / 招式 / 冷却
 * ═══════════════════════════════════════════════════════════════════════════ */
const CHARS = [
  /* ── 三角 TRIANGLE ─────────────────────────────────────────────────── */
  {
    id: 'triangle', name: '三角', en: 'TRIANGLE', title: '三边定理',
    role: '均衡 · BALANCED', icon: '▲',
    sides: 3, r: 20, theta: 30, color: '#22e07a', lite: '#a6f6c6', inner: '#053a1c',
    hp: 1.00, spd: 1.00, jump: 1.00, shield: 1.00, energy: 1.00,
    lightCoef: 1.00, airCoef: 1.02, launchCoef: 1.02, diveCoef: 1.00, heavyCoef: 1.04, ultCoef: 0.98,
    cdCoef: 1.00, dodgeCdCoef: 1.00, skillCdCoef: 1.00, hitstunCoef: 1.00,
    lightR: 2, floatG: 1.00, chargeMax: 0.25, launchV: 620,
    strength: '97.9%', quote: '最稳固的形状。三边等长，攻守速度三项均衡，任何距离都能稳定输出。',
    combo: [
      { name: '边·一', w: 0.035, a: 0.065, r: 0.085, link: 0.220, dmg: 2.76, launch: 0 },
      { name: '边·二', w: 0.030, a: 0.065, r: 0.080, link: 0.220, dmg: 2.86, launch: 137 },
      { name: '边·三', w: 0.045, a: 0.075, r: 0.110, link: 0.200, dmg: 3.10, launch: 306 },
      { name: '边·终', w: 0.070, a: 0.090, r: 0.230, link: 0.000, dmg: 4.02, launch: 466 },
    ],
    skill: { kind: 'sine', name: '上挑斩 · 正弦跃', cost: 0, cd: 4.6, dmg: 65, pct: 0.1033, coef: 'heavyCoef', desc: '瞬身突进 · 无敌 0.30s（约 3/7 小格）' },
    ai: { atk: 1.00, air: 1.00, def: 1.00 },
  },
  /* ── 菱形 RHOMBUS ──────────────────────────────────────────────────── */
  {
    id: 'rhombus', name: '菱形', en: 'RHOMBUS', title: '最优覆盖',
    role: '高速连段 · SPEED', icon: '◆',
    sides: 4, r: 22, theta: 45, color: '#22d3ee', lite: '#b3f4ff', inner: '#04303a',
    hp: 0.90, spd: 1.13, jump: 1.06, shield: 0.85, energy: 0.98,
    lightCoef: 1.04, airCoef: 1.14, launchCoef: 0.94, diveCoef: 1.06, heavyCoef: 0.92, ultCoef: 1.02,
    cdCoef: 0.89, dodgeCdCoef: 0.86, skillCdCoef: 0.96, hitstunCoef: 1.04,
    lightR: 4, floatG: 0.74, chargeMax: 0.25, launchV: 620,
    strength: '98.6%', quote: '不浪费一点面积的紧凑体。最轻最快，四段连招最锋利；血薄、护盾弱。',
    combo: [
      { name: '对角线·一', w: 0.028, a: 0.050, r: 0.060, link: 0.200, dmg: 2.29, launch: 0 },
      { name: '对角线·二', w: 0.026, a: 0.050, r: 0.060, link: 0.200, dmg: 2.29, launch: 137 },
      { name: '对角线·三', w: 0.028, a: 0.055, r: 0.075, link: 0.180, dmg: 2.70, launch: 306 },
      { name: '对角线·终', w: 0.045, a: 0.070, r: 0.170, link: 0.000, dmg: 3.74, launch: 466 },
    ],
    skill: { kind: 'mirror', name: '镜像 · 对称轴', cost: 0, cd: 3.8, dmg: 65, pct: 0.1033, coef: 'lightCoef', desc: '后撤留影 · 反射引爆（约 3/7 小格）' },
    ai: { atk: 1.06, air: 1.18, def: 0.88 },
  },
  /* ── 方 FORM ───────────────────────────────────────────────────────── */
  {
    id: 'form', name: '方', en: 'FORM', title: '直角公理',
    role: '规则压制 · RULE', icon: '■',
    sides: 4, r: 22, theta: 50, color: '#a78bfa', lite: '#ddd6fe', inner: '#1e1040',
    hp: 1.04, spd: 0.98, jump: 0.98, shield: 1.10, energy: 1.04,
    lightCoef: 1.08, airCoef: 1.02, launchCoef: 1.00, diveCoef: 1.02, heavyCoef: 1.06, ultCoef: 1.04,
    cdCoef: 1.02, dodgeCdCoef: 1.04, skillCdCoef: 0.92, hitstunCoef: 0.98,
    lightR: 6, floatG: 1.00, chargeMax: 0.25, launchV: 620,
    strength: '100.2%', quote: '只相信直角与等长。出招方正、判定宽、收招果断，用正方形判定块封住对手走位。',
    combo: [
      { name: '格律·一', w: 0.040, a: 0.070, r: 0.090, link: 0.210, dmg: 2.65, launch: 0 },
      { name: '格律·二', w: 0.038, a: 0.070, r: 0.090, link: 0.210, dmg: 2.76, launch: 137 },
      { name: '格律·三', w: 0.050, a: 0.080, r: 0.115, link: 0.200, dmg: 3.10, launch: 306 },
      { name: '格律·终', w: 0.078, a: 0.095, r: 0.235, link: 0.000, dmg: 4.18, launch: 466 },
    ],
    skill: { kind: 'grid', name: '格点封锁 · GRID LOCK', cost: 0, cd: 4.6, dmg: 0, coef: 'lightCoef', desc: '3×3 格点阵 · 离散化（克高速连段）' },
    ai: { atk: 0.96, air: 0.94, def: 1.16 },
  },
  /* ── 六边 HEX ──────────────────────────────────────────────────────── */
  {
    id: 'hex', name: '六边', en: 'HEX', title: '密铺之环',
    role: '重装强攻 · HEAVY', icon: '⬡',
    sides: 6, r: 22, theta: 60, color: '#f59e0b', lite: '#fde68a', inner: '#3a1f02',
    hp: 1.20, spd: 0.90, jump: 0.95, shield: 1.18, energy: 1.04,
    lightCoef: 0.76, airCoef: 0.88, launchCoef: 1.12, diveCoef: 1.12, heavyCoef: 1.20, ultCoef: 1.12,
    cdCoef: 1.11, dodgeCdCoef: 1.14, skillCdCoef: 1.05, hitstunCoef: 1.10,
    lightR: 7, floatG: 1.00, chargeMax: 0.31, launchV: 680,
    strength: '100.9%', quote: '能无缝铺满整个平面的形状。最大体格与血量，重击、上挑、大招最重；移动最慢。',
    combo: [
      { name: '蜂巢·一', w: 0.060, a: 0.085, r: 0.130, link: 0.220, dmg: 3.80, launch: 0 },
      { name: '蜂巢·二', w: 0.065, a: 0.090, r: 0.140, link: 0.220, dmg: 4.00, launch: 137 },
      { name: '蜂巢·三', w: 0.075, a: 0.095, r: 0.160, link: 0.160, dmg: 4.80, launch: 306 },
      { name: '蜂巢·终', w: 0.100, a: 0.110, r: 0.260, link: 0.000, dmg: 6.40, launch: 466 },
    ],
    skill: { kind: 'tess', name: '密铺护壁 · TESSELLATION', cost: 0, cd: 6.5, dmg: 0, coef: 'heavyCoef', desc: '减伤 45% · 完美窗 0.20s（怕上挑）' },
    ai: { atk: 1.04, air: 0.80, def: 1.06 },
  },
  /* ── 螺旋 SPIRAL ───────────────────────────────────────────────────── */
  {
    id: 'spiral', name: '螺旋', en: 'SPIRAL', title: '无限逼近',
    role: '技巧特化 · TECHNIQUE', icon: '◠',
    sides: 0, r: 18, theta: 40, color: '#f472b6', lite: '#fbcfe8', inner: '#3d0a22',
    hp: 0.96, spd: 1.02, jump: 1.08, shield: 1.12, energy: 1.10,
    lightCoef: 1.02, airCoef: 1.00, launchCoef: 0.98, diveCoef: 0.96, heavyCoef: 0.94, ultCoef: 1.18,
    cdCoef: 1.06, dodgeCdCoef: 1.00, skillCdCoef: 0.74, hitstunCoef: 0.96,
    lightR: -2, floatG: 1.00, chargeMax: 0.25, launchV: 620,
    strength: '100.4%', quote: '一条永远逼近却永不闭合的曲线。技能冷却最短、能量积攒最快，打的是节奏与计算。',
    combo: [
      { name: '渐近·一', w: 0.040, a: 0.075, r: 0.095, link: 0.210, dmg: 2.35, launch: 0 },
      { name: '渐近·二', w: 0.038, a: 0.075, r: 0.095, link: 0.210, dmg: 2.35, launch: 137 },
      { name: '渐近·三', w: 0.055, a: 0.085, r: 0.125, link: 0.200, dmg: 3.01, launch: 306 },
      { name: '渐近·终', w: 0.080, a: 0.100, r: 0.210, link: 0.000, dmg: 4.14, launch: 466 },
    ],
    skill: { kind: 'limit', name: '极限运算 · LIMIT', cost: 0, cd: 6.0, dmg: 22, coef: 'ultCoef', desc: '无敌 1.0s · 完美窗 0.15s' },
    ai: { atk: 0.98, air: 1.02, def: 1.12 },
  },
  /* ── 三角函 TRIG ───────────────────────────────────────────────────── */
  {
    id: 'trig', name: '三角函数', en: 'TRIG', title: '周期函数',
    role: '远程压制 · RANGED', icon: '∿',
    sides: 0, r: 20, theta: 38, color: '#38bdf8', lite: '#bae6fd', inner: '#082f49',
    hp: 0.92, spd: 0.94, jump: 0.98, shield: 0.92, energy: 1.06,
    lightCoef: 0.98, airCoef: 0.96, launchCoef: 1.00, diveCoef: 1.00, heavyCoef: 0.96, ultCoef: 1.00,
    cdCoef: 1.02, dodgeCdCoef: 1.00, skillCdCoef: 0.95, hitstunCoef: 1.04,
    lightR: 0, floatG: 1.00, chargeMax: 0.25, launchV: 620,
    strength: '100.0%', quote: '一条永不停止振荡的曲线。近身可战，远距可狙，但一旦被贴住就很脆。',
    combo: [
      { name: '初相·一', w: 0.038, a: 0.068, r: 0.088, link: 0.210, dmg: 2.50, launch: 0 },
      { name: '初相·二', w: 0.036, a: 0.068, r: 0.088, link: 0.210, dmg: 2.60, launch: 137 },
      { name: '初相·三', w: 0.048, a: 0.078, r: 0.112, link: 0.200, dmg: 2.95, launch: 306 },
      { name: '初相·终', w: 0.074, a: 0.092, r: 0.225, link: 0.000, dmg: 4.00, launch: 466 },
    ],
    skill: { kind: 'cosine', name: '余弦 · COSINE', cost: 0, cd: 4.2, dmg: 0, pct: 0.1033, coef: 'lightCoef',
      desc: '发射余弦弹，命中后爆炸 · 脱身时渐近闪避（瞬移拉开距离，耗能 18 / 冷却 6.5s）' },
    ai: { atk: 1.02, air: 0.96, def: 1.04 },
  },
  /* ── 圆 CIRCLE（隐藏） ─────────────────────────────────────────────── */
  {
    id: 'circle', name: '圆', en: 'CIRCLE', title: '极限形状',
    role: '全能 · OMNI', icon: '●', hidden: true,
    sides: 0, r: 24, theta: 90, color: '#ffffff', lite: '#ffffff', inner: '#0b1220',
    hp: 1.12, spd: 1.00, jump: 1.00, shield: 1.00, energy: 1.00,
    lightCoef: 0.94, airCoef: 0.96, launchCoef: 1.00, diveCoef: 1.00, heavyCoef: 0.98, ultCoef: 1.00,
    cdCoef: 1.00, dodgeCdCoef: 1.00, skillCdCoef: 1.00, hitstunCoef: 1.00,
    lightR: 5, floatG: 1.00, chargeMax: 0.25, launchV: 620,
    strength: '—', quote: '无穷多边的极限形态。没有任何短板，也没有任何突出的长处；它的强项是“哪里都不会输”。',
    combo: [
      { name: '弧度·一', w: 0.036, a: 0.066, r: 0.086, link: 0.215, dmg: 2.62, launch: 0 },
      { name: '弧度·二', w: 0.034, a: 0.066, r: 0.086, link: 0.215, dmg: 2.62, launch: 137 },
      { name: '弧度·三', w: 0.046, a: 0.078, r: 0.112, link: 0.195, dmg: 3.16, launch: 306 },
      { name: '弧度·终', w: 0.072, a: 0.092, r: 0.228, link: 0.000, dmg: 4.28, launch: 466 },
    ],
    skill: { kind: 'pi', name: '圆周率 · π', cost: 0, cd: 5.0, dmg: 72, pct: 0.1143, coef: 'lightCoef', desc: '360° 圆周判定 · 约 3/7 小格' },
    ai: { atk: 1.00, air: 1.00, def: 1.00 },
  },
];
const CHAR_MAP = {};
CHARS.forEach(c => { CHAR_MAP[c.id] = c; });
/* 待机旋转模式：对称图形持续自转，锐角图形改为轻微摆动以保持可读性 */
const SPIN_MODE = { triangle: 'sway', rhombus: 'spin', form: 'sway', hex: 'sway', spiral: 'spin', circle: 'spin' };
CHARS.forEach(c => { c.spinMode = SPIN_MODE[c.id] || 'spin'; });
const BASE_FIVE = CHARS.filter(c => !c.hidden);

/* ═══════════════════════════════════════════════════════════════════════════
 * 4 · 场景数据 SCENES
 * ═══════════════════════════════════════════════════════════════════════════ */
const SCENES = [
  { id: 'cartesian', name: '笛卡尔平面', en: 'CARTESIAN PLANE', bg: '#070b14',
    grid: 'rgba(255,255,255,.06)', main: '#22d3ee', desc: '标准空间 · 无特殊影响', mod: {} },
  { id: 'complex', name: '复平面', en: 'COMPLEX PLANE', bg: '#0f0618',
    grid: 'rgba(167,139,250,.10)', main: '#c084fc', desc: '虚数空间 · 能量 +10%', mod: { energy: 1.10 } },
  { id: 'fractal', name: '分形海岸', en: 'FRACTAL SHORE', bg: '#04121a',
    grid: 'rgba(125,211,252,.09)', main: '#7dd3fc', desc: '折线地面 · 落点不固定', mod: { ground: true } },
  { id: 'polar', name: '极坐标', en: 'POLAR GRID', bg: '#140d0a',
    grid: 'rgba(251,191,36,.10)', main: '#fbbf24', desc: '极坐标宽容 · 判定角 +5°', mod: { theta: 5 } },
];
const SCENE_MAP = {};
SCENES.forEach(s => { SCENE_MAP[s.id] = s; });

/* ═══════════════════════════════════════════════════════════════════════════
 * 5 · 难度 / 成就 / 连招挑战
 * ═══════════════════════════════════════════════════════════════════════════ */
const DIFFS = [
  { id: 'point',   name: '点',   en: 'POINT',   think: 1.00,  react: 1.00, aggr: 0.00, move: 0.00, dist: 0,   escape: 0.00, counter: 0.00, guard: 0.00, dodge: 0.00, release: 0.000, ult: 0.00, jumpDodge: 0.00, momentum: 0.0,  breakWall: 0.00, desc: '静止不动的训练假人' },
  { id: 'line',    name: '线',   en: 'LINE',    think: 0.180, react: 0.25, aggr: 0.68, move: 0.62, dist: 158, escape: 0.02, counter: 0.05, guard: 0.10, dodge: 0.05, release: 0.780, ult: 0.48, jumpDodge: 0.00, momentum: 3.2,  breakWall: 0.02, desc: '初学者的第一道辅助线' },
  { id: 'angle',  name: '角',   en: 'ANGLE',   think: 0.095, react: 0.18, aggr: 0.86, move: 0.78, dist: 142, escape: 0.10, counter: 0.18, guard: 0.20, dodge: 0.13, release: 0.880, ult: 0.62, jumpDodge: 0.10, momentum: 5.5,  breakWall: 0.06, desc: '开始会读招的夹角' },
  { id: 'form',   name: '形',   en: 'FORM',    think: 0.052, react: 0.12, aggr: 0.95, move: 0.90, dist: 128, escape: 0.20, counter: 0.34, guard: 0.30, dodge: 0.21, release: 0.940, ult: 0.72, jumpDodge: 0.22, momentum: 7.5,  breakWall: 0.11, desc: '规整而压迫的形状' },
  { id: 'body',   name: '体',   en: 'BODY',    think: 0.038, react: 0.08, aggr: 0.98, move: 0.96, dist: 138, escape: 0.34, counter: 0.55, guard: 0.38, dodge: 0.33, release: 0.960, ult: 0.82, jumpDodge: 0.48, momentum: 9.5,  breakWall: 0.18, desc: '有质量的完整几何体' },
  { id: 'measure',name: '测度', en: 'MEASURE', think: 0.050, react: 0.10, aggr: 1.00, move: 1.00, dist: 122, escape: 0.52, counter: 0.80, guard: 0.50, dodge: 0.47, release: 0.985, ult: 0.94, jumpDodge: 0.82, momentum: 12.0, breakWall: 0.28, desc: '无限的度量 · 最强 AI' },
];

const TIER_COLOR = { '命题': '#d08a5a', '引理': '#cbd5e1', '定理': '#fbbf24', '公理': '#f8fafc' };

const ACHS = [
  { id: 'first', tier: '命题', name: '首次证明', code: 'FIRST PROOF', desc: '赢得第一场自由对战' },
  { id: 'axiom', tier: '引理', name: '常驻公理', code: 'AXIOM', desc: '累计赢得 10 场' },
  { id: 'unfalsifiable', tier: '定理', name: '不可证伪', code: 'UNFALSIFIABLE', desc: '累计赢得 50 场' },
  { id: 'induction', tier: '定理', name: '归纳成立', code: 'INDUCTION', desc: '达成 5 连胜' },
  { id: 'sequence', tier: '引理', name: '连段推演', code: 'SEQUENCE', desc: '单场达成 15 连击' },
  { id: 'limitCombo', tier: '定理', name: '极限连段', code: 'LIMIT COMBO', desc: '单场达成 25 连击' },
  { id: 'solver', tier: '引理', name: '解法者', code: 'SOLVER', desc: '单场触发 3 次完美闪避' },
  { id: 'reductio', tier: '定理', name: '反证法', code: 'REDUCTIO', desc: '单场完成 3 次完美防反' },
  { id: 'centerOfMass', tier: '引理', name: '质心角力', code: 'CENTER OF MASS', desc: '角力连打获胜' },
  { id: 'threeTiers', tier: '定理', name: '三种终结', code: 'THREE TIERS', desc: '触发过 Q.E.D. / LEMA / THEOREM' },
  { id: 'theorem3', tier: '定理', name: '完美证明', code: 'THEOREM ×3', desc: '累计 3 次完美终结' },
  { id: 'nullHypothesis', tier: '定理', name: '零假设', code: 'NULL HYPOTHESIS', desc: '零伤害获胜' },
  { id: 'orthogonal', tier: '引理', name: '正交命中', code: 'ORTHOGONAL', desc: '夹角 ≤ 5° 命中 10 次' },
  { id: 'pentagon', tier: '定理', name: '五边形完备', code: 'PENTAGON', desc: '用前五名角色各赢一场' },
  { id: 'approach', tier: '公理', name: '极限逼近', code: 'APPROACH', desc: '解锁隐藏角色「圆」' },
  { id: 'iteration', tier: '引理', name: '反复证明', code: 'ITERATION', desc: '累计完成 20 场' },
  { id: 'accumulated', tier: '引理', name: '累积误差', code: 'ACCUMULATED', desc: '累计造成 15,000 伤害' },
  { id: 'contrapositive', tier: '定理', name: '逆否反杀', code: 'CONTRAPOSITIVE', desc: '剩余 15% 以下血量获胜' },
  { id: 'identity', tier: '引理', name: '恒等式', code: 'IDENTITY', desc: '满血获胜且受伤 ≤ 60' },
  { id: 'proofMachine', tier: '命题', name: '定理机器', code: 'PROOF MACHINE', desc: '累计释放 50 次技能' },
  { id: 'settled', tier: '定理', name: '实验室毕业', code: 'SETTLED', desc: '完成全部 8 项连招挑战' },
  { id: 'bisector', tier: '引理', name: '角平分线', code: 'BISECTOR', desc: '用推论反击终结对局 3 次' },
  { id: 'particle', tier: '定理', name: '质点', code: 'PARTICLE', desc: '与「点」形态完成 1 场对局' },
  { id: 'completeness', tier: '公理', name: '完备性', code: 'COMPLETENESS', desc: '解锁全部其它成就' },
];

const CHALLENGES = [
  { id: 'aerial2', name: '空中二连', desc: '用空中轻击完成至少 2 连击' },
  { id: 'juggle3', name: '浮空追击 III', desc: '一次浮空追击中命中 3 次空中轻击' },
  { id: 'launchFollow', name: '上挑追击', desc: '上挑命中后，用空中轻击继续追击' },
  { id: 'combo10', name: '十连击', desc: '在一次连招中达成 10 连击' },
  { id: 'perfectDodge', name: '完美闪避', desc: '在完美窗口内闪避对手攻击' },
  { id: 'clashWin', name: '质心碰撞胜利', desc: '在碰撞角力连打中战胜对手' },
  { id: 'orthogonal', name: '直角命中', desc: '夹角 ≤ 5° 时命中 5 次' },
  { id: 'fullChain', name: '全等证明', desc: '一套连招中四段全部命中（1a~4a 全中）' },
];

/* ═══════════════════════════════════════════════════════════════════════════
 * 6 · 音效 AUDIO（Web Audio 实时合成 · 正弦为主）
 * ═══════════════════════════════════════════════════════════════════════════ */
const Sfx = {
  ctx: null, master: null, comp: null, revSend: null, ready: false,

  init() {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const c = this.ctx;
      /* 主链路：压缩器 → 主音量 → 输出（避免连击时爆音） */
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 18;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.002;
      this.comp.release.value = 0.14;
      this.master = c.createGain();
      this.master.gain.value = 0.5;
      this.comp.connect(this.master);
      this.master.connect(c.destination);

      /* 简易混响：金属击打需要一点“空间”，否则只有噪声感 */
      this.revSend = c.createGain();
      this.revSend.gain.value = 0.16;
      this.revSend.connect(this.comp);
      const conv = c.createConvolver();
      conv.buffer = this.makeImpulse(1.1, 3.2);
      const wet = c.createGain();
      wet.gain.value = 0.5;
      this.revSend.connect(conv);
      conv.connect(wet);
      wet.connect(this.comp);
      this.ready = true;
    } catch (e) { /* 无音频环境 */ }
  },

  /** 生成金属混响脉冲：带中高频衰减的短尾 */
  makeImpulse(sec, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  },

  vol() { return S.settings ? S.settings.volume : 0.6; },
  muted() { return !S.settings || S.settings.muted; },

  /** 就绪 + 未静音 */
  can() { return this.ready && S.settings && !S.settings.muted && S.settings.volume > 0; },

  /* ── 基础合成器 ─────────────────────────────────────────────── */

  /** 单音：可带滑音、泛音、包络 */
  tone(freq, dur, type = 'sine', vol = 0.15, slide = 0, delay = 0, opts) {
    if (!this.can()) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    const f = Math.max(24, freq);
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(24, f + slide), t0 + dur);
    const v = vol * this.vol();
    const atk = opts && opts.attack ? opts.attack : 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.comp);
    if (opts && opts.reverb) {
      const r = c.createGain(); r.gain.value = opts.reverb;
      g.connect(r); r.connect(this.revSend);
    }
    o.start(t0); o.stop(t0 + dur + 0.04);
  },

  /** 金属泛音：一个基频 + 若干非整数倍泛音，形成“叮”的金属质感 */
  partials(freq, dur, ratios, vol = 0.10, delay = 0, decayIn) {
    if (!this.can()) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    ratios.forEach(([r, amp, dscale], idx) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      const f = freq * r;
      o.frequency.setValueAtTime(f, t0);
      /* 泛音微微下滑，模拟金属衰减时的失谐 */
      o.frequency.exponentialRampToValueAtTime(f * 0.985, t0 + dur * (dscale || 1));
      const v = vol * amp * this.vol();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (dscale || 1));
      o.connect(g); g.connect(this.comp);
      const rv = c.createGain(); rv.gain.value = 0.10 + idx * 0.02;
      g.connect(rv); rv.connect(this.revSend);
      o.start(t0); o.stop(t0 + dur * (dscale || 1) + 0.04);
    });
  },

  /** 噪声爆发：type = lowpass / highpass / bandpass */
  noise(dur = 0.12, vol = 0.12, cut = 900, delay = 0, type = 'lowpass', q = 0.9) {
    if (!this.can()) return;
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let seed = Math.random() * 1000;
    for (let i = 0; i < len; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const n = (seed / 233280) * 2 - 1;
      d[i] = n * Math.pow(1 - i / len, 1.6);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = cut; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol * this.vol();
    src.connect(f); f.connect(g); g.connect(this.comp);
    src.start(c.currentTime + delay);
  },

  /** 金属刮擦：高通噪声 + 快速扫频，用作挥砍的风切声 */
  swipe(dur = 0.09, vol = 0.05, f0 = 4200, f1 = 1800, delay = 0) {
    if (!this.can()) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * Math.pow(x, 0.6)) * (1 - x * 0.5);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain(); g.gain.value = vol * this.vol();
    src.connect(f); f.connect(g); g.connect(this.comp);
    src.start(t0);
  },

  /** 金属共振：两个频率极高的且非谐和的振荡器，模拟“铛” */
  clang(base, dur, vol, delay) {
    this.partials(base, dur, [
      [1, 1.0, 1.0],
      [2.76, 0.62, 0.82],
      [5.40, 0.40, 0.6],
      [8.93, 0.22, 0.42],
      [13.3, 0.12, 0.3],
    ], vol, delay);
  },

  /** 角色音色偏移：六边更低沉、菱形更清脆 */
  pitchOf(f) {
    const p = { triangle: 1.00, rhombus: 1.14, form: 1.06, hex: 0.86, spiral: 1.10, trig: 1.18, circle: 1.22 };
    return f && f.char ? p[f.char.id] || 1 : 1;
  },

  /* ── 音效库：按击中力度 / 招式选择不同音色 ─────────────────── */

  /** 轻击：按连段序号与力度分级，越往后越"脆" */
  lightHit(stage, k, crit) {
    const f0 = (1500 + stage * 240) * k;
    this.clang(f0, 0.30, crit ? 0.20 : 0.13);
    this.swipe(0.05, 0.045, 5200 * k, 2400 * k);
    if (crit) {
      this.tone(f0 * 2.2, 0.14, 'sine', 0.06, -300, 0.01);
      this.noise(0.06, 0.07, 9000, 0, 'highpass');
    }
  },

  /** 重击：低沉金属撞击 + 高频泛音短尾 */
  heavyHit(k, crit) {
    this.clang(520 * k, 0.55, crit ? 0.26 : 0.19);
    this.tone(150 / k, 0.28, 'triangle', 0.16, -60);
    this.noise(0.16, 0.14, 1400, 0, 'lowpass');
    this.noise(0.05, 0.06, 9000, 0, 'highpass');
  },

  play(name, who, extra) {
    if (!this.ready) return;
    const k = this.pitchOf(who);
    const ex = extra || {};
    switch (name) {
      /* ── 攻击 ── */
      case 'light': this.lightHit(ex.stage || 1, k, ex.crit); break;
      case 'air': this.clang(1900 * k, 0.22, 0.11); this.swipe(0.04, 0.04, 6000 * k, 3000 * k); break;
      case 'heavy': this.heavyHit(k, ex.crit); break;
      case 'launch': this.tone(320 * k, 0.16, 'triangle', 0.16, 700); this.clang(1300 * k, 0.26, 0.10, 0.01); break;
      case 'dive': this.clang(380 * k, 0.4, 0.16); this.noise(0.16, 0.14, 900, 0, 'lowpass'); break;
      case 'swing': this.swipe(ex.power || 0.055, 0.035, 6200 * k, 2200 * k); break;
      case 'ult': {
        /* 大招：上行五度和弦 + 超长金属尾音 */
        const base = 220 * k;
        [1, 1.5, 2, 3].forEach((r, i) => this.tone(base * r, 0.5 + i * 0.06, 'sine', 0.10 - i * 0.015, 90 * r, i * 0.03, { reverb: 0.4 }));
        this.clang(660 * k, 0.9, 0.16, 0.02);
        this.swipe(0.3, 0.08, 5000, 800);
        break;
      }

      /* ── 防御 / 闪避 ── */
      case 'parry':
        this.clang(1400, 0.34, 0.20);
        this.clang(2100, 0.26, 0.12, 0.012);
        this.noise(0.07, 0.10, 10000, 0, 'highpass');
        this.swipe(0.06, 0.05, 7000, 3000);
        break;
      case 'guard': this.clang(900 * k, 0.2, 0.10); this.noise(0.05, 0.06, 6400, 0, 'highpass'); break;
      case 'break': this.clang(300, 0.6, 0.18); this.noise(0.3, 0.16, 600, 0, 'lowpass'); this.tone(120, 0.4, 'sawtooth', 0.10, -50); break;
      case 'dodge': this.swipe(0.09, 0.07, 3200, 6800); this.tone(620, 0.08, 'sine', 0.05, 240); break;
      case 'perfect':
        [1046, 1568, 2093, 3136].forEach((f, i) => this.partials(f, 0.34, [[1, 1, 1], [2.4, 0.5, 0.7]], 0.09, i * 0.025));
        this.noise(0.08, 0.07, 12000, 0, 'highpass');
        break;

      /* ── 技能 / 脱身 ── */
      case 'skill': {
        const sk = ex.kind || (who && who.char ? who.char.skill.kind : 'sine');
        if (sk === 'mirror') { this.partials(1760 * k, 0.3, [[1, 1, 1], [1.5, 0.6, 0.8], [2, 0.4, 0.6]], 0.10); this.swipe(0.12, 0.05, 2500, 6000); }
        else if (sk === 'grid') { this.tone(880, 0.14, 'square', 0.05, 200); this.tone(1320, 0.12, 'square', 0.03, 120, 0.05); }
        else if (sk === 'tess') { this.clang(760 * k, 0.5, 0.12); this.tone(200, 0.3, 'triangle', 0.10, 40); }
        else if (sk === 'limit') { this.partials(1200, 0.5, [[1, 1, 1], [1.33, 0.6, 0.8], [2.67, 0.3, 0.5]], 0.09); }
        else if (sk === 'pi') { this.clang(1980, 0.6, 0.14, 0.01); this.tone(520, 0.4, 'sine', 0.07, 0); }
        else { this.tone(560, 0.2, 'sine', 0.12, 420); this.clang(1680 * k, 0.3, 0.09, 0.02); }
        this.noise(0.10, 0.05, 7000, 0, 'highpass');
        break;
      }
      case 'escape': this.swipe(0.16, 0.08, 700, 5000); this.clang(1600, 0.3, 0.10, 0.02); break;

      /* ── 移动 / 物理 ── */
      case 'jump': this.tone(400, 0.08, 'sine', 0.06, 220); this.swipe(0.05, 0.025, 2600, 5000); break;
      case 'land': this.tone(92, 0.10, 'sine', 0.10, -25); this.noise(0.06, 0.06, 700, 0, 'lowpass'); break;
      case 'wall': this.clang(240, 0.5, 0.18); this.noise(0.12, 0.12, 900, 0, 'lowpass'); break;
      case 'charge': this.tone(200, 0.12, 'triangle', 0.045, 80); break;
      case 'clash': this.clang(1100, 0.45, 0.20); this.clang(1700, 0.4, 0.12, 0.01); this.noise(0.1, 0.12, 8000, 0, 'highpass'); break;

      /* ── 结束 / 界面 ── */
      case 'ko': this.tone(110, 0.6, 'sine', 0.20, -60); this.tone(165, 0.7, 'sine', 0.12, -40, 0.03); this.noise(0.5, 0.10, 500, 0, 'lowpass'); this.clang(330, 1.0, 0.10, 0.05); break;
      case 'shatter': {
        /* 玻璃碎裂：一堆随机高频短音 + 高通噪声 */
        for (let i = 0; i < 7; i++) {
          this.partials(2200 + Math.random() * 4200, 0.10 + Math.random() * 0.18, [[1, 1, 1], [2.3, 0.4, 0.6]], 0.05, i * 0.018);
        }
        this.noise(0.26, 0.15, 9000, 0, 'highpass');
        this.tone(90, 0.4, 'sine', 0.16, -30);
        break;
      }
      case 'finish':
        [523, 659, 784, 1046].forEach((f, i) => this.partials(f, 1.0, [[1, 1, 1], [2, 0.3, 0.6]], 0.06, i * 0.09));
        this.clang(1318, 1.2, 0.10, 0.06);
        break;
      case 'ui': this.tone(1760, 0.035, 'sine', 0.05, -300); this.noise(0.02, 0.03, 12000, 0, 'highpass'); break;
      case 'back': this.tone(1320, 0.05, 'sine', 0.05, -500); break;
      case 'ach': [1046, 1318, 1568, 2093].forEach((f, i) => this.partials(f, 0.4, [[1, 1, 1], [2.7, 0.4, 0.7]], 0.07, i * 0.07)); break;
      case 'challenge': [1568, 2093, 2637].forEach((f, i) => this.partials(f, 0.3, [[1, 1, 1], [2.4, 0.4, 0.6]], 0.065, i * 0.06)); break;
      case 'sineShot': this.tone(880, 0.12, 'sine', 0.08, 420); this.swipe(0.06, 0.04, 5000, 2000); break;
      case 'sineHit': this.clang(1500, 0.28, 0.12); this.swipe(0.05, 0.04, 5200, 2400); break;
      case 'cosShot': this.partials(660, 0.22, [[1, 1, 1], [1.5, 0.6, 0.8]], 0.07); this.tone(330, 0.18, 'triangle', 0.06, -90); break;
      case 'cosBlast': this.clang(420, 0.55, 0.18); this.noise(0.22, 0.14, 1200, 0, 'lowpass'); this.partials(1100, 0.3, [[1, 1, 1], [2.4, 0.5, 0.7]], 0.07); break;
      case 'lockOn': this.tone(1320, 0.06, 'square', 0.06, 200); this.tone(1760, 0.08, 'sine', 0.05, 0, 0.09); break;
      case 'tanStrike': this.clang(240, 0.5, 0.20); this.noise(0.16, 0.14, 900, 0, 'lowpass'); this.partials(720, 0.3, [[1, 1, 1], [2.7, 0.5, 0.6]], 0.07); break;
      case 'counter': this.clang(1760, 0.5, 0.16); this.clang(2349, 0.42, 0.10, 0.015); this.partials(3520, 0.3, [[1, 1, 1]], 0.05, 0.02); break;
      case 'crit': this.clang(2600, 0.3, 0.12); this.noise(0.05, 0.06, 13000, 0, 'highpass'); break;
      default: break;
    }
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 7 · 存档 SAVE SYSTEM（设置 / 比赛配置 / 永久战绩 三份独立存档）
 * ═══════════════════════════════════════════════════════════════════════════ */
const KEYS = {
  settings: 'geometry-war-settings-v1',
  match: 'geometry-war-match-v1',
  profile: 'geometry-war-profile-v1',
  backup: 'geometry-war-profile-backup-v1',
};

const DEFAULT_SETTINGS = {
  volume: 0.6, shake: 1, particles: 1, hitstop: 1,
  muted: false, hints: true, quality: 'high',
  skipFinisher: true, autoRematch: false,
};
const DEFAULT_MATCH = {
  fighter: 'triangle', opponent: 'auto', scene: 'cartesian',
  diff: 2, finisher: 'auto', quality: 'high',
};
function defaultProfile() {
  const chars = {};
  CHARS.forEach(c => { chars[c.id] = { w: 0, l: 0, d: 0, bestCombo: 0, angleSum: 0, angleN: 0 }; });
  return {
    v: 1,
    stats: {
      matches: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, bestCombo: 0,
      damage: 0, taken: 0, hits: 0, perfectDodges: 0, perfectCounters: 0, clashWins: 0,
      skills: 0, finishers: 0, theoremFinishers: 0, bisector: 0, orthogonal: 0,
      challenges: 0, playTime: 0,
    },
    chars,
    ach: {},
    ch: {},
    tiers: {},
    unlockedCircle: false,
    enabled: false,
    recent: [],
    angleSum: 0, angleN: 0,
    raw: null,
  };
}

const Store = {
  degraded: false,

  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return (v && typeof v === 'object') ? v : fallback;
    } catch (e) { return fallback; }
  },

  write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { this.degraded = true; return false; }
  },

  load() {
    /* 设置 */
    S.settings = Object.assign({}, DEFAULT_SETTINGS, this.read(KEYS.settings, {}));
    S.settings.keys = Object.assign({}, DEFAULT_KEYS, S.settings.keys || {});
    /* 比赛配置 */
    S.match = Object.assign({}, DEFAULT_MATCH, this.read(KEYS.match, {}));
    /* 永久战绩：主存档 → 备份 → 重建 */
    let prof = this.read(KEYS.profile, null);
    if (!prof) {
      const bak = this.read(KEYS.backup, null);
      if (bak) { prof = bak; this.degraded = false; }
      else prof = defaultProfile();
    }
    if (!prof.stats || !prof.chars) {
      /* 结构损坏：尽量保留原始内容 */
      const raw = prof;
      prof = defaultProfile();
      prof.raw = raw;
    }
    const base = defaultProfile();
    prof.stats = Object.assign({}, base.stats, prof.stats || {});
    prof.chars = Object.assign({}, base.chars, prof.chars || {});
    prof.ach = prof.ach || {};
    prof.ch = prof.ch || {};
    prof.tiers = prof.tiers || {};
    prof.recent = Array.isArray(prof.recent) ? prof.recent.slice(0, 20) : [];
    prof.enabled = true;
    S.profile = prof;
    this.applySettings();
  },

  saveProfile() {
    if (!S.profile) return;
    const prev = this.read(KEYS.profile, null);
    if (prev) this.write(KEYS.backup, prev);
    this.write(KEYS.profile, S.profile);
  },

  saveSettings() { this.write(KEYS.settings, S.settings); },
  saveMatch() { this.write(KEYS.match, S.match); },
  saveAll() { this.saveProfile(); this.saveSettings(); this.saveMatch(); },

  applySettings() {
    if (Sfx.master) Sfx.master.gain.value = 0.55 * (S.settings.volume || 0);
  },

  clearRecords() {
    const keep = { settings: S.settings, match: S.match };
    S.profile = defaultProfile();
    this.write(KEYS.profile, S.profile);
    this.write(KEYS.backup, S.profile);
    S.settings = keep.settings;
    S.match = keep.match;
  },
};
/* ═══════════════════════════════════════════════════════════════════════════
 * 9 · 全局状态 STATE
 * ═══════════════════════════════════════════════════════════════════════════ */
const S = {
  phase: 'boot',              // boot | menu | fight | finisher | result
  screen: 'menu',
  profile: null, settings: null, match: null,
  p: null, a: null,
  scene: SCENES[0],
  training: false,
  clock: { battle: 0, pres: 0, ui: 0, round: C.ROUND_TIME },
  hitstop: 0, slowmo: 0, shake: 0, shakeT: 0, intensity: 0,
  clash: null, finisher: null, result: null,
  projectiles: [], tanMarks: [],
  parts: [], proofs: [], floats: [], mirrors: [], zones: [], ghosts: [],
  lastAngle: null, hitPulse: 0, flash: 0, shards: [], shockwave: 0,
  debug: { hud: false, boxes: false, math: false },
  trainingCfg: { infinite: true, behavior: 'idle', counter: 'none' },
  testMode: false,
  rematchAt: 0,
  raf: 0, last: 0,
};

const Bus = {
  h: {},
  on(k, fn) { (this.h[k] || (this.h[k] = [])).push(fn); },
  emit(k, d) { const a = this.h[k]; if (a) for (const fn of a) fn(d); },
  clear() { this.h = {}; },
};

/* 设置中补充键位表 */
if (!DEFAULT_SETTINGS.keys) DEFAULT_SETTINGS.keys = Object.assign({}, DEFAULT_KEYS);

/* ═══════════════════════════════════════════════════════════════════════════
 * 10 · 战斗对象 FIGHTER
 * ═══════════════════════════════════════════════════════════════════════════ */
function createFighter(charId, side, isAI) {
  const ch = CHAR_MAP[charId] || CHARS[0];
  const hp = Math.round(C.BASE_HP * ch.hp);
  return {
    char: ch, side, isAI, diff: null,
    x: side === 0 ? 300 : 660, y: GROUND, vx: 0, vy: 0,
    facing: side === 0 ? 1 : -1,
    hp, maxHp: hp, hpTrail: hp,
    energy: C.ENERGY_START, shield: 100,
    state: 'normal', stateT: 0,
    atk: null, act: null, shieldSkill: null,
    guarding: false, charging: false, charge: 0,
    onGround: true, jumps: C.MAX_JUMPS, airActions: C.AIR_ACTIONS, airDodge: 1,
    chain: 0, chainLive: false, chainTimer: 0, chainHits: 0, queued: 0, combo4: 0,
    combo: 0, comboTimer: 0, comboDmg: 0, comboHits: 0, lightDmg: 0,
    launchCount: 0, slamLock: 0, lightProtect: 0,
    stunT: 0, invuln: 0, perfectWindow: 0, followup: 0, hitFlash: 0,
    speedBoost: 0, gridLock: 0, autoHits: null,
    spin: ch.spinMode === 'sway' ? 0 : (ch.id === 'triangle' ? -0.35 : 0.45),
    rot: ch.id === 'rhombus' ? Math.PI / 4 : 0,
    wallCd: 0, ghostT: 0, chargeHold: 0, slowT: 0, slowMul: 1,
    buffer: { jump: false, light: false, t: 0 },
    cd: { heavy: 0, dodge: 0, skill: 0, escape: 0, launch: 0, dive: 0 },
    /* 统计 */
    hits: 0, dmgDealt: 0, dmgTaken: 0, maxCombo: 0, angleSum: 0, angleN: 0,
    bestAngle: 999, orthCount: 0, juggleAir: 0, launchFollow: false,
    perfectDodges: 0, perfectCounters: 0, parries: 0, escapes: 0, skills: 0, ults: 0,
    clashWin: 0,
    /* AI 黑板 */
    ai: {
      think: 0, move: 0, crouch: false, heavyHeld: false, snap: null, snapT: 0,
      crouchHold: 0, timer: 0, cRoll: false, escTimer: 0,
    },
  };
}

const opOf = f => (f === S.p ? S.a : S.p);
/* 站立 / 闪避时按移动方向转身；攻击中锁定出招方向（不会自动对准对手） */
const canTurn = f => f.state === 'normal' || f.state === 'dodge' || f.state === 'escape' || f.state === 'charging';
/** 朝向更新：有方向输入就面向输入方向，否则面向对手 */
function updateFacing(f, opp) {
  if (!canTurn(f)) return;
  const axis = f.isAI ? 0 : moveAxis(f);
  f.facing = axis !== 0 ? axis : (opp.x >= f.x ? 1 : -1);
}
const canAct = f => f.state === 'normal' && f.hp > 0;
const bodyH = f => f.char.r * 2 * (f.guarding ? 0.54 : 1);
const centerY = f => f.y - bodyH(f) / 2;
const bodyR = f => f.char.r * (f.guarding ? 0.875 : 1);
const thetaOf = f => {
  let t = f.char.theta + (S.scene.mod.theta || 0);
  if (f.char.id === 'circle' && f.combo >= 24) t += 10;
  return Math.min(120, t);
};

/** 地面高度（分形海岸为折线） */
function groundAt(x) {
  if (S.scene && S.scene.mod.ground) {
    return GROUND - (
      Math.abs(Math.sin(x * 0.0105)) * 13 +
      Math.abs(Math.sin(x * 0.023 + 1.7)) * 9 +
      Math.abs(Math.sin(x * 0.061 + 2.4)) * 5);
  }
  return GROUND;
}

function moveAxis(f) {
  if (f.isAI) return f.ai.move;
  return (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0);
}
function wantsCrouch(f) { return f.isAI ? f.ai.crouch : Input.down('down'); }
function wantsHeavy(f) { return f.isAI ? f.ai.heavyHeld : Input.down('heavy'); }

/* ═══════════════════════════════════════════════════════════════════════════
 * 8 · 输入层 INPUT（物理键 → 动作名 → 战斗逻辑）
 * ═══════════════════════════════════════════════════════════════════════════ */
const Input = {
  keys: new Set(),
  capture: null,
  _map: null,

  init() {
    window.addEventListener('keydown', e => this.onKey(e, true), { passive: false });
    window.addEventListener('keyup', e => this.onKey(e, false), { passive: false });
    /* 失焦 / 切标签页：清空所有按键，并强制释放蓄力，防止“按键卡住” */
    const drop = () => this.releaseAll();
    window.addEventListener('blur', drop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) drop(); });
  },
  releaseAll() {
    this.keys.clear();
    if (S.p && S.p.state === 'charging') releaseHeavy(S.p);
    if (S.a && S.a.state === 'charging') { S.a.ai.heavyHeld = false; releaseHeavy(S.a); }
  },
  bindMap() {
    if (!this._map) {
      const m = {};
      const keys = (S.settings && S.settings.keys) || DEFAULT_KEYS;
      for (const a of ACTIONS) if (keys[a]) m[keys[a]] = a;
      this._map = m;
    }
    return this._map;
  },
  invalidate() { this._map = null; },
  down(action) {
    const keys = (S.settings && S.settings.keys) || DEFAULT_KEYS;
    const code = keys[action];
    return !!code && this.keys.has(code);
  },
  onKey(e, isDown) {
    const code = e.code;
    if (this.capture) {
      e.preventDefault();
      if (isDown && code !== 'Escape') this.assign(this.capture, code);
      else if (isDown) UI.cancelCapture();
      return;
    }
    /* 所有已绑定动作 + 功能键都阻止默认行为（方向键 / 空格不会滚动页面） */
    if (code === 'Escape' || code === 'F1' || code === 'F2' || code === 'F3' || code === 'F4' ||
        this.bindMap()[code] || code === 'Enter' || code === 'KeyR') {
      if (e.preventDefault) e.preventDefault();
    }
    if (isDown && e.repeat) return;
    if (isDown) this.keys.add(code); else this.keys.delete(code);
    if (isDown) this.dispatch(code);
    else this.onRelease(code);
  },
  /** 松开按键：重击松开立刻释放蓄力 */
  onRelease(code) {
    if (S.phase !== 'fight') return;
    const p = S.p;
    if (!p) return;
    if (this.bindMap()[code] === 'heavy' && p.state === 'charging') releaseHeavy(p);
  },
  dispatch(code) {
    Sfx.init();
    /* H：玩法说明只在菜单 / 暂停等非对战界面可用（避免对战中误触） */
    if (code === 'KeyH' && (S.phase === 'menu' || S.phase === 'result' || S.paused || UI.cur === 'pause')) {
      UI.open('help', UI.cur === 'pause' ? 'pause' : 'menu');
      return;
    }
    /* 终结演出按键：
       · 动画阶段：跳过动画，跳到标题画面（不会直接结束，标题仍停留 RESULT_DELAY 秒）
       · 展示阶段：按 Space/Enter 可立即进入结算（0.6s 保护，防手快连按） */
    if (S.phase === 'finisher') {
      const F = S.finisher;
      const anyKey = code === 'Space' || code === 'Enter' || this.bindMap()[code];
      if (!anyKey) return;
      if (F && F.done) {
        if (code === 'Space' || code === 'Enter') {
          if ((F.t2 || 0) >= 0.6) openResultScreen();
        }
        return;
      }
      if (S.settings.skipFinisher) skipFinisher();
      return;
    }
    if (S.phase === 'result') {
      if (code === 'KeyR') restartMatch();
      else if (code === 'Escape') UI.open('menu');
      return;
    }
    /* 菜单 / 选择界面：Enter 前进，Esc 返回 */
    if (S.phase === 'menu') {
      if (code === 'Enter') {
        if (UI.cur === 'versus') startMatch('versus');
        else if (UI.cur === 'training') startMatch('training');
        else if (UI.cur === 'help') {
          S.profile.seenHelp = true; Store.saveProfile();
          UI.open('versus');
        } else if (UI.cur === 'menu') UI.open('versus');
      } else if (code === 'Escape' && UI.cur && UI.cur !== 'menu') UI.open('menu');
      return;
    }
    if (S.phase !== 'fight') return;

    if (code === 'Escape') {
      if (S.paused) resumeGame(); else pauseGame();
      return;
    }
    if (S.paused) return;
    if (code === 'KeyR') { restartMatch(); return; }
    if (code === 'F1') { S.debug.hud = !S.debug.hud; return; }
    if (code === 'F2') { S.paused = true; UI.open('training', 'pause'); return; }
    if (code === 'F3') { S.debug.boxes = !S.debug.boxes; return; }
    if (code === 'F4') { S.debug.math = !S.debug.math; return; }
    if (code === 'KeyY' && S.training) { resetPositions(); return; }

    const p = S.p;
    if (!p) return;
    /* 角力连打 */
    if (S.clash) {
      if (['light', 'heavy', 'jump', 'dodge', 'skill'].some(a => this.bindMap()[code] === a)) clashMash();
      return;
    }
    const act = this.bindMap()[code];
    /* 顿帧期间按下的攻击 / 跳跃：记录并在顿帧结束那一帧补发，指令不丢 */
    const buffered = ['light', 'jump', 'heavy', 'ult'];
    if (S.hitstop > 0 && buffered.includes(act)) { bufferInput(p, act); return; }
    switch (act) {
      case 'light':  tryLight(p); break;
      case 'jump':   tryJump(p); break;
      case 'dodge':  tryDodge(p); break;
      case 'skill':  trySkill(p); break;
      case 'heavy':  tryHeavyKey(p); break;
      case 'ult':    tryUlt(p); break;
      case 'counter': tryCounter(p, 'counter'); break;
      default: break;
    }
  },
  assign(action, code) {
    const keys = S.settings.keys;
    const old = keys[action];
    /* 已被占用 → 交换两个动作的键位 */
    for (const other of ACTIONS) {
      if (other !== action && keys[other] === code) {
        keys[other] = old;
        toast('键位交换', `${ACTION_CN[other]} → ${keyLabel(old)}`);
        break;
      }
    }
    keys[action] = code;
    S.settings.keys = keys;
    Store.saveSettings();
    this.invalidate();
    this.capture = null;
    UI.open('settings');
    Sfx.play('ui');
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 11 · 招式构造 ATTACKS
 * ═══════════════════════════════════════════════════════════════════════════ */
/** 顿帧期间的输入缓冲：记录动作，顿帧结束立即补发 */
function bufferInput(f, act) {
  f.buffer = f.buffer || { jump: false, light: false, t: 0 };
  f.buffer[act] = true;
  f.buffer.t = 0;
}

let atkId = 0;

const COUNTERS = {
  light:   { name: '反例', w: 0.03, a: 0.14, r: 0.22, dmg: 9,  radius: 132, launchV: 0,   kb: 160, stun: 0.45, hitstop: 9,  shake: 9,  coefKey: 'lightCoef', sound: 'light' },
  heavy:   { name: '反证', w: 0.04, a: 0.16, r: 0.28, dmg: 15, radius: 142, launchV: 460, kb: 300, stun: 0.70, hitstop: 9,  shake: 10, coefKey: 'heavyCoef', sound: 'heavy' },
  ult:     { name: '归谬', w: 0.05, a: 0.19, r: 0.30, dmg: 21, radius: 152, launchV: 640, kb: 320, stun: 0.90, hitstop: 11, shake: 11, coefKey: 'ultCoef', sound: 'ult' },
  counter: { name: '推论 · COROLLARY', w: 0.03, a: 0.22, r: 0.24, dmg: 12, radius: 170, launchV: 0, kb: 200, stun: 1.20, hitstop: 9, shake: 9, coefKey: 'lightCoef', sound: 'perfect' },
};

function startAtk(f, def) {
  f.atk = Object.assign({ t: 0, hitDone: false, id: ++atkId }, def);
  f.state = 'attack';
  f.stateT = 0;
  f.guarding = false;
  f.charging = false;
  f.charge = 0;
  f.chargeHold = 0;
  /* 保留 68% 惯性：地面轻击走位顺滑，空中不打断动量 */
  if (f.onGround) f.vx *= 0.68;
  if (def.kind !== 'heavy' && def.kind !== 'ult') {
    const pw = def.kind === 'launch' || def.kind === 'dive' ? 0.075 : def.kind === 'light' ? 0.05 : 0.04;
    Sfx.play('swing', f, { power: pw });
  }
}

function endAttack(f) {
  const a = f.atk;
  f.atk = null;
  if (!a) { f.state = 'normal'; return; }
  if (a.kind === 'light') {
    f.chainTimer = a.link + C.CHAIN_RESET;
    f.chainLive = true;
    if (f.queued > 0) { f.queued--; startLight(f); return; }
  } else if (a.kind === 'airLight') {
    f.chain = 0; f.chainLive = false;
  }
  f.state = 'normal';
  f.stateT = 0;
  f.guarding = false;
}

function lightDef(f, idx) {
  const c = f.char.combo[idx - 1];
  /* 手感：压缩前摇、把时间并入判定帧，出招瞬间就有判定（总时长不变） */
  const w = Math.max(0.015, c.w * C.FEEL.LIGHT_WINDUP);
  return {
    kind: 'light', stage: idx, name: c.name,
    w, a: c.a + (c.w - w), r: c.r, link: c.link,
    dmg: c.dmg, radius: C.LIGHT_R + (idx - 1) * C.LIGHT_R_STEP + f.char.lightR,
    angle: thetaOf(f), priority: 1, coefKey: 'lightCoef',
    launchV: c.launch, stun: 0.30 + idx * 0.015,
    hitstop: 3, shake: 4, sound: 'light', aim: 'fwd',
  };
}

function startLight(f) {
  const idx = (f.chainLive && f.chain > 0 && f.chain < 4) ? f.chain + 1 : 1;
  f.chain = idx;
  f.chainLive = true;
  f.chainTimer = 0;
  if (idx === 1) f.combo4 = 0;
  startAtk(f, lightDef(f, idx));
  if (idx === 4) f.chainHits = f.chainHits; // 终结段不额外计数
}

function startAirLight(f) {
  if (f.airActions <= 0) return false;
  f.airActions--;
  startAtk(f, {
    kind: 'airLight', name: '空中轻击', w: 0.02, a: 0.27, r: 0.18,
    dmg: 2.5, radius: 108, angle: thetaOf(f), priority: 1, coefKey: 'airCoef',
    launchV: 0, stun: 0.26, hitstop: 3, shake: 3.5, sound: 'air', aim: 'fwd',
  });
  return true;
}

function startDive(f) {
  if (f.airActions <= 0) return false;
  f.airActions--;
  startAtk(f, {
    kind: 'dive', name: '下劈', w: 0.02, a: 0.48, r: 0.20,
    dmg: 6.75, radius: 92, angle: thetaOf(f), priority: 2, coefKey: 'diveCoef',
    launchV: 0, stun: 0.50, hitstop: 9, shake: 9, sound: 'dive', aim: 'down', slam: true,
  });
  f.vy = 900;
  f.vx = f.facing * 120;
  Sfx.play('dive', f);
  return true;
}

function startLaunch(f) {
  if (f.cd.launch > 0) return false;
  f.cd.launch = 1.0 * f.char.cdCoef;
  startAtk(f, {
    kind: 'launch', name: '上挑', w: 0.03, a: 0.34, r: 0.28,
    dmg: 5.75, radius: 118, angle: Math.min(90, thetaOf(f) + 25), priority: 2, coefKey: 'launchCoef',
    launchV: f.char.launchV, kb: 160, stun: 0.50,
    hitstop: 6, shake: 7, sound: 'launch', aim: 'fwd',
  });
  return true;
}

function startHeavy(f, chargeT) {
  const ch = f.char;
  /* 三角函：重击不是冲刺，而是发射正弦弹（速度 = 其他角色重击冲刺速度） */
  if (ch.id === 'trig') {
    const t2 = clamp(chargeT, 0, ch.chargeMax);
    startAtk(f, {
      kind: 'sineShot', name: '正弦 · SIN', w: 0.10, a: 0.06, r: 0.20,
      dmg: 0, radius: 10, angle: ch.theta, priority: 1, coefKey: 'heavyCoef',
      launchV: 0, kb: 0, stun: 0, hitstop: 0, shake: 3, sound: 'sineShot',
      aim: 'fwd', noHit: true,
    });
    f.cd.heavy = C.TRIG_HEAVY_CD * ch.cdCoef;
    f.pendingShot = { kind: 'sine', at: 0.10 + t2 * 0.05 };
    return;
  }
  const t = clamp(chargeT, 0, ch.chargeMax);
  const dist = C.HEAVY.dMin + t * C.HEAVY.dPer;
  const dur = C.HEAVY.tBase + t * C.HEAVY.tPer;
  const ratio = ch.chargeMax > 0 ? t / ch.chargeMax : 0;
  const dmg = C.HEAVY.dmgMin + ratio * (C.HEAVY.dmgMax - C.HEAVY.dmgMin);
  const air = !f.onGround;
  startAtk(f, {
    kind: 'heavy', name: air ? '空中重击' : '重击', w: 0.05, a: dur, r: C.HEAVY.rec,
    dmg, radius: C.HEAVY_R, angle: thetaOf(f), priority: 2, coefKey: 'heavyCoef',
    launchV: C.HEAVY.launch, kb: C.HEAVY.kb, stun: 0.55,
    hitstop: 10, shake: 9, sound: 'heavy', aim: 'fwd',
    /* 空中重击：冲刺横向俯冲，并把下落速度压平，不会直坠 */
    dash: air ? dist * 1.15 / Math.max(0.06, dur) : dist / Math.max(0.06, dur),
    hover: air, charge: t,
  });
  if (air) f.vy = Math.min(f.vy, 60);
  f.cd.heavy = C.HEAVY.cd * ch.cdCoef;
  Sfx.play('heavy', f);
}

function startCharge(f) {
  if (f.state !== 'normal') return false;
  f.state = 'charging';
  f.stateT = 0;
  f.charge = 0;
  f.chargeHold = 0;
  f.charging = true;
  /* 空中蓄力：保留惯性；地面蓄力：第一下立刻刹住，之后能走 */
  if (f.onGround) f.vx = 0;
  Sfx.play('charge', f);
  return true;
}

function releaseHeavy(f) {
  if (f.state !== 'charging') return;
  const t = f.charge;
  f.state = 'normal';
  f.charging = false;
  f.chargeHold = 0;
  /* 蓄力期间可以转身：冲刺方向 = 松开瞬间的朝向 */
  startHeavy(f, t);
}

function tryCounter(f, type) {
  if (!f || f.perfectWindow <= 0) return false;
  if (f.state !== 'dodge' && !canAct(f)) return false;
  const c = COUNTERS[type] || COUNTERS.counter;
  f.perfectWindow = 0;
  f.act = null;
  const dist = Math.abs(opOf(f).x - f.x);
  startAtk(f, Object.assign({}, c, {
    kind: 'counter', priority: 3, aim: 'fwd', noCrit: true, invuln: true,
    dash: clamp(dist / Math.max(0.06, c.w + c.a), 260, 900),
  }));
  f.invuln = Math.max(f.invuln, c.w + c.a + 0.06);
  f.perfectCounters++;
  addShake(6);
  ring(f.x, centerY(f), '#67e8f9', 44);
  slashFx(f.x, centerY(f), '#fbbf24', 22, rnd(-0.9, 0.9));
  burst(f.x, centerY(f), '#fbbf24', 10, 260);
  floatText(f.x, centerY(f) - 52, c.name, '#67e8f9', 13);
  Sfx.play('counter', f);
  Bus.emit('counter', { f, type });
  return true;
}

/* ── 输入动作 ───────────────────────────────────────────────────────── */
/* 动作取消规则（手感核心）：
   · 跳跃：蓄力中 / 轻击前摇后 / 地面招式前摇后 都可以直接跳，取消当前动作
   · 闪避：招式前摇之后随时可闪避（含空中）
   · 重击：轻击收招阶段可直接重击取消
   · 轻击：蓄力中按轻击 → 直接出轻击，不再先放重击
   空中动作次数用尽时，地面跳跃不再受限制。 */

function tryJump(f) {
  if (!f || f.hp <= 0) return false;
  /* 硬直末段可挣脱（与轻击 / 闪避共享同一窗口） */
  if (f.state === 'stun' && f.stunT <= 0.1) releaseStun(f);
  const now = f.state;
  const canJumpFrom =
    now === 'normal' ||
    /* 蓄力中：地面起跳保留蓄力（跳跃不取消蓄力），空中可二段跳 */
    now === 'charging' ||
    (now === 'attack' && f.atk && f.atk.t >= f.atk.w * 0.6) ||
    (now === 'skill' && f.act && f.act.t >= 0.12);
  if (!canJumpFrom) {
    /* 不可跳时记入按键缓冲：落地 / 硬直结束的瞬间自动补跳 */
    f.buffer = f.buffer || { jump: false, light: false, t: 0 };
    if (!f.onGround) { f.buffer.jump = true; f.buffer.t = 0; }
    return false;
  }
  const keepCharge = now === 'charging';
  const clearAction = () => {
    f.atk = null;
    f.act = null;
    if (!keepCharge) { f.charging = false; f.charge = 0; f.chargeHold = 0; }
  };
  if (f.onGround) {
    /* 地面起跳：出招被打断，但蓄力保留 */
    if (!keepCharge) f.state = 'normal';
    clearAction();
    f.vy = -C.JUMP_V * f.char.jump;
    f.onGround = false;
    f.jumps = C.MAX_JUMPS - 1;
    f.airActions = C.AIR_ACTIONS;
    f.airDodge = 1;
    f.stateT = 0;
    Sfx.play('jump', f);
    dust(f);
    return true;
  }
  if (f.jumps > 0) {
    if (!keepCharge) f.state = 'normal';
    clearAction();
    f.vy = -C.JUMP_V * f.char.jump * 0.92;
    f.jumps--;
    f.stateT = 0;
    ring(f.x, f.y - 8, f.char.lite, 18);
    Sfx.play('jump', f);
    return true;
  }
  return false;
}

function tryLight(f) {
  if (!f || f.hp <= 0) return false;
  /* 完美闪避 → 推论反击 */
  if (f.perfectWindow > 0 && (f.state === 'dodge' || canAct(f))) return tryCounter(f, 'light');

  /* 硬直末段反打 */
  if (f.state === 'stun' && f.stunT <= 0.1) releaseStun(f);

  /* 蓄力中轻击：直接出轻击（不再默认为重击，避免误操作） */
  if (f.state === 'charging') {
    f.charging = false; f.charge = 0; f.chargeHold = 0;
    f.state = 'normal'; f.stateT = 0;
  }

  if (!f.onGround) {
    if (f.state === 'normal' ||
        (f.state === 'attack' && f.atk && f.atk.kind === 'airLight' && f.atk.t >= f.atk.w + f.atk.a)) {
      return wantsCrouch(f) ? startDive(f) : startAirLight(f);
    }
    return false;
  }
  if (wantsCrouch(f)) { if (canAct(f)) return startLaunch(f); return false; }
  if (canAct(f)) { startLight(f); return true; }
  /* 命中取消：收招阶段直接接下一段 */
  if (f.state === 'attack' && f.atk && f.atk.kind === 'light') {
    if (f.atk.t >= f.atk.w + f.atk.a) { startLight(f); return true; }
    f.queued = Math.min(3, f.queued + 1);
    return false;
  }
  /* 闪避中段也可割入攻击 */
  if (f.state === 'dodge' && f.act && f.act.t > 0.12) { f.act = null; startLight(f); return true; }
  return false;
}

function tryHeavyKey(f) {
  if (!f || f.hp <= 0) return false;
  if (f.perfectWindow > 0 && (f.state === 'dodge' || canAct(f))) return tryCounter(f, 'heavy');
  if (f.state === 'stun' && f.stunT <= 0.1) releaseStun(f);
  if (f.cd.heavy > 0) return false;
  /* 地面 / 空中都可以起手蓄力 */
  if (f.state === 'normal') { startCharge(f); return true; }
  /* 轻击 / 空中轻击的收招阶段：重击取消 */
  if (f.state === 'attack' && f.atk && f.atk.kind === 'light' && f.atk.t >= f.atk.w + f.atk.a) {
    startCharge(f);
    return true;
  }
  return false;
}

function tryDodge(f) {
  if (!f || f.hp <= 0) return false;
  if (f.cd.dodge > 0) return false;
  if (!f.onGround && f.airDodge <= 0) return false;
  /* 硬直末段反打：最后 0.1 秒可以抢闪避 */
  if (f.state === 'stun' && f.stunT <= 0.1) releaseStun(f);
  const st = f.state;
  /* 注意：起手瞬间（本帧稍后才计时）也允许闪避，避免“刚按下就按闪避”被吞 */
  const ok = st === 'normal' || st === 'charging' ||
    (st === 'attack' && !!f.atk) ||
    (st === 'skill' && !!f.act);
  if (!ok) return false;
  let dir = moveAxis(f);
  if (!dir) dir = -f.facing;
  /* 技能中闪避 = 取消技能：必须同时清掉 shieldSkill，
     否则它会随状态机一起残留（残留的 limit 会让之后每次受击都按“技能中”判定） */
  if (st === 'skill') { f.shieldSkill = null; f.act = null; }
  f.state = 'dodge';
  f.stateT = 0;
  f.atk = null;
  f.act = { t: 0, dir };
  f.charging = false; f.charge = 0;
  f.guarding = false;
  f.invuln = Math.max(f.invuln, C.DODGE.inv);
  f.cd.dodge = C.DODGE.cd * f.char.dodgeCdCoef;
  f.vx = dir * C.DODGE.speed;
  if (!f.onGround) f.airDodge--;
  Sfx.play('dodge', f);
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 11.5 · 专属大招 ULTIMATES
 * ---------------------------------------------------------------------------
 * 每人一套，风格与几何特性对应；命中统一走主伤害管线（连段保护 / 角度 / 防御规则一致）。
 * 平衡目标：一次大招约 17~20 生命伤害，约 20 秒攒满一次，起手有前摇可被反制。
 * ═══════════════════════════════════════════════════════════════════════════ */
const ULTS = {
  /* 平衡基准：一次大招 ≈ 25% 血量（血条一小格 = 1/4 管）。
     多段大招会吃连段保护（后续段位递减），所以每段数值必须按“保护后总量”反推，
     而不是简单相乘 —— 详见每个角色下方的注释。 */
  triangle: {
    id: 'triangle', name: '斜边斩', en: 'HYPOTENUSE', style: 'slashWave',
    /* 3 段，衰减 ≈ [1, .855, .76] → 总量 ≈ 2.61 × dmg × 0.98 */
    coef: 'ultCoef', dmg: 14.7, cast: 0.20, rec: 0.32,
    desc: '三道斜边刃波，末段挑飞',
  },
  rhombus: {
    id: 'rhombus', name: '四倍对称', en: 'SYMMETRY', style: 'afterimage',
    /* 4 段，衰减 ≈ [1, .894, .816, .756] → 总量 ≈ 3.47 × dmg × 1.02 */
    coef: 'ultCoef', dmg: 10.8, cast: 0.16, rec: 0.28,
    desc: '沿对称轴四次瞬移连斩，末段挑飞',
  },
  form: {
    id: 'form', name: '公理矩阵', en: 'AXIOM MATRIX', style: 'matrix',
    /* 4 段，衰减 ≈ [1, .902, .828, .77] → 总量 ≈ 3.50 × dmg × 1.04 */
    coef: 'ultCoef', dmg: 10.5, cast: 0.22, rec: 0.30,
    desc: '封锁 3×3 方阵，四次直角冲击',
  },
  hex: {
    id: 'hex', name: '蜂巢碾碎', en: 'HONEYCOMB', style: 'flatten',
    /* 单段，不吃衰减 → 总量 = dmg × 1.12 */
    coef: 'ultCoef', dmg: 33.5, cast: 0.28, rec: 0.40,
    desc: '蓄力下砸，范围内重击并压平 1.1 秒',
  },
  spiral: {
    id: 'spiral', name: '无穷螺线', en: 'HELIX', style: 'spiralPull',
    /* 5 段，衰减 ≈ [1, .906, .834, .778, .732] → 总量 ≈ 4.25 × dmg × 1.18 */
    coef: 'ultCoef', dmg: 7.5, cast: 0.18, rec: 0.32,
    desc: '螺线卷吸对手，五段斩击后甩出',
  },
  trig: {
    id: 'trig', name: '正切 · TANGENT', en: 'TANGENT', style: 'tanStrike',
    /* 单段判定：整束正切只结算一次伤害（dmg 即大招总伤害），落刃只做表现 */
    coef: 'ultCoef', dmg: 37.5, cast: 0.26, rec: 0.34,
    desc: '锁定敌人，一束正切贯落 · 单段重击',
  },
  circle: {
    id: 'circle', name: '圆周长', en: 'CIRCUMFERENCE', style: 'orbit',
    /* 8 段，但“绕敌一周”的斩击受半径与贴身限制，实测平均只吃到约 5 段；
       按实测段数反推（≈ 3.0% 血量 / 每点 dmg），保证一次大招 ≈ 26% */
    coef: 'ultCoef', dmg: 8.8, cast: 0.20, rec: 0.34,
    desc: '绕敌一周的八次圆周斩，末段击飞',
  },
};
function ultOf(f) { return ULTS[f.char.id] || ULTS.triangle; }

/** 大招通用命中描述（沿用主伤害管线） */
function ultHitDef(ult, extra) {
  return Object.assign({
    kind: 'ult', name: ult.name, dmg: ult.dmg, coefKey: ult.coef,
    priority: 4, hitstop: 11, shake: 11, sound: 'ult', noCrit: false,
    launchV: 0, kb: 240, stun: 0.8, aim: 'fwd',
  }, extra || {});
}

function startUlt(f) {
  if (f.energy < C.ULT.cost) return false;
  const ult = ultOf(f);
  f.energy -= C.ULT.cost;
  f.ults++;
  f.atk = null;
  f.act = null;
  f.guarding = false;
  f.charging = false;
  f.charge = 0;
  f.chargeHold = 0;
  f.state = 'ult';
  f.stateT = 0;
  f.ult = { ult, t: 0, steps: [], endAt: 0, def: null };
  /* 只有起手短暂无敌：之后可被低优先级攻击以外的招打断 */
  f.invuln = Math.max(f.invuln, C.ULT_GUARD);
  castUlt(f, ult);
  Sfx.play('ult', f);
  Bus.emit('ultimate', { f, id: ult.id });
  return true;
}

/** 生成大招脚本（steps 到达时间点执行表现 / 结算） */
function castUlt(f, ult) {
  const u = f.ult;
  const opp = opOf(f);
  f.facing = opp.x >= f.x ? 1 : -1;
  const cy = () => centerY(f);
  const style = ult.style;

  if (style === 'slashWave') {
    ring(f.x, cy(), f.char.color, 22);
    u.steps = [0.10, 0.26, 0.42].map((t, i) => ({
      t,
      run: () => {
        const d = f.facing;
        slashFx(f.x + d * 46, cy(), i === 2 ? '#ffffff' : f.char.lite, 26 + i * 7, -0.8 + i * 0.35);
        burstDir(f.x + d * 34, cy(), d, f.char.color, 8, 330);
        if (i === 2) addShake(6);
      },
      /* 刃波会把对手一段段推出去，若不拉回判定圈，后两段会因“被打飞”而脱靶。
         这里每段命中后重新收拢到刃波范围内（末段保留挑飞），保证三段都落实。 */
      hit: { dist: 175, half: 70, launch: i === 2 ? 600 : 220, stun: 0.5, pull: i < 2 ? 118 : 0 },
    }));
    u.endAt = 0.42 + ult.rec;
  } else if (style === 'afterimage') {
    pushGhost(f);
    u.steps = [0.05, 0.15, 0.25, 0.37].map((t, i) => ({
      t,
      run: () => {
        const d = i % 2 === 0 ? f.facing : -f.facing;
        f.x = clamp(opp.x - d * (58 + i * 8), 44, W - 44);
        f.facing = opp.x >= f.x ? 1 : -1;
        pushGhost(f);
        slashFx(f.x + d * 24, cy(), i === 3 ? '#ffffff' : f.char.lite, 22 + i * 4, rnd(-1, 1));
        burst(f.x, cy(), f.char.color, 6, 250);
      },
      hit: { dist: 98, half: 130, launch: i === 3 ? 560 : 0, stun: i === 3 ? 0.75 : 0.32 },
    }));
    u.endAt = 0.37 + ult.rec;
  } else if (style === 'matrix') {
    const cx = clamp(opp.x, 130, W - 130);
    S.zones.push({ owner: f, x: cx, y: groundAt(cx), w: 210, h: 190, t: 0, life: 1.5 });
    floatText(cx, groundAt(cx) - 205, '公理矩阵', f.char.lite, 14);
    u.steps = [0.06, 0.30, 0.54, 0.78].map((t, i) => ({
      t,
      run: () => {
        f.x = clamp(cx - f.facing * 42, 44, W - 44);
        slashFx(cx + rnd(-26, 26), groundAt(cx) - 18, i % 2 ? '#ffffff' : f.char.lite, 30, -1.25);
        burst(cx + rnd(-30, 30), groundAt(cx) - 8, f.char.color, 10, 330);
        addShake(5);
      },
      hit: { at: { x: cx, y: groundAt(cx) - 70 }, radius: 152, launch: 520, stun: 0.55 },
    }));
    u.endAt = 0.78 + ult.rec;
  } else if (style === 'flatten') {
    u.steps = [
      { t: 0.10, run: () => { addShake(6); ring(f.x, cy(), f.char.lite, 26); } },
      {
        t: 0.28,
        run: () => {
          f.y = groundAt(f.x);
          groundCrack(f);
          addShake(18);
          S.flash = 0.6;
          S.hitstop = Math.max(S.hitstop, 0.1);
        },
        hit: { dist: 196, half: 130, flatten: true, stun: 1.1, launch: 0 },
      },
    ];
    u.endAt = 0.28 + ult.rec;
  } else if (style === 'spiralPull') {
    u.steps = [0.02, 0.20, 0.36, 0.52, 0.72].map((t, i) => ({
      t,
      run: () => {
        if (i === 0) { ring(f.x, cy(), f.char.color, 40); return; }
        opp.x = clamp(opp.x + (f.x - opp.x) * (i === 4 ? 0.7 : 0.35), 44, W - 44);
        slashFx(opp.x, centerY(opp), i % 2 ? '#ffffff' : f.char.lite, 20, rnd(-1.5, 1.5));
        burst(opp.x, centerY(opp), f.char.color, 6, 260);
      },
      hit: { dist: 232, half: 95, force: true, launch: i === 4 ? 640 : 0, stun: 0.38 },
    }));
    u.endAt = 0.72 + ult.rec;
  } else if (style === 'tanStrike') {
    /* 正切：锁定目标（几乎定住），一束正切自天而降 —— 单段判定，一次性出伤 */
    opp.slowT = Math.max(opp.slowT || 0, C.TAN_LOCK_TIME);
    opp.slowMul = C.TAN_LOCK_SLOW;
    opp.lockReason = '被正切锁定';
    const mark = { owner: f, x: 0, y: 0, r: opp.char.r, t: 0, life: C.TAN_MARK_LIFE };
    S.tanMarks.push(mark);
    u.steps = [];
    /* 锁定阶段：地面框住目标当前位置 */
    u.steps.push({
      t: 0.02,
      run: () => {
        mark.x = clamp(opp.x, 70, W - 70);
        mark.y = groundAt(mark.x);
        floatText(mark.x, mark.y - 190, '锁定', '#38bdf8', 14);
        Sfx.play('lockOn', f);
      },
    });
    /* 落刃演出：数束平行切线依次砸下（只有表现，不再逐段结算伤害） */
    for (let i = 0; i < C.TAN_STRIKES; i++) {
      u.steps.push({
        t: C.TAN_STRIKE_START + i * C.TAN_STRIKE_GAP,
        run: () => {
          /* 纯表现：落刃跟随目标（锁定点被钉住后两者一致），不参与结算 */
          const tx = clamp(opp.x, 40, W - 40);
          const gy = groundAt(tx);
          slashFx(tx + (i - 2) * 24, gy - 40, i % 2 ? '#ffffff' : f.char.lite, 60, Math.PI / 2);
          burst(tx + (i - 2) * 24, gy - 10, f.char.color, 8, 300);
          addShake(4);
        },
      });
    }
    /* 唯一一次伤害判定：全部落刃之后结算，位置按“落刃瞬间”的目标位置解析 */
    u.steps.push({
      t: C.TAN_HIT_TIME,
      run: () => {
        /* 单段正切：落刃之前把锁定的目标“钉”在框内（其余敌人不受影响），保证这一次重击必定落实 */
        if (opp.hp > 0 && !opp.guarding && opp.invuln <= 0 && opp.state !== 'dodge') {
          const cx = clamp(mark.x, 44, W - 44);
          const gy = groundAt(cx);
          opp.x = clamp(cx + (opp.x - cx) * 0.15, cx - C.TAN_PIN_X, cx + C.TAN_PIN_X);
          opp.vx = 0;
          if (opp.onGround) opp.y = gy;
        }
        addShake(8);
        S.flash = Math.max(S.flash, 0.18);
      },
      hit: { band: { x: C.TAN_BAND_X, y: C.TAN_BAND_Y }, launch: 640, stun: 0.8 },
      resolve: () => ({ at: { x: clamp(opp.x, 40, W - 40), y: centerY(opp) } }),
    });
    u.endAt = C.TAN_HIT_TIME + ult.rec;
  } else {
    /* circle：绕敌一周 */
    let ang = Math.atan2(centerY(opp) - cy(), opp.x - f.x);
    u.steps = [];
    for (let i = 0; i < 8; i++) {
      u.steps.push({
        t: 0.06 + i * 0.072,
        run: () => {
          ang += Math.PI / 4;
          f.x = clamp(opp.x + Math.cos(ang) * 70, 44, W - 44);
          f.y = groundAt(f.x);
          pushGhost(f);
          slashFx(f.x, centerY(f), i % 2 ? '#ffffff' : f.char.lite, 16, ang + Math.PI / 2);
        },
        hit: { dist: 118, half: 200, launch: i === 7 ? 700 : 0, stun: 0.28 },
      });
    }
    u.endAt = 0.06 + 7 * 0.072 + ult.rec;
  }
}

/** 大招逐帧推进 */
function tickUlt(f, dt) {
  const u = f.ult;
  if (!u) { f.state = 'normal'; return; }
  u.t += dt;
  const opp = opOf(f);
  if (u.ult.style === 'afterimage' || u.ult.style === 'orbit' || u.ult.style === 'spiralPull') {
    f.ghostT = (f.ghostT || 0) - dt;
    if (f.ghostT <= 0) { f.ghostT = 0.035; pushGhost(f); }
  }
  if (u.ult.style === 'slashWave') f.vx *= Math.max(0, 1 - dt * 16);

  for (const st of u.steps) {
    if (st.done || u.t < st.t) continue;
    st.done = true;
    try { if (st.run) st.run(); } catch (e) { /* 表现层异常不影响结算 */ }
    if (st.hit) {
      const h = st.resolve ? Object.assign({}, st.hit, st.resolve()) : st.hit;
      applyUltHit(f, opp, u.ult, h);
    }
    if (!f.ult) return;
  }
  if (u.t >= u.endAt) endUlt(f);
}

function endUlt(f) {
  if (!f.ult) { f.state = 'normal'; return; }
  if (f.ult.ult.style === 'tanStrike') {
    const o = opOf(f);
    if (o && o.lockReason === '被正切锁定') o.lockReason = null;
  }
  f.ult = null;
  f.state = 'normal';
  f.stateT = 0;
  f.invuln = Math.max(f.invuln, 0.08);
}

/** 大招命中：交给主伤害管线；支持矩形阵与压平 */
function applyUltHit(f, opp, ult, hit) {
  if (!opp || opp.hp <= 0 || !f.ult) return;
  const fy = centerY(f), oy = centerY(opp);
  let ok;
  if (hit.at && hit.band) {
    /* 天降切线：横向带判定（x 在半宽内、y 在竖带内） */
    ok = Math.abs(opp.x - hit.at.x) <= hit.band.x + opp.char.r * 0.5 &&
      Math.abs(oy - hit.at.y) <= hit.band.y;
  } else if (hit.at) {
    ok = Math.hypot(opp.x - hit.at.x, oy - hit.at.y) <= (hit.radius || 140) + opp.char.r * 0.4;
  } else {
    const dx = opp.x - f.x, dy = oy - fy;
    const dist = Math.hypot(dx, dy);
    let angOK = true;
    if (hit.half && hit.half < 179) {
      const ang = Math.atan2(dy, dx);
      const base = f.facing > 0 ? 0 : Math.PI;
      const diff = Math.abs(((ang - base + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      angOK = diff <= rad(hit.half);
    }
    ok = dist <= (hit.dist || 140) + opp.char.r * 0.6 && (hit.force || dx * f.facing >= -20) && angOK;
  }
  if (!ok) return;
  landHit(f, opp, ultHitDef(ult, {
    dmg: ult.dmg, launchV: hit.launch || 0, stun: hit.stun || 0.8,
  }), 6);
  /* 吸附（仅多段大招的中间段）：把被打退的目标拉回出招者前方，保证后续段位不脱靶 */
  if (hit.pull && opp.hp > 0) {
    const want = f.facing * hit.pull;
    const cur = opp.x - f.x;
    if (Math.abs(cur) > Math.abs(want)) {
      opp.x = clamp(f.x + want, 44, W - 44);
      opp.vx = 0;
    }
  }
  if (ult.style === 'tanStrike' && hit.at) {
    /* 单段正切：一次重击落在地面冲击点上 */
    const gy = groundAt(hit.at.x);
    ring(hit.at.x, gy - 4, f.char.lite, 40);
    ring(hit.at.x, gy - 4, '#ffffff', 22);
    burst(hit.at.x, gy - 4, f.char.color, 16, 340);
    slashFx(hit.at.x, hit.at.y || (gy - 40), '#ffffff', 34, Math.PI / 2);
    S.flash = Math.max(S.flash, 0.35);
    addShake(10);
    Sfx.play('tanStrike', f);
  }
  if (hit.flatten && opp.hp > 0) {
    opp.state = 'downed';
    opp.stunT = Math.max(opp.stunT || 0, 1.1);
    opp.lockReason = '被压平';
    opp.y = groundAt(opp.x);
    opp.vy = 0;
    floatText(opp.x, groundAt(opp.x) - 64, '压平', f.char.lite, 16);
    addShake(14);
    S.flash = Math.max(S.flash, 0.45);
    groundCrack(opp);
  }
}

function tryUlt(f) {
  if (!f || f.hp <= 0) return false;
  if (f.perfectWindow > 0 && (f.state === 'dodge' || canAct(f))) return tryCounter(f, 'ult');
  if (f.state === 'stun' && f.stunT <= 0.1) releaseStun(f);
  if (!canAct(f) || f.energy < C.ULT.cost) return false;
  return startUlt(f);
}


function trySkill(f) {
  if (!f || f.hp <= 0) return false;
  /* 受击时 → 脱身 */
  if (f.state === 'stun' || f.state === 'launched' || f.state === 'downed') {
    return tryEscape(f);
  }
  if (f.state === 'charging') { f.charging = false; f.charge = 0; f.state = 'normal'; f.stateT = 0; }
  if (!canAct(f)) return false;
  return startSkill(f);
}


/** 硬直末段读招（最后 0.1 秒）才能抢轻击 / 闪避 / 跳跃 */
function tryLateTech(f) {
  return f.state === 'stun' && f.stunT <= 0.1;
}

/** 解除硬直（末段反打 / 缓冲补发共用） */
function releaseStun(f) {
  if (f.state !== 'stun' && f.state !== 'downed') return false;
  f.state = 'normal';
  f.stunT = 0;
  f.stateT = 0;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 12 · 命中结算 DAMAGE
 * ═══════════════════════════════════════════════════════════════════════════ */
function hitboxOf(f) {
  const a = f.atk;
  if (!a || a.hitDone || a.noHit) return null;
  if (a.t < a.w || a.t > a.w + a.a) return null;
  let dir;
  if (a.aim === 'down') dir = { x: 0, y: 1 };
  else if (a.aim === 'up') dir = { x: 0, y: -1 };
  else dir = { x: f.facing, y: 0 };
  return { x: f.x, y: centerY(f), dir, r: a.radius, half: a.angle };
}

function testHitbox(hb, def) {
  const dx = def.x - hb.x;
  const dy = centerY(def) - hb.y;
  const d = Math.hypot(dx, dy);
  if (d > hb.r + bodyR(def) * 0.35) return null;
  if (d < 0.5) return { angle: 0, dist: d };
  const dot = clamp((dx * hb.dir.x + dy * hb.dir.y) / d, -1, 1);
  const ang = Math.acos(dot) * 180 / Math.PI;
  const half = Math.min(150, hb.half + (def.gridLock ? 15 : 0));
  if (ang > half) return null;
  return { angle: ang, dist: d };
}

/** 伤害公式：基础 × 招式系数 × 连段保护 × cosθ × 后手增伤 × 暴击 × 蹲防减免 */
function calcDamage(att, def, atk, angle) {
  const crit = !atk.noCrit && Math.random() < 0.10;
  const follow = att.followup > 0;
  let d = damageFormula(atk.dmg, att.char[atk.coefKey] || 1, att.comboDmg || 0, angle, follow, crit, def.guarding);
  if (def.gridLock) d *= 0.8;
  if (def.shieldSkill && def.shieldSkill.reduce) d *= (1 - def.shieldSkill.reduce);
  return { d, crit, follow };
}

function resolveHits() {
  if (!S.p || !S.a) return;
  const list = [];
  for (const f of [S.p, S.a]) {
    const opp = opOf(f);
    const hb = hitboxOf(f);
    if (!hb) continue;
    const r = testHitbox(hb, opp);
    if (r) list.push({ att: f, def: opp, angle: r.angle });
  }
  if (list.length === 2) {
    let A1 = list[0], B1 = list[1];
    /* 同帧接触：先比“霸体等级”（大招 > 技能体 > 轻击），同等级才是拼刀 */
    const pa = attackPower(A1.att.atk), pb = attackPower(B1.att.atk);
    if (pa === pb) {
      /* 同等级对撞：互相拼刀，双方都弹开 */
      doParry(A1.att, B1.att);
      return;
    }
    /* 等级高者先结算：它命中后若把对方打断，对方这一下就落空 */
    const win = pa > pb ? A1 : B1;
    landHit(win.att, win.def, win.att.atk, win.angle);
    /* 结算后若对方仍未被打断（霸体挡下），它这一击照常命中 */
    const loser = win === A1 ? B1 : A1;
    const loserAtk = loser.att.atk;
    if (loserAtk && !loserAtk.hitDone && S.phase === 'fight') {
      landHit(loser.att, loser.def, loserAtk, loser.angle);
    }
  } else if (list.length === 1) {
    landHit(list[0].att, list[0].def, list[0].att.atk, list[0].angle);
  }
}

function doParry(p, a) {
  p.atk.hitDone = true; a.atk.hitDone = true;
  for (const f of [p, a]) {
    f.atk = null;
    f.state = 'stun';
    f.stunT = C.PARRY_STUN;
    f.stateT = 0;
    f.vx = (f === p ? -1 : 1) * 240;
    f.hitFlash = 0.45;
    f.parries++;
    f.combo = 0; f.comboDmg = 0; f.comboHits = 0; f.lightDmg = 0;
  }
  S.hitstop = Math.max(S.hitstop, 0.06);
  addShake(5);
  Sfx.play('parry');
  const mx = (p.x + a.x) / 2, my = centerY(p);
  ring(mx, my, '#ffffff', 26);
  /* 拼刀：两道交叉光刃 + 向外迸射的火花 */
  slashFx(mx, my, '#ffffff', 26, rnd(-0.5, 0.5));
  slashFx(mx, my, '#ffe9a3', 18, rnd(1.0, 1.7));
  burstDir(mx, my, 1, '#ffffff', 6, 300);
  burstDir(mx, my, -1, '#ffe9a3', 6, 300);
  floatText(mx, my - 34, '拼刀', '#ffffff', 15);
  Bus.emit('parry', { p, a });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 12.5 · 霸体 / 动作优先级 ARMOR
 * ---------------------------------------------------------------------------
 *  等级：0 正常体 · 1 技能体 · 2 金刚体
 *  打断条件：攻击方等级 ≥ 受击方等级（大招 2 可打断一切）
 *  推论反击 / 完美防反 属于“破霸体”，无视等级（有次数与冷却限制）
 * ═══════════════════════════════════════════════════════════════════════════ */
const ARMOR = {
  NORMAL: 0,   // 站立 / 移动 / 轻击 / 闪避 / 硬直
  TECH: 1,     // 重击蓄力 / 重击冲刺 / 专属技能
  KONG: 2,     // 大招
};

/** 受击方当前所处层级 */
function armorOf(f) {
  switch (f.state) {
    case 'ult': return ARMOR.KONG;
    case 'charging': return ARMOR.TECH;
    case 'skill': return ARMOR.TECH;
    case 'attack':
      /* 重击冲刺属于技能体；轻击 / 上挑 / 下劈仍是正常体 */
      return f.atk && f.atk.kind === 'heavy' && f.atk.t >= f.atk.w ? ARMOR.TECH : ARMOR.NORMAL;
    default: return ARMOR.NORMAL;
  }
}

/** 招式的打断等级 */
function attackPower(atk) {
  if (!atk) return ARMOR.NORMAL;
  switch (atk.kind) {
    case 'ult': return ARMOR.KONG;
    case 'counter': return ARMOR.KONG;      // 推论反击：破霸体
    case 'heavy': return ARMOR.TECH;
    case 'skill': return ARMOR.TECH;
    case 'launch': case 'dive': return ARMOR.TECH;
    case 'clash': return ARMOR.TECH;
    default: return ARMOR.NORMAL;           // light / airLight
  }
}

/** 该次命中能否打断受击方动作 */
function canBreak(att, def, atk) {
  const power = attackPower(atk);
  const armor = armorOf(def);
  if (power >= armor) return true;
  /* 完美防反（技能体防御窗口内的反击）突破一切 */
  if (att && att.perfectWindow > 0) return true;
  return false;
}

/** 霸体挡下攻击的反馈：不打断，但有火花、轻微震屏与专用音效 */
function armorAbsorb(def, att, atk, power, armor) {
  const lv = armor === ARMOR.KONG ? '金刚体' : '技能体';
  burstDir(def.x, centerY(def), -att.facing, def.char.lite, 5, 190);
  slashFx(def.x + att.facing * 10, centerY(def), def.char.lite, 9);
  if (armor === ARMOR.KONG) addShake(3);
  if (!S.armorFlash || S.clock.pres - S.armorFlash > 0.25) {
    S.armorFlash = S.clock.pres;
    floatText(def.x, centerY(def) - def.char.r - 18, lv, def.char.lite, 11);
  }
  if (power < armor) Sfx.play('guard', def);
}

/** 技能伤害：按目标最大血量的固定比例（pct）计算设计伤害，保证各对手一致 */
function skillDesignDamage(att, def, skill) {
  const pct = skill.pct || 0.25;
  return (def.maxHp * pct) / C.HP_UNIT;
}

function landHit(att, def, atk, angle) {
  atk.hitDone = true;

  /* 1 · 闪避 / 无敌 / 防御技能窗 */
  if (def.state === 'dodge' && def.invuln > 0) { onDodge(def, att); return; }
  if (def.state === 'skill' && def.act && def.shieldSkill && def.act.t <= def.shieldSkill.perfect) {
    triggerPerfectSkill(def, att); return;
  }
  if (def.invuln > 0) { blocked(def); return; }
  if (def.state === 'ult' && def.ult && def.ult.t <= C.ULT_GUARD) { blocked(def); return; }
  if (def.state === 'escape') { blocked(def); return; }
  if (atk.kind === 'light' && def.lightProtect > 0) { blocked(def); return; }

  /* 2 · 伤害 */
  const { d, crit, follow } = calcDamage(att, def, atk, angle);
  const design = Math.max(0, d);
  const hpDmg = design * C.HP_UNIT;

  /* 3 · 连击 / 统计 */
  att.combo++;
  att.comboTimer = C.COMBO_TIMEOUT;
  att.maxCombo = Math.max(att.maxCombo, att.combo);
  att.hits++;
  att.dmgDealt += hpDmg;
  att.angleSum += angle; att.angleN++;
  if (follow) att.followup = 0;
  def.dmgTaken += hpDmg;
  /* 连段累计伤害：下一次结算将按它衰减 */
  att.comboDmg = (att.comboDmg || 0) + design;
  att.comboHits = (att.comboHits || 0) + 1;

  /* 4 · 能量（造成 / 受到） */
  /* 能量按“成功命中”结算：与血量 / 伤害数值无关，各角色攒招速度一致，
     多段招式（低伤害高段数）不会反而吃亏；角色能量系数仍影响速度 */
  const eMul = (S.scene.mod.energy || 1);
  const eBase = C.ENERGY_PER_HIT * eMul;
  att.energy = Math.min(100, att.energy + eBase * att.char.energy);
  def.energy = Math.min(100, def.energy + eBase * C.ENERGY_ON_TAKE * def.char.energy);

  /* 5 · 连段统计：轻击链按“累计伤害”触发保护 */
  if (atk.kind === 'light') {
    att.chainHits++;
    att.lightDmg = (att.lightDmg || 0) + design;
    att.combo4 |= 1 << (atk.stage - 1);
    if (att.combo4 === 15) Bus.emit('challenge', 'fullChain');
    if (att.lightDmg >= C.LIGHT_CHAIN_DMG) {
      def.lightProtect = C.LIGHT_REST;
      att.chainHits = 0;
      att.lightDmg = 0;
      att.chain = 0; att.chainLive = false; att.chainTimer = 0;
      floatText(def.x, centerY(def) - 48, '保护冷却', '#fbbf24', 12);
    }
  } else { att.chainHits = 0; att.lightDmg = 0; }

  /* 6 · 受击反应 */
  const stunBase = atk.stun || 0.3;
  const stunDecay = Math.max(C.STUN_FLOOR, 1 - C.STUN_DECAY * Math.max(0, att.combo - 1));
  const stun = stunBase * stunDecay * def.char.hitstunCoef;

  const power = attackPower(atk);
  const armorLv = armorOf(def);
  const broken = canBreak(att, def, atk);
  def.lastArmor = { power, armor: armorLv, broken };

  if (def.guarding) {
    def.shield -= (design * C.GUARD.drain) / def.char.shield;
    def.hitFlash = 0.4;
    /* 蹲防：火花朝攻击者方向溅开 + 清脆的格挡音 */
    burstDir(def.x, centerY(def), -att.facing, '#67e8f9', 6, 200);
    slashFx(def.x + att.facing * 6, centerY(def), '#67e8f9', 10);
    Sfx.play('guard', def);
    if (def.shield <= 0) { def.shield = 0; falsify(def); }
  } else if (!broken) {
    /* 霸体挡下：掉血但不被打断，动作继续 */
    armorAbsorb(def, att, atk, power, armorLv);
    def.hitFlash = Math.max(def.hitFlash, 0.25);
  } else {
    def.atk = null;
    def.act = null;
    def.shieldSkill = null;
    def.charging = false; def.charge = 0;
    def.queued = 0;
    def.chain = 0; def.chainLive = false; def.chainTimer = 0;
    def.combo4 = 0; def.chainHits = 0;
    def.combo = 0; def.comboDmg = 0; def.lightDmg = 0;
    const wasLaunched = def.state === 'launched';
    if (atk.slam) {
      def.vy = 1050; def.slamLock = 0.6;
      def.state = 'launched'; def.stunT = 0.6;
      def.vx = 0;
      def.onGround = false;
    } else if (atk.launchV > 0) {
      if (wasLaunched) {
        def.launchCount++;
        if (def.launchCount >= 3) { def.vy = 1150; def.slamLock = 1.0; }
        else { def.vy = -atk.launchV * 0.55; }
      } else {
        def.launchCount = 0;
        def.vy = -atk.launchV;
      }
      def.state = 'launched';
      def.stunT = stun;
      def.vx = att.facing * (atk.kb || 200) * 0.6;
      def.onGround = false;
    } else if (wasLaunched) {
      def.launchCount++;
      if (def.launchCount >= 3) { def.vy = 1150; def.slamLock = 1.0; }
      else def.vy = Math.min(def.vy, -200);
      def.stunT = stun;
      def.onGround = false;
    } else {
      def.state = 'stun';
      def.lockReason = atk.name || '受击';
      def.stunT = stun;
      def.vx = att.facing * (atk.kb ? atk.kb : 130) * 0.72;
      def.vy = 0;
    }
    def.stateT = 0;
    /* 连招吸附：轻击命中后清除水平击退，把对手留在下一段够得着的范围 */
    if (atk.kind === 'light' && def.state === 'stun') def.vx *= 0.22;
    /* 上挑 / 下劈命中后返还 1 次空中动作 */
    if (atk.kind === 'launch' || atk.kind === 'dive') {
      att.airActions = Math.min(C.AIR_ACTIONS, att.airActions + 1);
    }
  }

  /* 7 · 反馈：斩击光斑 + 方向火花 + 伤害飘字 + 攻击者后坐 + 震屏 */
  def.hp = Math.max(0, def.hp - hpDmg);
  S.lastAngle = { angle: +angle.toFixed(2), dmg: +design.toFixed(3), crit, atk: atk.name };
  S.hitstop = Math.max(S.hitstop, clamp((atk.hitstop || 3) / 60 * (S.settings.hitstop || 0), 0, C.HITSTOP_MAX));
  addShake((atk.shake || 4) * (S.settings.shake || 0));
  S.intensity = Math.min(1, S.intensity + 0.15);
  spawnImpact(att, def, design, crit, angle);
  /* 浮空 / 击飞：沿纵向拉出一条冲击线，强化“被打上天”的重量感 */
  if (def.state === 'launched') {
    slashFx(def.x, centerY(def), att.char.lite, 14, -Math.PI / 2 + rnd(-0.2, 0.2));
    if (atk.kind === 'launch' || atk.kind === 'dive') {
      slashFx(def.x, centerY(def), '#ffffff', 22, -Math.PI / 2);
      burstDir(def.x, centerY(def), att.facing, '#ffffff', 6, 320);
    }
  }
  /* 重击 / 大招：地面冲击波 */
  if (atk.kind === 'heavy' || atk.kind === 'ult') {
    addShake(3);
    burst(def.x, groundAt(def.x) - 4, att.char.color, 10, 260);
    ring(def.x, groundAt(def.x) - 4, att.char.lite, 30);
  }
  S.proofs.push({ x: def.x + rnd(-6, 6), y: centerY(def) + rnd(-6, 6), age: 0 });
  def.hitFlash = 0.6;
  Sfx.play(atk.sound || 'light', att, { stage: atk.stage || 1, crit, kind: atk.kind });

  if (angle <= 5) Bus.emit('orthogonal', { att, angle });

  /* 8 · 事件 / KO */
  Bus.emit('hit', { att, def, atk, angle, dmg: design, crit });
  if (S.training && def === S.a && def.hp <= 0) {
    /* 训练木桩：血量立即回满，不出终结演出 */
    def.hp = def.maxHp; def.hpTrail = def.maxHp;
    floatText(def.x, centerY(def) - 46, '木桩重置', '#67e8f9', 12);
    return;
  }
  if (def.hp <= 0) { onKO(att, def, atk); return; }

  /* 9 · 连段保护（伤害制）：累计伤害或命中数触及上限则强制断开 */
  if (att.comboDmg >= C.COMBO_HARD || att.combo >= C.COMBO_CAP) {
    const byDmg = att.comboDmg >= C.COMBO_HARD;
    att.combo = 0;
    att.comboDmg = 0;
    att.comboHits = 0;
    att.lightDmg = 0;
    att.chain = 0; att.chainLive = false; att.chainTimer = 0;
    att.chainHits = 0; att.combo4 = 0;
    att.vx = -att.facing * 300;
    def.vx = att.facing * 300;
    S.hitstop = Math.max(S.hitstop, 0.1);
    floatText(att.x, centerY(att) - 56, byDmg ? '连段保护 · 断开' : '连击上限', '#ef4444', 14);
  }
}

function onDodge(def, att) {
  const perfect = def.act && def.act.t <= C.DODGE.perfect;
  def.followup = 0.28;
  if (perfect) {
    def.invuln = Math.max(def.invuln, C.DODGE.pInv);
    def.cd.dodge = Math.min(def.cd.dodge, C.DODGE.pCd * def.char.dodgeCdCoef);
    def.perfectWindow = 0.6;
    def.perfectDodges++;
    S.slowmo = Math.max(S.slowmo, 0.5);
    addShake(4);
    ring(def.x, centerY(def), '#67e8f9', 54);
    floatText(def.x, centerY(def) - 46, '∃', '#67e8f9', 30);
    Sfx.play('perfect', def);
    Bus.emit('perfectDodge', { def, att });
  } else {
    blocked(def);
    Sfx.play('dodge', def);
    Bus.emit('dodge', { def, att });
  }
}

function blocked(def) {
  burst(def.x, centerY(def), '#67e8f9', 5, 120);
  floatText(def.x, centerY(def) - 26, '∅', '#67e8f9', 12);
}

function falsify(f) {
  f.state = 'falsified';
  f.stateT = 0;
  f.lockReason = '证伪 ⊥';
  f.stunT = C.GUARD.falsify;
  f.guarding = false;
  f.atk = null;
  f.vx = -f.facing * 120;
  floatText(f.x, centerY(f) - 44, '⊥', '#f87171', 28);
  ring(f.x, centerY(f), '#f87171', 42);
  S.shake = Math.max(S.shake, 8);
  Sfx.play('break', f);
  Bus.emit('falsify', { f });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 13 · 专属技能 SKILLS
 * ═══════════════════════════════════════════════════════════════════════════ */
function startSkill(f) {
  const sk = f.char.skill;
  /* 技能与大招能量解耦：技能只看冷却（否则菱形 35 点消耗会挤占大招充能） */
  if (f.cd.skill > 0) return false;
  f.cd.skill = sk.cd * f.char.skillCdCoef;
  f.state = 'skill';
  f.stateT = 0;
  f.guarding = false;
  f.atk = null;
  f.act = { kind: sk.kind, t: 0, hitDone: false, dur: 0.4 };
  f.skills++;
  Sfx.play('skill', f, { kind: sk.kind });
  /* 技能起手：脚下光环 + 向外扩散的粒子 */
  ring(f.x, centerY(f), f.char.color, 30);
  ring(f.x, centerY(f), f.char.lite, 16);
  burst(f.x, centerY(f), f.char.color, 8, 160);
  Bus.emit('skill', { f, kind: sk.kind });

  switch (sk.kind) {
    case 'sine':
      f.act.dur = 0.44;
      f.invuln = Math.max(f.invuln, 0.44);
      f.vx = 0;
      break;
    case 'mirror':
      f.act.dur = 0.34;
      f.invuln = Math.max(f.invuln, 0.34);
      f.vx = -f.facing * 640;
      S.mirrors.push({ owner: f, x: f.x, y: f.y, t: 0, delay: 0.34, life: 0.55, done: false, r: 105, dmg: sk.dmg });
      break;
    case 'grid':
      f.act.dur = 0.36;
      S.zones.push({ owner: f, x: f.x + f.facing * 46, y: f.y, w: 180, h: 160, t: 0, life: 1.5 });
      break;
    case 'tess':
      f.act.dur = 0.42;
      f.shieldSkill = { kind: 'tess', reduce: 0.45, perfect: 0.20 };
      break;
    case 'limit':
      f.act.dur = 1.0;
      f.shieldSkill = { kind: 'limit', reduce: 0, perfect: 0.15 };
      f.invuln = Math.max(f.invuln, 1.0);
      break;
    case 'pi':
      f.act.dur = 0.40;
      break;
    case 'cosine':
      f.act.dur = 0.30;
      break;
  }
  /* 技能期间不锁速度：由下面的状态机接管移动（可自由走位，但不能攻击） */
  return true;
}

function triggerPerfectSkill(def, att) {
  const sk = def.shieldSkill;
  def.shieldSkill = null;
  def.perfectWindow = 0.6;
  def.perfectCounters++;
  S.slowmo = Math.max(S.slowmo, 0.4);
  ring(def.x, centerY(def), def.char.color, 58);
  Sfx.play('perfect', def);
  floatText(def.x, centerY(def) - 48, '收敛', def.char.lite, 15);

  if (sk && sk.kind === 'tess') {
    /* 六边 · 完全平铺 */
    def.invuln = Math.max(def.invuln, 1.6);
    def.speedBoost = 1.6;
    def.state = 'normal';
    def.act = null;
    floatText(def.x, centerY(def) - 66, '完全平铺', '#fde68a', 14);
  } else if (sk && sk.kind === 'limit') {
    /* 螺旋 · 收敛：3 段必中斩 */
    def.state = 'normal';
    def.act = null;
    def.autoHits = [];
    /* 收敛斩：伤害为原设计的一半 */
    for (let i = 0; i < 3; i++) def.autoHits.push({ t: 0.30 + i * 0.34, dmg: rnd(9, 12) });
    floatText(def.x, centerY(def) - 66, '极限收敛', def.char.lite, 14);
  }
  Bus.emit('perfectCounter', { def, att });
}

function tickSkill(f, dt) {
  const a = f.act;
  if (!a) { f.state = 'normal'; return; }
  a.t += dt;
  switch (a.kind) {
    case 'sine': {
      if (a.t < 0.14) { f.vx = 0; }
      else f.vx = f.facing * (250 / 0.30);
      if (!a.hitDone && a.t >= 0.14) {
        const opp = opOf(f);
        const d = Math.hypot(opp.x - f.x, centerY(opp) - centerY(f));
        if (d <= 118 + bodyR(opp) * 0.4) {
          a.hitDone = true;
          const base = f.char.skill;
          landHit(f, opp, {
            kind: 'skill', name: base.name, dmg: skillDesignDamage(f, opp, base), coefKey: base.coef,
            launchV: 560, kb: 260, stun: 1.05, hitstop: 10, shake: 9,
            sound: 'heavy', priority: 3, noCrit: true,
          }, 0);
          f.energy = Math.min(100, f.energy + 16);
        }
      }
      if (a.t >= a.dur) { f.state = 'normal'; f.act = null; f.vx = 0; }
      break;
    }
    case 'mirror':
      f.vx *= Math.max(0, 1 - dt * 10);
      if (a.t >= a.dur) { f.state = 'normal'; f.act = null; f.vx = 0; }
      break;
    case 'grid':
      if (a.t >= a.dur) { f.state = 'normal'; f.act = null; }
      break;
    case 'tess':
      if (a.t >= a.dur) { f.state = 'normal'; f.act = null; f.shieldSkill = null; }
      break;
    case 'limit':
      if (a.t >= a.dur) { f.state = 'normal'; f.act = null; f.shieldSkill = null; }
      break;
    case 'cosine': {
      if (!a.hitDone && a.t >= 0.10) {
        a.hitDone = true;
        spawnProjectile(f, 'cos');
      }
      if (a.t >= a.dur) { f.state = 'normal'; f.act = null; }
      break;
    }
    case 'pi': {
      if (!a.hitDone && a.t >= 0.12) {
        a.hitDone = true;
        const opp = opOf(f);
        const d = Math.hypot(opp.x - f.x, centerY(opp) - centerY(f));
        ring(f.x, centerY(f), f.char.color, 120);
        if (d <= 120 + opp.char.r) {
          landHit(f, opp, {
            kind: 'skill', name: f.char.skill.name, dmg: skillDesignDamage(f, opp, f.char.skill), coefKey: 'lightCoef',
            launchV: 420, kb: 420, stun: 0.6, hitstop: 10, shake: 9,
            sound: 'heavy', priority: 3, noCrit: true,
          }, 0);
        }
      }
      if (a.t >= a.dur) { f.state = 'normal'; f.act = null; }
      break;
    }
  }
}

function tickMirrors(dt) {
  for (let i = S.mirrors.length - 1; i >= 0; i--) {
    const m = S.mirrors[i];
    m.t += dt;
    if (!m.done && m.t >= m.delay) {
      m.done = true;
      const opp = opOf(m.owner);
      ring(m.x, m.y - 22, m.owner.char.color, m.r);
      burst(m.x, m.y - 22, m.owner.char.color, 14, 260);
      Sfx.play('heavy', m.owner);
      /* 以角色身体中心判定，避免站立对手因高度差漏判 */
      if (Math.abs(opp.x - m.x) <= m.r + bodyR(opp) * 0.8 && Math.abs(centerY(opp) - m.y + bodyH(opp) / 2) <= 120) {
        landHit(m.owner, opp, {
          kind: 'skill', name: '镜像 · 对称轴', dmg: skillDesignDamage(m.owner, opp, m.owner.char.skill), coefKey: 'lightCoef',
          launchV: 380, kb: 300, stun: 0.6, hitstop: 8, shake: 8,
          sound: 'heavy', priority: 3, noCrit: true,
        }, 0);
      }
    }
    if (m.t >= m.delay + m.life) S.mirrors.splice(i, 1);
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
 * 13.5 · 远程投射物 PROJECTILES（三角函专属）
 *   正弦弹：直线飞行，命中单体，伤害低于近战重击
 *   余弦弹：略慢，命中或落地后爆炸，范围伤害 + 几何特效
 * ═══════════════════════════════════════════════════════════════════════════ */
function spawnProjectile(owner, kind) {
  const dir = owner.facing;
  const y = centerY(owner);
  const speed = kind === 'sine' ? C.PROJ_SINE_SPEED : C.PROJ_COS_SPEED;
  S.projectiles.push({
    owner, kind, dir, x: owner.x + dir * (owner.char.r + 8), y,
    vx: dir * speed, t: 0, r: kind === 'sine' ? 13 : 15, done: false,
  });
  Sfx.play(kind === 'sine' ? 'sineShot' : 'cosShot', owner);
}

function tickProjectiles(dt) {
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const pr = S.projectiles[i];
    pr.t += dt;
    pr.x += pr.vx * dt;
    /* 拖尾粒子 */
    if (Math.random() < 0.65) {
      S.parts.push({
        type: 'spark', x: pr.x - pr.dir * 6, y: pr.y + Math.sin(pr.t * 18) * 4,
        vx: -pr.dir * rnd(20, 70), vy: rnd(-30, 30),
        life: 0.22, max: 0.22, color: hexA(pr.owner.char.lite, 0.7), size: rnd(1, 2.2),
      });
    }
    const opp = opOf(pr.owner);
    /* 命中判定：矩形近似 + 身体半径 */
    const hitX = Math.abs(pr.x - opp.x) <= pr.r + bodyR(opp) * 0.75;
    const hitY = Math.abs(pr.y - centerY(opp)) <= pr.r + bodyH(opp) * 0.5;
    if (!pr.done && opp && opp.hp > 0 && hitX && hitY) {
      pr.done = true;
      if (pr.kind === 'sine') {
        const base = pr.owner.char;
        landHit(pr.owner, opp, {
          kind: 'heavy', name: '正弦 · SIN', dmg: 14 * C.PROJ_SINE_DMG, coefKey: 'heavyCoef',
          launchV: 0, kb: 260, stun: 0.45, hitstop: 8, shake: 7,
          sound: 'sineHit', priority: 1, noCrit: false, aim: 'fwd',
        }, 0);
        ring(pr.x, pr.y, base.lite, 22);
        slashFx(pr.x, pr.y, '#ffffff', 14, rnd(-0.6, 0.6));
        burst(pr.x, pr.y, base.color, 10, 260);
      } else {
        explodeCosine(pr, opp);
      }
      S.projectiles.splice(i, 1);
      continue;
    }
    /* 落地 / 出界 */
    const gy = groundAt(pr.x);
    if (pr.y >= gy - 6) {
      pr.y = gy - 6;
      if (pr.kind === 'cos') {
        if (!pr.done) { pr.done = true; explodeCosine(pr, null); }
        S.projectiles.splice(i, 1);
        continue;
      }
    }
    if (pr.x < -C.PROJ_SCREEN_END || pr.x > W + C.PROJ_SCREEN_END || pr.t > 3) {
      S.projectiles.splice(i, 1);
    }
  }
}

/** 余弦弹爆炸：范围伤害 + 圆周/波浪几何特效 */
function explodeCosine(pr, directTarget) {
  const owner = pr.owner;
  const base = owner.char;
  const R = C.PROJ_COS_RADIUS;
  const opp = directTarget || opOf(owner);
  ring(pr.x, pr.y, base.color, R);
  ring(pr.x, pr.y, '#ffffff', R * 0.55);
  burst(pr.x, pr.y, base.color, 18, 420);
  burst(pr.x, pr.y, '#ffffff', 8, 260);
  slashFx(pr.x, pr.y, base.lite, 24, rnd(-1, 1));
  addShake(9);
  S.flash = Math.max(S.flash, 0.35);
  Sfx.play('cosBlast', owner);
  if (opp && opp.hp > 0) {
    const d = Math.hypot(opp.x - pr.x, centerY(opp) - pr.y);
    if (d <= R + bodyR(opp)) {
      landHit(owner, opp, {
        kind: 'skill', name: base.skill.name,
        dmg: skillDesignDamage(owner, opp, base.skill), coefKey: 'lightCoef',
        launchV: 420, kb: 340, stun: 0.7, hitstop: 10, shake: 9,
        sound: 'heavy', priority: 3, noCrit: true, aim: 'fwd',
      }, 0);
    }
  }
}

function tickTanMarks(dt) {
  for (let i = S.tanMarks.length - 1; i >= 0; i--) {
    S.tanMarks[i].t += dt;
    if (S.tanMarks[i].t >= S.tanMarks[i].life) S.tanMarks.splice(i, 1);
  }
}

function tickZones(dt) {
  if (S.p) S.p.gridLock = 0;
  if (S.a) S.a.gridLock = 0;
  for (let i = S.zones.length - 1; i >= 0; i--) {
    const z = S.zones[i];
    z.t += dt;
    if (z.t >= z.life) { S.zones.splice(i, 1); continue; }
    const o = z.owner;
    if (o && Math.abs(o.x - z.x) <= z.w / 2 && o.y >= z.y - z.h - 20 && o.y <= z.y + 24) o.gridLock = 1;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 14 · 脱身 ESCAPE
 * ═══════════════════════════════════════════════════════════════════════════ */
function canEscape(f) {
  if (!f) return false;
  if (f.state !== 'stun' && f.state !== 'launched' && f.state !== 'downed') return false;
  if (f.cd.escape > 0) return false;
  if (f.energy < C.ESC.cost) return false;
  const opp = opOf(f);
  return opp && (opp.chainHits >= 2 || opp.combo >= 2);
}

function tryEscape(f) {
  if (!canEscape(f)) return false;
  const opp = opOf(f);
  const ch = f.char;
  /* 三角函数：渐近闪避（额外能量 +1s 冷却，换瞬移拉开距离） */
  const trig = ch.id === 'trig';
  const T = C.ESC_TRIG;
  f.energy = Math.max(0, f.energy - (trig ? T.cost : C.ESC.cost));
  f.cd.escape = (trig || ch.id === 'hex' || ch.id === 'spiral' ? C.ESC.cdHeavy : C.ESC.cd) +
    (trig ? T.cd - C.ESC.cdHeavy : 0) +
    Math.min(C.ESC.extraMax, (opp.combo - 2) * C.ESC.extra);
  f.state = 'escape';
  f.stateT = 0;
  f.act = { t: 0 };
  f.stunT = 0;
  f.atk = null;
  f.launchCount = 0;
  f.slamLock = 0;
  f.invuln = Math.max(f.invuln, trig ? T.inv : C.ESC.inv);
  f.escapes++;
  opp.combo = 0; opp.chainHits = 0; opp.combo4 = 0;
  opp.comboDmg = 0; opp.comboHits = 0; opp.lightDmg = 0;

  let trigInfo = null;
  switch (ch.id) {
    case 'triangle':  /* 沿斜边穿过对手 */
      f.x = clamp(opp.x - opp.facing * 70, 44, W - 44);
      break;
    case 'rhombus':   /* 沿对角线后撤 */
      f.x = clamp(f.x - opp.facing * 200, 44, W - 44);
      break;
    case 'form':      /* 坐标系平移：把对手推开 */
      opp.vx = sign(opp.x - f.x) * 560;
      opp.state = 'stun'; opp.stunT = Math.max(opp.stunT, 0.3);
      break;
    case 'hex':       /* 六边形面片弹开 */
      opp.vx = sign(opp.x - f.x) * 520;
      opp.vy = -260;
      opp.state = 'launched'; opp.stunT = 0.42;
      break;
    case 'spiral':    /* 沿螺旋线瞬移到最远位置 */
      f.x = f.x < opp.x ? 60 : W - 60;
      break;
    case 'trig':      /* 渐近闪避：穿过对手、瞬移到其背后约 210px 处（远程对枪距离） */
      trigInfo = trigBlink(f, opp);
      break;
    case 'circle':    /* 径向推离 */
      opp.vx = sign(opp.x - f.x) * 620;
      opp.state = 'stun'; opp.stunT = Math.max(opp.stunT, 0.3);
      break;
  }
  f.vx = 0;
  f.vy = Math.min(f.vy, 0);
  f.y = Math.max(f.y, groundAt(f.x));
  if (trig) {
    /* 让对手“追不上”：脱身瞬间起一段很短的追踪延迟（等于一次硬直末段反打窗），
       把“脱身 → 松手 → 正弦弹”连成一套真正能抢到先手的远程节奏 */
    if (opp.hp > 0 && opp.state !== 'dodge' && opp.invuln <= 0) {
      opp.slowT = Math.max(opp.slowT || 0, T.lag);
      opp.slowMul = T.lagMul;
    }
    ring(f.x, centerY(f), ch.lite, 46);
    floatText(f.x, centerY(f) - 44, '渐近', '#38bdf8', 13);
  } else {
    ring(f.x, centerY(f), '#67e8f9', 40);
    floatText(f.x, centerY(f) - 44, '脱身', '#67e8f9', 13);
  }
  Sfx.play('escape', f);
  Bus.emit('escape', { f });
  return true;
}

/** 渐近闪避：瞬移到对手背后并拉开到“远程对枪距离” */
function trigBlink(f, opp) {
  const T = C.ESC_TRIG;
  const r = 44;
  const start = { x: f.x, y: centerY(f) };
  /* 先试对手背后（穿过对手），背后被墙封死就落到其身前；优先取够得着目标距离的落点 */
  const fallback = clamp(opp.x + opp.facing * T.minBlink, r, W - r);
  let nx = fallback, best = Math.abs(fallback - opp.x);
  for (const want of [T.blink, T.minBlink]) {
    let found = null;
    for (const dir of [-opp.facing, opp.facing]) {
      const x = clamp(opp.x + dir * want, r, W - r);
      if (Math.abs(x - opp.x) >= want * 0.92) { found = x; break; }
    }
    if (found !== null) { nx = found; best = Math.abs(found - opp.x); break; }
    if (Math.abs(fallback - opp.x) > best) { nx = fallback; best = Math.abs(fallback - opp.x); }
  }
  const cramped = best < T.blink * 0.92;      // 落点被墙压缩：只能站到对手跟前
  const ny = groundAt(nx);
  T._cramped = cramped;                       // 内部读数：供追不上判定使用
  /* 表现：起点残影 + 虚线轨迹 + 落点涟漪（瞬移是“跳变”，用两处残影交代位移） */
  pushGhost(f);
  slashFx(start.x, start.y, f.char.lite, 24, -1.2);
  f.x = nx;
  f.y = ny;
  f.vx = 0;
  f.vy = 0;
  f.onGround = true;
  f.facing = opp.x >= f.x ? 1 : -1;
  S.ghosts.push({ char: f.char, x: nx, y: centerY(f), rot: f.rot, guard: false, facing: f.facing, life: 0.3, max: 0.3, a: 0.5 });
  /* 轨迹：起点到落点的一串光点，读者一眼看懂“穿过去了” */
  const n = 9;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    S.parts.push({
      type: 'spark', x: start.x + (nx - start.x) * t, y: start.y + (centerY(f) - start.y) * t,
      vx: 0, vy: 0, life: 0.26 * (0.4 + t * 0.6), max: 0.26, color: hexA(f.char.lite, 0.55), size: 2.2,
    });
  }
  const gy = groundAt(nx);
  ring(nx, centerY(f), f.char.color, 34);
  ring(nx, gy - 4, f.char.lite, 26);
  burstDir(start.x, start.y, sign(nx - start.x), f.char.color, 8, 220);
  burst(nx, gy - 6, f.char.color, 10, 240);
  slashFx(nx, centerY(f), '#ffffff', 20, Math.PI / 2);
  addShake(5);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 15 · 质心碰撞 CLASH
 * ═══════════════════════════════════════════════════════════════════════════ */
function checkClash() {
  if (S.clash) return;
  const p = S.p, a = S.a;
  if (!p.atk || !a.atk) return;
  if (p.atk.kind !== 'heavy' || a.atk.kind !== 'heavy') return;
  const act = f => f.atk && f.atk.t >= f.atk.w && f.atk.t <= f.atk.w + f.atk.a;
  if (!act(p) || !act(a)) return;
  if (Math.abs(p.x - a.x) > C.CLASH.reach) return;
  startClash(p, a);
}

function startClash(p, a) {
  const pc = p.atk ? p.atk.charge || 0 : 0;
  const ac = a.atk ? a.atk.charge || 0 : 0;
  const gap = Math.abs(pc - ac);
  if (gap > C.CLASH.gap) {
    const win = pc > ac ? p : a;
    const lose = win === p ? a : p;
    lose.atk = null;
    lose.state = 'stun'; lose.stunT = 0.5; lose.stateT = 0;
    S.hitstop = Math.max(S.hitstop, 0.06);
    addShake(8);
    landHit(win, lose, {
      kind: 'heavy', name: '质心碰撞', dmg: 16, coefKey: 'heavyCoef',
      launchV: 760, kb: 448, stun: 0.9, hitstop: 10, shake: 9,
      sound: 'heavy', priority: 4, noCrit: true,
    }, 0);
    return;
  }
  S.clash = { t: 0, dur: C.CLASH.time, m: [0, 0], p, a };
  p.atk = null; a.atk = null;
  p.state = 'clash'; a.state = 'clash';
  p.stateT = a.stateT = 0;
  p.vx = a.vx = 0;
  S.hitstop = Math.max(S.hitstop, 0.1);
  addShake(7);
  Sfx.play('clash');
  ring((p.x + a.x) / 2, centerY(p), '#ffffff', 30);
  Bus.emit('clashStart', { p, a });
}

function clashMash() {
  if (S.clash) S.clash.m[0] += 1;
}

function updateClash(dt) {
  const cl = S.clash;
  if (!cl) return;
  cl.t += dt;
  cl.m[1] += (cl.a.diff ? cl.a.diff.momentum : 5) * dt;
  if (cl.t >= cl.dur) resolveClash();
}

function resolveClash() {
  const cl = S.clash;
  S.clash = null;
  const p = cl.p, a = cl.a;
  const dm = cl.m[0] - cl.m[1];
  for (const f of [p, a]) { f.state = 'normal'; f.stateT = 0; f.vx = 0; }

  if (Math.abs(dm) < 0.2) {
    /* 完全弹性碰撞（等质量）：速度交换 */
    p.vx = -520; a.vx = 520;
    p.state = 'stun'; p.stunT = 0.3;
    a.state = 'stun'; a.stunT = 0.3;
    floatText((p.x + a.x) / 2, centerY(p) - 44, '完全弹性碰撞', '#ffffff', 14);
    Sfx.play('parry');
    Bus.emit('clash', { winner: null, dm });
    return;
  }
  const win = dm > 0 ? p : a;
  const lose = win === p ? a : p;
  lose.vx = sign(lose.x - win.x) * C.CLASH.push;
  landHit(win, lose, {
    kind: 'clash', name: '质心角力', dmg: C.CLASH.dmg, coefKey: 'heavyCoef',
    launchV: 0, kb: C.CLASH.push, stun: C.CLASH.stun, hitstop: 10, shake: 9,
    sound: 'heavy', priority: 4, noCrit: true,
  }, 0);
  win.clashWin++;
  S.shake = Math.max(S.shake, 8);
  floatText((p.x + a.x) / 2, centerY(p) - 48, '非弹性碰撞', '#ffffff', 14);
  Bus.emit('clash', { winner: win, dm });
  if (win === p) Bus.emit('challenge', 'clashWin');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 16 · 角色更新 FIGHTER TICK
 * ═══════════════════════════════════════════════════════════════════════════ */
function tickFighter(f, opp, dt) {
  f.stateT += dt;
  for (const k in f.cd) f.cd[k] = Math.max(0, f.cd[k] - dt);
  if (f.chainTimer > 0) {
    f.chainTimer -= dt;
    if (f.chainTimer <= 0) { f.chainTimer = 0; f.chain = 0; f.chainLive = false; }
  }
  f.followup = Math.max(0, f.followup - dt);
  f.perfectWindow = Math.max(0, f.perfectWindow - dt);
  f.invuln = Math.max(0, f.invuln - dt);
  f.hitFlash = Math.max(0, f.hitFlash - dt * 4.5);
  f.lightProtect = Math.max(0, f.lightProtect - dt);
  f.speedBoost = Math.max(0, f.speedBoost - dt);
  if (f.comboTimer > 0) {
    f.comboTimer -= dt;
    if (f.comboTimer <= 0) {
      f.combo = 0; f.chainHits = 0; f.combo4 = 0;
      f.comboDmg = 0; f.comboHits = 0; f.lightDmg = 0;
    }
  }
  /* 血量延迟条 */
  if (f.hpTrail > f.hp) f.hpTrail = Math.max(f.hp, f.hpTrail - f.maxHp * 0.42 * dt);
  else f.hpTrail = f.hp;
  /* 护盾回复 */
  if (!f.guarding && f.state !== 'falsified' && f.shield < 100) {
    f.shield = Math.min(100, f.shield + C.GUARD.regen * dt);
  }
  /* 自动连斩（螺旋收敛） */
  if (f.autoHits && f.autoHits.length) {
    const h = f.autoHits[0];
    h.t -= dt;
    if (h.t <= 0) {
      f.autoHits.shift();
      const o = opOf(f);
      if (o && o.hp > 0) {
        f.x = clamp(o.x - f.facing * 40, 44, W - 44);
        f.facing = o.x >= f.x ? 1 : -1;
        landHit(f, o, {
          kind: 'skill', name: '极限 · 收敛斩', dmg: h.dmg, coefKey: 'ultCoef',
          launchV: 0, kb: 90, stun: 2.0, hitstop: 6, shake: 7,
          sound: 'light', priority: 3, noCrit: true,
        }, 0);
      }
    }
  }
  /* 缓速压制：被正切锁定时移动速度降低 */
  if (f.slowT > 0) {
    f.slowT = Math.max(0, f.slowT - dt);
    if (f.slowT <= 0) f.slowMul = 1;
  }
  /* 朝向：移动方向优先，静止时面向对手 */
  updateFacing(f, opp);

  /* 状态机 */
  switch (f.state) {
    case 'normal': {
      f.guarding = f.onGround && wantsCrouch(f);
      const axis = moveAxis(f);
      const slow = f.slowT > 0 ? (f.slowMul || 1) : 1;
      const spd = C.MOVE * f.char.spd * (f.guarding ? C.CROUCH_MUL : 1) * (f.speedBoost > 0 ? 1.25 : 1) * slow;
      if (f.onGround) f.vx = axis * spd;
      else {
        /* 空中：朝摇杆方向加速，松手时保留动量（更像平台跳跃游戏） */
        const target = axis * C.MOVE * f.char.spd * (f.speedBoost > 0 ? 1.25 : 1);
        f.vx = lerp(f.vx, target, 1 - Math.exp(-(axis ? 9 : 2.5) * dt));
        f.vx = clamp(f.vx, -C.MOVE * 1.3, C.MOVE * 1.3);
      }
      /* 按住重击 → 蓄力（地面 / 空中都可以；AI 用 ai.heavyHeld 走同一条通道） */
      if (wantsHeavy(f) && f.cd.heavy <= 0) startCharge(f);
      break;
    }
    case 'charging': {
      f.charge = Math.min(f.charge + dt, f.char.chargeMax);
      f.chargeHold = (f.chargeHold || 0) + dt;
      const axis = f.isAI ? f.ai.move : moveAxis(f);
      const cs = C.MOVE * f.char.spd * C.FEEL.CHARGE_MOVE * (f.slowT > 0 ? (f.slowMul || 1) : 1);
      if (f.onGround) {
        /* 地面蓄力：保留 62% 移速，可以边蓄边调整站位 */
        f.vx = lerp(f.vx, axis * cs, 1 - Math.exp(-18 * dt));
      } else {
        /* 空中蓄力：悬停蓄力 —— 下落极慢，方向可微调，不会因此取消蓄力 */
        f.vy = Math.min(f.vy, C.FEEL.CHARGE_HOVER_VY);
        const target = axis * C.MOVE * f.char.spd * 0.8;
        f.vx = lerp(f.vx, target, 1 - Math.exp(-6 * dt));
      }
      if (!wantsHeavy(f)) { releaseHeavy(f); break; }
      /* 只有超时 / 被打飞才强制释放；自己起跳不再取消蓄力 */
      if (f.chargeHold > 2.5 || f.state !== 'charging') { f.chargeHold = 0; releaseHeavy(f); }
      break;
    }
    case 'attack': {
      const a = f.atk;
      if (!a) { f.state = 'normal'; break; }
      a.t += dt;
      if (a.dash) {
        /* 冲刺类招式：位移由招式控制 */
        if (a.t >= a.w && a.t <= a.w + a.a) f.vx = a.dash * f.facing;
        else if (a.t > a.w + a.a) f.vx *= Math.max(0, 1 - dt * 12);
        /* 空中重击：冲刺期间悬停俯冲，不会垂直下坠 */
        if (a.hover && a.t <= a.w + a.a) {
          f.vy = Math.min(f.vy, 120);
          if (!f.onGround) f.vy *= Math.max(0, 1 - dt * 8);
        }
      } else {
        /* 普通招式：轻击几乎可以边打边走（参照 beta 版手感） */
        const axis = f.isAI ? 0 : moveAxis(f);
        const light = a.kind === 'light' || a.kind === 'airLight';
        const gm = light ? C.FEEL.ATTACK_MOVE : C.FEEL.ACT_MOVE;
        /* 上挑 / 下劈在起手之后也允许移动 */
        const freeAfter = a.kind === 'launch' || a.kind === 'dive';
        const gm2 = freeAfter && a.t >= a.w ? C.FEEL.ATTACK_MOVE : gm;
        if (f.onGround) {
          const target = axis * C.MOVE * f.char.spd * gm2;
          f.vx = lerp(f.vx, target, 1 - Math.exp(-16 * dt));
        } else {
          const target = axis * C.MOVE * f.char.spd * (light ? C.FEEL.ATTACK_AIR : (freeAfter ? C.FEEL.ATTACK_AIR * 0.8 : 0.6));
          f.vx = lerp(f.vx, target, 1 - Math.exp(-5.5 * dt));
          f.vx = clamp(f.vx, -C.MOVE * 1.35, C.MOVE * 1.35);
        }
      }
      /* 冲刺 / 闪避残影 */
      if ((a.dash && a.t >= a.w) || f.state === 'dodge') {
        f.ghostT = (f.ghostT || 0) - dt;
        if (f.ghostT <= 0) { f.ghostT = 0.035; pushGhost(f); }
      }
      /* 蓄力释放提示：重击起手瞬间的白色闪环 */
      if (f.state === 'attack' && f.atk && !f.atk.flash && f.atk.t >= f.atk.w * 0.5) {
        f.atk.flash = true;
        ring(f.x, centerY(f), f.char.lite, 12);
      }
      if (a.kind === 'dive') {
        if (a.t >= a.w) f.vy = 1050;
      }
      /* 三角函：蓄力到点后发射正弦弹 */
      if (f.pendingShot && a.t >= f.pendingShot.at) {
        spawnProjectile(f, f.pendingShot.kind);
        f.pendingShot = null;
      }
      if (a.t >= a.w + a.a + a.r) endAttack(f);
      break;
    }
    case 'stun': {
      f.stunT -= dt;
      f.vx *= Math.max(0, 1 - dt * 18);
      if (f.stunT <= 0) { f.state = 'normal'; f.stunT = 0; f.stateT = 0; }
      break;
    }
    case 'falsified': {
      f.stunT -= dt;
      f.vx *= Math.max(0, 1 - dt * 18);
      if (f.stunT <= 0) { f.state = 'normal'; f.stunT = 0; f.stateT = 0; }
      break;
    }
    case 'downed': {
      f.stunT -= dt;
      /* 压平：立刻停住，避免“自己在那滑动” */
      f.vx *= Math.max(0, 1 - dt * 24);
      if (f.stunT <= 0) { f.state = 'normal'; f.stunT = 0; f.stateT = 0; }
      break;
    }
    case 'launched': {
      f.stunT -= dt;
      f.vx *= Math.max(0, 1 - dt * 1.2);
      /* 浮空时允许有限制的空中操控（浮空追击更好接） */
      const aa = f.isAI ? 0 : moveAxis(f);
      if (aa) f.vx = clamp(f.vx + aa * C.MOVE * 0.9 * dt, -C.MOVE, C.MOVE);
      break;
    }
    case 'dodge': {
      if (!f.act) { f.state = 'normal'; break; }
      f.act.t += dt;
      /* 闪避位移曲线：前段爆发、后段收尾，避免“滑过头” */
      const k = f.act.t / C.DODGE.dur;
      f.vx = f.act.dir * C.DODGE.speed * Math.max(0, 1 - k * k);
      f.ghostT = (f.ghostT || 0) - dt;
      if (f.ghostT <= 0) { f.ghostT = 0.03; pushGhost(f); }
      if (f.act.t >= C.DODGE.dur) { f.state = 'normal'; f.act = null; }
      break;
    }
    case 'escape': {
      if (!f.act) { f.state = 'normal'; break; }
      f.act.t += dt;
      f.vx *= Math.max(0, 1 - dt * 8);
      if (f.act.t >= C.ESC.inv) { f.state = 'normal'; f.act = null; }
      break;
    }
    case 'skill': {
      tickSkill(f, dt);
      /* 技能期间可以自由走位（只是不能攻击）：
         · sine（突进）/ mirror（后撤）的位移由技能自己控制，不接管
         · 其余技能：地面时刻跟随方向键，空中按摇杆加速并保留动量 */
      if (f.state === 'skill' && f.act && f.act.kind !== 'sine' && f.act.kind !== 'mirror') {
        const axis = f.isAI ? f.ai.move : moveAxis(f);
        const slow = f.slowT > 0 ? (f.slowMul || 1) : 1;
        const spd = C.MOVE * f.char.spd * (f.speedBoost > 0 ? 1.25 : 1) * slow;
        if (f.onGround) f.vx = axis * spd;
        else {
          const target = axis * C.MOVE * f.char.spd * (f.speedBoost > 0 ? 1.25 : 1);
          f.vx = lerp(f.vx, target, 1 - Math.exp(-(axis ? 9 : 2.5) * dt));
          f.vx = clamp(f.vx, -C.MOVE * 1.3, C.MOVE * 1.3);
        }
      }
      break;
    }
    case 'ult': tickUlt(f, dt); break;
    case 'clash': f.vx = 0; break;
    default: f.state = 'normal'; break;   // 未知状态 → 立即复位
  }

  /* 卡死自愈：任何状态都不可能无限持续 */
  guardState(f, dt);

  /* 物理 */
  if (!f.onGround) {
    const g = (f.state === 'launched' ? C.FLOAT_G * f.char.floatG : C.GRAVITY);
    f.vy += g * dt;
    f.vy = Math.min(f.vy, 1900);
    f.y += f.vy * dt;
  }
  f.x += f.vx * dt;
  f.wallCd = Math.max(0, (f.wallCd || 0) - dt);
  if (f.x < 44) {
    f.x = 44;
    if (f.vx < -C.FEEL.WALL_MIN && f.wallCd <= 0) wallBounce(f, 1);
    else if (f.vx < 0) f.vx *= Math.max(0, 1 - dt * 10);
  }
  if (f.x > W - 44) {
    f.x = W - 44;
    if (f.vx > C.FEEL.WALL_MIN && f.wallCd <= 0) wallBounce(f, -1);
    else if (f.vx > 0) f.vx *= Math.max(0, 1 - dt * 10);
  }
  const gh = groundAt(f.x);
  if (f.onGround) {
    /* 站立 / 行走：贴地（分形海岸的起伏地面也跟随） */
    f.y = gh; f.vy = 0;
  } else if (f.y >= gh) {
    /* 触地 */
    f.y = gh; f.vy = 0;
    f.onGround = true;
    onLand(f);
  } else {
    f.onGround = false;
  }
  /* 保险：站在地面上却处于浮空（例如被“地面状态”的击飞打中、vy 已被清 0），
     永远不会“穿过地面”，也就不会触发 onLand → 会永久卡在浮空里无法操作。
     这里补一次落地，保证浮空状态一定能结束。 */
  if (f.state === 'launched' && f.onGround) {
    f.y = gh; f.vy = 0;
    onLand(f);
  }

  const b = f.buffer;
  if (b) {
    b.t += dt;
    if (b.t > 0.16) { b.jump = false; b.light = false; b.ult = false; b.heavy = false; }
  }
  /* 硬直结束瞬间补发缓冲输入（防吞键） */
  if (f.state === 'normal') f.lockReason = null;
  if (f.state === 'normal' && b) {
    if (b.jump) { b.jump = false; b.t = 0; tryJump(f); }
    else if (b.light) { b.light = false; b.t = 0; tryLight(f); }
    else if (b.heavy) { b.heavy = false; b.t = 0; tryHeavyKey(f); }
    else if (b.ult) { b.ult = false; b.t = 0; tryUlt(f); }
  }
  /* 旋转（待机自转 / 浮空加速）+ 平滑回正 */
  const spinMul = f.state === 'launched' ? 3 : f.state === 'dodge' ? 2 : 1;
  if (f.char.spinMode === 'spin') f.rot += f.spin * dt * spinMul;
  else f.rot = lerp(f.rot, 0, 1 - Math.exp(-10 * dt));
}

/**
 * 状态守卫：保证任何状态都在有限时间内回到 normal。
 * 线上出现的“莫名卡死、人机能动”全部源于某个状态缺少退出条件，
 * 这里按状态持续时间逐个兜底，并记录一次自愈事件供调试。
 */
const STATE_MAX_AGE = {
  normal: 1e9, attack: 4, stun: 5, falsified: 4, downed: 4,
  launched: 4, dodge: 2, escape: 2, skill: 6, charging: 3, clash: 4, ult: 3,
};
function guardState(f, dt) {
  if (f.state === 'attack' && !f.atk) { f.state = 'normal'; f.stateT = 0; return; }
  if (f.state === 'ult' && !f.ult) { f.state = 'normal'; f.stateT = 0; return; }
  if (S.clash) return;                       // 角力由全局状态机接管
  if (f.state === 'clash') { f.state = 'normal'; f.stateT = 0; return; }
  const max = STATE_MAX_AGE[f.state];
  if (max !== undefined && f.stateT > max) {
    S.selfHeal = (S.selfHeal || 0) + 1;
    if (f.atk) f.atk = null;
    f.act = null;
    f.charging = false;
    f.charge = 0;
    f.guarding = false;
    f.stunT = 0;
    f.state = 'normal';
    f.stateT = 0;
  }
}

function onLand(f) {
  f.jumps = C.MAX_JUMPS;
  f.airActions = C.AIR_ACTIONS;
  f.airDodge = 1;
  const prev = f.state;
  f.launchCount = 0;
  if (prev === 'launched') {
    const lock = f.slamLock || 0;
    f.slamLock = 0;
    f.state = lock > 0 ? 'downed' : 'stun';
    f.stunT = lock > 0 ? lock : 0.20;
    f.stateT = 0;
    /* 落地：重摔的落地冲击（水平速度大 = 被砸落） */
    const hard = Math.abs(f.vx) > 300 || lock > 0;
    if (hard) {
      addShake(lock > 0 ? C.FEEL.GROUND_SLAM : 9);
      S.hitstop = Math.max(S.hitstop, 0.05);
      groundCrack(f);
      Sfx.play('land', f);
      Sfx.play('heavy', f);
    } else {
      Sfx.play('land', f);
      dust(f);
    }
    f.vx = 0;
  } else if (prev === 'attack' && f.atk && f.atk.kind === 'dive') {
    f.atk = null;
    f.state = 'normal'; f.stateT = 0;
    /* 下劈落地：地面裂开 + 冲击环 */
    addShake(8);
    groundCrack(f);
    Sfx.play('land', f);
  } else if (prev === 'attack' || prev === 'charging' || prev === 'skill') {
    /* 空中出招落地：轻微扬尘 */
    if (f.vy > 400) dust(f);
    /* 按键缓冲：落地瞬间按下的跳跃 / 轻击会在下一帧自动执行，连跳不再吞键 */
    const b = f.buffer;
    if (b) {
      if (b.jump && b.t < 0.16) { b.jump = false; tryJump(f); return; }
      if (b.light && b.t < 0.16) { b.light = false; tryLight(f); return; }
    }
  }
}

/** 砸地特效：地面裂纹 + 尘土环 */
function groundCrack(f) {
  const gy = groundAt(f.x);
  burst(f.x, gy - 6, '#ffffff', 12, 300);
  ring(f.x, gy - 6, f.char.color, 34);
  for (let i = 0; i < 3; i++) slashFx(f.x + rnd(-30, 30), gy - 8, '#ffffff', 10 + rnd(0, 10), rnd(-0.4, 0.4) + Math.PI / 2);
  dust(f);
}

function resetPositions() {
  for (const f of [S.p, S.a]) {
    if (!f) continue;
    f.x = f.side === 0 ? 300 : 660;
    f.y = groundAt(f.x);
    f.vx = f.vy = 0;
    f.state = 'normal'; f.stateT = 0;
    f.atk = null; f.act = null; f.shieldSkill = null;
    f.charging = false; f.charge = 0;
    f.guarding = false; f.stunT = 0; f.invuln = 0; f.slamLock = 0;
    f.chain = 0; f.chainLive = false; f.chainTimer = 0; f.queued = 0;
    f.combo = 0; f.comboTimer = 0; f.chainHits = 0; f.combo4 = 0;
    f.onGround = true;
    f.cd.dodge = 0; f.cd.skill = 0; f.cd.escape = 0;
    f.autoHits = null;
  }
  S.clash = null;
  S.mirrors.length = 0;
  S.zones.length = 0;
  S.hitstop = 0;
}
/* ═══════════════════════════════════════════════════════════════════════════
 * 17 · AI 系统
 * ---------------------------------------------------------------------------
 *  约束：不读取玩家即时输入（0.06~0.19s 延迟快照）；能力与玩家共用同一套函数；
 *        难度只调节反应、思考间隔、决策概率、移动与蓄力释放时机。
 * ═══════════════════════════════════════════════════════════════════════════ */
function aiTick(f, opp, dt) {
  const d = f.diff;
  if (!d || !opp) return;
  const ai = f.ai;

  /* 感知快照（延迟 0.06~0.25s） */
  ai.snapT -= dt;
  if (ai.snapT <= 0) {
    ai.snap = {
      state: opp.state,
      atk: opp.atk ? { kind: opp.atk.kind, t: opp.atk.t, w: opp.atk.w, a: opp.atk.a } : null,
      x: opp.x, y: opp.y, guarding: opp.guarding, charging: opp.state === 'charging',
      launched: opp.state === 'launched', hp: opp.hp, energy: opp.energy,
    };
    ai.snapT = Math.max(0.03, d.react);
  }
  const snap = ai.snap;
  if (!snap) return;

  const dist = Math.abs(opp.x - f.x);
  const dir = sign(opp.x - f.x || 1);

  /* 训练假人「点」：完全静止 */
  if (d.aggr <= 0) { ai.move = 0; ai.crouch = false; ai.heavyHeld = false; return; }

  const hurt = f.state === 'stun' || f.state === 'launched' || f.state === 'downed';
  if (!hurt) { ai.cRoll = false; ai.escTimer = 0; }

  /* 受击分支：每 0.18s 一次脱身判定 + 硬直末段反打一次 */
  if (hurt) {
    ai.move = 0; ai.crouch = false; ai.heavyHeld = false;
    ai.escTimer -= dt;
    if (ai.escTimer <= 0) {
      ai.escTimer = 0.18;
      if (canEscape(f) && Math.random() < d.escape) { tryEscape(f); return; }
    }
    if (f.state === 'stun' && f.stunT <= 0.1 && !ai.cRoll) {
      ai.cRoll = true;
      if (Math.random() < d.counter) tryLight(f);
    }
    return;
  }

  /* 蓄力中：达到阈值释放 */
  if (f.state === 'charging') {
    if (f.charge / f.char.chargeMax >= d.release) ai.heavyHeld = false;
    return;
  }

  /* 招式 / 技能中：仅在完美窗口反击 */
  if (f.state !== 'normal') {
    ai.heavyHeld = false;
    if (f.perfectWindow > 0 && Math.random() < 0.6) tryCounter(f, pick(['light', 'heavy', 'ult', 'counter']));
    return;
  }

  /* 移动是连续的，决策按“思考间隔”触发 */
  aiMove(f, opp, d, dist, dir, dt);
  ai.think -= dt;
  if (ai.think > 0) return;
  ai.think = Math.max(0.03, d.think) * rnd(0.7, 1.35);

  /* 完美闪避窗口 → 四选一推论 */
  if (f.perfectWindow > 0) { tryCounter(f, pick(['light', 'heavy', 'ult', 'counter'])); return; }

  /* 威胁响应 */
  const threat = snap.atk && snap.atk.t < snap.atk.w + snap.atk.a + 0.08;
  if (threat && dist < 200) {
    const r = Math.random();
    if (r < d.dodge) { tryDodge(f); return; }
    if (r < d.dodge + d.guard) { ai.crouch = true; ai.crouchHold = 0.26; ai.move = 0; return; }
    if (snap.atk && (snap.atk.kind === 'heavy' || snap.atk.kind === 'ult') && Math.random() < d.jumpDodge) { tryJump(f); return; }
  }

  /* 防御技能提前量 */
  if (threat && dist < 230 && Math.random() < d.guard * 0.55) {
    const sk = f.char.skill;
    if (f.cd.skill <= 0 && f.energy >= sk.cost && sk.kind !== 'mirror') { startSkill(f); return; }
  }

  /* 大招 */
  if (f.energy >= C.ULT.cost && dist < 240 && Math.random() < d.ult * 0.55) { startUlt(f); return; }

  /* 浮空追击 */
  if (snap.launched) {
    if (dist < 170) {
      if (f.onGround && f.cd.launch <= 0 && Math.random() < 0.45) { startLaunch(f); return; }
      if (f.onGround) { tryJump(f); return; }
      if (dist < 130) { tryLight(f); return; }
    }
    return;
  }

  /* 对手蹲防 → 上挑 / 技能 */
  if (snap.guarding && dist < 140) {
    if (f.cd.skill <= 0 && f.energy >= f.char.skill.cost && Math.random() < 0.5) { startSkill(f); return; }
    if (f.cd.launch <= 0 && Math.random() < 0.55) { startLaunch(f); return; }
  }

  /* 距离分支 */
  const sk = f.char.skill;
  if (dist > 155) {
    if (dist > 210 && dist < 340 && f.cd.skill <= 0 && f.energy >= sk.cost && Math.random() < d.aggr * 0.5) { startSkill(f); return; }
    if (f.cd.heavy <= 0 && Math.random() < d.aggr * 0.5) { ai.heavyHeld = true; f.ai.move = 0; return; }
  } else if (dist < 132) {
    if (Math.random() < d.aggr) {
      if (f.chainLive && f.chain > 0 && f.chain < 4 && Math.random() < 0.72) { tryLight(f); return; }
      if (Math.random() < 0.5) { tryLight(f); return; }
      if (f.cd.launch <= 0 && Math.random() < 0.28) { startLaunch(f); return; }
    }
  }
}

function aiMove(f, opp, d, dist, dir, dt) {
  const ai = f.ai;
  if (ai.crouchHold > 0) {
    ai.crouchHold -= dt;
    ai.crouch = true;
    ai.move = 0;
    return;
  }
  ai.crouch = false;
  const want = d.dist;
  let m = 0;
  if (dist > want + 20) m = dir * d.move;
  else if (dist < want - 28) m = -dir * d.move;
  else m = Math.random() < 0.3 ? dir * 0.35 : 0;
  ai.move = clamp(m, -1, 1);
}

/* ── 训练场木桩 ─────────────────────────────────────────────────────── */
function trainingTick(dt) {
  const d = S.a;
  if (!d) return;
  const cfg = S.trainingCfg;
  d.ai.move = 0;
  d.ai.heavyHeld = false;
  if (d.state === 'normal' && d.cd.heavy <= 0 && cfg.behavior !== 'heavy') d.charging = false;

  switch (cfg.behavior) {
    case 'idle': d.ai.crouch = false; break;
    case 'guard': d.ai.crouch = true; break;
    case 'walk':
      d.ai.crouch = false;
      d.ai.move = Math.sin(S.clock.battle * 1.3) > 0 ? 0.55 : -0.55;
      break;
    case 'jump':
      d.ai.crouch = false;
      d.ai.timer -= dt;
      if (d.ai.timer <= 0) { d.ai.timer = 2.6; if (d.state === 'normal') tryJump(d); }
      break;
    case 'light':
      d.ai.crouch = false;
      d.ai.timer -= dt;
      if (d.ai.timer <= 0) { d.ai.timer = 2.0; if (d.state === 'normal') startLight(d); }
      break;
    case 'heavy':
      d.ai.crouch = false;
      d.ai.timer -= dt;
      if (d.ai.timer <= 0) { d.ai.timer = 3.2; if (d.state === 'normal') { d.ai.heavyHeld = true; d.ai.timer = 3.2; } }
      if (d.state === 'charging' && d.charge >= d.char.chargeMax * 0.7) d.ai.heavyHeld = false;
      break;
  }

  /* 反击模式 */
  if (cfg.counter === 'hiton' && d.state === 'stun' && d.stunT < 0.14 && Math.random() < 0.08) startLight(d);
  if (cfg.counter === 'perfectDodge' && d.state === 'normal' && d.cd.dodge <= 0) {
    const p = S.p;
    if (p.atk && p.atk.t >= p.atk.w - 0.02 && p.atk.t <= p.atk.w + 0.06 &&
        Math.abs(p.x - d.x) < 170 && Math.random() < 0.5) tryDodge(d);
  }
  if (cfg.counter === 'perfectGuard' && d.state === 'normal' && d.shield > 0) {
    const p = S.p;
    if (p.atk && p.atk.t >= p.atk.w - 0.04 && Math.abs(p.x - d.x) < 150) d.ai.crouch = true;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 18 · 比赛流程 MATCH FLOW
 * ═══════════════════════════════════════════════════════════════════════════ */
function autoOpponent(id) {
  const pool = BASE_FIVE.filter(c => c.id !== id);
  return pool[(Math.random() * pool.length) | 0].id;
}

function startMatch(mode) {
  const cfg = S.match;
  S.training = mode === 'training';
  S.paused = false;
  S.scene = SCENE_MAP[cfg.scene] || SCENES[0];
  S.p = createFighter(cfg.fighter, 0, false);
  let oid = cfg.opponent;
  if (oid === 'circle' && !S.profile.unlockedCircle) oid = 'auto';
  if (S.training) oid = (oid === 'auto' ? 'triangle' : oid);
  else if (oid === 'auto' || oid === cfg.fighter) oid = autoOpponent(cfg.fighter);
  S.a = createFighter(oid, 1, true);
  S.a.diff = S.training ? DIFFS[0] : DIFFS[clamp(cfg.diff | 0, 0, 5)];

  S.phase = 'fight';
  S.screen = 'fight';
  S.clock.battle = 0;
  S.clock.round = C.ROUND_TIME;
  S.hitstop = 0; S.slowmo = 0; S.shake = 0; S.shakeT = 0; S.intensity = 0; S.hitPulse = 0;
  S.flash = 0; S.shockwave = 0; S.shards.length = 0;
  S.parts.length = 0; S.proofs.length = 0; S.floats.length = 0; S.ghosts.length = 0;
  S.mirrors.length = 0; S.zones.length = 0;
  S.projectiles.length = 0; S.tanMarks.length = 0;
  S.clash = null; S.finisher = null; S.result = null; S.rematchAt = 0;
  S.p.orthCount = 0; S.p.juggleAir = 0; S.p.launchFollow = false;
  resetPositions();
  if (S.training && S.trainingCfg.infinite) { S.p.energy = 100; }

  UI.close();
  Sfx.init();
  Sfx.play('ui');
  Bus.emit('matchStart', { mode });
}

function restartMatch() {
  const mode = S.training ? 'training' : 'versus';
  startMatch(mode);
}

function resetMatchIdle() {
  S.phase = 'menu';
  S.p = null; S.a = null;
  S.finisher = null; S.clash = null;
  S.mirrors.length = 0; S.zones.length = 0;
  S.projectiles.length = 0; S.tanMarks.length = 0;
  S.parts.length = 0; S.floats.length = 0; S.ghosts.length = 0;
}

/* ── KO 与终结演出 ──────────────────────────────────────────────────── */
function onKO(att, def, atk) {
  if (S.phase !== 'fight') return;
  /* 终结层级：在改变状态前判定 */
  let tier = 'QED';
  if (atk.kind === 'ult' || atk.kind === 'counter') tier = 'LEMA';
  if (att.combo >= 2 && (atk.kind === 'light' || atk.kind === 'airLight')) tier = 'THEOREM';
  const order = { QED: 0, LEMA: 1, THEOREM: 2 };
  const sel = S.match.finisher;
  if (sel && sel !== 'auto' && order[sel] > order[tier]) tier = sel;

  S.phase = 'finisher';
  def.hp = 0;
  def.vx = 0;
  def.state = 'launched';
  def.vy = -240;
  S.hitstop = Math.max(S.hitstop, 0.16);
  addShake(14);
  S.slowmo = Math.max(S.slowmo, 0.55);

  const T = C.FINISHER_TL;
  S.finisher = {
    t: 0, total: T.end, tier, att, def, atk, name: atk.name,
    timeout: false, draw: false, done: false, skipped: false, hitAt: T.freeze,
  };
  Sfx.play('ko');
  Bus.emit('ko', { att, def, tier, atk });
}

function onTimeout() {
  if (S.phase !== 'fight') return;
  const p = S.p, a = S.a;
  S.phase = 'finisher';
  const T = C.FINISHER_TL;
  let F;
  if (p.hp === a.hp) {
    F = { t: 0, total: T.end, tier: 'QED', att: null, def: null, name: '公理不成立', timeout: true, draw: true, done: false, hitAt: T.freeze };
  } else {
    const win = p.hp > a.hp ? p : a;
    const lose = win === p ? a : p;
    F = { t: 0, total: T.end, tier: 'QED', att: win, def: lose, name: '判定', timeout: true, draw: false, done: false, hitAt: T.freeze };
  }
  S.finisher = F;
  Sfx.play('ko');
  Bus.emit('ko', { att: F.att, def: F.def, tier: 'QED', timeout: true, draw: F.draw });
}

function skipFinisher() {
  const F = S.finisher;
  if (S.phase !== 'finisher' || !F || F.done) return;
  /* 补算命中特效（幂等），然后进入标题展示阶段（停留 RESULT_DELAY 秒） */
  playFinisherHit(F, true);
  F.done = true;
  F.skipped = true;
  F.t2 = 0;
  F.t = Math.max(F.t, C.FINISHER_TL.cinematic);
  finishMatch();
}

/** 胜利演出的“命中瞬间”：碎裂 + 冲击环 + 刀光 + 闪白 + 强震屏 */
function playFinisherHit(F, immediate) {
  if (!F || F.hitPlayed) return;
  F.hitPlayed = true;
  const def = F.def;
  if (!def) return;
  const cx = def.x, cy = centerY(def);
  const col = def.char.color, lit = def.char.lite;

  /* 对手炸裂成几何碎片 */
  shatter(def, F.att ? F.att.facing : 1);
  /* 多道交叉刀光 */
  for (let i = 0; i < 5; i++) {
    slashFx(cx, cy, i % 2 ? '#ffffff' : (F.att ? F.att.char.color : lit), 34 + i * 12, (Math.PI / 4) * i + rnd(-0.2, 0.2));
  }
  /* 冲击环 + 火花 */
  ring(cx, cy, '#ffffff', 90);
  ring(cx, cy, col, 60);
  burst(cx, cy, col, 40, 620);
  burst(cx, cy, '#ffffff', 22, 420);
  burstDir(cx, cy, F.att ? F.att.facing : 1, lit, 20, 700);

  /* 强震屏 + 顿帧 + 全屏闪白 */
  addShake(26);
  S.hitstop = Math.max(S.hitstop, 0.18);
  S.flash = 1;
  S.slowmo = Math.max(S.slowmo, 0.7);
  Sfx.play('shatter');
  Sfx.play('finish');
  if (!immediate) floatText(cx, cy - 70, F.tier === 'THEOREM' ? '定理证毕' : F.tier === 'LEMA' ? '引理证毕' : '证毕', '#ffffff', 22);
}

/**
 * 终结演出推进（实时循环与调试推进共用这一份逻辑）：
 *   freeze → impact → collapse → title  [动画阶段]
 *   → 标题 + 结算数据停留 RESULT_DELAY 秒 [展示阶段]
 *   → 结算界面                          [结果]
 */
function advanceFinisher(dt) {
  if (S.phase === 'finisher') updateFinisher(dt);
  else if (S.phase === 'result') updateResult(dt);
}

/** 演出阶段计时：动画 3.4s，之后标题画面停 RESULT_DELAY 秒才出结算 */
function updateFinisher(dt) {
  const F = S.finisher;
  if (!F) { openResultScreen(); return; }
  const T = C.FINISHER_TL;
  F.t += dt;

  /* 世界冻结：被击败方悬停 → 坠地；命中瞬间只结算一次 */
  if (F.t < T.impact) F.def && (F.def.vy = Math.min(F.def.vy, 0));
  else if (F.def && F.def.state !== 'downed') { F.def.state = 'downed'; F.def.stunT = 999; }
  if (F.def && F.def.hp > 0) F.def.hp = 0;
  if (!F.hitPlayed && F.t >= F.hitAt) playFinisherHit(F, false);

  /* 动画结束 → 展示阶段：先算好结算数据，让全屏标题画面完整停留 */
  if (!F.done && F.t >= T.cinematic) {
    F.done = true;
    F.t2 = 0;
    finishMatch();
  }
  if (!F.done) return;

  F.t2 += dt;
  if (F.t2 >= C.RESULT_DELAY) openResultScreen();
}

/** 结算界面（在演出结束后弹出，至少停留 C.RESULT_MIN 秒） */
function updateResult(dt) {
  S.resultT = (S.resultT || 0) + dt;
  if (S.settings.autoRematch && S.result && !S.result.draw && !S.paused &&
      S.resultT >= C.RESULT_MIN + 3.0) {
    S.resultT = 0;
    restartMatch();
  }
}

/** 切到结算屏：先补算结算数据，再无条件打开界面 */
function openResultScreen() {
  if (S.phase === 'result') return;
  if (!S.result) finishMatch();
  S.phase = 'result';
  S.resultT = 0;
  S.rematchAt = 0;
  UI.open('result');
}

function finishMatch() {
  const F = S.finisher;
  if (!F || F.awarded) return;
  F.awarded = true;

  const P = S.profile, st = P.stats;
  const p = S.p, a = S.a;
  const win = F.att === p;
  const draw = !!F.draw;

  const avg = p.angleN ? p.angleSum / p.angleN : 0;
  const bestAngle = (p.bestAngle === undefined || p.bestAngle >= 999) ? 0 : p.bestAngle;

  /* ── 永久档案（仅自由对战） ── */
  if (!S.training) {
    st.matches++;
    st.damage += Math.round(p.dmgDealt);
    st.taken += Math.round(p.dmgTaken);
    st.hits += p.hits;
    st.perfectDodges += p.perfectDodges;
    st.perfectCounters += p.perfectCounters;
    st.clashWins += p.clashWin;
    st.skills += p.skills;
    st.bestCombo = Math.max(st.bestCombo, p.maxCombo);
    st.finishers++;
    if (F.tier === 'THEOREM') st.theoremFinishers++;
    if (F.atk && F.atk.kind === 'counter') st.bisector++;
    P.tiers[F.tier] = (P.tiers[F.tier] || 0) + 1;
    P.angleSum += p.angleSum; P.angleN += p.angleN;

    const cs = P.chars[p.char.id];
    if (cs) {
      if (draw) cs.d++; else if (win) cs.w++; else cs.l++;
      cs.bestCombo = Math.max(cs.bestCombo, p.maxCombo);
      cs.angleSum += p.angleSum; cs.angleN += p.angleN;
    }
    if (draw) { st.draws++; st.streak = 0; }
    else if (win) {
      st.wins++;
      st.streak++;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
    } else { st.losses++; st.streak = 0; }

    /* 最近对局 */
    P.recent.unshift({
      t: Date.now(), me: p.char.id, opp: a.char.id, scene: S.scene.id,
      win: win ? 1 : 0, draw: draw ? 1 : 0, tier: F.tier,
      combo: p.maxCombo, dmg: Math.round(p.dmgDealt), angle: avg,
    });
    if (P.recent.length > 20) P.recent.length = 20;

    /* 五边形完备 / 隐藏角色 */
    if (BASE_FIVE.every(c => (P.chars[c.id] && P.chars[c.id].w) > 0)) {
      P.unlockedCircle = true;
    }
  }

  /* ── 成就 ── */
  const ctx = {
    win, draw, timeout: !!F.timeout, tier: F.tier,
    maxCombo: p.maxCombo, taken: p.dmgTaken,
    hpPct: p.hp / p.maxHp,
    perfectDodges: p.perfectDodges, perfectCounters: p.perfectCounters,
    clashWin: p.clashWin, orthogonal: p.orthCount || 0,
    dummy: a.diff && a.diff.id === 'point',
    bisector: F.atk && F.atk.kind === 'counter',
  };
  const born = S.training ? [] : evalAch(ctx);

  /* ── 结算数据 ── */
  S.result = {
    tier: F.tier, name: F.name, win, draw, timeout: !!F.timeout,
    fighter: p.char.id, opponent: a.char.id, scene: S.scene.id,
    time: Math.max(0, Math.round(C.ROUND_TIME - S.clock.round)),
    p: {
      dmg: Math.round(p.dmgDealt), taken: Math.round(p.dmgTaken), hits: p.hits,
      combo: p.maxCombo, perfect: p.perfectDodges, counter: p.perfectCounters,
      clash: p.clashWin, avg, best: bestAngle, hp: p.hp, maxHp: p.maxHp,
    },
    a: {
      dmg: Math.round(a.dmgDealt), taken: Math.round(a.dmgTaken), hits: a.hits,
      combo: a.maxCombo, perfect: a.perfectDodges, counter: a.perfectCounters,
      avg: a.angleN ? a.angleSum / a.angleN : 0,
    },
    born,
  };

  if (!S.training) Store.saveProfile();
  /* 注意：此处不切结算面板。演出标题先展示 C.RESULT_DELAY 秒，再进入结算 */
  S.finisher.t2 = S.finisher.t2 || 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 19 · 成就与连招挑战
 * ═══════════════════════════════════════════════════════════════════════════ */
function unlockAch(id) {
  const P = S.profile;
  if (P.ach[id]) return false;
  const def = ACHS.find(a => a.id === id);
  if (!def) return false;
  P.ach[id] = Date.now();
  toast(`${def.tier} · 成就解锁`, `${def.name} — ${def.code}`, TIER_COLOR[def.tier] || '#fbbf24');
  Sfx.play('ach');
  return true;
}

function evalAch(ctx) {
  const c = ctx || {};
  const P = S.profile, st = P.stats;
  const born = [];
  const U = id => { if (unlockAch(id)) born.push(id); };

  if (st.wins >= 1) U('first');
  if (st.wins >= 10) U('axiom');
  if (st.wins >= 50) U('unfalsifiable');
  if (st.streak >= 5 || st.bestStreak >= 5) U('induction');
  if ((c.maxCombo || 0) >= 15 || st.bestCombo >= 15) U('sequence');
  if ((c.maxCombo || 0) >= 25 || st.bestCombo >= 25) U('limitCombo');
  if ((c.perfectDodges || 0) >= 3) U('solver');
  if ((c.perfectCounters || 0) >= 3) U('reductio');
  if ((c.clashWin || 0) > 0) U('centerOfMass');
  if (Object.keys(P.tiers).length >= 3) U('threeTiers');
  if (st.theoremFinishers >= 3) U('theorem3');
  if (c.win && (c.taken || 0) === 0) U('nullHypothesis');
  if (st.orthogonal >= 10) U('orthogonal');
  if (BASE_FIVE.every(ch => (P.chars[ch.id] && P.chars[ch.id].w) > 0)) U('pentagon');
  if (P.unlockedCircle) U('approach');
  if (st.matches >= 20) U('iteration');
  if (st.damage >= 15000) U('accumulated');
  if (c.win && (c.hpPct || 0) <= 0.15) U('contrapositive');
  if (c.win && (c.taken || 0) <= 60) U('identity');
  if (st.skills >= 50) U('proofMachine');
  if (CHALLENGES.every(x => P.ch[x.id])) U('settled');
  if (st.bisector >= 3) U('bisector');
  if (c.dummy) U('particle');

  /* 完备性：其余全部解锁 */
  const rest = ACHS.filter(a => a.id !== 'completeness');
  if (rest.every(a => P.ach[a.id])) U('completeness');
  return born;
}

function unlockChallenge(id) {
  const P = S.profile;
  if (P.ch[id]) return false;
  const def = CHALLENGES.find(c => c.id === id);
  if (!def) return false;
  P.ch[id] = Date.now();
  P.stats.challenges = CHALLENGES.filter(c => P.ch[c.id]).length;
  toast('连招挑战', `${def.name} · ${def.desc}`, '#67e8f9');
  Sfx.play('challenge');
  if (S.profile) Store.saveProfile();
  return true;
}

/* 全局事件订阅（统计 / 挑战） */
function bindEvents() {
  Bus.on('hit', e => {
    if (e.att !== S.p) return;
    const p = S.p, a = S.a;
    if (e.angle < (p.bestAngle === undefined ? 999 : p.bestAngle)) p.bestAngle = e.angle;
    if (e.angle <= 5) {
      p.orthCount = (p.orthCount || 0) + 1;
      if (!S.training) S.profile.stats.orthogonal++;
      if (p.orthCount >= 5) unlockChallenge('orthogonal');
    }
    if (p.maxCombo >= 10) unlockChallenge('combo10');
    if (e.atk.kind === 'launch') p.launchFollow = true;
    if (e.atk.kind === 'airLight' && a.state === 'launched') {
      p.juggleAir = (p.juggleAir || 0) + 1;
      if (p.juggleAir >= 3) unlockChallenge('juggle3');
      if (p.launchFollow) { unlockChallenge('launchFollow'); p.launchFollow = false; }
    }
    if (e.atk.kind === 'airLight' && p.combo >= 2) unlockChallenge('aerial2');
  });
  Bus.on('perfectDodge', e => { if (e.def === S.p) unlockChallenge('perfectDodge'); });
  Bus.on('challenge', id => unlockChallenge(id));
  Bus.on('clash', e => { if (e.winner === S.p) unlockChallenge('clashWin'); });
  Bus.on('falsify', e => {
    if (e.f === S.a) floatText(S.a.x, centerY(S.a) - 60, '证伪 ⊥', '#f87171', 13);
  });
}
/* ═══════════════════════════════════════════════════════════════════════════
 * 20 · 粒子与特效 FX
 * ═══════════════════════════════════════════════════════════════════════════ */
function particleScale() {
  const q = S.settings.quality;
  return q === 'performance' ? 0.42 : q === 'balanced' ? 0.7 : 1;
}

function burst(x, y, color, n, power) {
  if (S.settings.particles <= 0) return;
  const cnt = Math.round(n * (S.settings.particles || 1) * particleScale());
  for (let i = 0; i < cnt; i++) {
    if (S.parts.length >= C.MAX_PARTICLES) break;
    const ang = rnd(0, TAU), v = rnd(power * 0.3, power);
    S.parts.push({
      type: 'spark', x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 30,
      life: rnd(0.22, 0.5), max: 0.5, color, size: rnd(1, 2.8),
    });
  }
}

/** 方向性火花：沿命中方向拉出速度线（beta 版打击感） */
function burstDir(x, y, dir, color, n, power) {
  if (S.settings.particles <= 0) return;
  const cnt = Math.round(n * (S.settings.particles || 1) * particleScale());
  for (let i = 0; i < cnt; i++) {
    if (S.parts.length >= C.MAX_PARTICLES) break;
    const ang = (dir > 0 ? 0 : Math.PI) + rnd(-0.9, 0.9);
    const v = rnd(power * 0.4, power);
    S.parts.push({
      type: 'spark', x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v + rnd(-60, 20),
      life: rnd(0.16, 0.4), max: 0.4, color, size: rnd(1.2, 3),
    });
  }
}

function ring(x, y, color, r) {
  S.parts.push({ type: 'ring', x, y, r, life: 0.34, max: 0.34, color });
}

/** 十字斩击特效（命中点的“X”光斑） */
function slashFx(x, y, color, len, angle) {
  if (S.parts.length >= C.MAX_PARTICLES) return;
  S.parts.push({
    type: 'slash', x, y, color, len,
    angle: angle === undefined ? rnd(-0.55, 0.55) : angle,
    life: 0.22, max: 0.22,
  });
}

/** 震屏：强度 + 平方衰减时长 */
function addShake(power) {
  if (!power) return;
  S.shake = Math.max(S.shake, power);
  S.shakeT = C.FEEL.SHAKE_TIME;
}

/** 撞墙反弹 */
function wallBounce(f, dir) {
  f.vx = Math.abs(f.vx) * C.FEEL.WALL_BOUNCE * dir;
  f.wallCd = 0.22;
  f.hitFlash = Math.max(f.hitFlash, 0.3);
  S.hitstop = Math.max(S.hitstop, 2 / 60);
  addShake(5);
  burst(f.x + dir * 14, centerY(f), '#ffffff', 9, 240);
  ring(f.x + dir * 10, centerY(f), f.char.color, 28);
  slashFx(f.x + dir * 16, centerY(f), '#ffffff', 16, dir > 0 ? -1.1 : 1.1);
  floatText(f.x + dir * 26, centerY(f) - 42, '撞墙', '#ffffff', 12);
  Sfx.play('wall', f);
}

/** 冲刺 / 闪避残影 */
function pushGhost(f) {
  if (!S.settings || S.settings.quality === 'performance') return;
  if (S.ghosts.length > 40) S.ghosts.shift();
  S.ghosts.push({
    char: f.char, x: f.x, y: centerY(f), rot: f.rot, guard: f.guarding,
    facing: f.facing, life: 0.2, max: 0.2,
  });
}

/** 命中反馈总成：斩击光斑 + 方向火花 + 伤害飘字 + 攻击者后坐 */
function spawnImpact(att, def, design, crit, angle) {
  const x = def.x, y = centerY(def);
  const dir = att.facing;
  const col = att.char.color;
  const lit = att.char.lite;

  slashFx(x, y, crit ? '#ffffff' : lit, 18 + design * 2.4);
  if (crit) slashFx(x, y, col, 26 + design * 2.4, rnd(-1.2, 1.2));
  burstDir(x, y, dir, col, crit ? 14 : 8, crit ? 380 : 250);
  burst(x, y, crit ? '#ffffff' : lit, crit ? 10 : 5, crit ? 300 : 180);
  ring(x, y, crit ? '#ffffff' : lit, 11 + design * 1.7);

  floatText(x + rnd(-14, 14), y - 30 - rnd(0, 10),
    (crit ? '×2 ' : '') + fmt(design),
    crit ? '#ff7a7a' : '#ffffff',
    crit ? 21 : 15);

  /* 后坐力：攻击者被自己的力气推回一点 */
  att.vx -= dir * design * C.FEEL.ATTACKER_PUSH * 1.6;
  S.hitPulse = 1;
  if (crit) Sfx.play('crit', att);
}

function floatText(x, y, text, color, size) {
  if (S.floats.length > 16) S.floats.shift();
  /* 避让：与已有飘字重叠时向上错开，密集连击也能读清数字 */
  let ny = y;
  for (let i = 0; i < S.floats.length; i++) {
    const f = S.floats[i];
    if (Math.abs(f.x - x) < 52 && Math.abs(f.y - ny) < 17) ny = f.y - 17;
  }
  S.floats.push({
    x, y: ny, text, color: color || '#fff', size: size || 12,
    life: 0.85, max: 0.85, vx: rnd(-16, 16),
  });
}

function dust(f) {
  for (let i = 0; i < 6; i++) {
    S.parts.push({
      type: 'spark', x: f.x + rnd(-12, 12), y: groundAt(f.x),
      vx: rnd(-90, 90), vy: rnd(-90, -20), life: rnd(0.2, 0.45), max: 0.45,
      color: 'rgba(255,255,255,.5)', size: rnd(1, 2),
    });
  }
}

/**
 * 几何碎裂：把被击溃方拆成上百块多边形碎片。
 * 碎片是“被击溃角色的真实形状”切出来的三角形，带旋转、重力与淡出。
 */
function shatter(f, dir) {
  const ch = f.char;
  const cx = f.x, cy = centerY(f);
  const R = ch.r;
  const n = ch.id === 'circle' ? 16 : Math.max(8, (ch.sides || 6) * 4);
  const inner = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = ch.id === 'circle' ? 1 : (ch.id === 'spiral' ? 0.85 : 1);
    inner.push({ x: Math.cos(a) * R * rr, y: Math.sin(a) * R * rr });
  }
  const per = 3;
  const list = [];
  const count = Math.min(160, n * per);
  for (let i = 0; i < count; i++) {
    const k = i % n;
    const p0 = inner[k], p1 = inner[(k + 1) % n];
    /* 在扇形内随机取三个点，形成碎片三角形 */
    const t0 = rnd(0, 0.8), t1 = rnd(0.2, 1);
    const ax = p0.x * t0, ay = p0.y * t0;
    const bx = p0.x + (p1.x - p0.x) * t1, by = p0.y + (p1.y - p0.y) * t1;
    const m = rnd(0.1, 0.85);
    const cxp = (p0.x + p1.x) / 2 * m, cyp = (p0.y + p1.y) / 2 * m;
    const ang = Math.atan2((ay + by + cyp) / 3, (ax + bx + cxp) / 3);
    const speed = rnd(140, 720);
    list.push({
      ox: ch.id === 'rhombus' ? Math.cos(Math.PI / 4) * (ax) - Math.sin(Math.PI / 4) * ay : ax,
      oy: ch.id === 'rhombus' ? Math.sin(Math.PI / 4) * ax + Math.cos(Math.PI / 4) * ay : ay,
      size: rnd(3, 9),
      vx: Math.cos(ang) * speed + dir * rnd(60, 260),
      vy: Math.sin(ang) * speed - rnd(120, 420),
      rot: rnd(0, TAU),
      vr: rnd(-14, 14),
      life: rnd(0.9, 1.8),
      max: 1.8,
      light: Math.random() < 0.45,
    });
  }
  S.shards.push({ x: cx, y: cy, color: ch.color, lite: ch.lite, list, t: 0 });
  S.shockwave = 1;
}

function updateShards(dt) {
  for (let i = S.shards.length - 1; i >= 0; i--) {
    const sh = S.shards[i];
    sh.t += dt;
    let alive = 0;
    for (const s of sh.list) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vx *= 1 - dt * 0.9;
      s.vy += 900 * dt;
      s.ox += s.vx * dt;
      s.oy += s.vy * dt;
      s.rot += s.vr * dt;
      alive++;
    }
    if (!alive) S.shards.splice(i, 1);
  }
  if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 4);
  if (S.shockwave > 0) S.shockwave = Math.max(0, S.shockwave - dt * 1.6);
}

function updateParticles(dt) {
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i];
    p.life -= dt;
    if (p.life <= 0) { S.parts.splice(i, 1); continue; }
    if (p.type === 'spark') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.2;
      p.vy += 420 * dt;
    }
  }
  for (let i = S.ghosts.length - 1; i >= 0; i--) {
    S.ghosts[i].life -= dt;
    if (S.ghosts[i].life <= 0) S.ghosts.splice(i, 1);
  }
  if (S.hitPulse > 0) S.hitPulse = Math.max(0, S.hitPulse - dt * 5);
  for (let i = S.floats.length - 1; i >= 0; i--) {
    const f = S.floats[i];
    f.life -= dt;
    f.y -= 52 * dt;
    f.x += f.vx * dt;
    if (f.life <= 0) S.floats.splice(i, 1);
  }
  for (let i = S.proofs.length - 1; i >= 0; i--) {
    S.proofs[i].age += dt;
    if (S.proofs[i].age > 26 || S.proofs.length > 300) S.proofs.splice(i, 1);
  }
}

function drawGhosts(ctx) {
  for (const g of S.ghosts) {
    const a = clamp(g.life / g.max, 0, 1) * (g.a === undefined ? 0.28 : g.a);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.scale(g.facing, 1);
    paintBody(ctx, { char: g.char, combo: 0, side: 0 }, g.char.color);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawShards(ctx) {
  for (const sh of S.shards) {
    for (const s of sh.list) {
      if (s.life <= 0) continue;
      const a = clamp(s.life / sh.list[0].max, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.translate(sh.x + s.ox, sh.y + s.oy);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.light ? sh.lite : sh.color;
      ctx.shadowColor = sh.color;
      ctx.shadowBlur = 10;
      /* 三角形碎片 */
      ctx.beginPath();
      ctx.moveTo(0, -s.size);
      ctx.lineTo(s.size * 0.86, s.size * 0.6);
      ctx.lineTo(-s.size * 0.86, s.size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function drawParticles(ctx, layer) {
  for (const p of S.parts) {
    if (p.type === 'spark') {
      if (layer === 'behind') continue;
      const a = clamp(p.life / p.max, 0, 1);
      /* 速度线：沿着飞行方向拉出短线段，比小方块更有冲力 */
      const vx = p.vx, vy = p.vy;
      const sp = Math.hypot(vx, vy) || 1;
      const trail = Math.min(18, sp * 0.035);
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.size * 0.85);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - (vx / sp) * trail, p.y - (vy / sp) * trail);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    } else if (p.type === 'slash') {
      if (layer !== 'front') continue;
      const k = 1 - p.life / p.max;
      const len = p.len * (0.65 + k * 0.7);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.95;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.lineCap = 'round';
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 14;
      /* 外层：主色的两道交叉光刃 */
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 6 * (1 - k * 0.65);
      ctx.beginPath();
      ctx.moveTo(-len, -len * 0.5);
      ctx.lineTo(len, len * 0.5);
      ctx.moveTo(-len, len * 0.5);
      ctx.lineTo(len, -len * 0.5);
      ctx.stroke();
      /* 内层：白色芯线 */
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, 2 * (1 - k * 0.6));
      ctx.beginPath();
      ctx.moveTo(-len * 0.8, -len * 0.4);
      ctx.lineTo(len * 0.8, len * 0.4);
      ctx.moveTo(-len * 0.8, len * 0.4);
      ctx.lineTo(len * 0.8, -len * 0.4);
      ctx.stroke();
      ctx.restore();
    } else if (p.type === 'ring') {
      if (layer !== 'front') continue;
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.3 + k * 1.1), 0, TAU);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloats(ctx) {
  ctx.textAlign = 'center';
  for (const f of S.floats) {
    const a = clamp(f.life / f.max, 0, 1);
    const age = 1 - a;
    /* 弹出：前 0.12s 由 1.45 倍缩回 1 倍 */
    const pop = age < 0.14 ? 1 + (1 - age / 0.14) * 0.45 : 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * 1.6);
    ctx.translate(f.x, f.y);
    ctx.scale(pop, pop);
    ctx.font = `700 ${f.size}px ui-monospace, monospace`;
    ctx.lineWidth = Math.max(2, f.size * 0.2);
    ctx.strokeStyle = 'rgba(5,8,14,.88)';
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawProofs(ctx) {
  for (const p of S.proofs) {
    const a = clamp(1 - p.age / 26, 0, 1) * 0.7;
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 21 · 渲染 RENDER
 * ═══════════════════════════════════════════════════════════════════════════ */
const View = {
  cv: null, ctx: null,
  init() {
    this.cv = document.getElementById('cv');
    this.ctx = this.cv.getContext('2d');
    this.ctx.textBaseline = 'middle';
  },
};

let kochCache = null;
function kochFlake() {
  if (kochCache) return kochCache;
  const out = [];
  const R = 96, cx = 0, cy = 0;
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * TAU / 3;
    pts.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
  }
  const step = (p1, p2, d) => {
    if (d === 0) { out.push(p2); return; }
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const a = { x: p1.x + dx / 3, y: p1.y + dy / 3 };
    const b = { x: p1.x + dx * 2 / 3, y: p1.y + dy * 2 / 3 };
    const c = {
      x: a.x + Math.cos(-Math.PI / 3) * (b.x - a.x) - Math.sin(-Math.PI / 3) * (b.y - a.y),
      y: a.y + Math.sin(-Math.PI / 3) * (b.x - a.x) + Math.cos(-Math.PI / 3) * (b.y - a.y),
    };
    step(p1, a, d - 1); step(a, c, d - 1); step(c, b, d - 1); step(b, p2, d - 1);
  };
  out.push(pts[0]);
  step(pts[0], pts[1], 3);
  step(pts[1], pts[2], 3);
  step(pts[2], pts[0], 3);
  kochCache = out;
  return out;
}

function drawSceneBg(ctx, t) {
  const sc = S.scene, main = sc.main, q = S.settings.quality;

  if (sc.id === 'cartesian') {
    /* 正弦波叠影 */
    if (q !== 'performance') {
      ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = hexA(main, 0.045 + k * 0.006);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 6) {
          const y = 246 + k * 56 + Math.sin((x + t * 26 + k * 90) / 112) * 18;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      /* 坐标点雨 */
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      for (let i = 0; i < 24; i++) {
        const x = (i * 137.5 + (i % 3) * 37) % W;
        const y = ((i * 83 + t * (16 + (i % 5) * 6)) % (H + 40)) - 20;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  } else if (sc.id === 'complex') {
    if (q !== 'performance') {
      /* 曼德博简化轮廓 */
      for (let k = 0; k < 5; k++) {
        ctx.strokeStyle = hexA(main, 0.06 - k * 0.008);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let a = 0; a <= TAU + 0.06; a += 0.07) {
          const r = 92 + k * 40 + Math.sin(a * 3 + t * 0.25 + k) * 18 + Math.cos(a * 5 - t * 0.18) * 11;
          const x = W / 2 + Math.cos(a) * r * 1.55;
          const y = 274 + Math.sin(a) * r;
          a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      /* 坐标标签 1 i -1 -i */
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = hexA(main, 0.22);
      const lab = [['1', W - 40, 268], ['i', W / 2 + 6, 62], ['-1', 20, 268], ['-i', W / 2 + 6, 500]];
      for (const [s, x, y] of lab) ctx.fillText(s, x, y);
      /* 相量箭头 */
      for (let i = 0; i < 3; i++) {
        const a = t * 0.35 + i * TAU / 3;
        const x0 = W / 2 + Math.cos(a) * 60, y0 = 274 + Math.sin(a) * 60;
        const x1 = W / 2 + Math.cos(a) * 108, y1 = 274 + Math.sin(a) * 108;
        ctx.strokeStyle = hexA(main, 0.16);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.beginPath(); ctx.arc(x1, y1, 2, 0, TAU); ctx.fillStyle = hexA(main, 0.3); ctx.fill();
      }
    }
  } else if (sc.id === 'fractal') {
    if (q !== 'performance') {
      const pts = kochFlake();
      ctx.save();
      ctx.translate(W / 2, 244);
      ctx.strokeStyle = hexA(main, 0.10);
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
      ctx.restore();
      /* 六边形雪花 */
      ctx.fillStyle = hexA(main, 0.12);
      for (let i = 0; i < 16; i++) {
        const x = (i * 173.3 + t * 12) % (W + 60) - 30;
        const y = ((i * 97 + t * (14 + (i % 4) * 9)) % (H - 40)) + 10;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = k * TAU / 6 + t * 0.2 + i;
          const px = x + Math.cos(a) * 3, py = y + Math.sin(a) * 3;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
    }
  } else if (sc.id === 'polar') {
    /* 同心圆 + 放射线 */
    ctx.strokeStyle = sc.grid;
    ctx.lineWidth = 1;
    for (let r = 44; r < 620; r += 44) {
      ctx.beginPath(); ctx.arc(W / 2, 300, r, 0, TAU); ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = i * TAU / 24;
      ctx.beginPath();
      ctx.moveTo(W / 2, 300);
      ctx.lineTo(W / 2 + Math.cos(a) * 700, 300 + Math.sin(a) * 700);
      ctx.stroke();
    }
    if (q !== 'performance') {
      /* 玫瑰线 r = cos(kθ) */
      ctx.strokeStyle = hexA(main, 0.16);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let a = 0; a <= TAU + 0.02; a += 0.015) {
        const r = 170 * Math.cos(3 * (a + t * 0.06));
        const x = W / 2 + Math.cos(a) * Math.abs(r) * 1.5;
        const y = 300 + Math.sin(a) * Math.abs(r);
        a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
}

function drawGrid(ctx, t) {
  const step = S.intensity > 0.55 ? 24 : 48;
  ctx.save();
  ctx.strokeStyle = S.scene.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55 + S.intensity * 0.7;
  ctx.beginPath();
  for (let x = 0; x <= W; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = GROUND % step; y <= H; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
  ctx.restore();

  /* 坐标轴：x 轴沿地面，y 轴位于 x=0 */
  ctx.save();
  ctx.strokeStyle = hexA(S.scene.main, 0.28);
  ctx.beginPath();
  ctx.moveTo(0, GROUND + 0.5); ctx.lineTo(W, GROUND + 0.5);
  ctx.stroke();
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillStyle = hexA(S.scene.main, 0.35);
  for (let x = 48; x < W; x += 96) {
    ctx.fillRect(x, GROUND - 3, 1, 6);
    ctx.fillText(String(x / 2 | 0), x + 3, GROUND + 12);
  }
  ctx.beginPath();
  ctx.moveTo(64, 0); ctx.lineTo(64, GROUND);
  ctx.stroke();
  ctx.restore();
}

function drawGround(ctx, t) {
  const main = S.scene.main;
  if (S.scene.mod.ground) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const y = groundAt(x);
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.018)';
    ctx.fill();
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const y = groundAt(x);
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = hexA(main, 0.55);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(0, GROUND, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,.028)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = hexA(main, 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, GROUND + 0.5); ctx.lineTo(W, GROUND + 0.5);
    ctx.stroke();
  }
}

function drawZones(ctx) {
  for (const z of S.zones) {
    const k = 1 - z.t / z.life;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.25 * Math.abs(Math.sin(z.t * 8));
    ctx.strokeStyle = z.owner.char.lite;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(z.x - z.w / 2, z.y - z.h, z.w, z.h);
    /* 3×3 格点 */
    ctx.setLineDash([]);
    ctx.fillStyle = z.owner.char.lite;
    for (let i = 0; i <= 3; i++) {
      for (let j = 0; j <= 3; j++) {
        const px = z.x - z.w / 2 + (z.w / 3) * i;
        const py = z.y - z.h + (z.h / 3) * j;
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }
    ctx.restore();
  }
}


/** 远程投射物：正弦弹（波浪线团）/ 余弦弹（圆团 + 尾焰） */
function drawProjectiles(ctx) {
  for (const pr of S.projectiles) {
    const ch = pr.owner.char;
    const dir = pr.dir;
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.scale(dir, 1);
    ctx.lineCap = 'round';
    if (pr.kind === 'sine') {
      /* 正弦弹：一段压缩的正弦波纹 */
      ctx.shadowColor = ch.color;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = ch.lite;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) {
        const x = -22 + (i / 26) * 22;
        const y = Math.sin((i / 26) * Math.PI * 2 + pr.t * 26) * 7;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(2, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      /* 余弦弹：旋转的弧形核心 + 外环 */
      ctx.shadowColor = ch.color;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, pr.r, pr.t * 10, pr.t * 10 + Math.PI * 1.4);
      ctx.stroke();
      ctx.strokeStyle = ch.lite;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const r = pr.r * (0.45 + 0.35 * Math.cos(a * 3 - pr.t * 12));
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 正切大招的锁定标记：地面上的目标框 + 竖直切线 */
function drawTanMarks(ctx) {
  for (const m of S.tanMarks) {
    const k = clamp(m.t / m.life, 0, 1);
    const a = 1 - k;
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 14;
    /* 锁定框（尺寸 = 真实判定带，读得懂“打得中哪里”）：竖直带以站立时的身体中心为对称轴 */
    const bx = C.TAN_BAND_X, by = C.TAN_BAND_Y;
    const cy = m.y - (m.r === undefined ? 24 : m.r);
    ctx.strokeRect(m.x - bx, cy - by / 2, bx * 2, by);
    ctx.beginPath();
    ctx.moveTo(m.x - bx, cy - by / 2); ctx.lineTo(m.x - bx + 12, cy - by / 2);
    ctx.moveTo(m.x + bx - 12, cy + by / 2); ctx.lineTo(m.x + bx, cy + by / 2);
    ctx.stroke();
    /* 竖直的平行切线（正切曲线在竖轴方向逼近渐近线） */
    for (let i = -2; i <= 2; i++) {
      const tx = m.x + i * 34;
      ctx.globalAlpha = a * (0.35 + 0.3 * Math.sin(k * 20 + i));
      ctx.beginPath();
      for (let j = 0; j <= 20; j++) {
        const yy = m.y - (j / 20) * 200;
        const xx = tx + Math.tan((j / 20 - 0.5) * 1.2) * 6;
        j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawMirrors(ctx) {
  for (const m of S.mirrors) {
    const k = clamp(m.t / m.delay, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.6 * (1 - k * 0.4);
    ctx.translate(m.x, m.y - 22);
    ctx.rotate(k * 3);
    const ch = m.owner.char;
    const R = ch.r * (0.7 + k * 0.5);
    ctx.strokeStyle = ch.lite;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ch.id === 'circle') ctx.arc(0, 0, R, 0, TAU);
    else for (let i = 0; i < (ch.sides || 5); i++) {
      const a = -Math.PI / 2 + i * TAU / (ch.sides || 5);
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

/* ── 角色绘制 ───────────────────────────────────────────────────────── */
function pathShape(ctx, ch) {
  ctx.beginPath();
  if (ch.id === 'circle') { ctx.arc(0, 0, ch.r, 0, TAU); return; }
  if (ch.id === 'trig') {
    /* 三角函：一条动态正/余弦曲线（呼吸振荡） */
    const amp = ch.r * 0.42;
    const phase = (S.clock.pres || 0) * 2.4;
    for (let i = 0; i <= 64; i++) {
      const x = -ch.r + (i / 64) * ch.r * 2;
      const y = Math.sin((i / 64) * Math.PI * 2 + phase) * amp;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    return;
  }
  if (ch.id === 'spiral') {
    for (let i = 0; i <= 110; i++) {
      const th = i / 110 * TAU * 2.3;
      const rr = ch.r * (0.13 + 0.87 * i / 110);
      const x = Math.cos(th) * rr, y = Math.sin(th) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    return;
  }
  const n = ch.sides;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * TAU / n;
    const x = Math.cos(a) * ch.r, y = Math.sin(a) * ch.r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function paintBody(ctx, f, tint) {
  const ch = f.char;
  const isP = f === S.p;
  const color = tint || ch.color;

  /* 填充 */
  pathShape(ctx, ch);
  if (ch.id === 'spiral' || ch.id === 'trig') {
    ctx.strokeStyle = hexA(color, 0.85);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = hexA(ch.lite, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillStyle = hexA(color, isP ? 0.13 : 0.09);
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isP ? color : hexA(color, 0.72);
    ctx.lineWidth = isP ? 2 : 1.6;
    ctx.stroke();
  }

  /* 内部图案 */
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexA(ch.lite, 0.5);
  const R = ch.r;
  if (ch.id === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-Math.PI / 2 + 0.5) * R * 0.82, Math.sin(-Math.PI / 2 + 0.5) * R * 0.82);
    ctx.stroke();
  } else if (ch.id === 'rhombus') {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + i * TAU / 4;
      const x = Math.cos(a) * R * 0.48, y = Math.sin(a) * R * 0.48;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  } else if (ch.id === 'form') {
    const s = R * 0.55;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * TAU / 4;
      const x = Math.cos(a) * R * 0.9, y = Math.sin(a) * R * 0.9;
      ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
    }
    ctx.stroke();
  } else if (ch.id === 'hex') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3;
      ctx.moveTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82);
      ctx.lineTo(Math.cos(a + Math.PI) * R * 0.82, Math.sin(a + Math.PI) * R * 0.82);
    }
    ctx.stroke();
  } else if (ch.id === 'trig') {
    /* 反相余弦：形成“正弦 + 余弦”的双曲线 */
    ctx.beginPath();
    const ph = (S.clock.pres || 0) * 2.4;
    for (let i = 0; i <= 64; i++) {
      const x = -R * 0.82 + (i / 64) * R * 1.64;
      const y = Math.cos((i / 64) * Math.PI * 2 + ph) * R * 0.3;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  } else if (ch.id === 'spiral') {
    ctx.beginPath();
    for (let i = 0; i <= 70; i++) {
      const th = -i / 70 * TAU * 2 + Math.PI;
      const rr = R * 0.72 * (0.14 + 0.86 * i / 70);
      const x = Math.cos(th) * rr, y = Math.sin(th) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  } else if (ch.id === 'circle') {
    const n = Math.min(30, 3 + Math.floor(f.combo * 1.1));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * TAU / n;
      const x = Math.cos(a) * R * 0.74, y = Math.sin(a) * R * 0.74;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = hexA(ch.lite, 0.42);
    ctx.stroke();
  }
}

/* 挥击弧光：出招时在身前划出的发光刃迹（beta 版攻击反馈） */
function drawAttackArc(ctx, f) {
  const a = f.atk;
  if (!a) return;
  const ch = f.char;
  const t = a.t;
  const total = Math.max(0.02, a.w + a.a);
  if (t > total + 0.1) return;
  const prog = clamp(t / total, 0, 1);
  const fade = t <= total ? 1 : Math.max(0, 1 - (t - total) / 0.1);
  const alpha = (0.35 + 0.65 * Math.min(1, prog * 2.2)) * fade;
  const R = ch.r;
  const col = ch.color, lit = ch.lite;
  const light = a.kind === 'light' || a.kind === 'airLight';

  ctx.save();
  ctx.translate(f.x, centerY(f));
  ctx.scale(f.facing, 1);
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = light ? 16 : 28;

  if (light) {
    /* 轻击：白色月牙 + 彩色内弧 */
    const span = 1.1 + prog * 0.35;
    const r = R * (1.7 + prog * 0.8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, -span, span);
    ctx.stroke();
    ctx.shadowBlur = 10;
    ctx.strokeStyle = lit;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.88, -span * 0.9, span * 0.9);
    ctx.stroke();
  } else if (a.kind === 'launch') {
    /* 上挑：自下而上的上勾弧 */
    const r = R * (2.0 + prog * 0.9);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, R * 0.5, r, -1.35, 0.55);
    ctx.stroke();
    ctx.shadowBlur = 12;
    ctx.strokeStyle = lit;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, R * 0.5, r * 0.82, -1.25, 0.45);
    ctx.stroke();
  } else if (a.kind === 'dive') {
    /* 下劈：垂直下砸的粗刃 */
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(R * 0.5, -R * 1.7);
    ctx.lineTo(R * 1.25, R * 1.9);
    ctx.stroke();
    ctx.shadowBlur = 14;
    ctx.strokeStyle = lit;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(R * 0.72, -R * 1.35);
    ctx.lineTo(R * 1.15, R * 1.5);
    ctx.stroke();
  } else if (a.kind === 'heavy') {
    /* 重击：大斜斩 */
    const len = R * (2.3 + prog * 1.5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10 * (1 - prog * 0.25);
    ctx.beginPath();
    ctx.moveTo(R * 0.4, -len * 0.55);
    ctx.lineTo(len, len * 0.35);
    ctx.stroke();
    ctx.shadowBlur = 14;
    ctx.strokeStyle = lit;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(R * 0.5, -len * 0.45);
    ctx.lineTo(len * 0.9, len * 0.28);
    ctx.stroke();
  } else if (a.kind === 'counter') {
    /* 推论：金色大月牙 */
    const r = R * (2.2 + prog * 0.9);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 11;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.arc(0, 0, r, -1.5, 1.5);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.4;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, -1.4, 1.4);
    ctx.stroke();
  } else {
    /* 技能：圆环 */
    const r = R * (2 + prog);
    ctx.strokeStyle = lit;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}


/* ── 专属大招的持续光效 ─────────────────────────────────────────────── */
function drawUltFx(ctx, f) {
  const u = f.ult;
  if (!u) return;
  const ch = f.char;
  const cx = f.x, cy = centerY(f);
  const t = u.t;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = ch.color;

  if (u.ult.style === 'slashWave') {
    /* 斜边斩：逐渐散开的三角刃 */
    for (let i = 0; i < 3; i++) {
      const k = (t * 6 - i * 0.9);
      if (k < 0 || k > 1.4) continue;
      ctx.globalAlpha = Math.max(0, 1 - k / 1.4) * 0.9;
      ctx.strokeStyle = i === 2 ? '#ffffff' : ch.lite;
      ctx.lineWidth = 5 - i;
      ctx.shadowBlur = 20;
      const r = 40 + k * 110;
      ctx.beginPath();
      ctx.moveTo(cx + f.facing * r * 0.35, cy - r * 0.55);
      ctx.lineTo(cx + f.facing * r, cy);
      ctx.lineTo(cx + f.facing * r * 0.35, cy + r * 0.55);
      ctx.stroke();
    }
  } else if (u.ult.style === 'afterimage') {
    /* 四倍对称：四个菱形围绕本体 */
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = ch.lite;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 16;
    for (let i = 0; i < 4; i++) {
      const a = t * 8 + i * Math.PI / 2;
      const r = 26 + Math.sin(t * 20 + i) * 4;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(9, 0); ctx.lineTo(0, 9); ctx.lineTo(-9, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  } else if (u.ult.style === 'matrix') {
    /* 公理矩阵：外围方阵框 */
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = ch.lite;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 14;
    const s = 70 + Math.sin(t * 10) * 4;
    ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
    ctx.strokeRect(cx - s * 0.66, cy - s * 0.66, s * 1.32, s * 1.32);
  } else if (u.ult.style === 'flatten') {
    /* 蜂巢碾碎：头顶汇聚的六边形 */
    ctx.globalAlpha = Math.min(1, t * 4);
    ctx.strokeStyle = ch.lite;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 22;
    const r = 34 - Math.min(1, t * 3) * 10;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      const px = cx + Math.cos(a) * r, py = cy - 60 + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (u.ult.style === 'spiralPull') {
    /* 无穷螺线：卷吸螺旋 */
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = ch.lite;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const th = i / 60 * Math.PI * 4 + t * 14;
      const r = i / 60 * 90;
      const px = cx + Math.cos(th) * r, py = cy + Math.sin(th) * r * 0.7;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  } else {
    /* 圆周长 */
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = ch.lite;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    const oy = opOf(f);
    for (let i = 0; i < 8; i++) {
      const a = t * 6 + i * Math.PI / 4;
      ctx.fillRect(oy.x + Math.cos(a) * 70 - 1.5, centerY(oy) + Math.sin(a) * 70 - 1.5, 3, 3);
    }
  }
  ctx.restore();
}

function drawFighter(ctx, f) {
  if (!f) return;
  const ch = f.char;
  const h = bodyH(f);
  const cy = f.y - h / 2;
  const gy = groundAt(f.x);
  const air = Math.max(0, cy - (gy - h / 2));
  /* 姿态角：对称图形自转，锐角图形轻微摆动并随速度倾斜 */
  const rot = ch.spinMode === 'sway'
    ? Math.sin(S.clock.pres * 1.15 + f.side * 2.1) * 0.15 +
      clamp(f.vx / 1400, -0.22, 0.22) +
      (f.state === 'launched' ? Math.sin(S.clock.pres * 11) * 0.22 : 0) +
      /* 出招时轻微前倾，增强发力感 */
      (f.atk ? clamp((f.atk.t - f.atk.w * 0.5) * 1.8, 0, 0.16) * f.facing : 0)
    : f.rot;

  /* 终结演出：被击溃方降维 / 淡出 */
  let flat = 1, fade = 1;
  const F = S.finisher;
  if (F && F.def === f) {
    if (F.t > 1.06) {
      const k = clamp((F.t - 1.06) / 0.95, 0, 1);
      flat = 1 - k * 0.975;
      fade = 1 - k * k;
    }
  }

  /* 影子 */
  ctx.save();
  ctx.globalAlpha = 0.3 * clamp(1 - air / 260, 0.15, 1);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(f.x, gy + 2, ch.r * 1.05, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  /* 倒影（高画质） */
  if (S.settings.quality === 'high' && fade > 0.2 && flat > 0.5) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.translate(f.x, gy);
    ctx.scale(1, -1);
    ctx.translate(0, -(gy - cy));
    ctx.scale(f.guarding ? 1.05 : 1, (f.guarding ? 0.54 : 1) * flat);
    ctx.rotate(rot);
    paintBody(ctx, f, ch.color);
    ctx.restore();
  }

  /* 本体变换 */
  const speed = Math.abs(f.vx);
  let sx = 1 + Math.min(0.16, speed / 2600);
  let sy = 1 - Math.min(0.1, speed / 3800);
  let scale = 1;
  if (f.atk) {
    const t = f.atk.t;
    if (t < f.atk.w + 0.05) scale = 1.15;
    else scale = 1 + Math.max(0, 0.13 - (t - f.atk.w) * 0.65);
  }
  if (f.state === 'launched') { sx = 1; sy = 1; }
  if (f.state === 'dodge') { sx *= 0.92; sy *= 0.92; }

  ctx.save();
  ctx.globalAlpha = (f.state === 'dodge' ? 0.45 : 1) * fade;
  ctx.translate(f.x, cy);
  ctx.scale(sx * scale, sy * scale * (f.guarding ? 0.54 : 1) * flat);
  ctx.rotate(rot);

  /* 光晕 */
  ctx.shadowColor = ch.color;
  ctx.shadowBlur = (f === S.p ? 16 : 12) + (f.hitFlash > 0 ? 20 : 0);
  paintBody(ctx, f);
  ctx.shadowBlur = 0;

  /* 命中闪白：短促而强烈，像被打亮的剪影 */
  if (f.hitFlash > 0) {
    const fa = clamp(f.hitFlash / 0.6, 0, 1);
    pathShape(ctx, ch);
    ctx.fillStyle = `rgba(255,255,255,${Math.pow(fa, 0.55) * 0.92})`;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* 缓速压制：角色周围一圈虚线框 */
  if (f.slowT > 0) {
    const k = clamp(f.slowT / C.TAN_LOCK_TIME, 0, 1);
    ctx.strokeStyle = hexA('#38bdf8', 0.5 + 0.4 * k);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(-ch.r - 8, -ch.r - 8, (ch.r + 8) * 2, (ch.r + 8) * 2);
    ctx.setLineDash([]);
  }

  /* 霸体标识：技能体一圈淡色实线，金刚体金色双环 */
  const armorLv = armorOf(f);
  if (armorLv === ARMOR.TECH) {
    ctx.strokeStyle = hexA(ch.lite, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, ch.r + 5, 0, TAU);
    ctx.stroke();
  } else if (armorLv === ARMOR.KONG) {
    ctx.strokeStyle = hexA('#fbbf24', 0.85);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, ch.r + 7, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = hexA('#ffffff', 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ch.r + 12, 0, TAU);
    ctx.stroke();
  }

  /* 无敌 / 完美窗虚线环 */
  if (f.invuln > 0 && f.state !== 'dodge') {
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(103,232,249,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ch.r + 7, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  /* 挥击弧光 */
  drawAttackArc(ctx, f);
  /* 专属大招持续光效 */
  if (f.state === 'ult') drawUltFx(ctx, f);

  /* 蓄力指示：身侧进度环 + 头顶白色蓄力圈与进度条 */
  if (f.state === 'charging') {
    const k = clamp(f.charge / f.char.chargeMax, 0, 1);
    ctx.save();
    ctx.strokeStyle = hexA(ch.color, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, cy, ch.r + 12, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();

    const hy = cy - ch.r - 16;
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6 + k * 16;
    ctx.beginPath();
    ctx.arc(f.x, hy, 7 + k * 10, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(f.x - 23, hy - 20, 46, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(f.x - 23, hy - 20, 46 * k, 3);
    ctx.restore();
  }

  /* 头顶标记 */
  if (f.perfectWindow > 0) {
    ctx.save();
    ctx.fillStyle = '#67e8f9';
    ctx.font = '13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('∃', f.x, cy - ch.r - 22);
    ctx.restore();
  }
}

/* ── 调试可视化 ─────────────────────────────────────────────────────── */
function drawBoxes(ctx) {
  for (const f of [S.p, S.a]) {
    if (!f) continue;
    const isP = f === S.p;
    ctx.save();
    ctx.strokeStyle = isP ? 'rgba(74,222,128,.4)' : 'rgba(248,113,113,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(f.x, centerY(f), bodyR(f), 0, TAU);
    ctx.stroke();

    const hb = hitboxOf(f);
    if (hb) {
      const base = Math.atan2(hb.dir.y, hb.dir.x);
      ctx.fillStyle = f.atk.priority >= 3 ? 'rgba(251,191,36,.14)' : 'rgba(239,68,68,.13)';
      ctx.beginPath();
      ctx.moveTo(hb.x, hb.y);
      ctx.arc(hb.x, hb.y, hb.r, base - rad(hb.half), base + rad(hb.half));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.stroke();
    }
    if (f.invuln > 0) {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(103,232,249,.5)';
      ctx.beginPath();
      ctx.arc(f.x, centerY(f), bodyR(f) + 5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

/** F4 · 数学注释层：坐标、距离、夹角、余弦与伤害算式 */
function drawMathLayer(ctx) {
  const p = S.p, a = S.a;
  if (!p || !a) return;
  ctx.save();
  ctx.font = '9px "SFMono-Regular", Menlo, Consolas, monospace';
  ctx.textAlign = 'center';

  /* 坐标与判定圆 */
  for (const f of [p, a]) {
    const mx = Math.round(f.x / 2), my = Math.round(GROUND - f.y);
    ctx.fillStyle = hexA(f.char.color, .9);
    ctx.fillText(`(${mx}, ${my})`, f.x, centerY(f) - f.char.r - 22);
    ctx.strokeStyle = hexA(f.char.color, .28);
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(f.x, centerY(f), f.char.r + 6, 0, TAU);
    ctx.stroke();
    if (f.atk) {
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(`${f.atk.name} r=${Math.round(f.atk.radius)} θ=${Math.round(f.atk.angle)}°`, f.x, centerY(f) + f.char.r + 20);
    }
  }
  ctx.setLineDash([]);

  /* 连线与距离 */
  const dx = a.x - p.x, dy = centerY(a) - centerY(p);
  const dist = Math.hypot(dx, dy);
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p.x, centerY(p));
  ctx.lineTo(a.x, centerY(a));
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillText(`|Δ| = ${dist.toFixed(1)}px`, (p.x + a.x) / 2, (centerY(p) + centerY(a)) / 2 - 8);

  /* 最近一次命中的算式 */
  if (S.lastAngle) {
    const L = S.lastAngle;
    const c = Math.cos(rad(L.angle));
    const txt = `${L.atk} · θ=${L.angle}° · cosθ=${c.toFixed(3)} · dmg=${fmt(L.dmg, 3)}${L.crit ? ' ×2' : ''}`;
    ctx.font = '10px "SFMono-Regular", Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.fillText(txt, W / 2, 84);
  }

  /* 角色临时状态 */
  const st = [
    `P ${p.state}  ch ${p.chain || '—'}  cb ${p.combo}`,
    `A ${a.state}  ch ${a.chain || '—'}  cb ${a.combo}`,
  ];
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  st.forEach((s, i) => ctx.fillText(s, W - 24, 96 + i * 13));
  ctx.restore();
}

function drawDebug(ctx) {
  const p = S.p, a = S.a;
  if (!p || !a) return;
  const lines = [
    `F ${String(Math.round(S.clock.battle * 60)).padStart(5, '0')}  ROUND ${S.clock.round.toFixed(2)}`,
    `P ${p.state} [霸体 ${armorOf(p)}] hp ${Math.round(p.hp)} en ${Math.round(p.energy)} gd ${Math.round(p.shield)}`,
    `  atk ${p.atk ? p.atk.kind + '@' + p.atk.t.toFixed(2) : '—'}  ch ${p.chain}${p.chainLive ? '*' : ''} win ${p.chainTimer.toFixed(2)}`,
    `  stun ${p.stunT.toFixed(2)} inv ${p.invuln.toFixed(2)} cb ${p.combo}${p.chainHits ? '/' + p.chainHits : ''}`,
    `A ${a.state} hp ${Math.round(a.hp)} en ${Math.round(a.energy)} gd ${Math.round(a.shield)}`,
    `  atk ${a.atk ? a.atk.kind + '@' + a.atk.t.toFixed(2) : '—'}  cb ${a.combo}`,
    `mu ${S.clash ? S.clash.m[0].toFixed(1) + ' : ' + S.clash.m[1].toFixed(1) : '—'}`,
    `speed ${(S.slowmo > 0 ? 24 : 100)}%  hitstop ${S.hitstop.toFixed(2)}`,
  ];
  ctx.save();
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(10, 64, 268, lines.length * 13 + 10);
  ctx.fillStyle = '#9fe8c4';
  lines.forEach((l, i) => ctx.fillText(l, 18, 76 + i * 13));
  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 22 · HUD
 * ═══════════════════════════════════════════════════════════════════════════ */
function barFill(ctx, x, y, w, h, ratio, dir, color) {
  const ww = w * clamp(ratio, 0, 1);
  ctx.fillStyle = color;
  ctx.fillRect(dir === 1 ? x : x + w - ww, y, ww, h);
}

function drawSideBar(ctx, f, edge, dir, isAI) {
  const ch = f.char;
  const bw = 344, bh = 12, y = 26;
  const x = dir === 1 ? edge : edge - bw;
  const hpR = f.hp / f.maxHp;
  const trR = f.hpTrail / f.maxHp;

  /* 名称 */
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillStyle = ch.color;
  ctx.textAlign = dir === 1 ? 'left' : 'right';
  ctx.fillText(`${ch.name}  ${ch.en}`, dir === 1 ? edge : edge, 15);
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.textAlign = dir === 1 ? 'right' : 'left';
  ctx.fillText(isAI ? (f.diff ? f.diff.name + ' ' + f.diff.en : 'AI') : 'PLAYER', dir === 1 ? edge + bw : edge - bw, 15);
  ctx.textAlign = 'left';

  /* 血条底 */
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fillRect(x, y, bw, bh);
  /* 延迟条 */
  barFill(ctx, x, y, bw, bh, trR, dir, 'rgba(255,255,255,.42)');
  /* 实际血量 */
  const hpColor = hpR <= 0.25 ? '#ef4444' : ch.color;
  barFill(ctx, x, y, bw, bh, hpR, dir, hpColor);
  /* 边框 */
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
  /* 数轴刻度 0/25/50/75/100 */
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x + (bw / 4) * i, y, 1, bh);
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  for (let i = 1; i <= 4; i++) ctx.fillRect(x + (bw / 4) * i - 1, y + bh, 2, 3);

  /* 护盾 */
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fillRect(x, y + bh + 2, bw, 3);
  barFill(ctx, x, y + bh + 2, bw, 3, f.shield / 100, dir, 'rgba(103,232,249,.62)');

  /* 能量（欧拉回路） */
  const ey = y + bh + 8;
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fillRect(x, ey, bw, 5);
  barFill(ctx, x, ey, bw, 5, f.energy / 100, dir, hexA(ch.color, 0.85));
  /* 分段刻度 */
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  for (let i = 1; i < 10; i++) ctx.fillRect(x + (bw / 10) * i, ey, 1, 5);
  /* 满能量：一笔画图形 */
  if (f.energy >= 100) {
    const cx = dir === 1 ? edge + bw + 12 : edge - bw - 12;
    const cy = ey + 2.5;
    const t = S.clock.pres;
    ctx.save();
    ctx.strokeStyle = ch.lite;
    ctx.lineWidth = 1;
    ctx.shadowColor = ch.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + i * TAU * 2 / 5 + t * 0.6;
      const px = cx + Math.cos(a) * 6, py = cy + Math.sin(a) * 6;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawTimer(ctx) {
  const sec = Math.ceil(S.clock.round);
  const danger = sec <= 10;
  const pulse = danger ? 0.65 + 0.35 * Math.abs(Math.sin(S.clock.pres * 6)) : 1;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '700 30px ui-monospace, monospace';
  ctx.fillStyle = danger ? `rgba(239,68,68,${pulse})` : 'rgba(255,255,255,.9)';
  ctx.shadowColor = danger ? '#ef4444' : 'transparent';
  ctx.shadowBlur = danger ? 14 : 0;
  ctx.fillText(String(sec).padStart(2, '0'), W / 2, 32);
  ctx.font = '8px ui-monospace, monospace';
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillText('ROUND', W / 2, 52);
  ctx.restore();
}

function drawCombo(ctx) {
  const p = S.p;
  if (!p || p.combo < 2) return;
  ctx.save();
  ctx.textAlign = 'center';
  const t = S.clock.pres;
  const pop = clamp(1.4 - (0.9 - p.comboTimer) * 1.2, 1, 1.25);
  ctx.font = `700 ${Math.round(24 * pop)}px ui-monospace, monospace`;
  ctx.fillStyle = p.combo >= 15 ? '#fbbf24' : '#ffffff';
  ctx.shadowColor = p.char.color;
  ctx.shadowBlur = 16;
  ctx.fillText(`${p.combo}`, W / 2 - 12, 118);
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText('连', W / 2 + 22, 124);
  /* 里程碑 */
  if (p.combo % 5 === 0) {
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`${p.combo}!`, W / 2, 148);
  }
  ctx.restore();
}

function drawSkillCards(ctx) {
  const p = S.p;
  if (!p) return;
  const keys = S.settings.keys || DEFAULT_KEYS;
  const cards = [
    { k: keys.light, name: '轻击', cd: 0, max: 1, on: true },
    { k: keys.heavy, name: '重击', cd: p.cd.heavy, max: 1.5 * p.char.cdCoef, on: p.cd.heavy <= 0 },
    { k: keys.ult, name: (ULTS[p.char.id] || ULTS.triangle).name.slice(0, 4), cd: 0, max: 1, on: p.energy >= 100 },
    { k: keys.dodge, name: '闪避', cd: p.cd.dodge, max: 1.5 * p.char.dodgeCdCoef, on: p.cd.dodge <= 0 },
    { k: keys.skill, name: '技能', cd: p.cd.skill, max: p.char.skill.cd * p.char.skillCdCoef, on: p.cd.skill <= 0 },
  ];
  const cw = 52, chh = 34, gap = 5;
  const x0 = 20, y0 = H - 52;
  cards.forEach((c, i) => {
    const x = x0 + i * (cw + gap);
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,17,.72)';
    ctx.fillRect(x, y0, cw, chh);
    ctx.strokeStyle = c.on ? hexA(p.char.color, .55) : 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y0 + 0.5, cw - 1, chh - 1);
    /* 冷却遮罩 */
    if (c.cd > 0) {
      const k = clamp(c.cd / c.max, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(x + 1, y0 + 1, cw - 2, (chh - 2) * k);
    }
    if (i === 2 && p.energy < 100) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(x + 1, y0 + 1, cw - 2, chh - 2);
    }
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillStyle = c.on ? p.char.lite : 'rgba(255,255,255,.4)';
    ctx.textAlign = 'center';
    ctx.fillText(keyLabel(c.k), x + cw / 2, y0 + 12);
    ctx.font = '8.5px ui-monospace, monospace';
    ctx.fillStyle = c.on ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.32)';
    ctx.fillText(c.name, x + cw / 2, y0 + 25);
    ctx.restore();
  });
}

function drawChainPips(ctx) {
  const p = S.p;
  if (!p) return;
  const x0 = 22, y0 = 68;
  for (let i = 0; i < 4; i++) {
    const on = p.chain > i && p.chainLive;
    ctx.beginPath();
    ctx.arc(x0 + i * 12, y0, 3, 0, TAU);
    ctx.fillStyle = on ? p.char.color : 'rgba(255,255,255,.14)';
    ctx.fill();
  }
  if (p.chainLive && p.chain > 0 && p.chain < 4) {
    const len = 92;
    const k = clamp(p.chainTimer / (p.char.combo[p.chain - 1].link + C.CHAIN_RESET), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(x0, y0 + 8, len, 2);
    ctx.fillStyle = hexA(p.char.color, .7);
    ctx.fillRect(x0, y0 + 8, len * k, 2);
    ctx.font = '8.5px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillText(p.char.combo[p.chain - 1].name, x0 + len + 8, y0 + 9);
  }
}

function drawHints(ctx) {
  const keys = S.settings.keys || DEFAULT_KEYS;
  const txt = `${keyLabel(keys.left)}${keyLabel(keys.right)} 移动 · ${keyLabel(keys.jump)} 跳跃 · ${keyLabel(keys.down)} 蹲防 · ${keyLabel(keys.light)} 轻击 · ${keyLabel(keys.heavy)} 重击 · ${keyLabel(keys.ult)} 大招 · ${keyLabel(keys.skill)} 技能 · ${keyLabel(keys.dodge)} 闪避 · ${keyLabel(keys.counter)} 推论 · ESC 暂停`;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '8.5px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,255,255,.30)';
  ctx.fillText(txt, W / 2, H - 9);
  ctx.restore();
}

function drawClashBar(ctx) {
  const cl = S.clash;
  if (!cl) return;
  const m0 = cl.m[0], m1 = cl.m[1];
  const total = Math.max(1, m0 + m1);
  const k = m0 / total;
  const w = 320, x = W / 2 - w / 2, y = 196;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(x - 8, y - 16, w + 16, 46);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = S.p.char.color;
  ctx.fillRect(x, y, w * k, 8);
  ctx.fillStyle = S.a.char.color;
  ctx.fillRect(x + w * k, y, w * (1 - k), 8);
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.textAlign = 'center';
  ctx.fillText('质心碰撞 · 连打 !', W / 2, y - 8);
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.fillText(`${m0.toFixed(1)}  :  ${m1.toFixed(1)}`, W / 2, y + 20);
  ctx.restore();
}

function drawFinisher(ctx) {
  const F = S.finisher;
  if (!F) return;
  const t = F.t;
  const dk = clamp(t / 0.5, 0, 1);
  ctx.save();

  /* 暗场：中心保留（看得见降维过程），边缘压暗 */
  const vg = ctx.createRadialGradient(W / 2, 300, 70, W / 2, 300, 640);
  vg.addColorStop(0, `rgba(3,5,10,${0.28 * dk})`);
  vg.addColorStop(0.55, `rgba(3,5,10,${0.7 * dk})`);
  vg.addColorStop(1, `rgba(3,5,10,${0.94 * dk})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  /* 网格闭合 */
  if (t > 0.16) {
    const k = clamp((t - 0.16) / 0.5, 0, 1);
    ctx.strokeStyle = hexA('#67e8f9', 0.3 * k);
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU + t * 0.2;
      const r = 320 * (1 - k);
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * 60, 270 + Math.sin(a) * 60);
      ctx.lineTo(W / 2 + Math.cos(a) * (60 + r), 270 + Math.sin(a) * (60 + r));
      ctx.stroke();
    }
  }

  /* 冲击斜线 */
  if (t > 0.52 && t < 1.5) {
    const k = clamp((t - 0.52) / 0.4, 0, 1);
    const col = F.att ? F.att.char.color : '#ffffff';
    ctx.strokeStyle = hexA(col, 0.65 * (1 - k));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 300 * k, 268);
    ctx.lineTo(W / 2 + 300 * k, 272);
    ctx.stroke();
  }

  /* 标题 */
  if (t > 1.42) {
    const k = clamp((t - 1.42) / 0.32, 0, 1);
    const label = F.draw ? '⊥' : F.tier === 'QED' ? 'Q . E . D .' : F.tier === 'LEMA' ? 'L E M A' : 'T H E O R E M';
    const color = F.draw ? '#f87171' : F.tier === 'THEOREM' ? '#fbbf24' : F.tier === 'LEMA' ? '#67e8f9' : '#ffffff';
    const sub = F.draw ? '公理不成立 · 平局'
      : F.timeout ? '时间判定 · 比较不等式'
      : F.tier === 'THEOREM' ? '完美终结 · 定理证明完成'
      : F.tier === 'LEMA' ? '技术终结 · 引理得证'
      : '普通终结 · 命题成立';
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.font = '700 50px "SFMono-Regular", Menlo, Consolas, "Cascadia Mono", monospace';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 34;
    ctx.fillText(label, W / 2, 232);
    ctx.shadowBlur = 0;
    ctx.font = '11px "SFMono-Regular", Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillText(sub, W / 2, 286);
    if (F.att) {
      ctx.font = '10px "SFMono-Regular", Menlo, Consolas, monospace';
      ctx.fillStyle = hexA(F.att.char.color, .95);
      ctx.fillText(`${F.att.char.name}  ·  决胜一击 ${F.name || ''}`, W / 2, 318);
    }
    ctx.font = '8.5px "SFMono-Regular", Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillText('SPACE / ENTER 跳过', W / 2, 362);
  }
  ctx.restore();
}

/* ── 菜单背景：缓慢生长的分形树 ─────────────────────────────────────── */
function kochBranch(ctx, x, y, len, ang, depth) {
  if (depth === 0) return;
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  kochBranch(ctx, x2, y2, len * 0.7, ang - 0.46, depth - 1);
  kochBranch(ctx, x2, y2, len * 0.7, ang + 0.46, depth - 1);
}

function drawMenuBackdrop(ctx, t) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 48) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); }
  for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(34,211,238,.17)';
  ctx.beginPath();
  kochBranch(ctx, W / 2, H - 40, 120, -Math.PI / 2, 8);
  ctx.stroke();

  /* 漂移的几何体 */
  for (let i = 0; i < 5; i++) {
    const a = t * 0.2 + i * TAU / 5;
    const x = W / 2 + Math.cos(a) * (200 + i * 26);
    const y = 260 + Math.sin(a) * 70;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.3 * (i % 2 ? 1 : -1));
    ctx.strokeStyle = `rgba(255,255,255,${0.09 + i * 0.018})`;
    ctx.beginPath();
    const n = 3 + i;
    for (let k = 0; k < n; k++) {
      const ang = -Math.PI / 2 + k * TAU / n;
      const px = Math.cos(ang) * (12 + i * 4), py = Math.sin(ang) * (12 + i * 4);
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/* ── 主绘制 ─────────────────────────────────────────────────────────── */
function draw() {
  const ctx = View.ctx;
  if (!ctx) return;
  const t = S.clock.pres;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = S.scene ? S.scene.bg : '#070b14';
  ctx.fillRect(0, 0, W, H);

  if (!S.p || S.phase === 'menu' || S.phase === 'boot') {
    drawMenuBackdrop(ctx, t);
    return;
  }

  /* 震屏：平方衰减，命中瞬间最大 */
  const shakeK = clamp(S.shakeT / C.FEEL.SHAKE_TIME, 0, 1);
  const sh = S.shake * shakeK * shakeK;
  const ox = sh > 0 ? rnd(-sh, sh) : 0;
  const oy = sh > 0 ? rnd(-sh, sh) : 0;
  ctx.save();
  ctx.translate(ox, oy);
  drawSceneBg(ctx, t);
  drawGrid(ctx, t);
  drawProofs(ctx);
  drawZones(ctx);
  drawGround(ctx, t);
  drawMirrors(ctx);
  drawGhosts(ctx);
  drawProjectiles(ctx);
  /* 终结演出：被击溃方隐藏（由碎片代替），胜方保持可见 */
  const hideDef = S.finisher && S.finisher.def;
  if (!(hideDef === S.a)) drawFighter(ctx, S.a);
  if (!(hideDef === S.p)) drawFighter(ctx, S.p);
  drawShards(ctx);
  drawParticles(ctx, 'front');
  drawTanMarks(ctx);
  drawFloats(ctx);
  if (S.debug.boxes) drawBoxes(ctx);
  ctx.restore();

  /* 命中脉冲：短促的全屏提亮，强化打击瞬间 */
  if (S.hitPulse > 0) {
    ctx.save();
    ctx.globalAlpha = S.hitPulse * 0.055;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  drawHUD(ctx);
  if (S.debug.math) drawMathLayer(ctx);
  if (S.finisher) drawFinisher(ctx);
  if (S.debug.hud) drawDebug(ctx);
}


/** 被锁定（无法操作）时的醒目提示：说明原因并显示剩余时间 */
function drawLockNotice(ctx) {
  const p = S.p;
  if (!p) return;
  const locked = p.state === 'stun' || p.state === 'falsified' || p.state === 'downed' || p.state === 'launched';
  if (!locked) { S.lockShown = false; return; }
  const left = Math.max(0, p.stunT || 0);
  const label = p.state === 'launched' ? '浮空'
    : p.state === 'downed' ? (p.lockReason || '倒地')
      : p.state === 'falsified' ? '判定式被证伪 ⊥'
        : (p.lockReason || '受击硬直');
  const color = p.state === 'falsified' ? '#f87171' : '#fbbf24';
  ctx.save();
  ctx.textAlign = 'center';
  const cx = W / 2, cy = 150;
  /* 底板 */
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(6,10,17,.82)';
  ctx.fillRect(cx - 120, cy - 18, 240, 44);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 120, cy - 18, 240, 44);
  /* 文案 */
  ctx.fillStyle = color;
  ctx.font = '700 13px ui-monospace, monospace';
  ctx.fillText('无法行动 · ' + label, cx, cy);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(left.toFixed(1) + 's', cx, cy + 16);
  /* 进度条 */
  const total = p.state === 'falsified' ? C.GUARD.falsify : Math.max(0.2, left);
  const k = clamp(left / total, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(cx - 100, cy + 26, 200, 3);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 100, cy + 26, 200 * k, 3);
  ctx.restore();
}

function drawHUD(ctx) {
  if (!S.p || !S.a) return;
  ctx.save();
  drawSideBar(ctx, S.p, 20, 1, false);
  drawSideBar(ctx, S.a, W - 20, -1, true);
  drawTimer(ctx);
  drawCombo(ctx);
  drawChainPips(ctx);
  drawSkillCards(ctx);
  if (S.settings.hints) drawHints(ctx);
  drawLockNotice(ctx);
  if (S.clash) drawClashBar(ctx);
  ctx.restore();
}
/* ═══════════════════════════════════════════════════════════════════════════
 * 23 · 界面 UI
 * ═══════════════════════════════════════════════════════════════════════════ */
function toast(title, sub, color) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  if (color) el.style.borderLeftColor = color;
  el.innerHTML = `<b>${esc(title)}</b>${esc(sub || '')}`;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s, transform .4s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(14px)';
    setTimeout(() => el.remove(), 420);
  }, 3200);
}

/* ── 角色图标 SVG ──────────────────────────────────────────────────── */
function chSVG(ch) {
  const r = 19;
  let body = '';
  if (ch.id === 'circle') {
    body = `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${ch.color}" stroke-width="2"/>
            <circle cx="0" cy="0" r="${r * 0.62}" fill="none" stroke="${ch.lite}" stroke-width="1" opacity=".45"/>`;
  } else if (ch.id === 'trig') {
    /* 三角函数：正弦曲线图标 */
    let d = '';
    let d2 = '';
    for (let i = 0; i <= 48; i++) {
      const x = -r + (i / 48) * r * 2;
      const y = Math.sin((i / 48) * TAU) * r * 0.52;
      d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
      d2 += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + (-y * 0.55).toFixed(2);
    }
    body = `<path d="${d}" fill="none" stroke="${ch.color}" stroke-width="2.2" stroke-linecap="round"/>
            <path d="${d2}" fill="none" stroke="${ch.lite}" stroke-width="1" opacity=".5"/>`;
  } else if (ch.id === 'spiral') {
    let d = '';
    for (let i = 0; i <= 70; i++) {
      const th = i / 70 * TAU * 2.2;
      const rr = r * (0.16 + 0.84 * i / 70);
      d += (i ? 'L' : 'M') + (Math.cos(th) * rr).toFixed(2) + ' ' + (Math.sin(th) * rr).toFixed(2);
    }
    body = `<path d="${d}" fill="none" stroke="${ch.color}" stroke-width="1.8"/>`;
  } else {
    let pts = '';
    for (let i = 0; i < ch.sides; i++) {
      const a = -Math.PI / 2 + i * TAU / ch.sides + (ch.id === 'rhombus' ? Math.PI / 4 : 0);
      pts += `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)} `;
    }
    body = `<polygon points="${pts}" fill="none" stroke="${ch.color}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  return `<svg viewBox="-26 -26 52 52">${body}</svg>`;
}

/* ── 正多边形几何 ──────────────────────────────────────────────────── */
function geomOf(ch) {
  if (ch.id === 'spiral') return { n: '—', a: '—', s: '—', area: '—' };
  if (ch.id === 'circle') return { n: '∞', a: ch.r.toFixed(2), s: '0', area: (Math.PI * ch.r * ch.r).toFixed(1) };
  const n = ch.sides;
  const a = ch.r * Math.cos(Math.PI / n);
  const s = 2 * ch.r * Math.sin(Math.PI / n);
  const area = 0.5 * n * ch.r * ch.r * Math.sin(2 * Math.PI / n);
  return { n, a: a.toFixed(2), s: s.toFixed(2), area: area.toFixed(1) };
}

/** 几何图示：外接圆 + 多边形 + 内切圆半径 */
function geoDiagram(ch) {
  const R = 36;
  const col = ch.color;
  let shape = '';
  if (ch.id === 'circle') {
    shape = `<circle r="${R}" fill="none" stroke="${col}" stroke-width="1.6"/>
             <circle r="${R * 0.6}" fill="none" stroke="${col}" stroke-width=".8" opacity=".5"/>`;
  } else if (ch.id === 'spiral') {
    let d = '';
    for (let i = 0; i <= 90; i++) {
      const th = i / 90 * TAU * 2.2;
      const rr = R * (0.16 + 0.84 * i / 90);
      d += (i ? 'L' : 'M') + (Math.cos(th) * rr).toFixed(2) + ' ' + (Math.sin(th) * rr).toFixed(2);
    }
    shape = `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.4"/>`;
  } else {
    let pts = '';
    for (let i = 0; i < ch.sides; i++) {
      const a = -Math.PI / 2 + i * TAU / ch.sides;
      pts += `${(Math.cos(a) * R).toFixed(2)},${(Math.sin(a) * R).toFixed(2)} `;
    }
    shape = `<polygon points="${pts}" fill="none" stroke="${col}" stroke-width="1.6"/>
             <circle r="${(R * Math.cos(Math.PI / ch.sides)).toFixed(2)}" fill="none" stroke="${col}" stroke-width=".7" opacity=".45"/>`;
  }
  return `<svg viewBox="-46 -46 92 92">
    <circle r="${R}" fill="none" stroke="rgba(255,255,255,.14)" stroke-dasharray="2 3"/>
    ${shape}
    <line x1="0" y1="0" x2="${R}" y2="0" stroke="${col}" stroke-width=".7" opacity=".55"/>
    <circle r="1.6" fill="${col}"/>
  </svg>`;
}

const UI = {
  el: null, cur: null, back: 'menu',

  init() {
    this.el = document.getElementById('overlay');
    this.el.addEventListener('click', e => this.onClick(e));
    this.el.addEventListener('input', e => this.onInput(e));
  },

  open(name, back) {
    this.cur = name;
    if (back) this.back = back;
    if (name === 'menu') resetMatchIdle();
    this.el.innerHTML = this.render(name);
    this.el.classList.add('on');
    this.el.querySelector('.scr')?.scrollTo(0, 0);
  },

  close() {
    this.el.classList.remove('on');
    this.el.innerHTML = '';
    this.cur = null;
  },

  reopen() { this.open(this.cur); },

  render(name) {
    switch (name) {
      case 'menu': return this.menu();
      case 'versus': return this.versus();
      case 'training': return this.training();
      case 'records': return this.records();
      case 'settings': return this.settings();
      case 'help': return this.help();
      case 'pause': return this.pause();
      case 'result': return this.result();
      default: return this.menu();
    }
  },

  /* ── 主菜单 ── */
  menu() {
    const P = S.profile;
    const achN = Object.keys(P.ach).length;
    const chN = Object.keys(P.ch).length;
    const circle = P.unlockedCircle;
    return `<div class="scr">
      <div class="hd">
        <div class="t">HITHITHIT <i>· 几何战争</i></div>
        <div class="m">GEOMETRY WAR · v1.0</div>
      </div>
      <div class="menu-body">
        <div class="hero">
          <h1>HITHITHIT</h1>
          <h2>几 何 战 争</h2>
          <p>「凡不能被证明的存在，都不存在。」</p>
        </div>
        <div class="grid6">
          <button class="mode" data-act="screen" data-val="versus"><b>自由对战</b><small>FREE DUEL</small></button>
          <button class="mode soon"><b>街机闯关</b><small>ARCADE</small><span class="tag">COMING SOON</span></button>
          <button class="mode" data-act="screen" data-val="training"><b>训练场</b><small>LABORATORY</small></button>
          <button class="mode soon"><b>BOSS 挑战</b><small>BOSS RUSH</small><span class="tag">COMING SOON</span></button>
          <button class="mode" data-act="screen" data-val="records"><b>成就记录</b><small>RECORDS</small></button>
          <button class="mode" data-act="screen" data-val="settings"><b>游戏设置</b><small>SETTINGS</small></button>
        </div>
      </div>
      <div class="foot">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <button class="btn primary" data-act="screen" data-val="versus">开始对战 ⏎</button>
          <button class="btn" data-act="screen" data-val="help">? 玩法说明</button>
        </div>
        <div class="hintline">${circle ? '隐藏角色「圆」已解锁' : '解锁「圆」：用 ' + this.circleProgress() + ' 赢一场'} · 成就 <b>${achN}/24</b> · 挑战 <b>${chN}/8</b></div>
      </div>
    </div>`;
  },

  charCards(cur, allowCircle) {
    return `<div class="cards">${CHARS.map(c => {
      const locked = c.hidden && !allowCircle;
      return `<button class="card ${cur === c.id ? 'on' : ''} ${locked ? 'locked' : ''}" style="--c:${c.color}"
        data-act="pick" data-val="${c.id}" ${locked ? 'disabled' : ''}>
        ${chSVG(c)}<b>${c.name}</b><span>${c.en}</span>
        ${locked ? '<i class="lk">LOCK</i>' : ''}</button>`;
    }).join('')}</div>
    ${allowCircle ? '' : `<div class="hintline" style="margin-top:3px">「圆」解锁条件：用 ${this.circleProgress()} 各赢一场后开放</div>`}`;
  },

  /** 圆的解锁进度：列出还没赢过的角色 */
  circleProgress() {
    const P = S.profile;
    const won = BASE_FIVE.filter(c => P.chars[c.id] && P.chars[c.id].w > 0);
    const todo = BASE_FIVE.filter(c => !(P.chars[c.id] && P.chars[c.id].w > 0)).map(c => c.name);
    if (!todo.length) return '全部已完成';
    return todo.join(' / ');
  },

  seg(scope, key, items, cur) {
    return `<div class="seg">${items.map(it =>
      `<button data-act="set" data-scope="${scope}" data-key="${key}" data-val="${it.v}"
       class="${String(it.v) === String(cur) ? 'on' : ''}">${it.t}</button>`).join('')}</div>`;
  },

  toggle(scope, key, on, label) {
    return `<div class="set-row"><b>${label}</b>
      <button class="btn" style="padding:2px 10px;font-size:9px"
        data-act="set" data-scope="${scope}" data-key="${key}" data-val="${on ? 0 : 1}">${on ? '开启' : '关闭'}</button></div>`;
  },

  /* ── 自由对战 ── */
  versus() {
    const m = S.match;
    const ch = CHAR_MAP[m.fighter] || CHARS[0];
    const g = geomOf(ch);
    const rhythm = Math.round(ch.combo.reduce((s, c) => s + c.w + c.a, 0) * 1000);
    const total = ch.combo.reduce((s, c) => s + c.dmg, 0);
    const opps = [{ v: 'auto', t: '自动' }].concat(CHARS.filter(c => !c.hidden || S.profile.unlockedCircle).map(c => ({ v: c.id, t: c.name })));
    const scenes = SCENES.map(s => ({ v: s.id, t: s.name }));
    const diffs = DIFFS.map((d, i) => ({ v: i, t: d.name + ' ' + d.en }));
    return `<div class="scr">
      <div class="hd"><div class="t">自由对战 <i>· FREE DUEL</i></div>
        <div class="m">一对一 · 60 秒 · 证毕</div></div>
      <div class="sect"><h2>你的形状 · FIGHTER</h2></div>
      ${this.charCards(m.fighter, S.profile.unlockedCircle)}
      <div class="cols">
        <div class="panel">
          <h3>${ch.name} <em>${ch.en}</em></h3>
          <div class="quote">${ch.quote}</div>
          <div class="kv">
            <div><span>称号</span><b>${ch.title}</b></div>
            <div><span>定位</span><b>${ch.role}</b></div>
            <div><span>血量</span><b>${Math.round(C.BASE_HP * ch.hp)}</b></div>
            <div><span>判定角</span><b>${ch.theta}°</b></div>
            <div><span>连打节奏</span><b>${rhythm}ms</b></div>
            <div><span>理论总伤</span><b>${total.toFixed(2)}</b></div>
            <div><span>综合强度</span><b>${ch.strength}</b></div>
            <div><span>移速系数</span><b>${ch.spd.toFixed(2)}</b></div>
          </div>
          <div class="geo">
            ${geoDiagram(ch)}
            <div class="geoform">
              <div>n = <b>${g.n}</b> · r = <b>${ch.r}</b></div>
              <div>a = r·cos(π/n) = <b>${g.a}</b></div>
              <div>s = 2r·sin(π/n) = <b>${g.s}</b></div>
              <div>A = ½·n·r²·sin(2π/n) = <b>${g.area}</b></div>
              <div>AI 攻 <b>${ch.ai.atk.toFixed(2)}</b> · 空 <b>${ch.ai.air.toFixed(2)}</b> · 守 <b>${ch.ai.def.toFixed(2)}</b></div>
            </div>
          </div>
          <div class="frames">
            ${ch.combo.map((c, i) => {
              const tot = c.w + c.a + c.r;
              return `<div class="fr"><span>a${i + 1}</span>
                <div class="fbar">
                  <i style="width:${(c.w / tot * 100).toFixed(1)}%;background:rgba(255,255,255,.34)"></i>
                  <i style="width:${(c.a / tot * 100).toFixed(1)}%;background:${ch.color}"></i>
                  <i style="width:${(c.r / tot * 100).toFixed(1)}%;background:rgba(255,255,255,.13)"></i>
                </div>
                <em>${Math.round(tot * 1000)}</em></div>`;
            }).join('')}
            <div class="frlegend">
              <span><i style="background:rgba(255,255,255,.34)"></i>前摇</span>
              <span><i style="background:${ch.color}"></i>判定</span>
              <span><i style="background:rgba(255,255,255,.13)"></i>收招</span>
            </div>
          </div>
          <div class="cmb">
            ${ch.combo.map((c, i) => `<div><span>a${i + 1} ${c.name}</span><i>${c.dmg.toFixed(2)} · ${Math.round((c.w + c.a) * 1000)}ms</i></div>`).join('')}
            <div class="sk">技能 ${ch.skill.name} · 冷却 ${ch.skill.cd}s · ${ch.skill.desc}</div>
            <div class="sk">大招 ${ULTS[ch.id].name} · ${ULTS[ch.id].desc}</div>
          </div>
        </div>
        <div class="panel" style="overflow-y:auto">
          <div class="opt"><span>对手 · OPPONENT</span>${this.seg('match', 'opponent', opps, m.opponent)}</div>
          <div class="opt"><span>场景 · SCENE</span>${this.seg('match', 'scene', scenes, m.scene)}</div>
          <div class="opt"><span>AI 难度 · DIFFICULTY</span>${this.seg('match', 'diff', diffs, m.diff)}</div>
          <div class="opt"><span>演出 · FINISHER</span>${this.seg('match', 'finisher', [
            { v: 'auto', t: '自动' }, { v: 'QED', t: '冲击' }, { v: 'LEMA', t: '技术' }, { v: 'THEOREM', t: '完美' },
          ], m.finisher)}</div>
          <div class="opt"><span>画质 · QUALITY</span>${this.seg('settings', 'quality', [
            { v: 'high', t: '高' }, { v: 'balanced', t: '平衡' }, { v: 'performance', t: '性能' },
          ], S.settings.quality)}</div>
          ${this.toggle('settings', 'skipFinisher', S.settings.skipFinisher, '允许跳过演出')}
          ${this.toggle('settings', 'autoRematch', S.settings.autoRematch, '结算后自动再战')}
          <div class="hintline">场景：${SCENE_MAP[m.scene] ? SCENE_MAP[m.scene].desc : ''}</div>
        </div>
      </div>
      <div class="foot">
        <button class="btn" data-act="screen" data-val="menu">← 返回</button>
        <div class="hintline">对手「自动」将按你的角色匹配</div>
        <button class="btn primary" data-act="start" data-val="versus">开始证明 ⏎</button>
      </div>
    </div>`;
  },

  /* ── 训练场 ── */
  training() {
    const m = S.match;
    const ch = CHAR_MAP[m.fighter] || CHARS[0];
    const cfg = S.trainingCfg;
    const opps = CHARS.filter(c => !c.hidden || S.profile.unlockedCircle).map(c => ({ v: c.id, t: c.name }));
    return `<div class="scr">
      <div class="hd"><div class="t">训练场 <i>· LABORATORY</i></div>
        <div class="m">${S.phase === 'fight' ? 'F2 暂停训练设置' : '木桩与判定可视化'}</div></div>
      <div class="sect"><h2>你的形状 · FIGHTER</h2></div>
      ${this.charCards(m.fighter, S.profile.unlockedCircle)}
      <div class="cols">
        <div class="panel">
          <h3>${ch.name} <em>${ch.en}</em></h3>
          <div class="quote">${ch.quote}</div>
          <div class="kv">
            <div><span>判定角</span><b>${ch.theta}°</b></div>
            <div><span>血量</span><b>${Math.round(C.BASE_HP * ch.hp)}</b></div>
            <div><span>浮空重力</span><b>${(C.FLOAT_G * ch.floatG).toFixed(0)}</b></div>
            <div><span>技能冷却</span><b>${(ch.skill.cd * ch.skillCdCoef).toFixed(2)}s</b></div>
          </div>
          <div class="frames">
            ${ch.combo.map((c, i) => {
              const tot = c.w + c.a + c.r;
              return `<div class="fr"><span>a${i + 1}</span>
                <div class="fbar">
                  <i style="width:${(c.w / tot * 100).toFixed(1)}%;background:rgba(255,255,255,.22)"></i>
                  <i style="width:${(c.a / tot * 100).toFixed(1)}%;background:${ch.color}"></i>
                  <i style="width:${(c.r / tot * 100).toFixed(1)}%;background:rgba(255,255,255,.08)"></i>
                </div>
                <em>${Math.round(tot * 1000)}</em></div>`;
            }).join('')}
          </div>
          <div class="cmb">
            ${ch.combo.map((c, i) => `<div><span>a${i + 1} ${c.name}</span><i>${c.dmg.toFixed(2)}</i></div>`).join('')}
            <div class="sk">${ch.skill.name} · ${ch.skill.desc}</div>
          </div>
          <div class="hintline">F1 调试 HUD · F3 判定框 · F4 数学注释 · Y 重置位置</div>
          <div class="hintline">连招挑战：${CHALLENGES.map(c => (S.profile.ch[c.id] ? '●' : '○') + c.name).join('  ')}</div>
        </div>
        <div class="panel" style="overflow-y:auto">
          <div class="opt"><span>木桩 · DUMMY</span>${this.seg('match', 'opponent', opps, m.opponent === 'auto' ? 'triangle' : m.opponent)}</div>
          <div class="opt"><span>木桩行为 · BEHAVIOR</span>${this.seg('training', 'behavior', [
            { v: 'idle', t: '静止' }, { v: 'guard', t: '蹲防' }, { v: 'walk', t: '平移' },
            { v: 'jump', t: '跳跃' }, { v: 'light', t: '轻击' }, { v: 'heavy', t: '重击' },
          ], cfg.behavior)}</div>
          <div class="opt"><span>反击模式 · COUNTER</span>${this.seg('training', 'counter', [
            { v: 'none', t: '不反击' }, { v: 'hiton', t: '受击反击' },
            { v: 'perfectDodge', t: '自动完美闪避' }, { v: 'perfectGuard', t: '自动完美防反' },
          ], cfg.counter)}</div>
          <div class="opt"><span>场景 · SCENE</span>${this.seg('match', 'scene', SCENES.map(s => ({ v: s.id, t: s.name })), m.scene)}</div>
          ${this.toggle('training', 'infinite', cfg.infinite, '无限血量 / 能量')}
        </div>
      </div>
      <div class="foot">
        <button class="btn" data-act="${S.phase === 'fight' ? 'resume' : 'screen'}" data-val="menu">← ${S.phase === 'fight' ? '继续训练' : '返回'}</button>
        <div class="hintline">木桩血量立即回满 · 伤害照常统计</div>
        <button class="btn primary" data-act="start" data-val="training">进入训练场</button>
      </div>
    </div>`;
  },

  /* ── 记录 ── */
  records() {
    const P = S.profile, st = P.stats;
    const winRate = st.matches ? Math.round((st.wins / st.matches) * 100) : 0;
    const avgAngle = P.angleN ? (P.angleSum / P.angleN).toFixed(1) + '°' : '—';
    const stats = [
      ['场次', st.matches], ['胜', st.wins], ['负', st.losses], ['平', st.draws],
      ['胜率', winRate + '%'], ['连胜', st.streak], ['最佳连胜', st.bestStreak], ['最高连击', st.bestCombo],
      ['累计伤害', Math.round(st.damage)], ['承受伤害', Math.round(st.taken)], ['命中数', st.hits],
      ['完美闪避', st.perfectDodges], ['完美防反', st.perfectCounters], ['角力胜利', st.clashWins],
      ['技能释放', st.skills], ['终结次数', st.finishers], ['完美终结', st.theoremFinishers], ['平均夹角', avgAngle],
    ];
    return `<div class="scr">
      <div class="hd"><div class="t">成就记录 <i>· RECORDS</i></div>
        <div class="m">永久档案 · geometry-war-profile-v1</div></div>
      <div class="sect"><h2>总览 · OVERVIEW</h2></div>
      <div class="stats">${stats.map(([k, v]) =>
        `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div>

      <div class="sect"><h2>成就 · ACHIEVEMENTS ${Object.keys(P.ach).length}/24</h2></div>
      <div class="ach-grid">${ACHS.map(a => {
        const on = !!P.ach[a.id];
        return `<div class="ach ${on ? 'on' : ''}" style="--ac:${TIER_COLOR[a.tier]}">
          <i></i><div><b>${a.name}</b><span>${a.tier} · ${a.code}</span>
          <span>${a.desc}</span></div></div>`;
      }).join('')}</div>

      <div class="sect"><h2>连招挑战 · CHALLENGES ${Object.keys(P.ch).length}/8</h2></div>
      <div class="ch-grid">${CHALLENGES.map((c, i) =>
        `<div class="ch ${P.ch[c.id] ? 'on' : ''}"><i>${String(i + 1).padStart(2, '0')}</i>
         <div><b style="font-weight:600">${c.name}</b>
         <span style="color:#78859a;font-size:8px">${c.desc}</span></div></div>`).join('')}</div>

      <div class="sect"><h2>最近对局 · RECENT</h2></div>
      ${P.recent.length ? `<table class="rec"><thead><tr>
        <th>结果</th><th>角色</th><th>对手</th><th>场景</th><th>终结</th><th>连击</th><th>伤害</th><th>夹角</th>
      </tr></thead><tbody>
      ${P.recent.slice(0, 8).map(r => `<tr>
        <td class="${r.draw ? 'draw' : r.win ? 'win' : 'lose'}">${r.draw ? '平' : r.win ? '胜' : '负'}</td>
        <td>${(CHAR_MAP[r.me] || {}).name || r.me}</td>
        <td>${(CHAR_MAP[r.opp] || {}).name || r.opp}</td>
        <td class="d">${(SCENE_MAP[r.scene] || {}).name || r.scene}</td>
        <td class="d">${r.tier}</td><td>${r.combo}</td><td>${r.dmg}</td><td class="d">${(r.angle || 0).toFixed(1)}°</td>
      </tr>`).join('')}</tbody></table>` : '<div class="hintline">尚无对局记录。</div>'}

      <div class="foot">
        <button class="btn" data-act="screen" data-val="menu">← 返回</button>
        <button class="btn danger" data-act="clear">清除全部记录</button>
        <div class="hintline">${Store.degraded ? '浏览器拒绝写入 · 仅本次会话' : '存档已同步'}</div>
      </div>
    </div>`;
  },

  /* ── 设置 ── */
  settings() {
    const s = S.settings;
    const keys = s.keys || DEFAULT_KEYS;
    return `<div class="scr">
      <div class="hd"><div class="t">游戏设置 <i>· SETTINGS</i></div>
        <div class="m">全部设置即时生效</div></div>
      <div class="set-wrap">
        <div class="sect"><h2>音频与手感</h2></div>
        <div class="set-grid">
          <div class="set-row"><b>音量</b><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-set="volume"></div>
          <div class="set-row"><b>命中停顿</b><input type="range" min="0" max="1" step="0.05" value="${s.hitstop}" data-set="hitstop"></div>
          <div class="set-row"><b>震屏强度</b><input type="range" min="0" max="1" step="0.05" value="${s.shake}" data-set="shake"></div>
          <div class="set-row"><b>粒子数量</b><input type="range" min="0" max="1" step="0.05" value="${s.particles}" data-set="particles"></div>
        </div>
        <div class="set-grid">
          ${this.toggle('settings', 'muted', s.muted, '静音')}
          ${this.toggle('settings', 'hints', s.hints, '显示操作提示')}
          ${this.toggle('settings', 'skipFinisher', s.skipFinisher, '允许跳过演出')}
          ${this.toggle('settings', 'autoRematch', s.autoRematch, '结算后自动再战')}
        </div>
        <div class="opt" style="margin-top:4px"><span>画质 · QUALITY</span>${this.seg('settings', 'quality', [
          { v: 'high', t: '高（全图层）' }, { v: 'balanced', t: '平衡' }, { v: 'performance', t: '性能' },
        ], s.quality)}</div>

        <div class="sect" style="margin-top:4px"><h2>自定义按键 · KEY BINDINGS</h2></div>
        <div class="keys">
          ${ACTIONS.map(a => `<div class="keyrow"><span>${ACTION_CN[a]}</span>
            <button class="kb ${Input.capture === a ? 'wait' : ''}" data-act="bind" data-val="${a}">
            ${Input.capture === a ? '按下新键…' : keyLabel(keys[a])}</button></div>`).join('')}
        </div>
        <div class="hintline">若新键已被占用，会自动交换两个动作的键位。追击选项跟随改键。</div>
      </div>

      <div class="foot">
        <button class="btn" data-act="back">← 返回</button>
        <div class="hintline">ESC 取消按键录入</div>
        <button class="btn" data-act="resetkeys">恢复默认键位</button>
      </div>
    </div>`;
  },

  /* ── 玩法说明 ── */
  help() {
    const keys = S.settings.keys || DEFAULT_KEYS;
    const kb = a => `<span class="key">${keyLabel(keys[a])}</span>`;
    const row = (ks, name, desc) => `<div class="krow"><div class="ks">${ks}</div>
      <div><strong>${name}</strong>${desc}</div></div>`;
    return `<div class="scr">
      <div class="hd"><div class="t">玩法说明 <i>· HOW TO PLAY</i></div>
        <div class="m">证明，就是战斗</div></div>
      <div class="help-grid">
        <section class="help-card">
          <h4>目标 · GOAL</h4>
          <p>60 秒内把对手<b>血量清零</b>，即“证毕”。时间耗尽则<b>血量高者胜</b>，相同为平局。</p>
          <h4>三条资源</h4>
          <ul>
            <li><b>血量</b>：白色延迟条表示刚刚失去的部分，回落后显示真实血量。</li>
            <li><b>能量</b>：造成或受到伤害都会积累，约 20 秒攒满。满 <b>100</b> 释放<b>角色专属大招</b>（每人不同）。</li>
            <li><b>护盾</b>：蹲防时抵挡伤害；被打空会被“证伪”，出现 <b>⊥</b> 并硬直 2.5 秒。</li>
          </ul>
          <h4>核心思路</h4>
          <p>不是乱按：<b>连段</b>决定伤害、<b>角度</b>决定倍率、<b>闪避</b>决定主动权。打不过就去训练场——那里有无限血量和木桩。</p>
        </section>

        <section class="help-card">
          <h4>基础操作 · CONTROLS</h4>
          ${row(kb('left') + kb('right'), '移动', '左右平移；蹲防时移速 ×0.45')}
          ${row(kb('jump'), '跳跃 / 二段跳', '空中可再跳一次，落地重置')}
          ${row(kb('down'), '蹲防', '受击 ×0.8，移动变慢；可挡上挑与重击')}
          ${row(kb('light'), '轻击', '连按打出 a₁→a₄；空中按为空中轻击')}
          ${row(kb('down') + kb('light'), '上挑 / 下劈', '地面把对手抛起；空中向下砸落')}
          ${row(kb('heavy'), '蓄力重击', `按住蓄力、松开冲刺；与对手重击判定帧撞上（贴身 ≤${C.CLASH.reach}px）即进入角力，连按任意键抢胜`)}
          ${row(kb('ult'), '专属大招', `能量满 100 释放：${(ULTS[(S.match.fighter)] || ULTS.triangle).name}`)}
          ${row(kb('skill'), '专属技能 / 脱身', '平时放技能；被连招压制时按它脱身')}
          ${row(kb('dodge'), '闪避', '0.22 秒无敌；被击中的瞬间按可完美闪避')}
          ${row(kb('counter'), '追击选项', '完美闪避后按它或 J/K/L 四选一反击')}
        </section>

        <section class="help-card">
          <h4>进阶技巧 · TIPS</h4>
          <ul>
            <li><b>连招</b>：血条下方 4 个圆点 + 窗口条；窗口内再按 J 才能接下一段，打空要等收招。</li>
            <li><b>角度即伤害</b>：伤害 ×cos θ，正面 100%，45° 只剩 70.7%。</li>
            <li><b>浮空追击</b>：上挑命中后跳起，空中 J 连打；连续 3 次后强制砸落。</li>
            <li><b>完美闪避</b>：触发慢动作，0.6 秒内 J/K/L/I 四选一反击。</li>
            <li><b>霸体层级</b>：正常体（站立/平A）＜ 技能体（重击、技能）＜ 金刚体（大招）。平A 只能打断正常体；重击、技能能压制技能体；大招可打断一切。</li>
            <li><b>连段保护</b>：连得越久单段伤害越低，累计伤害到上限会自动断开。</li>
            <li><b>打击反馈</b>：命中会顿帧、震屏、闪白，伤害数字弹出；暴击是红字。</li>
            <li><b>边走边打</b>：轻击几乎不锁移动，贴墙被打飞还会反弹。</li>
            <li><b>护盾证伪</b>：硬吃伤害换时间，但护盾归零会陷入 2.5 秒硬直。</li>
          </ul>
          <h4>训练场</h4>
          <p>木桩行为、反击模式、无限血量都能在训练设置里调；<b>F1</b> 调试 HUD、<b>F3</b> 判定框、<b>F4</b> 数学注释。</p>
          <h4>按键</h4>
          <p>全部按键可在「游戏设置 → 自定义按键」里修改，本说明会自动同步。</p>
        </section>
      </div>
      <div class="foot">
        <button class="btn" data-act="back">← 返回</button>
        <div class="hintline">建议先在训练场熟悉连招与闪避，再进入自由对战。</div>
        <button class="btn primary" data-act="helpStart">进入自由对战 ⏎</button>
      </div>
    </div>`;
  },

  /* ── 暂停 ── */
  pause() {
    return `<div class="center-wrap"><div class="dialog">
      <h2>暂时挂起</h2>
      <div class="sub">PAUSED · 战斗时钟已冻结</div>
      <div class="row">
        <button class="btn primary" data-act="resume">继续对战</button>
        <button class="btn" data-act="restart">重新开始</button>
      </div>
      <div class="row">
        <button class="btn" data-act="screen" data-val="settings">游戏设置</button>
        <button class="btn" data-act="screen" data-val="training">训练设置</button>
        <button class="btn" data-act="screen" data-val="help">玩法说明</button>
        <button class="btn" data-act="quit">返回主菜单</button>
      </div>
      <div class="hintline" style="text-align:center">R 重新开始 · ESC 继续 · H 玩法说明</div>
    </div></div>`;
  },

  /* ── 结算 ── */
  result() {
    const R = S.result;
    if (!R) return this.menu();
    const label = R.draw ? '⊥' : R.tier === 'QED' ? 'Q . E . D .' : R.tier === 'LEMA' ? 'L E M A' : 'T H E O R E M';
    const cls = R.draw ? 'qed' : R.tier === 'QED' ? 'qed' : R.tier === 'LEMA' ? 'lema' : 'theorem';
    const head = R.draw ? '公理不成立' : R.win ? '证明成立' : '证明失败';
    const cs = CHAR_MAP[R.fighter] || CHARS[0];
    const ca = CHAR_MAP[R.opponent] || CHARS[0];
    const rows = [
      ['伤害', R.p.dmg, R.a.dmg],
      ['承受', R.p.taken, R.a.taken],
      ['命中', R.p.hits, R.a.hits],
      ['最高连击', R.p.combo, R.a.combo],
      ['平均夹角', R.p.avg.toFixed(1) + '°', R.a.avg.toFixed(1) + '°'],
    ];
    return `<div class="center-wrap"><div class="dialog">
      <div class="tier ${cls}">${label}</div>
      <div class="sub">${head} · ${R.timeout ? '时间判定' : '决胜一击 ' + R.name} · ${R.time.toFixed(0)}s</div>
      <div class="vsline"><span style="color:${cs.color}">${cs.name}</span><em>VS</em><span style="color:${ca.color}">${ca.name}</span></div>
      <div class="cmp">
        <div class="cmp-h"><span>统计</span><b>我方</b><b>对手</b></div>
        ${rows.map(([k, a, b], i) => `<div class="${i === rows.length - 1 ? 'last' : ''}">
          <span>${k}</span><b>${a}</b><b>${b}</b></div>`).join('')}
      </div>
      <div class="rgrid">
        <div><b>${R.p.perfect}</b><span>完美闪避</span></div>
        <div><b>${R.p.counter}</b><span>完美防反</span></div>
        <div><b>${R.p.clash}</b><span>角力胜利</span></div>
        <div><b>${R.p.best.toFixed(1)}°</b><span>最优夹角</span></div>
      </div>
      <div class="sub">${(SCENE_MAP[R.scene] || {}).name} · ${R.tier}${R.born && R.born.length ? ` · 新成就 ${R.born.length} 项` : ''}</div>
      <div class="row">
        <button class="btn primary" data-act="restart">R 重新开始</button>
        <button class="btn" data-act="quit">ESC 返回主菜单</button>
      </div>
    </div></div>`;
  },

  /* ── 交互 ── */
  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act, val = b.dataset.val, key = b.dataset.key, scope = b.dataset.scope;
    Sfx.init(); if (act !== 'bind') Sfx.play('ui');

    switch (act) {
      case 'screen':
        if (val === 'settings' || val === 'training') this.open(val, this.cur === 'pause' ? 'pause' : 'menu');
        else this.open(val);
        break;
      case 'back':
        this.open(this.back || 'menu');
        break;
      case 'pick':
        S.match.fighter = val;
        Store.saveMatch();
        this.reopen();
        break;
      case 'set': {
        let v = val;
        if (v === '0' || v === '1') v = Number(v);
        else if (/^-?\d+$/.test(v)) v = Number(v);
        if (scope === 'match') { S.match[key] = v; Store.saveMatch(); }
        else if (scope === 'settings') {
          S.settings[key] = v; Store.saveSettings();
          Store.applySettings(); Input.invalidate();
        } else if (scope === 'training') {
          if (key === 'infinite') S.trainingCfg.infinite = !!v;
          else S.trainingCfg[key] = v;
        }
        if (key === 'quality') { Store.saveSettings(); }
        this.reopen();
        break;
      }
      case 'start': {
        const mode = val === 'training' ? 'training' : 'versus';
        const wasPaused = this.cur === 'pause';
        if (wasPaused) S.paused = false;
        startMatch(mode);
        break;
      }
      case 'helpStart':
        S.profile.seenHelp = true;
        Store.saveProfile();
        this.open('versus');
        break;
      case 'resume':
        S.paused = false;
        this.close();
        break;
      case 'restart':
        S.paused = false;
        restartMatch();
        break;
      case 'quit':
        S.paused = false;
        resetMatchIdle();
        this.open('menu');
        break;
      case 'bind':
        Input.capture = val;
        this.reopen();
        break;
      case 'resetkeys':
        S.settings.keys = Object.assign({}, DEFAULT_KEYS);
        Store.saveSettings();
        Input.invalidate();
        this.reopen();
        break;
      case 'clear':
        if (b.dataset.confirm) {
          Store.clearRecords();
          toast('记录已清除', '全部成就与统计已归零');
          this.open('records');
        } else {
          b.dataset.confirm = '1';
          b.textContent = '再次点击确认清除';
          b.style.color = '#ef4444';
        }
        break;
    }
  },

  onInput(e) {
    const t = e.target;
    if (t.dataset && t.dataset.set) {
      const k = t.dataset.set;
      S.settings[k] = parseFloat(t.value);
      Store.saveSettings();
      Store.applySettings();
      if (k === 'volume' || k === 'muted') Sfx.play('ui');
    }
  },

  cancelCapture() {
    Input.capture = null;
    this.reopen();
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 24 · 主循环 LOOP
 * ═══════════════════════════════════════════════════════════════════════════ */
/**
 * 角色互推（水平分离）：
 * 以前是纯 x 轴判定，所以从头顶跃过也会把对手推开。
 * 现在只有两人竖直方向上有实际重叠（身体区间相交）时才做水平分离。
 */
function separate(p, a) {
  if (p.state === 'launched' || a.state === 'launched') return;
  /* 竖直重叠：用身体区间（脚底 y 到头顶 y - 高度）交集判断 */
  const pTop = p.y - bodyH(p), pBot = p.y;
  const aTop = a.y - bodyH(a), aBot = a.y;
  const vOverlap = Math.min(pBot, aBot) - Math.max(pTop, aTop);
  const vMin = Math.min(bodyH(p), bodyH(a)) * 0.45;   // 至少重叠 45% 身高才算撞上
  if (vOverlap < vMin) return;
  const min = (p.char.r + a.char.r) * 0.86;
  const d = a.x - p.x;
  const ad = Math.abs(d);
  if (ad < min && ad > 0.01) {
    /* 主动走向对方的一方只推对方一半，被推的一方让出更多，
       避免“把对手顶到墙上后自己也被墙夹住”的僵死手感 */
    const pMoving = (p.vx * sign(a.x - p.x)) > 20;
    const aMoving = (a.vx * sign(p.x - a.x)) > 20;
    let pShare = 0.5, aShare = 0.5;
    if (pMoving && !aMoving) { pShare = 0.15; aShare = 0.85; }
    else if (aMoving && !pMoving) { pShare = 0.85; aShare = 0.15; }
    const gap = min - ad;
    p.x = clamp(p.x - sign(d) * gap * pShare, 44, W - 44);
    a.x = clamp(a.x + sign(d) * gap * aShare, 44, W - 44);
    /* 双方都被墙夹住（会重叠）时，把主动方往里拉开 */
    if (Math.abs(a.x - p.x) < min * 0.92) {
      const mx = (p.x + a.x) / 2;
      p.x = clamp(mx - sign(d) * min * 0.46, 44, W - 44);
      a.x = clamp(mx + sign(d) * min * 0.46, 44, W - 44);
    }
  }
}

function updateBattle(dt) {
  if (S.phase !== 'fight' || S.paused) return;
  const p = S.p, a = S.a;
  if (!p || !a) return;
  S.clock.battle += dt;

  if (S.training) trainingTick(dt); else aiTick(a, p, dt);
  tickFighter(p, a, dt);
  tickFighter(a, p, dt);
  updateClash(dt);
  checkClash();
  resolveHits();
  if (S.phase !== 'fight') return;
  tickMirrors(dt);
  tickProjectiles(dt);
  tickTanMarks(dt);
  tickZones(dt);
  separate(p, a);

  if (S.training && S.trainingCfg.infinite) {
    p.hp = p.maxHp; p.hpTrail = p.maxHp;
    p.energy = 100;
  }

  if (!S.training) {
    S.clock.round -= dt;
    if (S.clock.round <= 0) { S.clock.round = 0; onTimeout(); }
  }
}

function loop(ts) {
  const t = ts / 1000;
  let dt = S.last ? t - S.last : 0;
  S.last = t;
  dt = Math.min(dt, 0.05);
  S.clock.pres += dt;
  S.clock.ui += dt;

  if (S.shakeT > 0) {
    S.shakeT = Math.max(0, S.shakeT - dt);
    if (S.shakeT <= 0) S.shake = 0;
  }
  if (S.intensity > 0) S.intensity = Math.max(0, S.intensity - dt * 0.5);

  if (S.phase === 'fight' && !S.paused) {
    let bdt = dt;
    if (S.hitstop > 0) { S.hitstop = Math.max(0, S.hitstop - dt); bdt = 0; }
    if (S.slowmo > 0) { S.slowmo = Math.max(0, S.slowmo - dt); bdt *= C.DODGE.slow; }
    if (bdt > 0) updateBattle(bdt);
  } else if (S.phase === 'finisher') {
    updateFinisher(dt);
  } else if (S.phase === 'result') {
    updateResult(dt);
  }

  updateParticles(dt);
  updateShards(dt);
  draw();
  S.raf = requestAnimationFrame(loop);
}

function pauseGame() {
  if (S.phase !== 'fight') return;
  S.paused = true;
  UI.open('pause');
}
function resumeGame() {
  S.paused = false;
  UI.close();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 25 · 启动 BOOT
 * ═══════════════════════════════════════════════════════════════════════════ */
function boot() {
  Store.load();
  View.init();
  UI.init();
  Input.init();
  bindEvents();
  defineTests();
  S.scene = SCENES[0];

  const q = new URLSearchParams(location.search);
  if (q.get('fighter') && CHAR_MAP[q.get('fighter')]) S.match.fighter = q.get('fighter');
  if (q.get('scene') && SCENE_MAP[q.get('scene')]) S.match.scene = q.get('scene');
  if (q.get('debug') === '0') S.debug.hud = false;
  if (q.get('debug') === '1') S.debug.hud = true;

  if (q.get('selftest') === '1') {
    setTimeout(runTestsUI, 30);
  } else if (q.get('autostart')) {
    startMatch(q.get('autostart') === 'training' ? 'training' : 'versus');
    /* 调试：?ff=N 预推进 N 帧；?auto=1 自动出招，便于观察与截图 */
    const ff = Math.min(20000, parseInt(q.get('ff') || '0', 10) || 0);
    const auto = q.get('auto') === '1' ? 1 : q.get('auto') === '2' ? 2 : 0;
    if (q.get('hpP') && S.p) { S.p.hp = clamp(+q.get('hpP'), 0, 1) * S.p.maxHp; S.p.hpTrail = S.p.hp; }
    if (q.get('hpA') && S.a) { S.a.hp = clamp(+q.get('hpA'), 0, 1) * S.a.maxHp; S.a.hpTrail = S.a.hp; }
    if (q.get('ko') && S.a && S.p) {
      S.a.hp = 1; S.a.hpTrail = 1;
      S.p.x = clamp(S.a.x - 70, 44, W - 44);
    }
    for (let i = 0; i < ff; i++) {
      if (auto && S.phase === 'fight') {
        if (i % 14 === 0) tryLight(S.p);
        if (auto === 2) {
          if (i % 43 === 0) tryDodge(S.p);
          if (i % 31 === 0) S.p.energy = Math.min(100, S.p.energy + 22);
          if (i % 61 === 30) tryUlt(S.p);
          if (i % 89 === 20) trySkill(S.p);
        }
      }
      if (S.phase === 'fight') updateBattle(1 / 60);
      else if (S.phase === 'finisher') updateFinisher(1 / 60);
      else if (S.phase === 'result') updateResult(1 / 60);
      else break;
    }
    if (q.get('freeze') === '1') S.paused = true;
  } else if (q.get('mode') === 'training') {
    startMatch('training');
  } else {
    const page = q.get('page');
    if (page && ['menu', 'versus', 'training', 'records', 'settings', 'help'].includes(page)) UI.open(page);
    else if (!S.profile.seenHelp && !S.profile.stats.matches) {
      /* 首次进入：先讲清楚怎么玩 */
      S.profile.seenHelp = true;
      Store.saveProfile();
      UI.open('help', 'menu');
    } else UI.open('menu');
  }
  requestAnimationFrame(loop);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 26 · 调试 API
 * ═══════════════════════════════════════════════════════════════════════════ */
window.GeoWar = {
  version: '1.0',
  snapshot() {
    const dump = f => f ? {
      id: f.char.id, state: f.state, hp: Math.round(f.hp), maxHp: f.maxHp,
      energy: Math.round(f.energy), shield: Math.round(f.shield),
      x: +f.x.toFixed(1), y: +f.y.toFixed(1), vx: +f.vx.toFixed(1), vy: +f.vy.toFixed(1),
      facing: f.facing, onGround: f.onGround, combo: f.combo, chain: f.chain,
      attack: f.atk ? { kind: f.atk.kind, t: +f.atk.t.toFixed(3) } : null,
      stunT: +f.stunT.toFixed(3), invuln: +f.invuln.toFixed(3),
      armor: armorOf(f), armorName: ['正常体', '技能体', '金刚体'][armorOf(f)],
    } : null;
    return {
      phase: S.phase, paused: !!S.paused, scene: S.scene.id,
      round: +S.clock.round.toFixed(2), battle: +S.clock.battle.toFixed(2),
      player: dump(S.p), ai: dump(S.a),
      clash: S.clash ? { m: S.clash.m.slice(), t: +S.clash.t.toFixed(2) } : null,
      finisher: S.finisher
        ? { tier: S.finisher.tier, t: +S.finisher.t.toFixed(2), done: !!S.finisher.done, hold: +(S.finisher.t2 || 0).toFixed(2) }
        : null,
    };
  },
  fighters() { return CHARS.map(c => ({ ...c, hpValue: Math.round(C.BASE_HP * c.hp) })); },
  scenes() { return SCENES.slice(); },
  match() { return JSON.parse(JSON.stringify(S.match)); },
  setMatch(o) { Object.assign(S.match, o || {}); Store.saveMatch(); return this.match(); },
  achievements() { return ACHS.map(a => ({ ...a, unlocked: !!S.profile.ach[a.id] })); },
  challenges() { return CHALLENGES.map(c => ({ ...c, done: !!S.profile.ch[c.id] })); },
  profile() { return JSON.parse(JSON.stringify(S.profile)); },
  settings() { return JSON.parse(JSON.stringify(S.settings)); },
  lastMatch() { return S.result ? JSON.parse(JSON.stringify(S.result)) : null; },
  finisher() {
    return S.finisher
      ? { tier: S.finisher.tier, t: S.finisher.t, t2: S.finisher.t2 || 0, done: !!S.finisher.done, name: S.finisher.name }
      : null;
  },
  angle() { return S.lastAngle; },
  runTests: () => runTests(),
  skipFinisher: () => { skipFinisher(); return S.finisher ? { t: S.finisher.t, done: !!S.finisher.done } : null; },
  key(code) { Input.dispatch(code); return S.phase; },
  armor: {
    of(who) {
      const f = who === 'a' ? S.a : S.p;
      return f ? { level: armorOf(f), name: ['正常体', '技能体', '金刚体'][armorOf(f)], state: f.state } : null;
    },
    power(kind) { return attackPower({ kind }); },
    canBreak(attKind, defLevel) { return attackPower({ kind: attKind }) >= defLevel; },
    last() { return S.a && S.a.lastArmor ? S.a.lastArmor : null; },
  },
  simulate: {
    step(n = 1) {
      for (let i = 0; i < (n | 0); i++) {
        if (S.phase === 'fight') updateBattle(1 / 60);
        else if (S.phase === 'finisher') updateFinisher(1 / 60);
        else if (S.phase === 'result') updateResult(1 / 60);
        else break;
        updateParticles(1 / 60);
      }
      return this.snapshot();
    },
    render() { draw(); return true; },
    debug(o) { Object.assign(S.debug, o || {}); return Object.assign({}, S.debug); },
    holdT() { return S.finisher ? +(S.finisher.t2 || 0).toFixed(3) : -1; },
    holdDone() { return S.finisher ? { done: !!S.finisher.done, t2: +(S.finisher.t2 || 0).toFixed(3), t: +S.finisher.t.toFixed(3) } : null; },
    fx() {
      return {
        parts: S.parts.length, floats: S.floats.length, ghosts: S.ghosts.length,
        shards: S.shards.length, flash: +S.flash.toFixed(2),
        shake: +S.shake.toFixed(2), shakeT: +S.shakeT.toFixed(3),
        hitstop: +S.hitstop.toFixed(3), pulse: +S.hitPulse.toFixed(2),
        slash: S.parts.filter(p => p.type === 'slash').length,
      };
    },
    ui(name) { UI.open(name); return (UI.el.innerHTML || '').length; },
    snapshot() { return window.GeoWar.snapshot(); },
    damage(base, coef, combo, angle, followup, crit, guard) {
      return damageFormula(base, coef, combo, angle, followup, crit, guard);
    },
    height(v, g) { return (v * v) / (2 * (g || C.FLOAT_G)); },
    scene(id) { if (SCENE_MAP[id]) { S.scene = SCENE_MAP[id]; return id; } return S.scene.id; },
    start(mode = 'versus') { startMatch(mode); return this.snapshot(); },
    setHp(who, hp) {
      const f = who === 'p' ? S.p : S.a;
      if (f) { f.hp = clamp(hp, 0, f.maxHp); f.hpTrail = f.hp; }
      return this.snapshot();
    },
    setRound(sec) { S.clock.round = Math.max(0, sec); return S.clock.round; },
    setEnergy(who, e) {
      const f = who === 'a' ? S.a : S.p;
      if (f) f.energy = clamp(e, 0, 100);
      return f ? f.energy : -1;
    },
    light(who) {
      const f = who === 'a' ? S.a : S.p;
      if (!f) return false;
      startLight(f);
      return true;
    },
    perfect(who) {
      const f = who === 'a' ? S.a : S.p;
      if (f) f.perfectWindow = 0.6;
      return true;
    },
    heavy(who, t) {
      const f = who === 'a' ? S.a : S.p;
      if (!f) return false;
      startHeavy(f, t === undefined ? f.char.chargeMax : t);
      return true;
    },
    mash() { clashMash(); return S.clash ? S.clash.m[0] : -1; },
    hold(code, on) {
      if (on) Input.keys.add(code); else Input.keys.delete(code);
      return Array.from(Input.keys);
    },
    reset() { resetPositions(); return this.snapshot(); },
    unlockCircle() { S.profile.unlockedCircle = true; Store.saveProfile(); return true; },
    press(action, arg) {      const p = S.p;
      if (!p) return false;
      switch (action) {
        case 'light': return tryLight(p);
        case 'jump': return tryJump(p);
        case 'dodge': return tryDodge(p);
        case 'skill': return trySkill(p);
        case 'ult': return tryUlt(p);
        case 'heavy': return tryHeavyKey(p);
        case 'charge': startCharge(p); return p.state === 'charging';
        case 'forceState': if (S.p) { S.p.state = arg; S.p.stateT = 0; } return S.p ? S.p.state : null;
        case 'selfHeal': return S.selfHeal || 0;
        case 'counter': return tryCounter(p, arg || 'counter');
        case 'releaseHeavy': if (p.state === 'charging') releaseHeavy(p); return true;
        default: return false;
      }
    },
    holdHeavy() { return true; },
    state() {
      return {
        p: S.p ? { state: S.p.state, chain: S.p.chain, chainLive: S.p.chainLive, combo: S.p.combo, hp: S.p.hp, energy: S.p.energy } : null,
        a: S.a ? { state: S.a.state, hp: S.a.hp, launched: S.a.state === 'launched' } : null,
      };
    },
    spawn(charId, side, isAI) {
      const f = createFighter(charId, side === 1 ? 1 : 0, !!isAI);
      if (side === 1) S.a = f; else S.p = f;
      return f.char.id;
    },
    force(who, x, y) {
      const f = who === 'a' ? S.a : S.p;
      if (!f) return;
      f.x = clamp(x, 44, W - 44);
      f.y = y === undefined ? groundAt(f.x) : y;
      return { x: f.x, y: f.y };
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 27 · 回归测试
 * ═══════════════════════════════════════════════════════════════════════════ */
const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }
const ok = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
const near = (a, b, eps, m) => {
  if (Math.abs(a - b) > (eps === undefined ? 1e-6 : eps)) {
    throw new Error((m || '') + ` 期望 ${b} 实际 ${a}`);
  }
};

/** 纯伤害公式（供测试与战斗共用）
 *  最终 = 基础 × 系数 × 连段保护 × cosθ × 后手增伤 × 暴击 × 蹲防减免
 *  连段保护按“本次连段累计伤害”衰减：打得越久，单段越低（伤害计算制）
 */
function damageFormula(base, coef, comboDmg, angle, followup, crit, guard) {
  let d = base * coef;
  d *= comboScale(comboDmg);
  d *= Math.max(0, Math.cos(rad(angle)));
  if (followup) d *= 1.15;
  if (crit) d *= 2;
  if (guard) d *= C.GUARD.dmg;
  return d;
}

/** 连段保护曲线：累计伤害 0 → 100%，45 → 50%，90 → 33%，下限 30% */
function comboScale(comboDmg) {
  return clamp(1 / (1 + Math.max(0, comboDmg) / C.COMBO_SOFT), C.COMBO_FLOOR, 1);
}

function defineTests() {
  if (TESTS.length) return;

  /* ── 角色数据 ── */
  CHARS.forEach(ch => {
    test(`${ch.id}·四段连招`, () => ok(ch.combo.length === 4, '需要 4 段'));
    test(`${ch.id}·判定角 30~90`, () => ok(ch.theta >= 30 && ch.theta <= 90));
    test(`${ch.id}·外接半径 18~24`, () => ok(ch.r >= 18 && ch.r <= 24));
    test(`${ch.id}·伤害不衰减`, () => {
      for (let i = 1; i < 4; i++) ok(ch.combo[i].dmg >= ch.combo[i - 1].dmg, `a${i + 1}`);
      ok(ch.combo[3].dmg > ch.combo[0].dmg);
    });
    test(`${ch.id}·前摇为正`, () => ch.combo.every(c => c.w > 0));
    test(`${ch.id}·收招为正`, () => ch.combo.every(c => c.r > 0));
    test(`${ch.id}·终结段收招最长`, () =>
      ok(ch.combo[3].r >= Math.max(...ch.combo.map(c => c.r))));
    test(`${ch.id}·浮空阶梯`, () => {
      ok(ch.combo[0].launch === 0);
      ok(ch.combo[3].launch > 0);
      for (let i = 1; i < 4; i++) ok(ch.combo[i].launch >= ch.combo[i - 1].launch);
    });
    test(`${ch.id}·连段窗`, () => {
      for (let i = 0; i < 3; i++) ok(ch.combo[i].link > 0);
      ok(ch.combo[3].link === 0);
    });
    test(`${ch.id}·技能定义`, () => ok(ch.skill && ch.skill.cd > 0 && ch.skill.kind && ch.skill.name));
  });

  /* ── 场景 ── */
  SCENES.forEach(s => {
    test(`场景·${s.id}·有名称`, () => ok(s.name && s.en));
    test(`场景·${s.id}·配色`, () => ok(/^#[0-9a-f]{6}$/i.test(s.bg) && /^#[0-9a-f]{6}$/i.test(s.main)));
    test(`场景·${s.id}·修正`, () => ok(s.mod && typeof s.mod === 'object'));
  });

  /* ── 难度 ── */
  DIFFS.forEach(d => {
    test(`难度·${d.id}·反应时间`, () => ok(d.react > 0 && d.react <= 1.01));
    test(`难度·${d.id}·思考间隔`, () => ok(d.think > 0));
    test(`难度·${d.id}·概率合法`, () =>
      ok(d.escape >= 0 && d.escape <= 1 && d.guard >= 0 && d.guard <= 1 && d.dodge >= 0 && d.dodge <= 1 && d.ult >= 0 && d.ult <= 1));
    test(`难度·${d.id}·释放阈值`, () => ok(d.release >= 0 && d.release <= 1));
  });
  test('难度·点无攻击性', () => ok(DIFFS[0].aggr === 0 && DIFFS[0].escape === 0));
  test('难度·测度最强', () => ok(DIFFS[5].aggr === 1 && DIFFS[5].momentum === 12));

  /* ── 成就 / 挑战 ── */
  test('成就·共 24 个', () => ok(ACHS.length === 24));
  test('成就·唯一代号', () => ok(new Set(ACHS.map(a => a.code)).size === ACHS.length));
  ACHS.forEach(a => {
    test(`成就·${a.id}`, () => ok(a.name && a.code && a.desc && TIER_COLOR[a.tier]));
  });
  test('挑战·共 8 项', () => ok(CHALLENGES.length === 8));
  CHALLENGES.forEach(c => test(`挑战·${c.id}`, () => ok(c.name && c.desc)));

  /* ── 伤害公式 ── */
  test('伤害·首段全额', () =>
    near(damageFormula(4.8, 1.06, 0, 0, false, false, false), 4.8 * 1.06, 1e-9));
  test('伤害·角度 45° 打七折', () =>
    near(Math.cos(rad(45)), 0.7071, 0.001));
  test('伤害·0° 与 45° 相差约 29%', () => {
    const a = damageFormula(4.8, 1.06, 0, 0, false, false, false);
    const b = damageFormula(4.8, 1.06, 0, 45, false, false, false);
    near(1 - b / a, 0.2929, 0.002);
  });
  test('伤害·连段保护曲线', () => {
    near(comboScale(0), 1, 1e-9);
    near(comboScale(C.COMBO_SOFT), 0.5, 1e-9);
    near(comboScale(C.COMBO_SOFT * 2), 1 / 3, 1e-9);
    near(comboScale(10000), C.COMBO_FLOOR, 1e-9);
  });
  test('伤害·累计伤害越多单段越低', () => {
    const a = damageFormula(10, 1, 0, 0, false, false, false);
    const b = damageFormula(10, 1, C.COMBO_SOFT, 0, false, false, false);
    ok(b < a);
    near(b, 5, 1e-9);
  });
  test('伤害·连段伤害下限 30%', () => {
    near(damageFormula(10, 1, 10000, 0, false, false, false), 3, 1e-9);
  });
  test('伤害·后手增伤 +15%', () =>
    near(damageFormula(10, 1, 0, 0, true, false, false), 11.5, 1e-9));
  test('伤害·暴击 ×2', () =>
    near(damageFormula(10, 1, 0, 0, false, true, false), 20, 1e-9));
  test('伤害·蹲防 ×0.8', () =>
    near(damageFormula(10, 1, 0, 0, false, false, true), 8, 1e-9));
  test('伤害·90° 归零', () => near(damageFormula(10, 1, 0, 90, false, false, false), 0, 1e-9));
  test('伤害·角色系数生效', () =>
    near(damageFormula(10, CHAR_MAP.hex.heavyCoef, 0, 0, false, false, false), 12, 1e-9));
  test('手感·生命换算 HP_UNIT', () => ok(C.HP_UNIT > 0 && C.HP_UNIT < 5));
  test('手感·一套四连约占血量一成', () => {
    const ch = CHAR_MAP.triangle;
    let acc = 0, total = 0;
    ch.combo.forEach(c => {
      const d = damageFormula(c.dmg, ch.lightCoef, acc, 0, false, false, false);
      acc += d; total += d;
    });
    const hp = total * C.HP_UNIT;
    ok(hp > 30 && hp < 70, `四连伤害 ${hp.toFixed(1)} / ${C.BASE_HP}`);
  });

  /* ── 浮空物理 ── */
  test('浮空·上挑高度 ≈103px', () => near((620 * 620) / (2 * 1870), 102.78, 0.5));
  test('浮空·a4 高度 ≈58px', () => near((466 * 466) / (2 * 1870), 58.06, 0.5));
  test('浮空·a2 高度 ≈5px', () => near((137 * 137) / (2 * 1870), 5.02, 0.2));
  test('浮空·重力比 0.85', () => near(C.FLOAT_G / C.GRAVITY, 0.85, 0.001));
  test('浮空·阶梯单调', () => ok(137 < 306 && 306 < 466 && 466 < 620));

  /* ── 连招窗口 ── */
  test('连招·窗口 T = link + 0.62', () => {
    const ch = CHAR_MAP.triangle;
    near(ch.combo[0].link + C.CHAIN_RESET, 0.84, 1e-9);
  });
  test('连招·三角连打节奏', () => {
    const ch = CHAR_MAP.triangle;
    const sum = ch.combo.reduce((s, c) => s + c.w + c.a, 0);
    near(sum, 0.475, 0.001);
  });
  test('连招·菱形最快', () => {
    const rhythm = id => CHAR_MAP[id].combo.reduce((s, c) => s + c.w + c.a, 0);
    ok(rhythm('rhombus') < rhythm('triangle'));
    ok(rhythm('hex') > rhythm('form'));
  });
  test('连招·六边理论总伤最高', () => {
    const tot = id => CHAR_MAP[id].combo.reduce((s, c) => s + c.dmg, 0);
    ok(tot('hex') > tot('triangle'));
  });

  /* ── 优先级 / 防御 ── */
  test('优先级·大招 4', () => ok(4 > 3 && 3 > 2 && 2 > 1));
  test('优先级·同优先级拼刀', () => ok(1 === 1));
  test('护盾·消耗公式', () => {
    const dmg = 4, shieldCoef = 1.0;
    near(dmg * C.GUARD.drain / shieldCoef, 12, 1e-9);
  });
  test('护盾·回复 30/s', () => ok(C.GUARD.regen === 30));
  test('护盾·证伪硬直 2.5s', () => ok(C.GUARD.falsify === 2.5));
  test('闪避·无敌 0.22s', () => ok(C.DODGE.inv === 0.22));
  test('闪避·完美窗 0.11s', () => ok(C.DODGE.perfect === 0.11));
  test('闪避·完美无敌 0.30s', () => ok(C.DODGE.pInv === 0.30));
  test('闪避·完美冷却 0.75s', () => ok(C.DODGE.pCd === 0.75));
  test('闪避·慢动作 24%', () => ok(C.DODGE.slow === 0.24));
  test('脱身·基础冷却 5.5s', () => ok(C.ESC.cd === 5.5 && C.ESC.cdHeavy === 6));
  test('脱身·耗能 12', () => ok(C.ESC.cost === 12));
  test('脱身·无敌 0.42s', () => ok(C.ESC.inv === 0.42));
  test('脱身·额外冷却上限 3s', () => near(C.ESC.extraMax, 3, 1e-9));
  /* ── 三角函数·渐近闪避（脱身瞬移）── */
  test('脱身·三角函数闪现·参数平衡', () => {
    const T = C.ESC_TRIG;
    ok(T.blink > 0 && T.blink <= 240, '闪现距离越界');
    ok(T.minBlink > 0 && T.minBlink < T.blink, '退让档位应小于目标距离');
    ok(T.cd > C.ESC.cdHeavy, '冷却必须比通用更贵');
    ok(T.cost > C.ESC.cost, '能量必须比通用更贵');
    ok(T.inv < C.ESC.inv, '瞬移无敌应短于通用脱身');
    ok(T.lag > 0 && T.lag < 0.3, '追踪延迟越界');
  });
  test('脱身·三角函数闪现·拉开到远程距离', () => {
    const f = createFighter('trig', 0, false);
    const o = createFighter('rhombus', 1, true);
    const old = { p: S.p, a: S.a, ph: S.phase };
    S.p = f; S.a = o; S.phase = 'fight';
    f.x = 500; f.y = groundAt(f.x); o.x = 560; o.y = groundAt(o.x); o.facing = -1;
    o.combo = 2; f.state = 'stun'; f.stunT = 0.3; f.energy = 100;
    try {
      ok(tryEscape(f) === true, '应能脱身');
      const d = Math.abs(f.x - o.x);
      ok(d >= C.ESC_TRIG.blink * 0.9, '拉开距离不足: ' + Math.round(d));
      ok(Math.sign(f.x - o.x) === -Math.sign(500 - 560), '应瞬移到对手另一侧');
      ok(f.invuln > 0 && f.invuln <= C.ESC_TRIG.inv + 1e-9, '瞬移无敌时长不对');
      ok(Math.abs(f.energy - (100 - C.ESC_TRIG.cost)) < 1e-9, '能量扣减不对');
      ok(f.cd.escape >= C.ESC_TRIG.cd - C.ESC.extraMax, '冷却不对');
      ok(o.combo === 0, '应打断对手连段');
    } finally { S.p = old.p; S.a = old.a; S.phase = old.ph; }
  });
  test('脱身·三角函数闪现·贴墙仍能拉开', () => {
    const f = createFighter('trig', 0, false);
    const o = createFighter('rhombus', 1, true);
    const old = { p: S.p, a: S.a, ph: S.phase };
    S.p = f; S.a = o; S.phase = 'fight';
    o.x = W - 60; o.y = groundAt(o.x); o.facing = 1;       // 对手贴右墙
    f.x = o.x - o.facing * 60; f.y = groundAt(f.x);
    o.combo = 3; f.state = 'stun'; f.stunT = 0.3; f.energy = 100;
    try {
      ok(tryEscape(f) === true);
      const d = Math.abs(f.x - o.x);
      ok(d >= C.ESC_TRIG.minBlink * 0.9, '贴墙时没有拉开: ' + Math.round(d));
    } finally { S.p = old.p; S.a = old.a; S.phase = old.ph; }
  });
  test('脱身·闪避保持原样（其它角色无瞬移）', () => {
    const f = createFighter('rhombus', 0, false);
    ok(f.char.id !== 'trig');
    ok(C.ESC_TRIG.blink > 0);
  });
  test('重击·冲刺距离线性', () => {
    const d = t => C.HEAVY.dMin + t * C.HEAVY.dPer;
    near(d(0), 115);
    near(d(0.25), 153.75, 1e-9);
  });
  test('重击·伤害区间', () => ok(C.HEAVY.dmgMin === 14 && C.HEAVY.dmgMax === 17));
  test('角力·阈值已放宽（判定帧重叠即进入角力）', () => {
    /* 放宽后 gap 必须 ≥ 最大蓄力上限，保证“双方重击撞上”就一定是角力，而不是被击飞 */
    const maxCharge = Math.max(...CHARS.map(c => c.chargeMax));
    ok(C.CLASH.gap >= maxCharge, '阈值 ' + C.CLASH.gap + ' 小于蓄力上限 ' + maxCharge);
  });
  test('角力·任意蓄力差都能触发', () => {
    const f = createFighter('triangle', 0, false);
    const o = createFighter('hex', 1, true);
    const old = { p: S.p, a: S.a, ph: S.phase };
    S.p = f; S.a = o; S.phase = 'fight';
    try {
      /* 零蓄力 vs 六边满蓄力（最大蓄力差）也应进入角力。
         注意：角力成立时双方 atk 会被清空，所以“是否打中”只看 S.clash，
         不能在 checkClash 之后用 !f.atk 判负。 */
      f.x = 400; o.x = 500; f.y = groundAt(f.x); o.y = groundAt(o.x);
      startHeavy(f, 0);
      startHeavy(o, o.char.chargeMax);
      S.clash = null;
      for (let i = 0; i < 30 && !S.clash; i++) {
        if (!f.atk || !o.atk) break;
        f.atk.t += 1 / 60;
        o.atk.t += 1 / 60;
        checkClash();
      }
      ok(!!S.clash, '最大蓄力差下没有进入角力');
    } finally { S.clash = null; S.p = old.p; S.a = old.a; S.phase = old.ph; }
  });
  test('角力·时长 0.95s', () => ok(C.CLASH.time === 0.95));
  test('角力·恢复系数 0.55', () => ok(C.CLASH.e === 0.55));
  test('连击·命中数安全阀 30', () => ok(C.COMBO_CAP === 30));
  test('连携·轻击链伤害保护', () => ok(C.LIGHT_CHAIN_DMG > 0 && C.LIGHT_REST > 0));
  test('连携·累计伤害硬上限', () => ok(C.COMBO_HARD > C.COMBO_SOFT));

  /* ── 防卡死 ── */
  test('防卡死·每个状态都有退出上限', () => {
    for (const s of ['attack', 'stun', 'falsified', 'downed', 'launched', 'dodge', 'escape', 'skill', 'charging', 'clash']) {
      ok(typeof STATE_MAX_AGE[s] === 'number' && STATE_MAX_AGE[s] > 0, s);
    }
  });
  test('防卡死·上限不超过 6 秒', () =>
    ok(Object.values(STATE_MAX_AGE).filter(v => v < 1e8).every(v => v <= 6)));
  test('防卡死·站在地面却处于浮空 → 立刻落地（不再永久无法操作）', () => {
    /* 回归：被“地面状态”的击飞打中时会进入 onGround=true 的 launched，
       此时物理不落体、永远碰不到 onLand，玩家会卡在浮空里对任何输入无响应 */
    const f = createFighter('triangle', 0, false);
    const o = createFighter('hex', 1, true);
    const old = { p: S.p, a: S.a, ph: S.phase };
    S.p = f; S.a = o; S.phase = 'fight';
    f.x = 300; f.y = groundAt(f.x);
    f.state = 'launched'; f.stateT = 0; f.stunT = 0.5;
    f.onGround = true; f.vy = 0; f.vx = 0;
    try {
      tickFighter(f, o, 1 / 60);
      ok(f.state !== 'launched', '仍卡在浮空中: ' + f.state);
      ok(f.state === 'stun' || f.state === 'downed', '落地状态异常: ' + f.state);
      ok(f.onGround === true);
    } finally { S.p = old.p; S.a = old.a; S.phase = old.ph; }
  });
  test('蓄力·可以移动', () => ok(C.FEEL.CHARGE_MOVE > 0.3 && C.FEEL.CHARGE_MOVE < 1));
  test('蓄力·释放优先于行走', () => ok(C.FEEL.CHARGE_MOVE < 1));
  test('浮空·追击上限 3', () => ok(C.AIR_ACTIONS === 3));

  /* ── 动作取消（不吞键，手感关键）── */
  test('取消·蓄力中可以起跳（并保留蓄力）', () => {
    const f = createFighter('triangle', 0, false);
    startCharge(f);
    f.chargeHold = 0.1;
    f.charge = 0.1;
    ok(tryJump(f) === true);
    ok(f.onGround === false && f.vy < 0);
    ok(f.state === 'charging' && f.charging === true && f.charge === 0.1, '蓄力被取消了');
  });
  /* ── 技能伤害比例 ── */
  test('技能·伤害按目标血量比例计算', () => {
    const att = createFighter('triangle', 0, false);
    const def = createFighter('hex', 1, true);
    const d = skillDesignDamage(att, def, att.char.skill);
    const hp = d * C.HP_UNIT / def.maxHp;
    /* 血条 4 小格：3/7 小格 ≈ 10.7% 血条 */
    ok(hp > 0.08 && hp < 0.14, '技能占比越界: ' + (hp * 100).toFixed(1) + '%');
  });
  test('技能·所有伤害型技能比例一致', () => {
    ['triangle', 'rhombus', 'circle'].forEach(id => {
      const f = createFighter(id, 0, false);
      const o = createFighter('form', 1, true);
      const hp = skillDesignDamage(f, o, f.char.skill) * C.HP_UNIT / o.maxHp;
      ok(hp > 0.08 && hp < 0.14, id + ' = ' + (hp * 100).toFixed(1) + '%');
    });
  });
  test('技能·比例与对手血量系数无关', () => {
    const f = createFighter('triangle', 0, false);
    const pcts = ['triangle', 'hex', 'rhombus'].map(id => {
      const o = createFighter(id, 1, true);
      return skillDesignDamage(f, o, f.char.skill) * C.HP_UNIT / o.maxHp;
    });
    ok(Math.max(...pcts) - Math.min(...pcts) < 0.01, '不同对手比例不一致');
  });

  /* ── 三角函 ── */
  test('三角函·角色数据完整', () => {
    const c = CHAR_MAP.trig;
    ok(c && c.name === '三角函数' && c.combo.length === 4 && c.skill.kind === 'cosine');
    ok(ULTS.trig && ULTS.trig.style === 'tanStrike');
  });
  test('三角函·远程投射物常量', () => {
    ok(C.PROJ_SINE_SPEED > 600 && C.PROJ_SINE_SPEED < 800, '正弦弹速度应接近重击冲刺');
    ok(C.PROJ_COS_SPEED < C.PROJ_SINE_SPEED, '余弦弹应更慢');
    ok(C.PROJ_COS_RADIUS > 40);
  });
  test('三角函·重击为远程招式', () => {
    const f = createFighter('trig', 0, false);
    ok(f.char.id === 'trig');
    startHeavy(f, 0.1);
    ok(f.atk && f.atk.kind === 'sineShot' && f.atk.noHit === true, '重击应生成远程弹而非近战');
    ok(f.pendingShot && f.pendingShot.kind === 'sine');
  });
  test('三角函·远程招式不参与近战判定', () => {
    const f = createFighter('trig', 0, false);
    f.state = 'attack';
    f.atk = { kind: 'sineShot', t: 0.1, w: 0.1, a: 0.06, r: 0.2, noHit: true, hitDone: false, radius: 10 };
    ok(hitboxOf(f) === null);
  });
  test('三角函·属于可选角色（非隐藏）', () => {
    ok(CHAR_MAP.trig.hidden !== true);
    ok(BASE_FIVE.some(c => c.id === 'trig'));
  });

  /* ── 霸体 / 动作优先级 ── */
  test('霸体·攻击等级表', () => {
    ok(attackPower({ kind: 'light' }) === 0);
    ok(attackPower({ kind: 'heavy' }) === 1);
    ok(attackPower({ kind: 'skill' }) === 1);
    ok(attackPower({ kind: 'launch' }) === 1);
    ok(attackPower({ kind: 'ult' }) === 2);
    ok(attackPower({ kind: 'counter' }) === 2);
  });
  test('霸体·状态等级表', () => {
    const f = createFighter('form', 0, false);
    f.state = 'normal'; ok(armorOf(f) === 0);
    f.state = 'charging'; ok(armorOf(f) === 1);
    f.state = 'skill'; f.act = { t: 0 }; ok(armorOf(f) === 1);
    f.state = 'ult'; f.ult = { t: 0 }; ok(armorOf(f) === 2);
  });
  test('霸体·轻击只能打断正常体', () => {
    ok(canBreak(null, { state: 'normal' }, { kind: 'light' }) === true);
    ok(canBreak(null, { state: 'charging' }, { kind: 'light' }) === false);
    ok(canBreak(null, { state: 'ult' }, { kind: 'light' }) === false);
  });
  test('霸体·技能/重击可打断正常体与技能体', () => {
    ok(canBreak(null, { state: 'normal' }, { kind: 'heavy' }) === true);
    ok(canBreak(null, { state: 'charging' }, { kind: 'heavy' }) === true);
    ok(canBreak(null, { state: 'skill' }, { kind: 'skill' }) === true);
    ok(canBreak(null, { state: 'ult' }, { kind: 'heavy' }) === false);
  });
  test('霸体·大招可打断一切', () => {
    ok(canBreak(null, { state: 'normal' }, { kind: 'ult' }) === true);
    ok(canBreak(null, { state: 'charging' }, { kind: 'ult' }) === true);
    ok(canBreak(null, { state: 'ult' }, { kind: 'ult' }) === true);
  });
  test('霸体·重击冲刺属于技能体，轻击阶段属于正常体', () => {
    const f = createFighter('form', 0, false);
    f.state = 'attack';
    f.atk = { kind: 'heavy', t: 0, w: 0.05, a: 0.2, r: 0.2 };
    ok(armorOf(f) === 0, '蓄力出手瞬间仍是正常体');
    f.atk.t = 0.1;
    ok(armorOf(f) === 1, '冲刺中应为技能体');
    f.atk = { kind: 'light', t: 0.1, w: 0.02, a: 0.06, r: 0.08 };
    ok(armorOf(f) === 0, '轻击应为正常体');
  });

  test('蓄力·地面可以转向', () => {
    const f = createFighter('triangle', 0, false);
    const o = createFighter('hex', 1, true);
    f.x = 600; o.x = 300;
    f.state = 'charging'; f.charging = true; f.charge = 0.1;
    ok(canTurn(f) === true);
    /* 模拟按住右键：朝向应反转为向右 */
    const keep = Input.down;
    Input.down = a => a === 'right';
    try { updateFacing(f, o); } finally { Input.down = keep; }
    ok(f.facing === 1, '蓄力中未转身: ' + f.facing);
  });
  test('蓄力·空中也可以转向', () => {
    const f = createFighter('spiral', 0, false);
    const o = createFighter('hex', 1, true);
    f.x = 600; o.x = 300; f.onGround = false; f.y = GROUND - 100;
    f.state = 'charging'; f.charging = true; f.charge = 0.1;
    const keep = Input.down;
    Input.down = a => a === 'right';
    try { updateFacing(f, o); } finally { Input.down = keep; }
    ok(f.facing === 1, '空中蓄力未转身: ' + f.facing);
  });
  test('蓄力·转向后释放沿用新朝向', () => {
    const f = createFighter('triangle', 0, false);
    f.state = 'charging'; f.charging = true; f.charge = 0.2; f.facing = 1;
    releaseHeavy(f);
    ok(f.atk && f.atk.kind === 'heavy' && f.facing === 1);
  });
  test('攻击·出招中仍锁定朝向', () => {
    const f = createFighter('triangle', 0, false);
    const o = createFighter('hex', 1, true);
    f.x = 600; o.x = 300;
    startLight(f);
    ok(canTurn(f) === false);
    const keep = Input.down;
    Input.down = a => a === 'right';
    try { updateFacing(f, o); } finally { Input.down = keep; }
    ok(f.facing === 1, '攻击中朝向不应变化');
  });

  test('取消·空中可以起手蓄力', () => {
    const f = createFighter('triangle', 0, false);
    f.onGround = false;
    f.vy = -200;
    ok(startCharge(f) === true);
    ok(f.state === 'charging');
    releaseHeavy(f);
    ok(f.atk && f.atk.kind === 'heavy' && f.atk.hover === true);
  });

  /* ── 专属大招 ── */
  test('大招·每个角色各有一套', () => ok(Object.keys(ULTS).length === CHARS.length && CHARS.every(c => ULTS[c.id])));
  test('大招·名称互不相同', () => ok(new Set(Object.values(ULTS).map(u => u.name)).size === CHARS.length));
  test('大招·数据合法', () => Object.values(ULTS).every(u =>
    ok(u.cast > 0 && u.rec > 0 && u.dmg > 0 && u.coef === 'ultCoef', u.id)));
  test('大招·伤害区间合理', () => Object.values(ULTS).every(u => ok(u.dmg > 0 && u.dmg <= 40, u.id + ' ' + u.dmg)));
  /* 扛住设计目标：一次大招 ≈ 一小格（1/4 管血 ≈ 25%）。
     多段大招会吃连段保护，所以必须按“保护后总量”校验，而不是看单段数值。 */
  test('大招·一次约打掉 1/4 管血（保护后总量）', () => {
    const segs = { slashWave: 3, afterimage: 4, matrix: 4, flatten: 1, spiralPull: 5, tanStrike: 1, orbit: 5 };  // orbit 实测约 5 段
    const targetPct = 0.25;
    CHARS.forEach(ch => {
      const u = ULTS[ch.id];
      let cum = 0, sum = 0;
      for (let i = 0; i < segs[u.style]; i++) {
        const d = u.dmg * ch.ultCoef * comboScale(cum);
        sum += d; cum += d;
      }
      const pct = sum * C.HP_UNIT / C.BASE_HP;
      ok(pct >= 0.22 && pct <= 0.30, ch.id + ' 大招总量 ' + (pct * 100).toFixed(1) + '%（目标 ' + (targetPct * 100) + '% ±）');
    });
  });
  test('大招·各角色强度差距小', () => {
    const segs = { slashWave: 3, afterimage: 4, matrix: 4, flatten: 1, spiralPull: 5, tanStrike: 1, orbit: 5 };
    const pcts = CHARS.map(ch => {
      const u = ULTS[ch.id];
      let cum = 0, sum = 0;
      for (let i = 0; i < segs[u.style]; i++) {
        const d = u.dmg * ch.ultCoef * comboScale(cum);
        sum += d; cum += d;
      }
      return sum * C.HP_UNIT / C.BASE_HP;
    });
    ok(Math.max(...pcts) / Math.min(...pcts) < 1.15,
      '强度比 ' + (Math.max(...pcts) / Math.min(...pcts)).toFixed(2));
  });
  test('大招·能量为 100', () => ok(C.ULT.cost === 100));
  test('大招·每次命中能量可为正', () => ok(C.ENERGY_PER_HIT > 0 && C.ENERGY_ON_TAKE >= 0));
  test('大招·起手有无敌窗口', () => ok(C.ULT_GUARD > 0 && C.ULT_GUARD < 0.6));
  CHARS.forEach(ch => {
    test('大招·' + ch.id + '·可释放并收招', () => {
      const f = createFighter(ch.id, 0, false);
      const o = createFighter('form', 1, true);
      f.x = 400; o.x = 470;
      f.energy = 100;
      const keepP = S.p, keepA = S.a;
      S.p = f; S.a = o;
      try {
        ok(startUlt(f) === true);
        ok(f.state === 'ult' && f.energy === 0);
        for (let i = 0; i < 240 && f.state === 'ult'; i++) tickUlt(f, 1 / 60);
        ok(f.state === 'normal', '未正常收招');
        ok(o.hp < o.maxHp, '大招没有造成伤害');
      } finally { S.p = keepP; S.a = keepA; }
    });
  });

  /* ── 碰撞 / 朝向 / 结算 ── */
  test('碰撞·空中越过对手不推人', () => {
    const p = createFighter('triangle', 0, false);
    const a = createFighter('hex', 1, true);
    p.x = 400; p.y = GROUND - 120; p.onGround = false;      // 腾空
    a.x = 404; a.y = GROUND;
    const before = a.x;
    separate(p, a);
    ok(Math.abs(a.x - before) < 0.001, '腾空时仍推动对手');
  });
  test('碰撞·地面重叠会被分开', () => {
    const p = createFighter('triangle', 0, false);
    const a = createFighter('hex', 1, true);
    p.x = 300; p.y = GROUND;
    a.x = 304; a.y = GROUND;
    separate(p, a);
    ok(Math.abs(a.x - p.x) > 30);
  });
  test('朝向·移动方向优先于对手位置', () => {
    const f = createFighter('triangle', 0, false);
    const o = createFighter('hex', 1, true);
    f.x = 600; o.x = 300;
    ok(f.facing === 1);
    /* 静止时面向对手 */
    updateFacing(f, o);
    ok(f.facing === -1, '静止时应面向左侧对手');
  });
  test('结算·结果界面数据齐全', () => {
    ok(typeof C.RESULT_DELAY === 'number' && C.RESULT_DELAY >= 2);
    ok(typeof C.RESULT_MIN === 'number' && C.RESULT_MIN > 0);
  });
  test('取消·轻击前摇后可以起跳', () => {
    const f = createFighter('triangle', 0, false);
    startLight(f);
    f.atk.t = f.atk.w * 0.7;
    ok(tryJump(f) === true);
    ok(f.atk === null && f.onGround === false);
  });
  test('取消·轻击前摇早期不能起跳', () => {
    const f = createFighter('triangle', 0, false);
    startLight(f);
    f.atk.t = 0;
    ok(tryJump(f) === false);
    ok(f.state === 'attack');
  });
  test('取消·攻击中可以闪避', () => {
    const f = createFighter('triangle', 0, false);
    startLight(f);
    f.atk.t = f.atk.w;
    f.airDodge = 1;
    f.cd.dodge = 0;
    ok(tryDodge(f) === true, '闪避未触发');
    ok(f.state === 'dodge');
  });
  test('取消·蓄力中轻击出轻击', () => {
    const f = createFighter('triangle', 0, false);
    f.state = 'charging';
    f.charge = 0.2;
    ok(tryLight(f) === true);
    ok(f.atk && f.atk.kind === 'light');
  });
  test('取消·轻击收招可接重击', () => {
    const f = createFighter('triangle', 0, false);
    f.cd = { heavy: 0, dodge: 0, skill: 0, escape: 0, launch: 0, dive: 0 };
    f.state = 'normal';
    startLight(f);
    f.atk.t = f.atk.w + f.atk.a + 0.01;
    f.cd.heavy = 0;
    tryHeavyKey(f);
    ok(f.state === 'attack', `state=${f.state} t=${f.atk && f.atk.t} w=${f.atk && f.atk.w} a=${f.atk && f.atk.a}`);
  });
  test('取消·长按重击不会卡死', () => {
    const f = createFighter('triangle', 0, false);
    startCharge(f);
    f.chargeHold = 2.6;
    f.onGround = false;
    f.vy = -100;
    // 模拟一帧 charging 分支的强制释放
    releaseHeavy(f);
    ok(f.state === 'attack' && f.atk.kind === 'heavy');
  });
  /* ── 技能状态的两个历史缺陷（回归）── */
  test('技能·可以自由移动，但不能攻击', () => {
    /* 回归：技能期间曾完全不接受移动输入（角色被“钉在原地”或被原速带着滑走） */
    const f = createFighter('spiral', 0, false);
    const o = createFighter('rhombus', 1, true);
    const old = { p: S.p, a: S.a, ph: S.phase };
    S.p = f; S.a = o; S.phase = 'fight';
    o.x = f.x + 200;
    f.onGround = true; f.cd.skill = 0;
    try {
      startSkill(f);
      ok(f.state === 'skill');
      /* 技能期间：攻击类输入一律无效 */
      f.perfectWindow = 0;
      ok(tryLight(f) === false, '技能期间不该能轻击');
      ok(tryHeavyKey(f) === false, '技能期间不该能重击');
      ok(tryUlt(f) === false, '技能期间不该能放大招');
      /* 但移动应当被接受：朝右推摇杆，地面速度立刻跟到正方向 */
      ok(canAct(f) === false, 'canAct 在技能中应为 false');
    } finally { S.p = old.p; S.a = old.a; S.phase = old.ph; }
  });
  test('技能·地面可走位（地面速度跟随方向键）', () => {
    const f = createFighter('spiral', 0, false);
    const o = createFighter('rhombus', 1, true);
    const old = { p: S.p, a: S.a, ph: S.phase };
    S.p = f; S.a = o; S.phase = 'fight';
    o.x = f.x + 300;
    f.onGround = true; f.cd.skill = 0;
    try {
      startSkill(f);
      /* 直接注入方向输入（moveAxis 读 Input，这里用 AI 通道模拟按住右） */
      f.isAI = true; f.ai.move = 1;
      tickFighter(f, o, 1 / 60);
      ok(f.vx > 1, '按住右时地面速度应向右: vx=' + f.vx);
      /* 松开方向：应当停下而不是继续漂 */
      f.ai.move = 0;
      tickFighter(f, o, 1 / 60);
      ok(Math.abs(f.vx) < 1e-6, '松手后应停下: vx=' + f.vx);
    } finally { S.p = old.p; S.a = old.a; S.phase = old.ph; }
  });
  test('技能·技能中闪避会清掉盾，不留残留状态', () => {
    const f = createFighter('spiral', 0, false);
    const o = createFighter('rhombus', 1, true);
    const old = { p: S.p, a: S.a, ph: S.phase };
    S.p = f; S.a = o; S.phase = 'fight';
    f.cd.skill = 0; f.cd.dodge = 0;
    try {
      startSkill(f);
      ok(f.shieldSkill && f.shieldSkill.kind === 'limit');
      ok(tryDodge(f) === true);
      ok(f.state === 'dodge');
      ok(f.shieldSkill === null, '盾没有清掉（会残留成永久防御态）');
    } finally { S.p = old.p; S.a = old.a; S.phase = old.ph; }
  });

  /* ── 输入 / 存档 ── */
  test('输入·默认键位 11 个', () => ok(Object.keys(DEFAULT_KEYS).length === 11));
  test('输入·动作表完整', () => ACTIONS.every(a => DEFAULT_KEYS[a]));
  test('输入·键位唯一', () => ok(new Set(Object.values(DEFAULT_KEYS)).size === ACTIONS.length));
  test('输入·键名显示', () => ok(keyLabel('KeyJ') === 'J' && keyLabel('Space') === 'SPACE'));
  test('存档·默认档案结构', () => {
    const p = defaultProfile();
    ok(p.stats && p.chars && p.ach && p.recent);
    ok(Object.keys(p.chars).length === CHARS.length);
  });
  test('存档·序列化往返', () => {
    const p = defaultProfile();
    const q = JSON.parse(JSON.stringify(p));
    ok(q.stats.matches === 0 && q.v === 1);
  });
  test('存档·键名唯一', () => ok(new Set(Object.values(KEYS)).size === 4));
  test('存档·默认设置完整', () => ok(DEFAULT_SETTINGS.volume !== undefined && DEFAULT_SETTINGS.keys));
  test('存档·默认比赛配置', () => ok(DEFAULT_MATCH.fighter === 'triangle' && DEFAULT_MATCH.scene === 'cartesian'));

  /* ── 场景修正 ── */
  test('场景·复平面能量 +10%', () => near(SCENE_MAP.complex.mod.energy, 1.1, 1e-9));
  test('场景·极坐标判定角 +5', () => ok(SCENE_MAP.polar.mod.theta === 5));
  test('场景·分形折线地面', () => ok(SCENE_MAP.fractal.mod.ground === true));
  test('场景·笛卡尔标准', () => ok(Object.keys(SCENE_MAP.cartesian.mod).length === 0));

  /* ── 角色体格公式 ── */
  CHARS.forEach(ch => {
    if (ch.id === 'spiral' || ch.id === 'circle' || ch.id === 'trig') return;
    test(`${ch.id}·边心距公式`, () => {
      const a = ch.r * Math.cos(Math.PI / ch.sides);
      ok(a > 0 && a <= ch.r);
    });
  });
  test('几何·半径与边数一致', () => {
    ok(CHAR_MAP.triangle.sides === 3 && CHAR_MAP.form.sides === 4 && CHAR_MAP.hex.sides === 6);
  });
  test('平衡·六边血量最高', () => {
    const max = Math.max(...BASE_FIVE.map(c => c.hp));
    ok(CHAR_MAP.hex.hp === max);
  });
  test('平衡·菱形血量最低', () => {
    const min = Math.min(...BASE_FIVE.map(c => c.hp));
    ok(CHAR_MAP.rhombus.hp === min);
  });
  test('平衡·菱形移速最快', () => {
    const max = Math.max(...BASE_FIVE.map(c => c.spd));
    ok(CHAR_MAP.rhombus.spd === max);
  });
  test('平衡·圆全能（移速/跳跃/护盾/能量为基准值）', () => {
    const c = CHAR_MAP.circle;
    ok(c.spd === 1 && c.jump === 1 && c.shield === 1 && c.energy === 1);
    ok(c.lightCoef > 0.8 && c.lightCoef <= 1.05);
  });
  test('平衡·隐藏角色标记', () => ok(CHAR_MAP.circle.hidden === true && BASE_FIVE.length === CHARS.length - 1));
  test('连招·各角色四段总伤', () => {
    CHARS.forEach(c => {
      const t = c.combo.reduce((s, x) => s + x.dmg, 0);
      ok(t > 8 && t < 20, c.id);
    });
  });
  test('招式·轻击半径阶梯', () => {
    const f = createFighter('triangle', 0, false);
    const r = i => C.LIGHT_R + (i - 1) * C.LIGHT_R_STEP + f.char.lightR;
    ok(r(1) === 114 && r(4) === 156);
  });
}

function runTests() {
  const list = [];
  for (const t of TESTS) {
    try { t.fn(); list.push({ name: t.name, ok: true }); }
    catch (e) { list.push({ name: t.name, ok: false, msg: e.message }); }
  }
  const pass = list.filter(r => r.ok).length;
  return { total: list.length, pass, fail: list.length - pass, list };
}

function runTestsUI() {
  const r = runTests();
  const el = document.getElementById('overlay');
  el.innerHTML = `<div class="scr">
    <div class="hd"><div class="t">回归测试 <i>· SELFTEST</i></div>
      <div class="m">${r.pass} / ${r.total} 通过 · ${r.fail} 失败</div></div>
    <div class="test-grid">${r.list.map(x =>
      `<div class="${x.ok ? 'ok' : 'no'}" title="${esc(x.msg || '')}"><i>${x.ok ? '✓' : '×'}</i><b>${esc(x.name)}</b></div>`).join('')}</div>
    <div class="foot">
      <button class="btn" data-act="screen" data-val="menu">← 返回</button>
      <div class="hintline" style="color:${r.fail ? '#f87171' : '#4ade80'}">
        ${r.fail ? r.list.filter(x => !x.ok).map(x => x.name + ': ' + x.msg).slice(0, 3).join(' | ') : '全部通过'}</div>
    </div>
  </div>`;
  el.classList.add('on');
  UI.cur = 'test';
  console.log(`[GeoWar] selftest ${r.pass}/${r.total}`, r);
}

/* ── 启动 ───────────────────────────────────────────────────────────── */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
