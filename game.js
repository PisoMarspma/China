const TAU = Math.PI * 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const now = () => performance.now();

class Input {
  constructor(targetEl) {
    this.keys = new Set();
    this.keysOnce = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.targetEl = targetEl;

    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.keysOnce.add(e.code);
      this.keys.add(e.code);

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    const updateMouse = (e) => {
      const r = this.targetEl.getBoundingClientRect();
      const sx = this.targetEl.width / r.width;
      const sy = this.targetEl.height / r.height;
      this.mouse.x = (e.clientX - r.left) * sx;
      this.mouse.y = (e.clientY - r.top) * sy;
    };

    this.targetEl.addEventListener("mousemove", (e) => updateMouse(e));
    this.targetEl.addEventListener("mousedown", (e) => {
      if (this.targetEl.focus) this.targetEl.focus();
      this.mouse.down = true;
      updateMouse(e);
    });
    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });
  }

  isDown(code) {
    return this.keys.has(code);
  }

  consumeOnce(code) {
    if (!this.keysOnce.has(code)) return false;
    this.keysOnce.delete(code);
    return true;
  }

  endFrame() {
    this.keysOnce.clear();
  }
}

class Starfield {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.stars = Array.from({ length: 160 }, () => ({
      x: rand(0, w),
      y: rand(0, h),
      z: rand(0.15, 1),
      tw: rand(0, TAU),
    }));
    this.vx = 0;
    this.vy = 0;
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
  }

  update(dt) {
    for (const s of this.stars) {
      s.x += this.vx * s.z * dt;
      s.y += this.vy * s.z * dt;
      s.tw += dt * (0.8 + s.z * 1.4);
      if (s.x < -20) s.x = this.w + 20;
      if (s.x > this.w + 20) s.x = -20;
      if (s.y < -20) s.y = this.h + 20;
      if (s.y > this.h + 20) s.y = -20;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const s of this.stars) {
      const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(s.tw));
      const r = 0.6 + s.z * 1.6;
      ctx.fillStyle = `rgba(120, 190, 255, ${a * s.z})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}

class FX {
  constructor() {
    this.particles = [];
    this.shake = 0;
    this.shakeDecay = 0.9;
  }

  burst(x, y, color, count = 18, power = 170) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(power * 0.4, power);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.35, 0.8),
        t: 0,
        color,
        r: rand(1.2, 3.4),
      });
    }
  }

  addShake(amount = 10) {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt) {
    this.shake *= Math.pow(this.shakeDecay, dt * 60);
    this.particles = this.particles.filter((p) => {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.2, dt);
      p.vy *= Math.pow(0.2, dt);
      return p.t < p.life;
    });
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const t = p.t / p.life;
      const a = (1 - t) * (1 - t);
      ctx.fillStyle = `${p.color}${Math.floor(a * 255)
        .toString(16)
        .padStart(2, "0")}`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.7 + 0.7 * (1 - t)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

class AudioLite {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this.enabled = false;
      return;
    }
    this.ctx = new AC();
  }

  async resume() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  blip(type = "square", freq = 440, dur = 0.08, gain = 0.05) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;

    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    o.type = type;
    o.frequency.setValueAtTime(freq, t0);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g);
    g.connect(this.ctx.destination);

    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
}

class GameBase {
  constructor(core) {
    this.core = core;
  }
  onEnter() {}
  onExit() {}
  update(_dt) {}
  draw(_ctx) {}
  onResize(_w, _h) {}
  get title() {
    return "";
  }
  get hint() {
    return "";
  }
}

class TankGame extends GameBase {
  constructor(core) {
    super(core);
    this.walls = [];
    this.bullets = [];
    this.player = null;
    this.enemy = null;
    this.cooldown = 0;
    this.enemyCooldown = 0;
    this.over = false;
  }

  get title() {
    return "坦克大战";
  }

  get hint() {
    return "方向键 移动 | 空格开火 | Esc 返回";
  }

  onEnter() {
    const { w, h } = this.core;
    this.over = false;
    this.bullets = [];

    this.walls = [
      { x: w * 0.2, y: h * 0.4, r: 28 },
      { x: w * 0.5, y: h * 0.55, r: 36 },
      { x: w * 0.8, y: h * 0.35, r: 26 },
      { x: w * 0.35, y: h * 0.7, r: 24 },
      { x: w * 0.65, y: h * 0.25, r: 22 },
    ];

    this.player = {
      x: w * 0.22,
      y: h * 0.72,
      a: -Math.PI / 2,
      hp: 100,
      color: "#78beff",
    };

    this.enemy = {
      x: w * 0.78,
      y: h * 0.28,
      a: Math.PI / 2,
      hp: 100,
      color: "#ff6ece",
      brainT: 0,
      targetA: 0,
    };

    this.cooldown = 0;
    this.enemyCooldown = 0;

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  shoot(from, speed, color, dmg = 12) {
    const { fx, audio } = this.core;
    const muzzle = 18;
    const bx = from.x + Math.cos(from.a) * muzzle;
    const by = from.y + Math.sin(from.a) * muzzle;

    this.bullets.push({
      x: bx,
      y: by,
      vx: Math.cos(from.a) * speed,
      vy: Math.sin(from.a) * speed,
      life: 2.2,
      t: 0,
      r: 4,
      color,
      dmg,
    });

    fx.burst(bx, by, color, 10, 180);
    fx.addShake(6);
    audio.blip("square", 180 + rand(-20, 20), 0.06, 0.045);
  }

  stepTank(t, dt, isPlayer) {
    const input = this.core.input;

    const turn = 3.2;
    const accel = 360;
    const drag = 0.15;

    if (isPlayer) {
      const speed = 260;
      let dx = 0;
      let dy = 0;
      if (input.isDown("ArrowLeft")) dx -= 1;
      if (input.isDown("ArrowRight")) dx += 1;
      if (input.isDown("ArrowUp")) dy -= 1;
      if (input.isDown("ArrowDown")) dy += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        t.x += dx * speed * dt;
        t.y += dy * speed * dt;
        t.a = Math.atan2(dy, dx);
      }

      // zero inertia for player
      t.vx = 0;
      t.vy = 0;

      if (input.consumeOnce("Space") && this.cooldown <= 0 && !this.over) {
        this.cooldown = 0.28;
        this.shoot(t, 520, "#78beff", 12);
      }
    } else {
      const e = t;
      e.brainT -= dt;
      if (e.brainT <= 0) {
        e.brainT = rand(0.35, 0.7);
        const angToPlayer = Math.atan2(this.player.y - e.y, this.player.x - e.x);
        e.targetA = angToPlayer + rand(-0.35, 0.35);
      }

      const da = ((e.targetA - e.a + Math.PI) % TAU) - Math.PI;
      e.a += clamp(da, -turn * dt, turn * dt);

      const d = Math.hypot(this.player.x - e.x, this.player.y - e.y);
      const dir = d > 210 ? 1 : d < 140 ? -1 : 0;

      e.vx = (e.vx != null ? e.vx : 0) + Math.cos(e.a) * accel * dir * dt;
      e.vy = (e.vy != null ? e.vy : 0) + Math.sin(e.a) * accel * dir * dt;

      if (this.enemyCooldown <= 0 && !this.over) {
        const aim = Math.abs(da);
        if (aim < 0.25 && d < 520) {
          this.enemyCooldown = rand(0.35, 0.55);
          this.shoot(e, 500, "#ff6ece", 10);
        }
      }
    }

    t.vx *= Math.pow(drag, dt);
    t.vy *= Math.pow(drag, dt);
    t.x += t.vx * dt;
    t.y += t.vy * dt;

    this.resolveCollisions(t);
  }

  resolveCollisions(t) {
    const { w, h } = this.core;
    const bodyR = 16;

    if (t.x < bodyR) {
      t.x = bodyR;
      t.vx *= -0.25;
    }
    if (t.x > w - bodyR) {
      t.x = w - bodyR;
      t.vx *= -0.25;
    }
    if (t.y < bodyR) {
      t.y = bodyR;
      t.vy *= -0.25;
    }
    if (t.y > h - bodyR) {
      t.y = h - bodyR;
      t.vy *= -0.25;
    }

    for (const wall of this.walls) {
      const dx = t.x - wall.x;
      const dy = t.y - wall.y;
      const d = Math.hypot(dx, dy);
      const minD = wall.r + bodyR;
      if (d < minD) {
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        const push = minD - d;
        t.x += nx * push;
        t.y += ny * push;
        const vn = (t.vx != null ? t.vx : 0) * nx + (t.vy != null ? t.vy : 0) * ny;
        t.vx -= vn * nx * 1.2;
        t.vy -= vn * ny * 1.2;
      }
    }
  }

  update(dt) {
    const { w, h, fx, audio } = this.core;

    this.cooldown -= dt;
    this.enemyCooldown -= dt;

    if (!this.over) {
      this.stepTank(this.player, dt, true);
      this.stepTank(this.enemy, dt, false);
    }

    for (const b of this.bullets) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < 0 || b.x > w) b.vx *= -1;
      if (b.y < 0 || b.y > h) b.vy *= -1;

      for (const wall of this.walls) {
        const dx = b.x - wall.x;
        const dy = b.y - wall.y;
        const d = Math.hypot(dx, dy);
        if (d < wall.r + b.r) {
          const nx = dx / (d || 1);
          const ny = dy / (d || 1);
          const vn = b.vx * nx + b.vy * ny;
          b.vx -= 2 * vn * nx;
          b.vy -= 2 * vn * ny;
          b.x = wall.x + nx * (wall.r + b.r + 0.5);
          b.y = wall.y + ny * (wall.r + b.r + 0.5);
          fx.burst(b.x, b.y, "#78beff", 6, 120);
          audio.blip("sine", 300 + rand(-60, 60), 0.05, 0.03);
        }
      }

      const hitTank = (tank) => {
        const dx = b.x - tank.x;
        const dy = b.y - tank.y;
        return Math.hypot(dx, dy) < 16 + b.r;
      };

      if (!this.over) {
        if (b.color === "#78beff" && hitTank(this.enemy)) {
          this.enemy.hp -= b.dmg;
          b.t = b.life;
          fx.burst(b.x, b.y, "#ff6ece", 20, 240);
          fx.addShake(10);
          audio.blip("triangle", 120, 0.08, 0.06);
        } else if (b.color === "#ff6ece" && hitTank(this.player)) {
          this.player.hp -= b.dmg;
          b.t = b.life;
          fx.burst(b.x, b.y, "#78beff", 20, 240);
          fx.addShake(10);
          audio.blip("triangle", 140, 0.08, 0.06);
        }
      }
    }

    this.bullets = this.bullets.filter((b) => b.t < b.life);

    if (!this.over && (this.player.hp <= 0 || this.enemy.hp <= 0)) {
      this.over = true;
      const win = this.player.hp > 0;
      fx.burst(w * 0.5, h * 0.5, win ? "#78beff" : "#ff6ece", 60, 420);
      fx.addShake(16);
      audio.blip("sawtooth", win ? 220 : 140, 0.18, 0.07);
      this.core.toast(win ? "你赢了！按 Esc 返回菜单" : "你输了！按 Esc 返回菜单");
    }
  }

  draw(ctx) {
    const { w, h } = this.core;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Arena vignette
    const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 50, w * 0.5, h * 0.5, w * 0.65);
    g.addColorStop(0, "rgba(120,190,255,0.06)");
    g.addColorStop(1, "rgba(0,0,0,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // walls
    for (const wall of this.walls) {
      ctx.fillStyle = "rgba(130, 170, 255, 0.12)";
      ctx.beginPath();
      ctx.arc(wall.x, wall.y, wall.r, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = "rgba(120, 190, 255, 0.22)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const drawTank = (t) => {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.a);

      // glow
      ctx.fillStyle = `${t.color}18`;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();

      // body
      ctx.fillStyle = `${t.color}cc`;
      roundRect(ctx, -16, -12, 32, 24, 7);
      ctx.fill();

      // turret
      ctx.fillStyle = `${t.color}ff`;
      roundRect(ctx, -6, -6, 24, 12, 6);
      ctx.fill();

      // muzzle
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      roundRect(ctx, 16, -2.6, 10, 5.2, 2.6);
      ctx.fill();

      ctx.restore();

      // hp bar
      const barW = 110;
      const barH = 8;
      const x = t.x - barW / 2;
      const y = t.y - 34;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, x, y, barW, barH, 6);
      ctx.fill();
      ctx.fillStyle = `${t.color}cc`;
      roundRect(ctx, x, y, (barW * clamp(t.hp, 0, 100)) / 100, barH, 6);
      ctx.fill();
    };

    drawTank(this.player);
    drawTank(this.enemy);

    // bullets
    for (const b of this.bullets) {
      ctx.fillStyle = `${b.color}cc`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();

      ctx.fillStyle = `${b.color}28`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3.2, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}

class TetrisGame extends GameBase {
  // 常量
  static GRID_W = 10;
  static GRID_H = 20;
  static CELL_SIZE = 22;
  static INITIAL_DROP_INTERVAL = 0.7;
  static MIN_DROP_INTERVAL = 0.12;
  static SPEED_INCREASE_PER_LEVEL = 0.06;
  static LINES_PER_LEVEL = 10;
  static SCORE_TABLE = [0, 100, 300, 500, 800];
  static WALL_KICK_OFFSETS = [0, -1, 1, -2, 2];

  constructor(core) {
    super(core);
    this.gridW = TetrisGame.GRID_W;
    this.gridH = TetrisGame.GRID_H;
    this.cell = TetrisGame.CELL_SIZE;
    this.board = [];
    this.bag = [];
    this.currentPiece = null;
    this.nextPiece = null;
    this.dropTimer = 0;
    this.dropInterval = TetrisGame.INITIAL_DROP_INTERVAL;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.over = false;
    this.piecesCache = null;
  }

  get title() {
    return "俄罗斯方块";
  }

  get hint() {
    return "←→ 移动 | ↑ 旋转 | ↓ 加速下落 | 空格硬降 | Esc 返回";
  }

  onEnter() {
    this.over = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropInterval = TetrisGame.INITIAL_DROP_INTERVAL;
    this.dropTimer = 0;

    this.board = Array.from({ length: this.gridH }, () => Array(this.gridW).fill(0));
    this.bag = [];
    this.currentPiece = this.spawn();
    this.nextPiece = this.spawn();

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  pieces() {
    // 缓存方块定义，避免重复创建
    if (this.piecesCache) return this.piecesCache;

    // 4x4 matrices (row-major)
    this.piecesCache = {
      I: {
        color: "#78beff",
        m: [
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
      O: {
        color: "#ffe08a",
        m: [
          [0, 1, 1, 0],
          [0, 1, 1, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
      T: {
        color: "#ff6ece",
        m: [
          [0, 1, 0, 0],
          [1, 1, 1, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
      S: {
        color: "#84ffb3",
        m: [
          [0, 1, 1, 0],
          [1, 1, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
      Z: {
        color: "#ff8b8b",
        m: [
          [1, 1, 0, 0],
          [0, 1, 1, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
      J: {
        color: "#a8a4ff",
        m: [
          [1, 0, 0, 0],
          [1, 1, 1, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
      L: {
        color: "#ffd29a",
        m: [
          [0, 0, 1, 0],
          [1, 1, 1, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
    };

    return this.piecesCache;
  }

  refillBag() {
    const keys = Object.keys(this.pieces());
    // Fisher-Yates shuffle
    for (let i = keys.length - 1; i > 0; i--) {
      const j = randi(0, i);
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    this.bag.push(...keys);
  }

  spawn() {
    if (this.bag.length === 0) this.refillBag();
    const type = this.bag.shift();
    const pieceDef = this.pieces()[type];
    return {
      type,
      color: pieceDef.color,
      matrix: pieceDef.m.map((row) => row.slice()),
      x: 3,
      y: -1,
    };
  }

  rotate(matrix) {
    const n = 4;
    const rotated = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        rotated[x][n - 1 - y] = matrix[y][x];
      }
    }
    return rotated;
  }

  collide(piece, offsetX = 0, offsetY = 0, matrix = null) {
    const m = matrix != null ? matrix : piece.matrix;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!m[y][x]) continue;
        const gx = piece.x + x + offsetX;
        const gy = piece.y + y + offsetY;
        if (gx < 0 || gx >= this.gridW || gy >= this.gridH) return true;
        if (gy >= 0 && this.board[gy][gx]) return true;
      }
    }
    return false;
  }

  lock() {
    const { fx, audio } = this.core;
    const piece = this.currentPiece;

    // 将当前方块锁定到棋盘
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!piece.matrix[y][x]) continue;
        const gx = piece.x + x;
        const gy = piece.y + y;
        if (gy < 0) {
          this.gameOver();
          return;
        }
        if (gx >= 0 && gx < this.gridW && gy >= 0 && gy < this.gridH) {
          this.board[gy][gx] = piece.color;
        }
      }
    }

    audio.blip("square", 320, 0.05, 0.04);

    // 消行检测
    const cleared = this.clearLines();

    if (cleared > 0) {
      const scoreGain = (TetrisGame.SCORE_TABLE[cleared] || 0) * this.level;
      this.score += scoreGain;
      this.lines += cleared;
      this.level = 1 + Math.floor(this.lines / TetrisGame.LINES_PER_LEVEL);
      this.dropInterval = Math.max(
        TetrisGame.MIN_DROP_INTERVAL,
        TetrisGame.INITIAL_DROP_INTERVAL - (this.level - 1) * TetrisGame.SPEED_INCREASE_PER_LEVEL
      );

      fx.burst(this.core.w * 0.52, this.core.h * 0.52, "#78beff", 40 + cleared * 10, 340);
      fx.addShake(10);
      audio.blip("triangle", 520, 0.08, 0.05);
    }

    // 生成下一个方块
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.spawn();
    if (this.collide(this.currentPiece, 0, 0)) {
      this.gameOver();
    }
  }

  clearLines() {
    let cleared = 0;
    for (let y = this.gridH - 1; y >= 0; y--) {
      if (this.board[y].every((cell) => cell)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(this.gridW).fill(0));
        cleared++;
        y++; // 重新检查当前行
      }
    }
    return cleared;
  }

  gameOver() {
    if (this.over) return;
    const { fx, audio } = this.core;
    this.over = true;
    fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#ff6ece", 80, 480);
    fx.addShake(16);
    audio.blip("sawtooth", 150, 0.2, 0.08);
    this.core.toast("游戏结束！按 Esc 返回菜单");
  }

  update(dt) {
    const input = this.core.input;
    const piece = this.currentPiece;

    if (this.over || !piece) return;

    // 左右移动
    if (input.consumeOnce("ArrowLeft") && !this.collide(piece, -1, 0)) {
      piece.x -= 1;
    }
    if (input.consumeOnce("ArrowRight") && !this.collide(piece, 1, 0)) {
      piece.x += 1;
    }

    // 旋转（带 wall-kick）
    if (input.consumeOnce("ArrowUp")) {
      const rotatedMatrix = this.rotate(piece.matrix);
      for (const kick of TetrisGame.WALL_KICK_OFFSETS) {
        if (!this.collide(piece, kick, 0, rotatedMatrix)) {
          piece.matrix = rotatedMatrix;
          piece.x += kick;
          this.core.audio.blip("sine", 520, 0.04, 0.03);
          break;
        }
      }
    }

    // 硬降
    if (input.consumeOnce("Space")) {
      let steps = 0;
      while (!this.collide(piece, 0, 1)) {
        piece.y += 1;
        steps++;
      }
      this.score += steps * 2;
      this.lock();
      this.dropTimer = 0;
      return;
    }

    // 自动下落
    const fastDrop = input.isDown("ArrowDown") ? 0.06 : this.dropInterval;
    this.dropTimer += dt;
    if (this.dropTimer >= fastDrop) {
      this.dropTimer = 0;
      if (!this.collide(piece, 0, 1)) {
        piece.y += 1;
      } else {
        this.lock();
      }
    }
  }

  draw(ctx) {
    const { w, h } = this.core;
    const cell = this.cell;

    const boardW = this.gridW * cell;
    const boardH = this.gridH * cell;
    const ox = Math.floor(w * 0.5 - boardW * 0.5);
    const oy = Math.floor(h * 0.5 - boardH * 0.5);

    // panel
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, ox - 14, oy - 14, boardW + 28, boardH + 28, 18);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,190,255,0.18)";
    ctx.lineWidth = 2;
    roundRect(ctx, ox - 14, oy - 14, boardW + 28, boardH + 28, 18);
    ctx.stroke();

    // grid
    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const px = ox + x * cell;
        const py = oy + y * cell;
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.fillRect(px, py, cell - 1, cell - 1);
        const c = this.board[y][x];
        if (c) {
          drawCell(ctx, px, py, cell, c);
        }
      }
    }

    // current piece + ghost
    if (!this.over) {
      // ghost
      const current = this.currentPiece;
      if (!current || !current.matrix) return;

      let gy = current.y;
      while (true) {
        const probe = { ...current, y: gy };
        if (this.collide(probe, 0, 1)) break;
        gy += 1;
        if (gy > this.gridH + 4) break;
      }
      const ghost = { ...current, y: gy, color: current.color + "55" };
      drawPiece(ctx, ghost, ox, oy, cell, true);

      drawPiece(ctx, current, ox, oy, cell);
    }

    // sidebar
    const sx = ox + boardW + 26;
    const sy = oy + 8;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, sx, sy, 170, 170, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,110,206,0.16)";
    ctx.lineWidth = 2;
    roundRect(ctx, sx, sy, 170, 170, 16);
    ctx.stroke();

    ctx.fillStyle = "rgba(235,245,255,0.9)";
    ctx.font = "700 14px system-ui";
    ctx.fillText("NEXT", sx + 12, sy + 26);
    if (this.nextPiece && this.nextPiece.matrix) {
      drawPiece(ctx, { ...this.nextPiece, x: 1, y: 1 }, sx + 22, sy + 40, cell);
    }

    ctx.fillStyle = "rgba(235,245,255,0.7)";
    ctx.font = "600 13px system-ui";
    ctx.fillText(`Score: ${this.score}`, sx + 12, sy + 198);
    ctx.fillText(`Lines: ${this.lines}`, sx + 12, sy + 220);
    ctx.fillText(`Level: ${this.level}`, sx + 12, sy + 242);

    ctx.restore();
  }
}

class ShooterGame extends GameBase {
  constructor(core) {
    super(core);
    this.player = null;
    this.bullets = [];
    this.enemies = [];
    this.pBullets = [];
    this.spawnT = 0;
    this.shotT = 0;
    this.score = 0;
    this.over = false;
  }

  get title() {
    return "打飞机";
  }

  get hint() {
    return "鼠标移动或方向键 | 空格连发 | 生命归零结束 | Esc 返回";
  }

  onEnter() {
    const { w, h } = this.core;

    this.player = { x: w * 0.5, y: h * 0.82, hp: 100, inv: 0 };
    this.bullets = [];
    this.enemies = [];
    this.pBullets = [];
    this.spawnT = 0;
    this.shotT = 0;
    this.score = 0;
    this.over = false;

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 80;
  }

  spawnEnemy() {
    const { w } = this.core;
    const x = rand(60, w - 60);
    const y = -30;
    const hp = randi(18, 30);
    const sp = rand(70, 120);
    this.enemies.push({ x, y, vx: rand(-25, 25), vy: sp, hp, r: 18, shot: rand(0.5, 1.2) });
  }

  update(dt) {
    const { w, h, input, fx, audio } = this.core;
    if (this.over) return;

    // movement
    const target = input.mouse;
    const useMouse = true;

    let dx = 0;
    let dy = 0;
    if (input.isDown("ArrowLeft")) dx -= 1;
    if (input.isDown("ArrowRight")) dx += 1;
    if (input.isDown("ArrowUp")) dy -= 1;
    if (input.isDown("ArrowDown")) dy += 1;

    if (Math.abs(dx) + Math.abs(dy) > 0) {
      this.player.x += dx * 340 * dt;
      this.player.y += dy * 340 * dt;
    } else if (useMouse) {
      this.player.x = lerp(this.player.x, target.x, 0.16);
      this.player.y = lerp(this.player.y, target.y, 0.16);
    }

    this.player.x = clamp(this.player.x, 22, w - 22);
    this.player.y = clamp(this.player.y, 22, h - 22);

    this.player.inv = Math.max(0, this.player.inv - dt);

    // shooting
    const shooting = input.isDown("Space") || input.mouse.down;
    this.shotT -= dt;
    if (shooting && this.shotT <= 0) {
      this.shotT = 0.12;
      this.pBullets.push({ x: this.player.x, y: this.player.y - 18, vx: 0, vy: -680, r: 4, t: 0, life: 1.2 });
      this.pBullets.push({ x: this.player.x - 10, y: this.player.y - 14, vx: -40, vy: -660, r: 3, t: 0, life: 1.1 });
      this.pBullets.push({ x: this.player.x + 10, y: this.player.y - 14, vx: 40, vy: -660, r: 3, t: 0, life: 1.1 });
      audio.blip("square", 520 + rand(-20, 20), 0.03, 0.03);
    }

    // enemy spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = rand(0.35, 0.55);
      this.spawnEnemy();
    }

    // update enemies
    for (const e of this.enemies) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.shot -= dt;
      if (e.shot <= 0) {
        e.shot = rand(0.8, 1.3);
        const a = Math.atan2(this.player.y - e.y, this.player.x - e.x);
        this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 4, t: 0, life: 3 });
        audio.blip("sine", 210 + rand(-40, 40), 0.05, 0.02);
      }
    }

    // update bullets
    for (const b of this.bullets) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    for (const b of this.pBullets) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    const hit = (ax, ay, ar, bx, by, br) => Math.hypot(ax - bx, ay - by) < ar + br;

    // player bullets -> enemies
    for (const pb of this.pBullets) {
      if (pb.t >= pb.life) continue;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (hit(pb.x, pb.y, pb.r, e.x, e.y, e.r)) {
          e.hp -= 12;
          pb.t = pb.life;
          fx.burst(pb.x, pb.y, "#78beff", 12, 240);
          if (e.hp <= 0) {
            this.score += 100;
            fx.burst(e.x, e.y, "#ff6ece", 36, 460);
            fx.addShake(10);
            audio.blip("triangle", 180, 0.12, 0.06);
          }
          break;
        }
      }
    }

    // enemy bullets -> player
    if (this.player.inv <= 0) {
      for (const eb of this.bullets) {
        if (eb.t >= eb.life) continue;
        if (hit(eb.x, eb.y, eb.r, this.player.x, this.player.y, 16)) {
          eb.t = eb.life;
          this.player.hp -= 14;
          this.player.inv = 0.6;
          fx.burst(this.player.x, this.player.y, "#ff8b8b", 26, 380);
          fx.addShake(14);
          audio.blip("sawtooth", 120, 0.12, 0.08);
          if (this.player.hp <= 0) {
            this.gameOver();
          }
          break;
        }
      }
    }

    // cleanup
    this.enemies = this.enemies.filter((e) => e.y < h + 60 && e.hp > -50);
    this.bullets = this.bullets.filter((b) => b.t < b.life && b.y < h + 60 && b.y > -60);
    this.pBullets = this.pBullets.filter((b) => b.t < b.life && b.y > -60);
  }

  gameOver() {
    if (this.over) return;
    const { fx, audio } = this.core;
    this.over = true;
    fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#ff6ece", 90, 560);
    fx.addShake(18);
    audio.blip("sawtooth", 110, 0.2, 0.09);
    this.core.toast(`你挂了！Score: ${this.score}（Esc 返回菜单）`);
  }

  draw(ctx) {
    const { w, h } = this.core;

    // score + hp
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 14px system-ui";
    ctx.fillText(`Score: ${this.score}`, 18, 26);

    // hp bar
    const barW = 240;
    const barH = 10;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, 18, 38, barW, barH, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(120,190,255,0.85)";
    roundRect(ctx, 18, 38, (barW * clamp(this.player.hp, 0, 100)) / 100, barH, 7);
    ctx.fill();

    ctx.restore();

    // player
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    const blink = this.player.inv > 0 ? 0.35 + 0.35 * Math.sin(now() * 0.03) : 1;
    ctx.globalAlpha = blink;

    ctx.fillStyle = "rgba(120,190,255,0.16)";
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(120,190,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-14, 18);
    ctx.lineTo(0, 10);
    ctx.lineTo(14, 18);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // enemies
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const e of this.enemies) {
      ctx.fillStyle = "rgba(255,110,206,0.22)";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 1.8, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "rgba(255,110,206,0.9)";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fill();

      // tiny hp
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, e.x - 18, e.y - 30, 36, 6, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,110,206,0.85)";
      roundRect(ctx, e.x - 18, e.y - 30, (36 * clamp(e.hp, 0, 30)) / 30, 6, 4);
      ctx.fill();
    }
    ctx.restore();

    // bullets
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.pBullets) {
      ctx.fillStyle = "rgba(120,190,255,0.85)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    for (const b of this.bullets) {
      ctx.fillStyle = "rgba(255,110,206,0.8)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // subtle bottom glow
    ctx.save();
    const g = ctx.createRadialGradient(w * 0.5, h * 1.08, 80, w * 0.5, h * 1.08, w * 0.8);
    g.addColorStop(0, "rgba(120,190,255,0.12)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

class BilliardsGame extends GameBase {
  constructor(core) {
    super(core);
    this.table = null;
    this.balls = [];
    this.pockets = [];
    this.score = 0;
    this.over = false;
    this.aiming = false;
    this.wasDown = false;
    this.spawnPositions = {};
    this.firstHit = null;
    this.turnPocketed = [];
    this.turnActive = false;
    this.scratch = false;
    this.targetBall = null;
    this.players = [
      { name: "玩家A", inHand: false },
      { name: "玩家B", inHand: false },
    ];
    this.currentTurn = 0;
    this.charging = false;
    this.charge = 0;
    this.chargeMax = 1.2;
  }

  get title() {
    return "台球（九球简化）";
  }

  get hint() {
    return "按住蓄力松开出杆 | 先打最小号 | 轮流对打 | R 重开 | Esc 返回";
  }

  onEnter() {
    const { w, h } = this.core;
    this.over = false;
    this.score = 0;
    this.aiming = false;
    this.wasDown = false;

    const padX = Math.max(70, w * 0.12);
    const padY = Math.max(50, h * 0.12);
    this.table = { l: padX, r: w - padX, t: padY, b: h - padY };

    const pocketR = 18;
    this.pockets = [
      { x: this.table.l, y: this.table.t },
      { x: (this.table.l + this.table.r) / 2, y: this.table.t - 2 },
      { x: this.table.r, y: this.table.t },
      { x: this.table.l, y: this.table.b },
      { x: (this.table.l + this.table.r) / 2, y: this.table.b + 2 },
      { x: this.table.r, y: this.table.b },
    ].map((p) => ({ ...p, r: pocketR }));

    this.setupBalls();
    this.firstHit = null;
    this.turnPocketed = [];
    this.turnActive = false;
    this.scratch = false;
    this.targetBall = this.lowestBallNumber();
    this.players[0].inHand = false;
    this.players[1].inHand = false;
    this.currentTurn = 0;
    this.charging = false;
    this.charge = 0;
    this.placeCueBall(this.defaultCueSpot().x, this.defaultCueSpot().y);

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  setupBalls() {
    const { w, h } = this.core;
    const rackX = w * 0.65;
    const rackY = h * 0.5;
    const r = 10;
    const gap = r * 2 + 1.5;

    const layout = [1, 2, 3, 2, 1];
    const positions = [];
    let idx = 0;
    for (let row = 0; row < layout.length; row++) {
      const count = layout[row];
      const x = rackX + row * gap * 0.95;
      const startY = rackY - (count - 1) * gap * 0.5;
      for (let c = 0; c < count && idx < 9; c++, idx++) {
        positions.push({ x, y: startY + c * gap });
      }
    }

    const numberOrder = [1, 2, 3, 4, 9, 5, 6, 7, 8];
    const colors = {
      1: "#ffe08a",
      2: "#78beff",
      3: "#ff8b8b",
      4: "#b38bff",
      5: "#ffb36b",
      6: "#6fd59a",
      7: "#b36565",
      8: "#2a2a2a",
      9: "#ffe4a8",
    };

    this.spawnPositions = {};

    this.balls = [
      { x: w * 0.28, y: h * 0.5, vx: 0, vy: 0, r, color: "#ffffff", cue: true },
      ...positions.map((p, i) => {
        const number = numberOrder[i];
        const ball = { x: p.x, y: p.y, vx: 0, vy: 0, r, color: colors[number], cue: false, number };
        this.spawnPositions[number] = { x: p.x, y: p.y };
        return ball;
      }),
    ];
  }

  allStopped() {
    return this.balls.every((b) => Math.hypot(b.vx, b.vy) < 5);
  }

  update(dt) {
    const { input, fx, audio } = this.core;
    const cueBall = this.balls.find((b) => b.cue);

    if (!cueBall) return;

    const current = this.players[this.currentTurn];

    if (this.turnActive && this.allStopped()) {
      this.finishTurn();
      return;
    }

    // 手中球放置
    if (!this.over && current.inHand && this.allStopped()) {
      if (input.mouse.down) {
        const p = this.clampToTable(input.mouse.x, input.mouse.y, cueBall.r);
        if (this.canPlaceCueBall(p.x, p.y, cueBall.r)) {
          this.placeCueBall(p.x, p.y);
          current.inHand = false;
        }
      }
    }

    // Input: drag to aim when balls stopped
    if (this.allStopped() && !this.over && !current.inHand) {
      if (input.mouse.down) {
        if (!this.charging) {
          this.charging = true;
          this.charge = 0;
        }
        this.charge = Math.min(this.chargeMax, this.charge + dt);
      }
      if (!input.mouse.down && this.charging) {
        this.fireHumanShot(cueBall, input, fx, audio);
      }
    } else {
      this.charging = false;
      this.aiming = false;
      this.wasDown = input.mouse.down;
    }

    // Physics
    this.simulate(dt);

    // win handled in finishTurn for 9-ball
  }

  simulate(dt) {
    const { l, r, t, b } = this.table;
    const damp = Math.pow(0.985, dt * 60);
    const balls = this.balls;
    const pocketed = [];

    // move
    for (const ball of balls) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vx *= damp;
      ball.vy *= damp;

      // cushions
      if (ball.x < l + ball.r) {
        ball.x = l + ball.r;
        ball.vx = Math.abs(ball.vx) * 0.98;
      }
      if (ball.x > r - ball.r) {
        ball.x = r - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.98;
      }
      if (ball.y < t + ball.r) {
        ball.y = t + ball.r;
        ball.vy = Math.abs(ball.vy) * 0.98;
      }
      if (ball.y > b - ball.r) {
        ball.y = b - ball.r;
        ball.vy = -Math.abs(ball.vy) * 0.98;
      }
    }

    // collisions
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const c = balls[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minD = a.r + c.r;
        if (dist > 0 && dist < minD) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minD - dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          c.x += nx * overlap * 0.5;
          c.y += ny * overlap * 0.5;
          const va = a.vx * nx + a.vy * ny;
          const vb = c.vx * nx + c.vy * ny;
          if (!this.firstHit && a.cue && !c.cue) this.firstHit = c.number;
          if (!this.firstHit && c.cue && !a.cue) this.firstHit = a.number;
          const p = vb - va;
          a.vx += p * nx;
          a.vy += p * ny;
          c.vx -= p * nx;
          c.vy -= p * ny;
        }
      }
    }

    // pockets
    for (const ball of balls) {
      for (const pocket of this.pockets) {
        const d = Math.hypot(ball.x - pocket.x, ball.y - pocket.y);
        if (d < pocket.r) {
          if (ball.cue) {
            ball.x = this.core.w * 0.28;
            ball.y = this.core.h * 0.5;
            ball.vx = ball.vy = 0;
            this.scratch = true;
          } else {
            pocketed.push(ball);
            this.score += 1;
          }
          this.core.fx.burst(ball.x, ball.y, ball.cue ? "#fff" : ball.color, 20, 260);
          this.core.audio.blip("sine", 320 + rand(-60, 60), 0.07, 0.05);
          break;
        }
      }
    }
    if (pocketed.length > 0) {
      this.turnPocketed.push(...pocketed.map((b) => ({ ...b })));
      this.balls = this.balls.filter((b) => !pocketed.includes(b));
    }
  }

  draw(ctx) {
    const { l, r, t, b } = this.table;
    const w = r - l;
    const h = b - t;
    const current = this.players[this.currentTurn];

    // table
    const g = ctx.createLinearGradient(l, t, r, b);
    g.addColorStop(0, "#0f3b2d");
    g.addColorStop(1, "#0c5d3e");
    ctx.fillStyle = g;
    roundRect(ctx, l - 12, t - 12, w + 24, h + 24, 16);
    ctx.fill();

    ctx.fillStyle = "#0b2a20";
    roundRect(ctx, l, t, w, h, 12);
    ctx.fill();

    // pockets
    ctx.fillStyle = "#050505";
    for (const p of this.pockets) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 2, 0, TAU);
      ctx.fill();
    }

    // aim helper
    const cue = this.balls.find((b) => b.cue);
    if (cue && this.allStopped() && !this.over) {
      this.drawAim(ctx, cue);
      if (this.charging) this.drawPowerArc(ctx, cue);
      if (current.inHand) this.drawPlaceHint(ctx, cue);
    }

    // balls
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ball of this.balls) {
      ctx.fillStyle = ball.color;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(ball.x - ball.r * 0.4, ball.y - ball.r * 0.4, ball.r * 0.35, 0, TAU);
      ctx.fill();

      if (!ball.cue && ball.number) {
        ctx.save();
        ctx.font = "700 10px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.strokeText(ball.number, ball.x, ball.y);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText(ball.number, ball.x, ball.y);
        ctx.restore();
      }
    }
    ctx.restore();

    // score
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "700 14px system-ui";
    ctx.fillText(`Score: ${this.score}`, l, t - 16);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "600 12px system-ui";
    if (this.targetBall) ctx.fillText(`目标球：${this.targetBall} 号`, l, t - 32);
    ctx.fillText(`回合：${current.name}`, l, t - 48);
    if (current.inHand && !this.over) ctx.fillText(`手中球：点击放置`, l, t - 64);
  }

  lowestBallNumber() {
    const remain = this.balls.filter((b) => !b.cue);
    if (remain.length === 0) return null;
    return Math.min(...remain.map((b) => b.number));
  }

  finishTurn() {
    if (!this.turnActive) return;
    this.turnActive = false;

    const lowest = this.lowestBallNumber();
    const foul = (lowest !== null && this.firstHit !== lowest) || this.scratch;
    const current = this.players[this.currentTurn];
    const opponent = this.players[1 - this.currentTurn];

    if (foul) {
      this.score = Math.max(0, this.score - this.turnPocketed.length);
      this.respotPocketed();
      const cue = this.balls.find((b) => b.cue);
      if (cue) {
        cue.x = this.core.w * 0.28;
        cue.y = this.core.h * 0.5;
        cue.vx = cue.vy = 0;
      }
      opponent.inHand = true;
      const msg = lowest ? `犯规：必须先击中 ${lowest} 号球` : "犯规";
      this.core.toast(msg);
      this.switchTurn();
    } else {
      const p9 = this.turnPocketed.find((b) => b.number === 9);
      if (p9) {
        this.winNineBall();
      } else if (this.turnPocketed.length === 0) {
        this.switchTurn();
      }
    }

    this.turnPocketed = [];
    this.firstHit = null;
    this.scratch = false;
    this.targetBall = this.lowestBallNumber();
    this.charging = false;
    this.charge = 0;
  }

  respotPocketed() {
    for (const ball of this.turnPocketed) {
      if (!ball.number) continue;
      const spawn = this.spawnPositions[ball.number] != null ? this.spawnPositions[ball.number] : { x: this.core.w * 0.65, y: this.core.h * 0.5 };
      let x = spawn.x;
      let y = spawn.y;
      let attempts = 0;
      while (this.balls.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + ball.r + 0.5) && attempts < 20) {
        y -= ball.r * 0.6;
        attempts++;
      }
      this.balls.push({ ...ball, x, y, vx: 0, vy: 0, cue: false });
    }
  }

  winNineBall() {
    if (this.over) return;
    this.over = true;
    this.core.fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#84ffb3", 90, 560);
    this.core.fx.addShake(14);
    this.core.audio.blip("triangle", 360, 0.2, 0.08);
    this.core.toast("9 号入袋，胜利！按 R 重来");
  }

  defaultCueSpot() {
    return { x: this.core.w * 0.28, y: this.core.h * 0.5 };
  }

  placeCueBall(x, y) {
    const cue = this.balls.find((b) => b.cue);
    if (!cue) return;
    cue.x = x;
    cue.y = y;
    cue.vx = 0;
    cue.vy = 0;
  }

  clampToTable(x, y, r) {
    return {
      x: clamp(x, this.table.l + r, this.table.r - r),
      y: clamp(y, this.table.t + r, this.table.b - r),
    };
  }

  canPlaceCueBall(x, y, r) {
    for (const b of this.balls) {
      if (b.cue) continue;
      if (Math.hypot(b.x - x, b.y - y) < b.r + r + 0.5) return false;
    }
    return true;
  }

  fireHumanShot(cueBall, input, fx, audio) {
    const dx = cueBall.x - input.mouse.x;
    const dy = cueBall.y - input.mouse.y;
    const len = Math.hypot(dx, dy) || 1;
    const power = clamp((this.charge / this.chargeMax) * 160, 12, 160);
    const impulse = power * 22;
    cueBall.vx += (dx / len) * impulse;
    cueBall.vy += (dy / len) * impulse;
    fx.burst(cueBall.x, cueBall.y, "#78beff", 10, 140);
    audio.blip("square", 220 + rand(-30, 30), 0.08, 0.06);
    this.turnActive = true;
    this.firstHit = null;
    this.turnPocketed = [];
    this.scratch = false;
    this.targetBall = this.lowestBallNumber();
    this.charging = false;
    this.aiming = false;
  }

  drawPowerArc(ctx, cue) {
    const frac = clamp(this.charge / this.chargeMax, 0, 1);
    const r = cue.r * 2.4;
    ctx.save();
    ctx.strokeStyle = "rgba(255,214,150," + (0.6 + 0.4 * frac) + ")";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cue.x, cue.y, r, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawPlaceHint(ctx, cue) {
    ctx.save();
    ctx.strokeStyle = "rgba(120,190,255,0.7)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cue.x, cue.y, cue.r * 1.8, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  switchTurn() {
    this.currentTurn = 1 - this.currentTurn;
    this.charging = false;
    this.charge = 0;
    this.turnActive = false;
  }

  drawAim(ctx, cue) {
    const { input } = this.core;
    if (!input.mouse.down && !this.aiming) return;

    const dx = cue.x - input.mouse.x;
    const dy = cue.y - input.mouse.y;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;

    const dirX = dx / len;
    const dirY = dy / len;

    const guide = this.predictGuide(cue, dirX, dirY, 900);

    ctx.save();
    ctx.strokeStyle = "rgba(120,190,255,0.7)";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(guide.x, guide.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (guide.type === "ball") {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(guide.x, guide.y, 5, 0, TAU);
      ctx.fill();
    }

    const stickLen = clamp(len * 1.4, 70, 220);
    const stickStartX = cue.x - dirX * (cue.r + 4);
    const stickStartY = cue.y - dirY * (cue.r + 4);
    const stickEndX = stickStartX - dirX * stickLen;
    const stickEndY = stickStartY - dirY * stickLen;

    ctx.strokeStyle = "rgba(255,214,150,0.9)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(stickStartX, stickStartY);
    ctx.lineTo(stickEndX, stickEndY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(stickStartX, stickStartY);
    ctx.lineTo(stickStartX - dirX * 14, stickStartY - dirY * 14);
    ctx.stroke();
    ctx.restore();
  }

  predictGuide(cue, dx, dy, maxLen = 800) {
    let best = maxLen;
    let type = "wall";
    const rSum = cue.r;

    for (const ball of this.balls) {
      if (ball.cue) continue;
      const toX = ball.x - cue.x;
      const toY = ball.y - cue.y;
      const proj = toX * dx + toY * dy;
      if (proj <= 0) continue;
      const perp2 = toX * toX + toY * toY - proj * proj;
      const rad = rSum + ball.r;
      const rad2 = rad * rad;
      if (perp2 <= rad2) {
        const offset = Math.sqrt(rad2 - perp2);
        const dist = proj - offset;
        if (dist > 0 && dist < best) {
          best = dist;
          type = "ball";
        }
      }
    }

    const tx = dx > 0 ? (this.table.r - cue.r - cue.x) / dx : dx < 0 ? (this.table.l + cue.r - cue.x) / dx : Infinity;
    const ty = dy > 0 ? (this.table.b - cue.r - cue.y) / dy : dy < 0 ? (this.table.t + cue.r - cue.y) / dy : Infinity;

    const wallDist = Math.min(tx > 0 ? tx : Infinity, ty > 0 ? ty : Infinity, maxLen);
    const finalDist = Math.min(best, wallDist);

    return { x: cue.x + dx * finalDist, y: cue.y + dy * finalDist, type };
  }
}

class FallGame extends GameBase {
  constructor(core) {
    super(core);
    this.player = null;
    this.platforms = [];
    this.score = 0;
    this.over = false;
  }

  get title() {
    return "下100楼";
  }

  get hint() {
    return "方向键左右移动 | Esc 返回 | R 重开";
  }

  onEnter() {
    const { w, h } = this.core;
    this.player = { x: w * 0.5, y: h * 0.2, vx: 0, vy: 0, r: 12 };
    this.platforms = [];
    this.score = 0;
    this.over = false;

    for (let i = 0; i < 12; i++) {
      this.addPlatform(rand(40, w - 140), i * 50 + 60, rand(80, 160));
    }

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 50;
  }

  addPlatform(x, y, width) {
    this.platforms.push({ x, y, w: width, h: 10 });
  }

  update(dt) {
    const { w, h, input } = this.core;
    if (this.over) return;

    const p = this.player;
    const prevY = p.y;
    const accel = 600;
    const maxVX = 260;
    const gravity = 900;
    const scroll = 90 + this.score * 0.4;

    // horizontal
    let ax = 0;
    if (input.isDown("ArrowLeft")) ax -= accel;
    if (input.isDown("ArrowRight")) ax += accel;
    p.vx += ax * dt;
    p.vx = clamp(p.vx, -maxVX, maxVX);
    p.x += p.vx * dt;
    if (p.x < p.r) {
      p.x = p.r;
      p.vx = 0;
    }
    if (p.x > w - p.r) {
      p.x = w - p.r;
      p.vx = 0;
    }

    // vertical + scroll
    p.vy += gravity * dt;
    p.y += p.vy * dt;
    p.y += scroll * dt;
    for (const plat of this.platforms) plat.y += scroll * dt;

    // collisions (landing)
    if (p.vy > 0) {
      for (const plat of this.platforms) {
        const withinX = p.x > plat.x - p.r && p.x < plat.x + plat.w + p.r;
        const crossed = prevY + p.r <= plat.y && p.y + p.r >= plat.y;
        if (withinX && crossed) {
          p.y = plat.y - p.r;
          p.vy = -320;
          this.score += 1;
          break;
        }
      }
    }

    // cleanup & spawn
    this.platforms = this.platforms.filter((pl) => pl.y < h + 80);
    while (this.platforms.length < 14) {
      const topY = this.platforms.length ? Math.min(...this.platforms.map((pl) => pl.y)) : h * 0.2;
      const ny = topY - rand(40, 90);
      const nw = rand(70, 150);
      const nx = rand(20, w - nw - 20);
      this.addPlatform(nx, ny, nw);
    }

    // death
    if (p.y - p.r > h + 50) {
      this.gameOver();
    }
  }

  gameOver() {
    if (this.over) return;
    this.over = true;
    this.core.fx.burst(this.player.x, this.player.y, "#ff6ece", 60, 420);
    this.core.audio.blip("sawtooth", 140, 0.16, 0.07);
    this.core.toast(`掉出去了！Score: ${this.score} | 按 R 重开`);
  }

  draw(ctx) {
    const { w, h } = this.core;

    // platforms
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (const p of this.platforms) {
      roundRect(ctx, p.x, p.y, p.w, p.h, 4);
      ctx.fill();
    }
    ctx.restore();

    // player
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    ctx.fillStyle = "rgba(120,190,255,0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, this.player.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(-4, -4, this.player.r * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "700 14px system-ui";
    ctx.fillText(`Score: ${this.score}`, 18, 26);
    ctx.fillText("下到 100 层就算通关，加油！", 18, 46);
  }
}

class RacingGame extends GameBase {
  constructor(core) {
    super(core);
    this.player = null;
    this.cars = [];
    this.roadLines = [];
    this.score = 0;
    this.over = false;
  }

  get title() {
    return "赛车";
  }

  get hint() {
    return "方向键左右换道 | Esc 返回 | R 重开";
  }

  onEnter() {
    const { w, h } = this.core;
    this.lanes = 3;
    this.road = { x: w * 0.25, w: w * 0.5 };
    this.player = { lane: 1, y: h - 120, speed: 380 };
    this.cars = [];
    this.roadLines = [];
    this.score = 0;
    this.over = false;

    for (let i = 0; i < 12; i++) {
      this.roadLines.push({ y: i * 80 });
    }
    this.spawnT = 0;
    this.core.starfield.vx = 0;
    this.core.starfield.vy = 120;
  }

  laneX(lane) {
    const { x, w } = this.road;
    const laneW = w / this.lanes;
    return x + laneW * (lane + 0.5);
  }

  spawnCar() {
    const lane = randi(0, this.lanes - 1);
    const speed = rand(180, 260);
    this.cars.push({ lane, y: -80, speed });
  }

  update(dt) {
    const { h, input, fx, audio } = this.core;
    if (this.over) return;

    // input move lane
    if (input.consumeOnce("ArrowLeft")) this.player.lane = Math.max(0, this.player.lane - 1);
    if (input.consumeOnce("ArrowRight")) this.player.lane = Math.min(this.lanes - 1, this.player.lane + 1);

    // road lines
    for (const line of this.roadLines) {
      line.y += this.player.speed * dt * 0.6;
      if (line.y > h + 20) line.y -= 80 * this.roadLines.length;
    }

    // spawn traffic
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = rand(0.6, 1.1);
      this.spawnCar();
    }

    // move cars
    for (const c of this.cars) {
      c.y += (this.player.speed + c.speed) * dt * 0.6;
    }
    this.cars = this.cars.filter((c) => c.y < h + 120);

    // collision
    const px = this.laneX(this.player.lane);
    const py = this.player.y;
    for (const c of this.cars) {
      const cx = this.laneX(c.lane);
      if (Math.abs(cx - px) < 40 && Math.abs(c.y - py) < 70) {
        this.over = true;
        fx.burst(px, py, "#ff6ece", 70, 520);
        audio.blip("sawtooth", 150, 0.18, 0.08);
        this.core.toast(`撞车了！Score: ${this.score} | 按 R 重开`);
        return;
      }
    }

    // score
    this.score += dt * 10;
  }

  draw(ctx) {
    const { w, h } = this.core;
    const { x, w: rw } = this.road;
    ctx.save();

    // road
    ctx.fillStyle = "#1c1f2a";
    roundRect(ctx, x - 12, 0, rw + 24, h, 16);
    ctx.fill();
    ctx.fillStyle = "#0f111a";
    roundRect(ctx, x, 0, rw, h, 12);
    ctx.fill();

    // lane lines
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 18]);
    for (let i = 1; i < this.lanes; i++) {
      const lx = x + (rw / this.lanes) * i;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // road stripes
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for (const line of this.roadLines) {
      ctx.fillRect(x + rw * 0.5 - 3, line.y, 6, 30);
    }

    // cars
    ctx.globalCompositeOperation = "lighter";
    const drawCar = (cx, cy, color) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = color;
      roundRect(ctx, -24, -40, 48, 80, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      roundRect(ctx, -16, -26, 32, 22, 6);
      ctx.fill();
      ctx.restore();
    };

    for (const c of this.cars) {
      drawCar(this.laneX(c.lane), c.y, "rgba(255,110,206,0.9)");
    }

    drawCar(this.laneX(this.player.lane), this.player.y, "rgba(120,190,255,0.95)");

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 14px system-ui";
    ctx.fillText(`Score: ${this.score.toFixed(0)}`, 18, 26);
    ctx.fillText("方向键左右换道，躲避车辆", 18, 46);

    ctx.restore();
  }
}

class SnakeGame extends GameBase {
  constructor(core) {
    super(core);
    this.snake = [];
    this.food = null;
    this.dir = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };
    this.score = 0;
    this.level = 1;
    this.over = false;
    this.moveT = 0;
    this.moveEvery = 0.15;
    this.targetLen = 5;
    this.gridW = 30;
    this.gridH = 20;
    this.cell = 0;
    this.ox = 0;
    this.oy = 0;
  }

  get title() {
    return "贪吃蛇";
  }

  get hint() {
    return "方向键控制 | 吃食物成长 | 达到长度通关 | Esc 返回";
  }

  onEnter() {
    const { w, h } = this.core;
    this.over = false;
    this.score = 0;
    this.level = 1;
    this.moveEvery = 0.15;
    this.moveT = 0;
    this.targetLen = 10;

    this.cell = Math.floor(Math.min(w / (this.gridW + 2), h / (this.gridH + 2)));
    this.ox = Math.floor((w - this.gridW * this.cell) / 2);
    this.oy = Math.floor((h - this.gridH * this.cell) / 2);

    const startX = Math.floor(this.gridW / 2);
    const startY = Math.floor(this.gridH / 2);
    this.snake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
    this.dir = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };

    this.spawnFood();

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  spawnFood() {
    const occupied = new Set(this.snake.map((s) => `${s.x},${s.y}`));
    let attempts = 0;
    while (attempts < 1000) {
      const x = randi(0, this.gridW - 1);
      const y = randi(0, this.gridH - 1);
      if (!occupied.has(`${x},${y}`)) {
        this.food = { x, y };
        return;
      }
      attempts++;
    }
  }

  update(dt) {
    const { input, fx, audio } = this.core;
    if (this.over) return;

    if (input.consumeOnce("ArrowUp") && this.dir.y !== 1) this.nextDir = { x: 0, y: -1 };
    if (input.consumeOnce("ArrowDown") && this.dir.y !== -1) this.nextDir = { x: 0, y: 1 };
    if (input.consumeOnce("ArrowLeft") && this.dir.x !== 1) this.nextDir = { x: -1, y: 0 };
    if (input.consumeOnce("ArrowRight") && this.dir.x !== -1) this.nextDir = { x: 1, y: 0 };

    this.moveT += dt;
    if (this.moveT < this.moveEvery) return;
    this.moveT = 0;

    this.dir = this.nextDir;
    const head = this.snake[0];
    const nx = head.x + this.dir.x;
    const ny = head.y + this.dir.y;

    if (nx < 0 || nx >= this.gridW || ny < 0 || ny >= this.gridH) {
      this.gameOver();
      return;
    }

    for (let i = 0; i < this.snake.length; i++) {
      if (this.snake[i].x === nx && this.snake[i].y === ny) {
        this.gameOver();
        return;
      }
    }

    this.snake.unshift({ x: nx, y: ny });

    if (this.food && nx === this.food.x && ny === this.food.y) {
      this.score += 10 * this.level;
      fx.burst(
        this.ox + nx * this.cell + this.cell / 2,
        this.oy + ny * this.cell + this.cell / 2,
        "#84ffb3",
        15,
        200
      );
      audio.blip("triangle", 440, 0.06, 0.04);

      if (this.snake.length >= this.targetLen) {
        this.level++;
        this.targetLen += 5;
        this.moveEvery = Math.max(0.06, this.moveEvery - 0.015);
        fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#78beff", 40, 350);
        audio.blip("square", 660, 0.1, 0.06);
        this.core.toast(`第 ${this.level} 关！目标长度：${this.targetLen}`);
      }

      this.spawnFood();
    } else {
      this.snake.pop();
    }

    audio.blip("sine", 280 + rand(-20, 20), 0.03, 0.02);
  }

  gameOver() {
    if (this.over) return;
    this.over = true;
    const { fx, audio } = this.core;
    const head = this.snake[0];
    fx.burst(
      this.ox + head.x * this.cell + this.cell / 2,
      this.oy + head.y * this.cell + this.cell / 2,
      "#ff6ece",
      50,
      400
    );
    fx.addShake(14);
    audio.blip("sawtooth", 130, 0.18, 0.08);
    this.core.toast(`撞墙了！Score: ${this.score} | 按 R 重开`);
  }

  draw(ctx) {
    const { w, h } = this.core;
    const { ox, oy, cell, gridW, gridH } = this;

    ctx.save();

    // grid background
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, ox - 6, oy - 6, gridW * cell + 12, gridH * cell + 12, 10);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,190,255,0.18)";
    ctx.lineWidth = 2;
    roundRect(ctx, ox - 6, oy - 6, gridW * cell + 12, gridH * cell + 12, 10);
    ctx.stroke();

    // grid cells
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
      }
    }

    // food
    if (this.food) {
      const fx = ox + this.food.x * cell + cell / 2;
      const fy = oy + this.food.y * cell + cell / 2;
      ctx.fillStyle = "rgba(255,110,206,0.3)";
      ctx.beginPath();
      ctx.arc(fx, fy, cell * 0.6, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "#ff6ece";
      ctx.beginPath();
      ctx.arc(fx, fy, cell * 0.35, 0, TAU);
      ctx.fill();
    }

    // snake
    for (let i = 0; i < this.snake.length; i++) {
      const s = this.snake[i];
      const px = ox + s.x * cell;
      const py = oy + s.y * cell;
      const isHead = i === 0;
      const a = isHead ? 1 : 0.7 + 0.3 * (1 - i / this.snake.length);

      ctx.fillStyle = isHead ? "rgba(120,190,255,0.95)" : `rgba(120,190,255,${a * 0.7})`;
      roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 5);
      ctx.fill();

      if (isHead) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        const eyeOffset = cell * 0.25;
        const eyeR = cell * 0.12;
        if (this.dir.x === 1) {
          ctx.beginPath();
          ctx.arc(px + cell - eyeOffset, py + eyeOffset, eyeR, 0, TAU);
          ctx.arc(px + cell - eyeOffset, py + cell - eyeOffset, eyeR, 0, TAU);
          ctx.fill();
        } else if (this.dir.x === -1) {
          ctx.beginPath();
          ctx.arc(px + eyeOffset, py + eyeOffset, eyeR, 0, TAU);
          ctx.arc(px + eyeOffset, py + cell - eyeOffset, eyeR, 0, TAU);
          ctx.fill();
        } else if (this.dir.y === -1) {
          ctx.beginPath();
          ctx.arc(px + eyeOffset, py + eyeOffset, eyeR, 0, TAU);
          ctx.arc(px + cell - eyeOffset, py + eyeOffset, eyeR, 0, TAU);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(px + eyeOffset, py + cell - eyeOffset, eyeR, 0, TAU);
          ctx.arc(px + cell - eyeOffset, py + cell - eyeOffset, eyeR, 0, TAU);
          ctx.fill();
        }
      }
    }

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "700 14px system-ui";
    ctx.fillText(`Score: ${this.score}`, ox, oy - 12);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "600 12px system-ui";
    ctx.fillText(`Level: ${this.level} | 长度: ${this.snake.length}/${this.targetLen}`, ox, oy - 30);

    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCell(ctx, x, y, s, color) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);

  ctx.fillStyle = color;
  roundRect(ctx, x + 2, y + 2, s - 4, s - 4, 6);
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = color + "33";
  roundRect(ctx, x + 1, y + 1, s - 2, s - 2, 7);
  ctx.fill();

  ctx.restore();
}

function drawPiece(ctx, piece, ox, oy, cell, ghost = false) {
  if (!piece) return;
  const m = piece.matrix || piece.m;
  if (!m) return;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (!m[y] || !m[y][x]) continue;
      const px = ox + (piece.x + x) * cell;
      const py = oy + (piece.y + y) * cell;
      if (py < oy) continue;
      if (ghost) {
        ctx.save();
        ctx.strokeStyle = piece.color;
        ctx.lineWidth = 2;
        roundRect(ctx, px + 4, py + 4, cell - 8, cell - 8, 6);
        ctx.stroke();
        ctx.restore();
      } else {
        drawCell(ctx, px, py, cell, piece.color);
      }
    }
  }
}

class Core {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.w = canvas.width;
    this.h = canvas.height;

    this.input = new Input(canvas);
    this.starfield = new Starfield(this.w, this.h);
    this.fx = new FX();
    this.audio = new AudioLite();

    this.toastEl = document.getElementById("toast");
    this.hudTitleEl = document.getElementById("hudTitle");
    this.hudHintEl = document.getElementById("hudHint");

    this.active = null;
    this.mode = "menu";

    this.backBtn = document.getElementById("btnBack");
    this.restartBtn = document.getElementById("btnRestart");
    this.overlay = document.getElementById("overlay");

    this.backBtn.addEventListener("click", () => this.showMenu());
    this.restartBtn.addEventListener("click", () => this.restart());
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") {
        if (this.mode !== "menu") this.showMenu();
      }
      if (e.code === "KeyR" && this.mode === "game") this.restart();
    });

    canvas.tabIndex = 0;
    canvas.addEventListener("pointerdown", async () => {
      await this.audio.resume();
    });

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", () => this.handleResize());
    }

    this.handleResize();
  }

  toast(msg, ms = 1800) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => {
      this.toastEl.hidden = true;
    }, ms);
  }

  setHud(title, hint) {
    this.hudTitleEl.textContent = title;
    this.hudHintEl.textContent = hint;
  }

  showMenu() {
    this.mode = "menu";
    this.overlay.hidden = false;
    this.overlay.style.display = "grid";
    this.overlay.style.pointerEvents = "auto";
    this.backBtn.hidden = true;
    this.restartBtn.hidden = true;
    if (this.active && this.active.onExit) this.active.onExit();
    this.active = null;
    this.setHud("小游戏合集", "快捷键：1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 0 / - 开始；单击画面获取键盘焦点");
    this.starfield.vx = 0;
    this.starfield.vy = 0;
    this.toastEl.hidden = true;
  }

  start(game) {
    this.mode = "game";
    this.overlay.hidden = true;
    this.overlay.style.display = "none";
    this.overlay.style.pointerEvents = "none";
    this.backBtn.hidden = false;
    this.restartBtn.hidden = false;
    if (this.active && this.active.onExit) {
      try { this.active.onExit(); } catch (e) { console.warn("onExit error:", e); }
    }
    this.active = game;
    try {
      if (this.active.onEnter) this.active.onEnter();
    } catch (e) {
      console.error("onEnter error:", e);
      this.showMenu();
      this.toast("游戏启动失败，请查看控制台");
      return;
    }
    this.setHud(game.title, game.hint);
    this.toast(`${game.title}：开始！`);
    if (this.canvas.focus) this.canvas.focus();
  }

  restart() {
    if (!this.active) return;
    if (this.active.onEnter) this.active.onEnter();
    this.setHud(this.active.title, this.active.hint);
    this.toast("已重新开始");
    if (this.canvas.focus) this.canvas.focus();
  }

  handleResize() {
    // keep internal resolution stable but adjust starfield bounds
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.starfield.resize(this.w, this.h);
    if (this.active && this.active.onResize) this.active.onResize(this.w, this.h);
  }

  frame(dt) {
    const ctx = this.ctx;

    // update
    this.starfield.update(dt);
    this.fx.update(dt);

    if (this.mode === "menu") {
      // gentle drift
      this.starfield.vx = lerp(this.starfield.vx, 20, 0.02);
      this.starfield.vy = lerp(this.starfield.vy, 8, 0.02);
    }

    if (this.active) this.active.update(dt);

    // draw
    ctx.save();
    ctx.clearRect(0, 0, this.w, this.h);

    // camera shake
    const sh = this.fx.shake;
    const sx = (Math.random() * 2 - 1) * sh;
    const sy = (Math.random() * 2 - 1) * sh;
    ctx.translate(sx, sy);

    // background
    ctx.fillStyle = "rgb(7, 10, 18)";
    ctx.fillRect(-sx, -sy, this.w, this.h);
    this.starfield.draw(ctx);

    // main
    if (this.active) {
      this.active.draw(ctx);
    } else {
      drawMenuBackdrop(ctx, this.w, this.h);
    }

    // fx
    this.fx.draw(ctx);

    ctx.restore();

    this.input.endFrame();
  }
}

class MemoryGame extends GameBase {
  // Emoji 主题
  static EMOJIS = ['😀', '🐶', '🌸', '🍎', '🎸', '🚀', '⭐', '🎀', '🐱', '🌻', '🍕', '🎯', '💎', '🌈', '🎵', '🔥', '🌙', '🎪', '🦋', '🎨'];

  constructor(core) {
    super(core);
    this.cards = [];
    this.gridW = 4;
    this.gridH = 4;
    this.cell = 0;
    this.ox = 0;
    this.oy = 0;
    this.level = 1;
    this.score = 0;
    this.moves = 0;
    this.over = false;
    this.flipped = [];
    this.matched = new Set();
    this.waiting = false;
    this.waitTimer = 0;
    this.pairsFound = 0;
    this.totalPairs = 0;
  }

  get title() {
    return "记忆翻牌";
  }

  get hint() {
    return "点击翻牌 | 找出所有配对 | Esc 返回 | R 重开";
  }

  onEnter() {
    this.over = false;
    this.score = 0;
    this.moves = 0;
    this.level = 1;
    this.startLevel();

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  startLevel() {
    // 根据关卡调整网格大小
    if (this.level <= 2) {
      this.gridW = 4;
      this.gridH = 4;
    } else if (this.level <= 4) {
      this.gridW = 5;
      this.gridH = 4;
    } else if (this.level <= 6) {
      this.gridW = 6;
      this.gridH = 5;
    } else {
      this.gridW = 6;
      this.gridH = 6;
    }

    const { w, h } = this.core;
    this.cell = Math.floor(Math.min(
      (w - 80) / this.gridW,
      (h - 120) / this.gridH,
      80
    ));
    this.ox = Math.floor((w - this.gridW * this.cell) / 2);
    this.oy = Math.floor((h - this.gridH * this.cell) / 2);

    this.generateCards();
    this.flipped = [];
    this.matched = new Set();
    this.waiting = false;
    this.waitTimer = 0;
    this.moves = 0;
    this.pairsFound = 0;
  }

  generateCards() {
    const totalCards = this.gridW * this.gridH;
    this.totalPairs = totalCards / 2;

    // 选择 emoji
    const selectedEmojis = [];
    for (let i = 0; i < this.totalPairs; i++) {
      selectedEmojis.push(MemoryGame.EMOJIS[i % MemoryGame.EMOJIS.length]);
    }

    // 创建配对并打乱
    const pairs = [...selectedEmojis, ...selectedEmojis];
    this.shuffleArray(pairs);

    // 生成卡片对象
    this.cards = [];
    for (let i = 0; i < totalCards; i++) {
      const row = Math.floor(i / this.gridW);
      const col = i % this.gridW;
      this.cards.push({
        x: this.ox + col * this.cell,
        y: this.oy + row * this.cell,
        emoji: pairs[i],
        index: i,
        flipped: false,
        matched: false,
      });
    }
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = randi(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  update(dt) {
    const { input } = this.core;
    if (this.over) return;

    // 等待翻牌动画
    if (this.waiting) {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) {
        this.waiting = false;
        this.checkMatch();
      }
      return;
    }

    // 点击翻牌
    if (input.mouse.down) {
      const mx = input.mouse.x;
      const my = input.mouse.y;

      for (const card of this.cards) {
        if (card.matched || card.flipped) continue;

        if (mx >= card.x && mx <= card.x + this.cell &&
            my >= card.y && my <= card.y + this.cell) {
          this.flipCard(card);
          break;
        }
      }
    }
  }

  flipCard(card) {
    if (this.flipped.length >= 2) return;

    card.flipped = true;
    this.flipped.push(card);
    this.core.audio.blip("sine", 440 + this.flipped.length * 100, 0.08, 0.05);

    if (this.flipped.length === 2) {
      this.moves++;
      this.waiting = true;
      this.waitTimer = 0.8;
    }
  }

  checkMatch() {
    const [card1, card2] = this.flipped;

    if (card1.emoji === card2.emoji) {
      // 配对成功
      card1.matched = true;
      card2.matched = true;
      this.matched.add(card1.index);
      this.matched.add(card2.index);
      this.pairsFound++;
      this.score += 100;

      this.core.fx.burst(
        (card1.x + card2.x) / 2 + this.cell / 2,
        (card1.y + card2.y) / 2 + this.cell / 2,
        "#84ffb3", 20, 200
      );
      this.core.audio.blip("triangle", 660, 0.1, 0.06);

      // 检查是否通关
      if (this.pairsFound === this.totalPairs) {
        this.levelComplete();
      }
    } else {
      // 配对失败
      card1.flipped = false;
      card2.flipped = false;
      this.core.audio.blip("sawtooth", 180, 0.08, 0.04);
    }

    this.flipped = [];
  }

  levelComplete() {
    this.score += this.level * 200;
    this.core.fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#78beff", 60, 400);
    this.core.fx.addShake(12);
    this.core.audio.blip("square", 880, 0.15, 0.07);
    this.core.toast(`第 ${this.level} 关完成！`);

    this.level++;
    setTimeout(() => {
      if (!this.over) this.startLevel();
    }, 1500);
  }

  draw(ctx) {
    const cell = this.cell;

    ctx.save();

    // 背景面板
    const panelW = this.gridW * cell + 20;
    const panelH = this.gridH * cell + 20;
    const px = this.ox - 10;
    const py = this.oy - 10;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,190,255,0.18)";
    ctx.lineWidth = 2;
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.stroke();

    // 绘制卡片
    for (const card of this.cards) {
      const cx = card.x;
      const cy = card.y;
      const padding = 4;

      if (card.matched) {
        // 已配对 - 半透明显示
        ctx.fillStyle = "rgba(132,255,179,0.15)";
        roundRect(ctx, cx + padding, cy + padding, cell - padding * 2, cell - padding * 2, 8);
        ctx.fill();

        ctx.strokeStyle = "rgba(132,255,179,0.3)";
        ctx.lineWidth = 2;
        roundRect(ctx, cx + padding, cy + padding, cell - padding * 2, cell - padding * 2, 8);
        ctx.stroke();

        // 显示 emoji
        ctx.font = `${cell * 0.5}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(card.emoji, cx + cell / 2, cy + cell / 2);
      } else if (card.flipped) {
        // 翻开状态 - 显示 emoji
        ctx.fillStyle = "rgba(120,190,255,0.2)";
        roundRect(ctx, cx + padding, cy + padding, cell - padding * 2, cell - padding * 2, 8);
        ctx.fill();

        ctx.strokeStyle = "rgba(120,190,255,0.6)";
        ctx.lineWidth = 2;
        roundRect(ctx, cx + padding, cy + padding, cell - padding * 2, cell - padding * 2, 8);
        ctx.stroke();

        ctx.font = `${cell * 0.5}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText(card.emoji, cx + cell / 2, cy + cell / 2);
      } else {
        // 未翻开 - 显示问号
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        roundRect(ctx, cx + padding, cy + padding, cell - padding * 2, cell - padding * 2, 8);
        ctx.fill();

        ctx.strokeStyle = "rgba(120,190,255,0.25)";
        ctx.lineWidth = 2;
        roundRect(ctx, cx + padding, cy + padding, cell - padding * 2, cell - padding * 2, 8);
        ctx.stroke();

        // 问号
        ctx.font = `700 ${cell * 0.4}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(120,190,255,0.5)";
        ctx.fillText("?", cx + cell / 2, cy + cell / 2);
      }
    }

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "700 14px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`关卡: ${this.level}`, 18, 26);
    ctx.fillText(`得分: ${this.score}`, 18, 46);
    ctx.fillText(`步数: ${this.moves}`, 18, 66);
    ctx.fillText(`配对: ${this.pairsFound}/${this.totalPairs}`, 18, 86);

    ctx.restore();
  }
}

class Game2048 extends GameBase {
  // 颜色配置 - 霓虹风格
  static TILE_COLORS = {
    2: { bg: "rgba(120,190,255,0.15)", text: "rgba(120,190,255,0.9)", glow: "rgba(120,190,255,0.3)" },
    4: { bg: "rgba(132,255,179,0.15)", text: "rgba(132,255,179,0.9)", glow: "rgba(132,255,179,0.3)" },
    8: { bg: "rgba(255,110,206,0.15)", text: "rgba(255,110,206,0.9)", glow: "rgba(255,110,206,0.3)" },
    16: { bg: "rgba(255,180,100,0.15)", text: "rgba(255,180,100,0.9)", glow: "rgba(255,180,100,0.3)" },
    32: { bg: "rgba(255,139,139,0.2)", text: "rgba(255,139,139,0.95)", glow: "rgba(255,139,139,0.4)" },
    64: { bg: "rgba(168,164,255,0.2)", text: "rgba(168,164,255,0.95)", glow: "rgba(168,164,255,0.4)" },
    128: { bg: "rgba(120,190,255,0.25)", text: "rgba(255,255,255,0.95)", glow: "rgba(120,190,255,0.5)" },
    256: { bg: "rgba(132,255,179,0.25)", text: "rgba(255,255,255,0.95)", glow: "rgba(132,255,179,0.5)" },
    512: { bg: "rgba(255,110,206,0.3)", text: "rgba(255,255,255,0.95)", glow: "rgba(255,110,206,0.6)" },
    1024: { bg: "rgba(255,214,150,0.3)", text: "rgba(255,255,255,0.95)", glow: "rgba(255,214,150,0.6)" },
    2048: { bg: "rgba(255,215,0,0.35)", text: "rgba(255,255,255,1)", glow: "rgba(255,215,0,0.7)" },
  };

  constructor(core) {
    super(core);
    this.grid = [];
    this.gridSize = 4;
    this.cell = 0;
    this.ox = 0;
    this.oy = 0;
    this.score = 0;
    this.bestScore = 0;
    this.over = false;
    this.won = false;
    this.mergedCells = [];
    this.newCell = null;
    this.moveInProgress = false;
    this.swipeStart = null;
  }

  get title() {
    return "2048";
  }

  get hint() {
    return "方向键/鼠标滑动 | 合并数字 | 追求最高分 | Esc 返回 | R 重开";
  }

  onEnter() {
    this.over = false;
    this.won = false;
    this.score = 0;
    this.bestScore = parseInt(localStorage.getItem("2048_best") || "0");
    this.startNewGame();

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  startNewGame() {
    // 初始化空网格
    this.grid = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(0));
    this.mergedCells = [];
    this.newCell = null;

    // 添加两个初始方块
    this.addRandomTile();
    this.addRandomTile();

    this.calculateLayout();
  }

  calculateLayout() {
    const { w, h } = this.core;
    const maxCellSize = 90;
    const padding = 8;
    const totalPadding = (this.gridSize + 1) * padding;
    this.cell = Math.min(
      Math.floor((w - 100) / this.gridSize),
      Math.floor((h - 140) / this.gridSize),
      maxCellSize
    );
    const boardW = this.gridSize * this.cell + totalPadding;
    const boardH = this.gridSize * this.cell + totalPadding;
    this.ox = Math.floor((w - boardW) / 2);
    this.oy = Math.floor((h - boardH) / 2) + 20;
    this.padding = padding;
  }

  addRandomTile() {
    const emptyCells = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.grid[r][c] === 0) {
          emptyCells.push({ r, c });
        }
      }
    }

    if (emptyCells.length === 0) return;

    const { r, c } = emptyCells[randi(0, emptyCells.length - 1)];
    const value = Math.random() < 0.9 ? 2 : 4;
    this.grid[r][c] = value;
    this.newCell = { r, c, value };
  }

  update(_dt) {
    const { input, audio } = this.core;

    if (this.over) {
      // 游戏结束后按任意键重新开始
      if (input.consumeOnce("KeyR")) {
        this.startNewGame();
        this.over = false;
        this.score = 0;
      }
      return;
    }

    // 键盘输入
    let direction = null;
    if (input.consumeOnce("ArrowLeft")) direction = "left";
    else if (input.consumeOnce("ArrowRight")) direction = "right";
    else if (input.consumeOnce("ArrowUp")) direction = "up";
    else if (input.consumeOnce("ArrowDown")) direction = "down";

    // 鼠标滑动输入
    if (input.mouse.down) {
      if (!this.swipeStart) {
        this.swipeStart = { x: input.mouse.x, y: input.mouse.y };
      }
    } else if (this.swipeStart) {
      const dx = input.mouse.x - this.swipeStart.x;
      const dy = input.mouse.y - this.swipeStart.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 30) {
        if (Math.abs(dx) > Math.abs(dy)) {
          direction = dx > 0 ? "right" : "left";
        } else {
          direction = dy > 0 ? "down" : "up";
        }
      }
      this.swipeStart = null;
    }

    if (direction) {
      this.move(direction, audio);
    }
  }

  move(direction, audio) {
    this.mergedCells = [];
    this.newCell = null;
    let moved = false;

    // 根据方向处理移动
    const processLine = (line) => {
      // 移除零
      const filtered = line.filter(v => v !== 0);
      const merged = [];
      let scoreGain = 0;

      // 合并相邻相同数字
      for (let i = 0; i < filtered.length; i++) {
        if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
          const newValue = filtered[i] * 2;
          merged.push(newValue);
          scoreGain += newValue;
          this.mergedCells.push(newValue);
          i++; // 跳过下一个
        } else {
          merged.push(filtered[i]);
        }
      }

      // 补零
      while (merged.length < this.gridSize) {
        merged.push(0);
      }

      return { merged, scoreGain };
    };

    if (direction === "left") {
      for (let r = 0; r < this.gridSize; r++) {
        const { merged, scoreGain } = processLine(this.grid[r]);
        if (merged.some((v, i) => v !== this.grid[r][i])) moved = true;
        this.grid[r] = merged;
        this.score += scoreGain;
      }
    } else if (direction === "right") {
      for (let r = 0; r < this.gridSize; r++) {
        const reversed = [...this.grid[r]].reverse();
        const { merged, scoreGain } = processLine(reversed);
        const result = merged.reverse();
        if (result.some((v, i) => v !== this.grid[r][i])) moved = true;
        this.grid[r] = result;
        this.score += scoreGain;
      }
    } else if (direction === "up") {
      for (let c = 0; c < this.gridSize; c++) {
        const column = this.grid.map(row => row[c]);
        const { merged, scoreGain } = processLine(column);
        if (merged.some((v, i) => v !== this.grid[i][c])) moved = true;
        for (let r = 0; r < this.gridSize; r++) {
          this.grid[r][c] = merged[r];
        }
        this.score += scoreGain;
      }
    } else if (direction === "down") {
      for (let c = 0; c < this.gridSize; c++) {
        const column = this.grid.map(row => row[c]).reverse();
        const { merged, scoreGain } = processLine(column);
        const result = merged.reverse();
        if (result.some((v, i) => v !== this.grid[i][c])) moved = true;
        for (let r = 0; r < this.gridSize; r++) {
          this.grid[r][c] = result[r];
        }
        this.score += scoreGain;
      }
    }

    if (moved) {
      // 播放移动音效
      audio.blip("sine", 220, 0.05, 0.03);

      // 如果有合并，播放合并音效
      if (this.mergedCells.length > 0) {
        const maxMerged = Math.max(...this.mergedCells);
        const freq = 300 + Math.log2(maxMerged) * 60;
        audio.blip("triangle", freq, 0.08, 0.05);
        this.core.fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#78beff", this.mergedCells.length * 3, 120);
      }

      // 添加新方块
      this.addRandomTile();

      // 更新最高分
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem("2048_best", this.bestScore.toString());
      }

      // 检查游戏是否结束
      if (!this.canMove()) {
        this.gameOver();
      }
    }
  }

  canMove() {
    // 检查是否有空格
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.grid[r][c] === 0) return true;
      }
    }

    // 检查是否有相邻相同数字
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const current = this.grid[r][c];
        // 检查右边
        if (c + 1 < this.gridSize && this.grid[r][c + 1] === current) return true;
        // 检查下面
        if (r + 1 < this.gridSize && this.grid[r + 1][c] === current) return true;
      }
    }

    return false;
  }

  gameOver() {
    this.over = true;
    this.core.fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#ff6ece", 60, 400);
    this.core.fx.addShake(12);
    this.core.audio.blip("sawtooth", 150, 0.15, 0.07);
    this.core.toast(`游戏结束！得分: ${this.score} | 按 R 重新开始`);
  }

  draw(ctx) {
    const { w, h } = this.core;
    const { cell, ox, oy, padding, gridSize } = this;

    ctx.save();

    // 背景面板
    const boardW = gridSize * cell + (gridSize + 1) * padding;
    const boardH = gridSize * cell + (gridSize + 1) * padding;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, ox - 8, oy - 8, boardW + 16, boardH + 16, 16);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,190,255,0.18)";
    ctx.lineWidth = 2;
    roundRect(ctx, ox - 8, oy - 8, boardW + 16, boardH + 16, 16);
    ctx.stroke();

    // 绘制网格背景
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const x = ox + padding + c * (cell + padding);
        const y = oy + padding + r * (cell + padding);

        ctx.fillStyle = "rgba(255,255,255,0.03)";
        roundRect(ctx, x, y, cell, cell, 8);
        ctx.fill();
      }
    }

    // 绘制方块
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const value = this.grid[r][c];
        if (value === 0) continue;

        const x = ox + padding + c * (cell + padding);
        const y = oy + padding + r * (cell + padding);

        // 获取颜色配置
        const colorConfig = Game2048.TILE_COLORS[value] || {
          bg: "rgba(255,215,0,0.4)",
          text: "rgba(255,255,255,1)",
          glow: "rgba(255,215,0,0.8)"
        };

        // 绘制发光效果
        ctx.fillStyle = colorConfig.glow;
        roundRect(ctx, x - 2, y - 2, cell + 4, cell + 4, 10);
        ctx.fill();

        // 绘制方块背景
        ctx.fillStyle = colorConfig.bg;
        roundRect(ctx, x, y, cell, cell, 8);
        ctx.fill();

        // 绘制方块边框
        ctx.strokeStyle = colorConfig.text;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.3;
        roundRect(ctx, x, y, cell, cell, 8);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // 绘制数字
        const fontSize = value < 100 ? cell * 0.5 : value < 1000 ? cell * 0.4 : cell * 0.32;
        ctx.font = `700 ${fontSize}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = colorConfig.text;
        ctx.fillText(value.toString(), x + cell / 2, y + cell / 2);
      }
    }

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "700 14px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`得分: ${this.score}`, 18, 26);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 12px system-ui";
    ctx.fillText(`最高分: ${this.bestScore}`, 18, 46);

    // 游戏结束提示
    if (this.over) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(255,110,206,0.9)";
      ctx.font = "700 32px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("游戏结束", w / 2, h / 2 - 30);

      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "600 18px system-ui";
      ctx.fillText(`最终得分: ${this.score}`, w / 2, h / 2 + 10);

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "400 14px system-ui";
      ctx.fillText("按 R 重新开始", w / 2, h / 2 + 45);
    }

    ctx.restore();
  }
}

class BubbleShooter extends GameBase {
  // 泡泡颜色配置 - 霓虹风格
  static BUBBLE_COLORS = [
    { fill: "rgba(120,190,255,0.9)", glow: "rgba(120,190,255,0.4)", name: "blue" },
    { fill: "rgba(255,110,206,0.9)", glow: "rgba(255,110,206,0.4)", name: "pink" },
    { fill: "rgba(132,255,179,0.9)", glow: "rgba(132,255,179,0.4)", name: "green" },
    { fill: "rgba(255,180,100,0.9)", glow: "rgba(255,180,100,0.4)", name: "orange" },
    { fill: "rgba(168,164,255,0.9)", glow: "rgba(168,164,255,0.4)", name: "purple" },
  ];

  constructor(core) {
    super(core);
    this.grid = [];
    this.cols = 10;
    this.rows = 12;
    this.bubbleR = 18;
    this.ox = 0;
    this.oy = 0;
    this.cellW = 0;
    this.cellH = 0;
    this.score = 0;
    this.level = 1;
    this.targetScore = 500;
    this.over = false;
    this.won = false;
    this.shooter = null;
    this.flyingBubble = null;
    this.nextColor = 0;
    this.pushTimer = 0;
    this.pushInterval = 15; // 秒
  }

  get title() {
    return "泡泡龙";
  }

  get hint() {
    return "←→ 瞄准 | 空格发射 | 消除3个以上得分 | Esc 返回 | R 重开";
  }

  onEnter() {
    this.over = false;
    this.won = false;
    this.score = 0;
    this.level = 1;
    this.targetScore = 500;
    this.initGame();

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  onExit() {
    this.grid = [];
    this.flyingBubble = null;
    this.shooter = null;
  }

  initGame() {
    this.calculateLayout();

    // 初始化网格
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(-1));

    // 生成初始泡泡行（顶部5行）
    for (let r = 0; r < 5; r++) {
      this.fillRow(r);
    }

    // 初始化发射器
    this.shooter = {
      x: this.ox + (this.cols * this.cellW) / 2,
      y: this.oy + this.rows * this.cellH + 40,
      angle: -Math.PI / 2,
      speed: 500,
    };

    this.flyingBubble = null;
    this.nextColor = this.getRandomColor();
    this.pushTimer = this.pushInterval;
  }

  calculateLayout() {
    const { w } = this.core;
    this.cellW = this.bubbleR * 2 + 2;
    this.cellH = this.bubbleR * 1.75;
    const boardW = this.cols * this.cellW;
    this.ox = Math.floor((w - boardW) / 2);
    this.oy = 60;
  }

  getRandomColor() {
    // 只使用当前网格中已存在的颜色
    const usedColors = new Set();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] >= 0) {
          usedColors.add(this.grid[r][c]);
        }
      }
    }

    if (usedColors.size === 0) {
      return randi(0, BubbleShooter.BUBBLE_COLORS.length - 1);
    }

    const colorsArray = Array.from(usedColors);
    return colorsArray[randi(0, colorsArray.length - 1)];
  }

  fillRow(row) {
    for (let c = 0; c < this.cols; c++) {
      this.grid[row][c] = randi(0, BubbleShooter.BUBBLE_COLORS.length - 1);
    }
  }

  getBubblePos(row, col) {
    const offset = row % 2 === 1 ? this.cellW / 2 : 0;
    return {
      x: this.ox + col * this.cellW + offset + this.cellW / 2,
      y: this.oy + row * this.cellH + this.cellH / 2,
    };
  }

  update(dt) {
    const { input, audio } = this.core;
    if (!this.shooter) return;

    if (this.over) {
      if (input.consumeOnce("KeyR")) {
        this.initGame();
        this.over = false;
        this.score = 0;
      }
      return;
    }

    // 瞄准控制
    const aimSpeed = 2.5;
    if (input.isDown("ArrowLeft")) {
      this.shooter.angle = Math.max(-Math.PI + 0.2, this.shooter.angle - aimSpeed * dt);
    }
    if (input.isDown("ArrowRight")) {
      this.shooter.angle = Math.min(-0.2, this.shooter.angle + aimSpeed * dt);
    }

    // 发射泡泡
    if (input.consumeOnce("Space") && !this.flyingBubble) {
      this.flyingBubble = {
        x: this.shooter.x,
        y: this.shooter.y,
        vx: Math.cos(this.shooter.angle) * this.shooter.speed,
        vy: Math.sin(this.shooter.angle) * this.shooter.speed,
        color: this.nextColor,
      };
      this.nextColor = this.getRandomColor();
      audio.blip("square", 300, 0.06, 0.04);
    }

    // 更新飞行泡泡
    if (this.flyingBubble) {
      const bubble = this.flyingBubble;
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;

      // 墙壁反弹
      if (bubble.x - this.bubbleR < this.ox) {
        bubble.x = this.ox + this.bubbleR;
        bubble.vx = Math.abs(bubble.vx);
      }
      if (bubble.x + this.bubbleR > this.ox + this.cols * this.cellW) {
        bubble.x = this.ox + this.cols * this.cellW - this.bubbleR;
        bubble.vx = -Math.abs(bubble.vx);
      }

      // 顶部碰撞
      if (bubble.y - this.bubbleR < this.oy) {
        this.snapBubble(bubble);
        return;
      }

      // 碰撞检测
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c] < 0) continue;
          const pos = this.getBubblePos(r, c);
          const dist = Math.hypot(bubble.x - pos.x, bubble.y - pos.y);
          if (dist < this.bubbleR * 1.8) {
            this.snapBubble(bubble);
            return;
          }
        }
      }

      // 超出边界
      if (bubble.y > this.oy + this.rows * this.cellH + 100) {
        this.flyingBubble = null;
      }
    }

    // 定时下压
    this.pushTimer -= dt;
    if (this.pushTimer <= 0) {
      this.pushTimer = this.pushInterval;
      this.pushDown();
      audio.blip("sawtooth", 100, 0.1, 0.05);
      fx.addShake(4);
    }
  }

  snapBubble(bubble) {
    const { fx, audio } = this.core;

    // 找到最近的网格位置
    let bestR = 0, bestC = 0, bestDist = Infinity;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] >= 0) continue;
        const pos = this.getBubblePos(r, c);
        const dist = Math.hypot(bubble.x - pos.x, bubble.y - pos.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestR = r;
          bestC = c;
        }
      }
    }

    // 放置泡泡
    this.grid[bestR][bestC] = bubble.color;
    this.flyingBubble = null;

    // 检查消除
    const matches = this.findMatches(bestR, bestC, bubble.color);

    if (matches.length >= 3) {
      // 消除泡泡
      for (const { r, c } of matches) {
        this.grid[r][c] = -1;
      }

      // 得分
      const points = matches.length * 10 + (matches.length - 3) * 5;
      this.score += points;

      // 检查是否达到目标分数
      if (this.score >= this.targetScore) {
        this.level++;
        this.targetScore += 300;
        this.core.toast(`第 ${this.level} 关！目标分数: ${this.targetScore}`);
      }

      // 特效和音效
      const pos = this.getBubblePos(bestR, bestC);
      fx.burst(pos.x, pos.y, BubbleShooter.BUBBLE_COLORS[bubble.color].fill, matches.length * 5, 200);
      fx.addShake(matches.length * 2);
      audio.blip("triangle", 400 + matches.length * 50, 0.1, 0.06);

      // 检查悬空泡泡
      this.removeFloating();
    } else {
      audio.blip("sine", 200, 0.04, 0.03);
    }

    // 检查游戏结束
    this.checkGameOver();
  }

  findMatches(row, col, color) {
    const matches = [];
    const visited = new Set();

    const dfs = (r, c) => {
      const key = `${r},${c}`;
      if (visited.has(key)) return;
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return;
      if (this.grid[r][c] !== color) return;

      visited.add(key);
      matches.push({ r, c });

      // 6方向邻居
      const offsets = [
        [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]
      ];
      // 奇数行偏移
      const oddOffsets = [
        [-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]
      ];

      const isOdd = r % 2 === 1;
      const dirs = isOdd ? oddOffsets : offsets;

      for (const [dr, dc] of dirs) {
        dfs(r + dr, c + dc);
      }
    };

    dfs(row, col);
    return matches;
  }

  removeFloating() {
    // 标记所有连接到顶部的泡泡
    const connected = new Set();

    const dfs = (r, c) => {
      const key = `${r},${c}`;
      if (connected.has(key)) return;
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return;
      if (this.grid[r][c] < 0) return;

      connected.add(key);

      const offsets = [
        [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]
      ];
      const oddOffsets = [
        [-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]
      ];

      const isOdd = r % 2 === 1;
      const dirs = isOdd ? oddOffsets : offsets;

      for (const [dr, dc] of dirs) {
        dfs(r + dr, c + dc);
      }
    };

    // 从顶部开始搜索
    for (let c = 0; c < this.cols; c++) {
      if (this.grid[0][c] >= 0) {
        dfs(0, c);
      }
    }

    // 移除悬空泡泡
    let floatingCount = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] >= 0 && !connected.has(`${r},${c}`)) {
          this.grid[r][c] = -1;
          floatingCount++;
        }
      }
    }

    if (floatingCount > 0) {
      this.score += floatingCount * 15;
    }
  }

  pushDown() {
    // 检查最后一行是否有泡泡
    for (let c = 0; c < this.cols; c++) {
      if (this.grid[this.rows - 1][c] >= 0) {
        this.gameOver();
        return;
      }
    }

    // 下移所有行
    for (let r = this.rows - 1; r > 0; r--) {
      this.grid[r] = [...this.grid[r - 1]];
    }

    // 生成新行
    this.fillRow(0);
  }

  checkGameOver() {
    // 检查泡泡是否到达底部
    for (let c = 0; c < this.cols; c++) {
      if (this.grid[this.rows - 1][c] >= 0) {
        this.gameOver();
        return;
      }
    }
  }

  gameOver() {
    this.over = true;
    this.core.fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#ff6ece", 60, 400);
    this.core.fx.addShake(12);
    this.core.audio.blip("sawtooth", 150, 0.15, 0.07);
    this.core.toast(`游戏结束！得分: ${this.score} | 按 R 重新开始`);
  }

  draw(ctx) {
    if (!this.shooter) return;

    const { w, h } = this.core;

    ctx.save();

    // 绘制游戏区域边框
    const boardW = this.cols * this.cellW;
    const boardH = this.rows * this.cellH;

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, this.ox - 8, this.oy - 8, boardW + 16, boardH + 80, 12);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,190,255,0.15)";
    ctx.lineWidth = 2;
    roundRect(ctx, this.ox - 8, this.oy - 8, boardW + 16, boardH + 80, 12);
    ctx.stroke();

    // 绘制网格中的泡泡
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] < 0) continue;
        const color = BubbleShooter.BUBBLE_COLORS[this.grid[r][c]];
        const pos = this.getBubblePos(r, c);

        // 发光效果
        ctx.fillStyle = color.glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.bubbleR + 3, 0, TAU);
        ctx.fill();

        // 泡泡主体
        ctx.fillStyle = color.fill;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.bubbleR, 0, TAU);
        ctx.fill();

        // 高光
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.beginPath();
        ctx.arc(pos.x - this.bubbleR * 0.3, pos.y - this.bubbleR * 0.3, this.bubbleR * 0.3, 0, TAU);
        ctx.fill();
      }
    }

    // 绘制发射器
    ctx.save();
    ctx.translate(this.shooter.x, this.shooter.y);

    // 发射器底座
    ctx.fillStyle = "rgba(120,190,255,0.2)";
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,190,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, TAU);
    ctx.stroke();

    // 瞄准线
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const lineLen = 100;
    ctx.lineTo(
      Math.cos(this.shooter.angle) * lineLen,
      Math.sin(this.shooter.angle) * lineLen
    );
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // 绘制飞行中的泡泡
    if (this.flyingBubble) {
      const bubble = this.flyingBubble;
      const color = BubbleShooter.BUBBLE_COLORS[bubble.color];

      ctx.fillStyle = color.glow;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, this.bubbleR + 3, 0, TAU);
      ctx.fill();

      ctx.fillStyle = color.fill;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, this.bubbleR, 0, TAU);
      ctx.fill();
    }

    // 绘制下一个泡泡
    const nextColor = BubbleShooter.BUBBLE_COLORS[this.nextColor];
    ctx.fillStyle = nextColor.fill;
    ctx.beginPath();
    ctx.arc(this.shooter.x, this.shooter.y + 40, this.bubbleR * 0.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 10px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("NEXT", this.shooter.x, this.shooter.y + 58);

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "700 14px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`得分: ${this.score}`, 18, 26);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 12px system-ui";
    ctx.fillText(`关卡: ${this.level} | 目标: ${this.targetScore}`, 18, 46);

    // 下压倒计时
    ctx.fillStyle = "rgba(255,214,150,0.7)";
    ctx.textAlign = "right";
    ctx.fillText(`下压: ${Math.ceil(this.pushTimer)}s`, w - 18, 26);

    // 游戏结束提示
    if (this.over) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(255,110,206,0.9)";
      ctx.font = "700 32px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("游戏结束", w / 2, h / 2 - 30);

      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "600 18px system-ui";
      ctx.fillText(`最终得分: ${this.score}`, w / 2, h / 2 + 10);

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "400 14px system-ui";
      ctx.fillText("按 R 重新开始", w / 2, h / 2 + 45);
    }

    ctx.restore();
  }
}

class MagicTowerGame extends GameBase {
  // 地图元素类型
  static TILE = {
    EMPTY: 0,
    WALL: 1,
    PLAYER: 2,
    MONSTER: 3,
    POTION: 4,
    ATK_UP: 5,
    DEF_UP: 6,
    STAIRS: 7,
    KEY: 8,
    DOOR: 9,
  };

  // 怪物符号
  static MONSTER_TYPES = [
    { symbol: "💀", name: "骷髅", baseHp: 20, baseAtk: 5, baseDef: 2 },
    { symbol: "🦇", name: "蝙蝠", baseHp: 15, baseAtk: 8, baseDef: 1 },
    { symbol: "👻", name: "幽灵", baseHp: 30, baseAtk: 6, baseDef: 4 },
    { symbol: "🐉", name: "小龙", baseHp: 50, baseAtk: 12, baseDef: 6 },
    { symbol: "👹", name: "恶魔", baseHp: 80, baseAtk: 18, baseDef: 10 },
  ];

  // 物品符号
  static ITEMS = {
    [3]: { symbol: "❤️", name: "生命药水", effect: "hp", value: 50 },
    [4]: { symbol: "⚔️", name: "攻击宝石", effect: "atk", value: 3 },
    [5]: { symbol: "🛡️", name: "防御宝石", effect: "def", value: 3 },
    [7]: { symbol: "🪜", name: "楼梯", effect: "stairs", value: 0 },
    [8]: { symbol: "🔑", name: "钥匙", effect: "key", value: 1 },
    [9]: { symbol: "🚪", name: "门", effect: "door", value: 0 },
  };

  constructor(core) {
    super(core);
    this.gridSize = 15;
    this.cell = 0;
    this.ox = 0;
    this.oy = 0;
    this.floor = 1;
    this.maxFloor = 10;
    this.map = [];
    this.player = null;
    this.monsters = [];
    this.message = "";
    this.messageTimer = 0;
    this.over = false;
    this.won = false;
    this.moveCount = 0;
  }

  get title() {
    return "魔塔";
  }

  get hint() {
    return "方向键移动 | 击败怪物 | 到达楼梯 | Esc 返回 | R 重开";
  }

  onEnter() {
    this.over = false;
    this.won = false;
    this.floor = 1;
    this.moveCount = 0;
    this.startFloor();

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  startFloor() {
    this.calculateLayout();

    // 初始化玩家
    if (!this.player) {
      this.player = {
        x: 7,
        y: 13,
        hp: 100,
        maxHp: 100,
        atk: 10,
        def: 5,
        keys: 0,
        gold: 0,
      };
    } else {
      this.player.x = 7;
      this.player.y = 13;
    }

    this.generateMap();
    this.message = `第 ${this.floor} 层`;
    this.messageTimer = 2;
  }

  calculateLayout() {
    const { w, h } = this.core;
    const maxCellSize = 32;
    this.cell = Math.floor(Math.min(
      (w - 40) / this.gridSize,
      (h - 100) / this.gridSize,
      maxCellSize
    ));
    const boardW = this.gridSize * this.cell;
    const boardH = this.gridSize * this.cell;
    this.ox = Math.floor((w - boardW) / 2);
    this.oy = Math.floor((h - boardH) / 2) + 15;
  }

  generateMap() {
    const T = MagicTowerGame.TILE;
    this.map = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(T.EMPTY));
    this.monsters = [];

    // 生成墙壁边界
    for (let i = 0; i < this.gridSize; i++) {
      this.map[0][i] = T.WALL;
      this.map[this.gridSize - 1][i] = T.WALL;
      this.map[i][0] = T.WALL;
      this.map[i][this.gridSize - 1] = T.WALL;
    }

    // 生成随机内部墙壁
    const wallCount = 15 + this.floor * 2;
    for (let i = 0; i < wallCount; i++) {
      let x, y;
      do {
        x = randi(1, this.gridSize - 2);
        y = randi(1, this.gridSize - 2);
      } while (this.map[y][x] !== T.EMPTY || (x === 7 && y >= 11));
      this.map[y][x] = T.WALL;
    }

    // 生成怪物
    const monsterCount = 8 + this.floor * 2;
    for (let i = 0; i < monsterCount; i++) {
      let x, y;
      do {
        x = randi(1, this.gridSize - 2);
        y = randi(1, this.gridSize - 2);
      } while (this.map[y][x] !== T.EMPTY || (x === 7 && y >= 11));

      const typeIdx = Math.min(randi(0, Math.min(this.floor, MagicTowerGame.MONSTER_TYPES.length - 1)), MagicTowerGame.MONSTER_TYPES.length - 1);
      const monsterType = MagicTowerGame.MONSTER_TYPES[typeIdx];
      const floorMultiplier = 1 + (this.floor - 1) * 0.3;

      const monster = {
        x,
        y,
        type: typeIdx,
        symbol: monsterType.symbol,
        name: monsterType.name,
        hp: Math.floor(monsterType.baseHp * floorMultiplier),
        maxHp: Math.floor(monsterType.baseHp * floorMultiplier),
        atk: Math.floor(monsterType.baseAtk * floorMultiplier),
        def: Math.floor(monsterType.baseDef * floorMultiplier),
      };

      this.monsters.push(monster);
      this.map[y][x] = T.MONSTER;
    }

    // 生成物品
    const potionCount = 5 + this.floor;
    const atkCount = 2 + Math.floor(this.floor / 2);
    const defCount = 2 + Math.floor(this.floor / 2);
    const keyCount = 2 + Math.floor(this.floor / 3);

    const placeItem = (type) => {
      let x, y;
      let attempts = 0;
      do {
        x = randi(1, this.gridSize - 2);
        y = randi(1, this.gridSize - 2);
        attempts++;
      } while (this.map[y][x] !== T.EMPTY && attempts < 100);
      if (attempts < 100) this.map[y][x] = type;
    };

    for (let i = 0; i < potionCount; i++) placeItem(T.POTION);
    for (let i = 0; i < atkCount; i++) placeItem(T.ATK_UP);
    for (let i = 0; i < defCount; i++) placeItem(T.DEF_UP);
    for (let i = 0; i < keyCount; i++) placeItem(T.KEY);

    // 生成门
    const doorCount = 2 + Math.floor(this.floor / 2);
    for (let i = 0; i < doorCount; i++) placeItem(T.DOOR);

    // 生成楼梯（如果不是最后一层）
    if (this.floor < this.maxFloor) {
      let sx, sy;
      do {
        sx = randi(3, this.gridSize - 4);
        sy = randi(1, 5);
      } while (this.map[sy][sx] !== T.EMPTY);
      this.map[sy][sx] = T.STAIRS;
    } else {
      // 最后一层，生成通关标记
      let ex, ey;
      do {
        ex = randi(3, this.gridSize - 4);
        ey = randi(1, 5);
      } while (this.map[ey][ex] !== T.EMPTY);
      this.map[ey][ex] = T.STAIRS;
    }

    // 确保玩家出生点周围畅通
    this.map[13][7] = T.EMPTY;
    this.map[12][7] = T.EMPTY;
    this.map[13][6] = T.EMPTY;
    this.map[13][8] = T.EMPTY;
  }

  update(dt) {
    const { input, fx, audio } = this.core;

    if (this.over) {
      if (input.consumeOnce("KeyR")) {
        this.player = null;
        this.floor = 1;
        this.startFloor();
        this.over = false;
      }
      return;
    }

    // 消息计时
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
    }

    // 移动控制
    let dx = 0, dy = 0;
    if (input.consumeOnce("ArrowLeft")) dx = -1;
    else if (input.consumeOnce("ArrowRight")) dx = 1;
    else if (input.consumeOnce("ArrowUp")) dy = -1;
    else if (input.consumeOnce("ArrowDown")) dy = 1;

    if (dx !== 0 || dy !== 0) {
      this.tryMove(dx, dy, fx, audio);
    }
  }

  tryMove(dx, dy, fx, audio) {
    const T = MagicTowerGame.TILE;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    // 边界检查
    if (nx < 0 || nx >= this.gridSize || ny < 0 || ny >= this.gridSize) return;

    const tile = this.map[ny][nx];

    // 墙壁
    if (tile === T.WALL) {
      audio.blip("sine", 100, 0.03, 0.02);
      return;
    }

    // 怪物 - 战斗
    if (tile === T.MONSTER) {
      const monster = this.monsters.find(m => m.x === nx && m.y === ny);
      if (monster) {
        this.combat(monster, fx, audio);
        return;
      }
    }

    // 门 - 需要钥匙
    if (tile === T.DOOR) {
      if (this.player.keys > 0) {
        this.player.keys--;
        this.map[ny][nx] = T.EMPTY;
        this.message = "使用钥匙开门";
        this.messageTimer = 1.5;
        audio.blip("triangle", 400, 0.08, 0.05);
      } else {
        this.message = "需要钥匙才能开门";
        this.messageTimer = 1.5;
        audio.blip("sine", 150, 0.05, 0.03);
        return;
      }
    }

    // 物品
    if (tile === T.POTION) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50);
      this.map[ny][nx] = T.EMPTY;
      this.message = "获得生命药水 +50 HP";
      this.messageTimer = 1.5;
      fx.burst(this.ox + nx * this.cell + this.cell / 2, this.oy + ny * this.cell + this.cell / 2, "#ff6ece", 10, 100);
      audio.blip("triangle", 500, 0.06, 0.04);
    }

    if (tile === T.ATK_UP) {
      this.player.atk += 3;
      this.map[ny][nx] = T.EMPTY;
      this.message = "获得攻击宝石 +3 ATK";
      this.messageTimer = 1.5;
      fx.burst(this.ox + nx * this.cell + this.cell / 2, this.oy + ny * this.cell + this.cell / 2, "#ff8b8b", 10, 100);
      audio.blip("triangle", 600, 0.06, 0.04);
    }

    if (tile === T.DEF_UP) {
      this.player.def += 3;
      this.map[ny][nx] = T.EMPTY;
      this.message = "获得防御宝石 +3 DEF";
      this.messageTimer = 1.5;
      fx.burst(this.ox + nx * this.cell + this.cell / 2, this.oy + ny * this.cell + this.cell / 2, "#78beff", 10, 100);
      audio.blip("triangle", 450, 0.06, 0.04);
    }

    if (tile === T.KEY) {
      this.player.keys++;
      this.map[ny][nx] = T.EMPTY;
      this.message = "获得钥匙";
      this.messageTimer = 1.5;
      audio.blip("square", 350, 0.06, 0.04);
    }

    // 楼梯
    if (tile === T.STAIRS) {
      if (this.floor >= this.maxFloor) {
        this.win(fx, audio);
        return;
      } else {
        this.floor++;
        this.startFloor();
        audio.blip("triangle", 700, 0.1, 0.06);
        return;
      }
    }

    // 移动
    this.player.x = nx;
    this.player.y = ny;
    this.moveCount++;
  }

  combat(monster, fx, audio) {
    // 计算伤害
    const playerDmg = Math.max(1, this.player.atk - monster.def);
    const monsterDmg = Math.max(1, monster.atk - this.player.def);

    // 计算回合数
    const turnsToKill = Math.ceil(monster.hp / playerDmg);
    const totalDmgTaken = turnsToKill * monsterDmg;

    // 检查玩家是否能赢
    if (this.player.hp <= totalDmgTaken) {
      this.message = `无法击败 ${monster.name}！需要更多HP或属性`;
      this.messageTimer = 2;
      audio.blip("sawtooth", 100, 0.1, 0.05);
      return;
    }

    // 执行战斗
    this.player.hp -= totalDmgTaken;
    this.player.gold += 10 + this.floor * 5;

    // 移除怪物
    const idx = this.monsters.indexOf(monster);
    if (idx >= 0) this.monsters.splice(idx, 1);
    this.map[monster.y][monster.x] = MagicTowerGame.TILE.EMPTY;

    // 特效
    fx.burst(
      this.ox + monster.x * this.cell + this.cell / 2,
      this.oy + monster.y * this.cell + this.cell / 2,
      "#ff6ece", 20, 200
    );
    fx.addShake(6);

    this.message = `击败 ${monster.name}！受到 ${totalDmgTaken} 伤害`;
    this.messageTimer = 2;
    audio.blip("triangle", 300, 0.1, 0.06);
  }

  win(fx, audio) {
    this.over = true;
    this.won = true;
    fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#84ffb3", 80, 500);
    fx.addShake(15);
    audio.blip("square", 880, 0.2, 0.08);
    this.core.toast(`通关！总步数: ${this.moveCount} | 按 R 重新开始`);
  }

  gameOver() {
    this.over = true;
    this.core.fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#ff6ece", 60, 400);
    this.core.fx.addShake(12);
    this.core.audio.blip("sawtooth", 150, 0.15, 0.07);
    this.core.toast(`生命耗尽！按 R 重新开始`);
  }

  draw(ctx) {
    const { w, h } = this.core;
    const T = MagicTowerGame.TILE;
    const cell = this.cell;

    ctx.save();

    // 绘制地图
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const px = this.ox + x * cell;
        const py = this.oy + y * cell;
        const tile = this.map[y][x];

        // 地板
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.fillRect(px, py, cell - 1, cell - 1);

        // 墙壁
        if (tile === T.WALL) {
          ctx.fillStyle = "rgba(120,190,255,0.2)";
          roundRect(ctx, px, py, cell - 1, cell - 1, 3);
          ctx.fill();
          ctx.strokeStyle = "rgba(120,190,255,0.4)";
          ctx.lineWidth = 1;
          roundRect(ctx, px, py, cell - 1, cell - 1, 3);
          ctx.stroke();
        }

        // 物品
        if (tile === T.POTION || tile === T.ATK_UP || tile === T.DEF_UP || tile === T.KEY || tile === T.DOOR || tile === T.STAIRS) {
          const item = MagicTowerGame.ITEMS[tile];
          if (item) {
            ctx.font = `${cell * 0.6}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(item.symbol, px + cell / 2, py + cell / 2);
          }
        }

        // 怪物
        if (tile === T.MONSTER) {
          const monster = this.monsters.find(m => m.x === x && m.y === y);
          if (monster) {
            // 怪物背景
            ctx.fillStyle = "rgba(255,110,206,0.15)";
            roundRect(ctx, px, py, cell - 1, cell - 1, 3);
            ctx.fill();

            // 怪物符号
            ctx.font = `${cell * 0.6}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(monster.symbol, px + cell / 2, py + cell / 2);

            // 怪物血条
            const barW = cell - 6;
            const barH = 3;
            const barX = px + 3;
            const barY = py + cell - 6;
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = "rgba(255,110,206,0.8)";
            ctx.fillRect(barX, barY, barW * (monster.hp / monster.maxHp), barH);
          }
        }
      }
    }

    // 绘制玩家
    const playerPx = this.ox + this.player.x * cell;
    const playerPy = this.oy + this.player.y * cell;

    // 玩家发光效果
    ctx.fillStyle = "rgba(132,255,179,0.2)";
    ctx.beginPath();
    ctx.arc(playerPx + cell / 2, playerPy + cell / 2, cell * 0.6, 0, TAU);
    ctx.fill();

    // 玩家符号
    ctx.font = `${cell * 0.7}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText("🧑", playerPx + cell / 2, playerPy + cell / 2);

    // HUD - 玩家属性
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "700 13px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`❤️ ${this.player.hp}/${this.player.maxHp}`, 10, 22);
    ctx.fillText(`⚔️ ${this.player.atk}`, 10, 40);
    ctx.fillText(`🛡️ ${this.player.def}`, 10, 58);
    ctx.fillText(`🔑 ${this.player.keys}`, 10, 76);

    // 楼层信息
    ctx.textAlign = "right";
    ctx.fillText(`第 ${this.floor}/${this.maxFloor} 层`, w - 10, 22);
    ctx.fillText(`步数: ${this.moveCount}`, w - 10, 40);
    ctx.fillText(`💰 ${this.player.gold}`, w - 10, 58);

    // 消息提示
    if (this.messageTimer > 0 && this.message) {
      const alpha = Math.min(1, this.messageTimer);
      ctx.fillStyle = `rgba(255,214,150,${alpha * 0.9})`;
      ctx.font = "600 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(this.message, w / 2, this.oy + this.gridSize * cell + 20);
    }

    // 游戏结束提示
    if (this.over) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, w, h);

      if (this.won) {
        ctx.fillStyle = "rgba(132,255,179,0.9)";
        ctx.font = "700 32px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("通关成功！", w / 2, h / 2 - 30);

        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "600 18px system-ui";
        ctx.fillText(`总步数: ${this.moveCount}`, w / 2, h / 2 + 10);
      } else {
        ctx.fillStyle = "rgba(255,110,206,0.9)";
        ctx.font = "700 32px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("生命耗尽", w / 2, h / 2 - 30);
      }

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "400 14px system-ui";
      ctx.fillText("按 R 重新开始", w / 2, h / 2 + 45);
    }

    ctx.restore();
  }
}

function drawMenuBackdrop(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const t = now() * 0.001;
  for (let i = 0; i < 6; i++) {
    const a = t * 0.3 + i;
    const x = w * 0.5 + Math.cos(a) * (w * 0.18 + i * 18);
    const y = h * 0.5 + Math.sin(a * 1.2) * (h * 0.16 + i * 14);
    const r = 120 + i * 26;
    const g = ctx.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, i % 2 ? "rgba(120,190,255,0.10)" : "rgba(255,110,206,0.08)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}

// boot
const canvas = document.getElementById("c");
const core = new Core(canvas);

const games = {
  tank: new TankGame(core),
  tetris: new TetrisGame(core),
  shooter: new ShooterGame(core),
  billiards: new BilliardsGame(core),
  fall: new FallGame(core),
  racing: new RacingGame(core),
  snake: new SnakeGame(core),
  memory: new MemoryGame(core),
  game2048: new Game2048(core),
  bubble: new BubbleShooter(core),
  tower: new MagicTowerGame(core),
};

async function startGameSafe(game) {
  try {
    await core.audio.resume();
  } catch (err) {
    console.warn("Audio resume failed, continue without sound", err);
  }
  core.start(game);
}

const btnTank = document.getElementById("btnTank");
const btnTetris = document.getElementById("btnTetris");
const btnShooter = document.getElementById("btnShooter");
const btnBilliards = document.getElementById("btnBilliards");
const btnFall = document.getElementById("btnFall");
const btnRacing = document.getElementById("btnRacing");
const btnSnake = document.getElementById("btnSnake");
const btnMemory = document.getElementById("btnMemory");
const btn2048 = document.getElementById("btn2048");
const btnBubble = document.getElementById("btnBubble");
const btnTower = document.getElementById("btnTower");

btnTank.addEventListener("click", () => startGameSafe(games.tank));
btnTetris.addEventListener("click", () => startGameSafe(games.tetris));
btnShooter.addEventListener("click", () => startGameSafe(games.shooter));
btnBilliards.addEventListener("click", () => startGameSafe(games.billiards));
btnFall.addEventListener("click", () => startGameSafe(games.fall));
btnRacing.addEventListener("click", () => startGameSafe(games.racing));
btnSnake.addEventListener("click", () => startGameSafe(games.snake));
btnMemory.addEventListener("click", () => startGameSafe(games.memory));
btn2048.addEventListener("click", () => startGameSafe(games.game2048));
btnBubble.addEventListener("click", () => startGameSafe(games.bubble));
btnTower.addEventListener("click", () => startGameSafe(games.tower));

window.addEventListener("keydown", async (e) => {
  if (core.mode !== "menu") return;
  if (["Digit1", "Numpad1"].includes(e.code)) {
    startGameSafe(games.tank);
  }
  if (["Digit2", "Numpad2"].includes(e.code)) {
    startGameSafe(games.tetris);
  }
  if (["Digit3", "Numpad3"].includes(e.code)) {
    startGameSafe(games.shooter);
  }
  if (["Digit4", "Numpad4"].includes(e.code)) {
    startGameSafe(games.billiards);
  }
  if (["Digit5", "Numpad5"].includes(e.code)) {
    startGameSafe(games.fall);
  }
  if (["Digit6", "Numpad6"].includes(e.code)) {
    startGameSafe(games.racing);
  }
  if (["Digit7", "Numpad7"].includes(e.code)) {
    startGameSafe(games.snake);
  }
  if (["Digit8", "Numpad8"].includes(e.code)) {
    startGameSafe(games.memory);
  }
  if (["Digit9", "Numpad9"].includes(e.code)) {
    startGameSafe(games.game2048);
  }
  if (["Digit0", "Numpad0"].includes(e.code)) {
    startGameSafe(games.bubble);
  }
  if (["Minus", "NumpadSubtract"].includes(e.code)) {
    startGameSafe(games.tower);
  }
});

core.showMenu();

let last = now();
function loop() {
  try {
    const t = now();
    const dt = clamp((t - last) / 1000, 0, 0.033);
    last = t;
    core.frame(dt);
    requestAnimationFrame(loop);
  } catch (err) {
    // If something goes wrong at runtime, show a visible hint instead of silently freezing.
    console.error(err);
    core.overlay.hidden = false;
    core.backBtn.hidden = true;
    core.setHud("发生错误", "按 F12 查看控制台错误；可刷新页面重试");
    core.toast("运行时错误：按 F12 查看控制台", 5000);
  }
}
requestAnimationFrame(loop);
