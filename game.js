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
      this.targetEl.focus?.();
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

      e.vx = (e.vx ?? 0) + Math.cos(e.a) * accel * dir * dt;
      e.vy = (e.vy ?? 0) + Math.sin(e.a) * accel * dir * dt;

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
        const vn = (t.vx ?? 0) * nx + (t.vy ?? 0) * ny;
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
  constructor(core) {
    super(core);
    this.gridW = 10;
    this.gridH = 20;
    this.cell = 22;
    this.board = [];
    this.bag = [];
    this.cur = null;
    this.next = null;
    this.dropT = 0;
    this.dropEvery = 0.7;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.over = false;
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
    this.dropEvery = 0.7;
    this.dropT = 0;

    this.board = Array.from({ length: this.gridH }, () => Array(this.gridW).fill(0));
    this.bag = [];
    this.cur = this.spawn();
    this.next = this.spawn();

    this.core.starfield.vx = 0;
    this.core.starfield.vy = 0;
  }

  pieces() {
    // 4x4 matrices (row-major)
    return {
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
    const p = this.pieces()[type];
    return {
      type,
      color: p.color,
      m: p.m.map((r) => r.slice()),
      x: 3,
      y: -1,
    };
  }

  rotate(m) {
    const n = 4;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) r[x][n - 1 - y] = m[y][x];
    return r;
  }

  collide(piece, ox = 0, oy = 0, mat = null) {
    const m = mat ?? piece.m;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!m[y][x]) continue;
        const gx = piece.x + x + ox;
        const gy = piece.y + y + oy;
        if (gx < 0 || gx >= this.gridW || gy >= this.gridH) return true;
        if (gy >= 0 && this.board[gy][gx]) return true;
      }
    }
    return false;
  }

  lock() {
    const { fx, audio } = this.core;

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!this.cur.m[y][x]) continue;
        const gx = this.cur.x + x;
        const gy = this.cur.y + y;
        if (gy < 0) {
          this.gameOver();
          return;
        }
        this.board[gy][gx] = this.cur.color;
      }
    }

    audio.blip("square", 320, 0.05, 0.04);

    let cleared = 0;
    for (let y = this.gridH - 1; y >= 0; y--) {
      if (this.board[y].every((c) => c)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(this.gridW).fill(0));
        cleared++;
        y++;
      }
    }

    if (cleared > 0) {
      const add = [0, 100, 300, 500, 800][cleared] ?? 0;
      this.score += add * this.level;
      this.lines += cleared;
      this.level = 1 + Math.floor(this.lines / 10);
      this.dropEvery = Math.max(0.12, 0.7 - (this.level - 1) * 0.06);

      fx.burst(this.core.w * 0.52, this.core.h * 0.52, "#78beff", 40 + cleared * 10, 340);
      fx.addShake(10);
      audio.blip("triangle", 520, 0.08, 0.05);
    }

    this.cur = this.next;
    this.next = this.spawn();
    if (this.collide(this.cur, 0, 0)) {
      this.gameOver();
    }
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

    if (!this.over) {
      if (input.consumeOnce("ArrowLeft") && !this.collide(this.cur, -1, 0)) this.cur.x -= 1;
      if (input.consumeOnce("ArrowRight") && !this.collide(this.cur, 1, 0)) this.cur.x += 1;

      if (input.consumeOnce("ArrowUp")) {
        const rm = this.rotate(this.cur.m);
        // simple wall-kick
        const kicks = [0, -1, 1, -2, 2];
        for (const k of kicks) {
          if (!this.collide(this.cur, k, 0, rm)) {
            this.cur.m = rm;
            this.cur.x += k;
            this.core.audio.blip("sine", 520, 0.04, 0.03);
            break;
          }
        }
      }

      if (input.consumeOnce("Space")) {
        // hard drop
        let steps = 0;
        while (!this.collide(this.cur, 0, 1)) {
          this.cur.y += 1;
          steps++;
        }
        this.score += steps * 2;
        this.lock();
        this.dropT = 0;
      }

      const fast = input.isDown("ArrowDown") ? 0.06 : this.dropEvery;
      this.dropT += dt;
      if (this.dropT >= fast) {
        this.dropT = 0;
        if (!this.collide(this.cur, 0, 1)) {
          this.cur.y += 1;
        } else {
          this.lock();
        }
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
      let gy = this.cur.y;
      while (true) {
        const probe = { ...this.cur, y: gy };
        if (this.collide(probe, 0, 1)) break;
        gy += 1;
        if (gy > this.gridH + 4) break;
      }
      const ghost = { ...this.cur, y: gy, color: this.cur.color + "55" };
      drawPiece(ctx, ghost, ox, oy, cell, true);

      drawPiece(ctx, this.cur, ox, oy, cell);
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
    drawPiece(ctx, { ...this.next, x: 1, y: 1 }, sx + 22, sy + 40, cell);

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
  }

  get title() {
    return "台球（九球简化）";
  }

  get hint() {
    return "鼠标拖拽击球 | 先打最小号 | R 重开 | Esc 返回";
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

    if (this.turnActive && this.allStopped()) {
      this.finishTurn();
    }

    // Input: drag to aim when balls stopped
    if (this.allStopped() && !this.over) {
      if (input.mouse.down) {
        this.aiming = true;
      }
      if (this.aiming && !input.mouse.down && this.wasDown) {
        const dx = cueBall.x - input.mouse.x;
        const dy = cueBall.y - input.mouse.y;
        const len = Math.hypot(dx, dy) || 1;
        const power = clamp(len, 12, 160);
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
        this.aiming = false;
      }
      this.wasDown = input.mouse.down;
    } else {
      this.aiming = false;
      this.wasDown = input.mouse.down;
    }

    // Physics
    this.simulate(dt);

    // Win condition
    const remaining = this.balls.filter((b) => !b.cue);
    if (!this.over && remaining.length === 0) {
      this.over = true;
      fx.burst(this.core.w * 0.5, this.core.h * 0.5, "#84ffb3", 80, 520);
      fx.addShake(14);
      audio.blip("triangle", 360, 0.18, 0.08);
      this.core.toast("清台！按 R 或 按钮重新开始");
    }
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
    if (this.targetBall) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "600 12px system-ui";
      ctx.fillText(`目标球：${this.targetBall} 号`, l, t - 32);
    }
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

    if (foul) {
      this.score = Math.max(0, this.score - this.turnPocketed.length);
      this.respotPocketed();
      const cue = this.balls.find((b) => b.cue);
      if (cue) {
        cue.x = this.core.w * 0.28;
        cue.y = this.core.h * 0.5;
        cue.vx = cue.vy = 0;
      }
      const msg = lowest ? `犯规：必须先击中 ${lowest} 号球` : "犯规";
      this.core.toast(msg);
    } else {
      const p9 = this.turnPocketed.find((b) => b.number === 9);
      if (p9) {
        this.winNineBall();
      }
    }

    this.turnPocketed = [];
    this.firstHit = null;
    this.scratch = false;
    this.targetBall = this.lowestBallNumber();
  }

  respotPocketed() {
    for (const ball of this.turnPocketed) {
      if (!ball.number) continue;
      const spawn = this.spawnPositions[ball.number] ?? { x: this.core.w * 0.65, y: this.core.h * 0.5 };
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
    this.core.toast("9 号入袋，清台！按 R 重来");
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
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (!piece.m[y][x]) continue;
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
    if (this.active) this.active.onExit?.();
    this.active = null;
    this.setHud("小游戏合集", "快捷键：1 / 2 / 3 / 4 / 5 / 6 开始；单击画面获取键盘焦点");
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
    if (this.active) this.active.onExit?.();
    this.active = game;
    this.active.onEnter?.();
    this.setHud(game.title, game.hint);
    this.toast(`${game.title}：开始！`);
    this.canvas.focus?.();
  }

  restart() {
    if (!this.active) return;
    this.active.onEnter?.();
    this.setHud(this.active.title, this.active.hint);
    this.toast("已重新开始");
    this.canvas.focus?.();
  }

  handleResize() {
    // keep internal resolution stable but adjust starfield bounds
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.starfield.resize(this.w, this.h);
    this.active?.onResize?.(this.w, this.h);
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

btnTank.addEventListener("click", () => startGameSafe(games.tank));
btnTetris.addEventListener("click", () => startGameSafe(games.tetris));
btnShooter.addEventListener("click", () => startGameSafe(games.shooter));
btnBilliards.addEventListener("click", () => startGameSafe(games.billiards));
btnFall.addEventListener("click", () => startGameSafe(games.fall));
btnRacing.addEventListener("click", () => startGameSafe(games.racing));

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
