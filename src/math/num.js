// Точная арифметика: числа вида  q0 + q1·√r1 + q2·√r2 + …,
// где q — рациональные (BigInt/BigInt), r — бесквадратные натуральные числа.
// Такие числа образуют поле (мультиквадратичное расширение Q): сложение, умножение,
// деление, сравнение и проверка на ноль выполняются без округлений.

const abs = (a) => (a < 0n ? -a : a);

export function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

const FACTOR_LIMIT = 3_000_000;
const factorCache = new Map();

// Разложение n > 0 на простые: Map<простое, показатель>
function factor(n) {
  const cached = factorCache.get(n);
  if (cached) return cached;
  const res = new Map();
  let m = n, steps = 0;
  for (let p = 2n; p * p <= m; p += p === 2n ? 1n : 2n) {
    if (++steps > FACTOR_LIMIT) throw new Error('Слишком большие числа для точного вычисления');
    let e = 0;
    while (m % p === 0n) { m /= p; e++; }
    if (e) res.set(p, e);
  }
  if (m > 1n) res.set(m, (res.get(m) || 0) + 1);
  factorCache.set(n, res);
  return res;
}

// n = s²·r, r бесквадратное
function squareSplit(n) {
  let s = 1n, r = 1n;
  for (const [p, e] of factor(n)) {
    s *= p ** BigInt(e >> 1);
    if (e & 1) r *= p;
  }
  return [s, r];
}

function norm(p, q) {
  if (q < 0n) { p = -p; q = -q; }
  const g = gcd(p, q);
  return [p / g, q / g];
}

function put(map, r, p, q) {
  const c = map.get(r);
  [p, q] = c ? norm(c[0] * q + p * c[1], c[1] * q) : norm(p, q);
  if (p === 0n) map.delete(r); else map.set(r, [p, q]);
}

export class Num {
  /** @param {Map<bigint,[bigint,bigint]>} t  радиканд → коэффициент p/q */
  constructor(t) { this.t = t; }

  static frac(p, q = 1n) {
    p = BigInt(p); q = BigInt(q);
    if (q === 0n) throw new Error('Деление на ноль');
    const t = new Map();
    put(t, 1n, p, q);
    return new Num(t);
  }

  isZero() { return this.t.size === 0; }
  isRational() { return this.t.size === 0 || (this.t.size === 1 && this.t.has(1n)); }
  /** [p, q] для рационального числа */
  rational() { return this.t.get(1n) || [0n, 1n]; }
  isInteger() { return this.isRational() && this.rational()[1] === 1n; }

  neg() {
    const t = new Map();
    for (const [r, [p, q]] of this.t) t.set(r, [-p, q]);
    return new Num(t);
  }
  add(o) {
    o = N(o);
    const t = new Map(this.t);
    for (const [r, [p, q]] of o.t) put(t, r, p, q);
    return new Num(t);
  }
  sub(o) { return this.add(N(o).neg()); }
  mul(o) {
    o = N(o);
    const t = new Map();
    for (const [r1, [p1, q1]] of this.t) {
      for (const [r2, [p2, q2]] of o.t) {
        const g = gcd(r1, r2);
        put(t, (r1 / g) * (r2 / g), p1 * p2 * g, q1 * q2);
      }
    }
    return new Num(t);
  }
  sq() { return this.mul(this); }

  /** Простые, входящие в радиканды */
  primes() {
    const s = new Set();
    for (const r of this.t.keys()) for (const p of factor(r).keys()) s.add(p);
    return [...s];
  }
  /** this = a + b·√p, где a и b не содержат p */
  split(p) {
    const a = new Map(), b = new Map();
    for (const [r, c] of this.t) {
      if (r % p === 0n) b.set(r / p, c); else a.set(r, c);
    }
    return [new Num(a), new Num(b)];
  }

  inv() {
    if (this.isZero()) throw new Error('Деление на ноль');
    if (this.isRational()) { const [p, q] = this.rational(); return Num.frac(q, p); }
    // домножаем на сопряжённое по одному из простых — оно исчезает из знаменателя
    const p = this.primes()[0];
    const [a, b] = this.split(p);
    const conj = a.sub(b.mul(sqrtInt(p)));
    return conj.mul(this.mul(conj).inv());
  }
  div(o) { return this.mul(N(o).inv()); }

  /** Точный знак: -1, 0, 1 */
  sign() {
    if (this.isZero()) return 0;
    if (this.isRational()) return this.rational()[0] > 0n ? 1 : -1;
    const p = this.primes()[0];
    const [a, b] = this.split(p);
    const sa = a.sign(), sb = b.sign();
    if (sa === 0) return sb;
    if (sb === 0 || sa === sb) return sa;
    // знаки разные: сравниваем a² и p·b²
    return sa * a.sq().sub(b.sq().mul(Num.frac(p))).sign();
  }
  cmp(o) { return this.sub(o).sign(); }
  eq(o) { return this.sub(o).isZero(); }

  toNumber() {
    let s = 0;
    for (const [r, [p, q]] of this.t) s += ratioToNumber(p, q) * Math.sqrt(Number(r));
    return s;
  }
}

function ratioToNumber(p, q) {
  const v = Number(p) / Number(q);
  if (Number.isFinite(v)) return v;
  // очень длинные числа: делим с запасом точности
  const scale = 10n ** 30n;
  return Number((p * scale) / q) / 1e30;
}

/** √n для натурального n */
function sqrtInt(n) {
  const [s, r] = squareSplit(n);
  return new Num(new Map([[r, [s, 1n]]]));
}

/** Приведение к Num: Num | bigint | целое number | строка "p/q" */
export function N(x) {
  if (x instanceof Num) return x;
  if (typeof x === 'bigint') return Num.frac(x);
  if (typeof x === 'number') {
    if (!Number.isInteger(x)) throw new Error('N(): дробное число, используйте строку или Num.frac');
    return Num.frac(BigInt(x));
  }
  if (typeof x === 'string') {
    const [p, q] = x.split('/');
    return Num.frac(BigInt(p), q ? BigInt(q) : 1n);
  }
  throw new Error('N(): неподдерживаемый аргумент');
}

export const ZERO = N(0), ONE = N(1), TWO = N(2);

/**
 * Точный квадратный корень в том же классе чисел (с «распутыванием» вложенных
 * радикалов: √(3+2√2) = 1+√2). Возвращает null, если корень так не выражается.
 */
export function sqrtNum(x, depth = 0) {
  const s = x.sign();
  if (s < 0) throw new Error('Корень из отрицательного числа');
  if (s === 0) return ZERO;
  if (x.isRational()) {
    const [p, q] = x.rational();
    return sqrtInt(p * q).div(Num.frac(q));
  }
  if (depth > 3) return null;
  for (const p of x.primes()) {
    const [a, b] = x.split(p);
    const n = a.sq().sub(b.sq().mul(Num.frac(p)));
    if (a.sign() <= 0 || n.sign() < 0) continue;
    const c = sqrtNum(n, depth + 1);
    if (!c) continue;
    const u = a.add(c).div(TWO), v = a.sub(c).div(TWO);
    if (u.sign() < 0 || v.sign() < 0) continue;
    const su = sqrtNum(u, depth + 1), sv = sqrtNum(v, depth + 1);
    if (!su || !sv) continue;
    const y = b.sign() >= 0 ? su.add(sv) : su.sub(sv);
    if (y.sq().eq(x)) return y.sign() < 0 ? y.neg() : y;
  }
  return null;
}

// ───────────────────────── Значения-результаты ─────────────────────────
// Val — либо Num, либо { root: Num } (корень, который не упрощается: √(5+√3)),
// либо { sum: Val[] }.

/** √x как Val */
export function rootOf(x) {
  const r = sqrtNum(x);
  return r || { root: x };
}

export function valToNumber(v) {
  if (v instanceof Num) return v.toNumber();
  if (v.root) return Math.sqrt(v.root.toNumber());
  return v.sum.reduce((s, t) => s + valToNumber(t), 0);
}

/** Сумма значений: рациональные и «хорошие» корни складываются точно */
export function sumVals(vals) {
  let acc = ZERO;
  const rest = [];
  const flat = [];
  const walk = (v) => (!(v instanceof Num) && v.sum ? v.sum.forEach(walk) : flat.push(v));
  vals.forEach(walk);
  for (const v of flat) {
    if (v instanceof Num) acc = acc.add(v);
    else {
      const same = rest.find((r) => r.root.eq(v.root));
      if (same) same.k += 1; else rest.push({ root: v.root, k: 1 });
    }
  }
  if (!rest.length) return acc;
  const parts = rest.map((r) => ({ root: r.root.mul(N(r.k * r.k)) }));
  if (!acc.isZero()) parts.unshift(acc);
  return parts.length === 1 ? parts[0] : { sum: parts };
}

// ───────────────────────────── Форматирование ─────────────────────────────

function lcm(a, b) { return (a / gcd(a, b)) * b; }

/** Num → { num: [[радиканд, целый коэф.]], den } */
function overCommonDen(x) {
  let den = 1n;
  for (const [, [, q]] of x.t) den = lcm(den, q);
  const num = [...x.t].map(([r, [p, q]]) => [r, p * (den / q)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { num, den };
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Буквенный множитель: a, a², a³… (пустая строка, если буквы нет или степень нулевая) */
export function unitStr(sym, deg) {
  if (!sym || !deg) return '';
  if (deg === 1) return sym;
  return sym + (deg < 0 ? '⁻' : '') + String(Math.abs(deg)).replace(/\d/g, (d) => SUP[d]);
}

function numeratorStr(num, unit = '') {
  let s = '';
  num.forEach(([r, c], i) => {
    const a = abs(c);
    const body = (a === 1n && (r !== 1n || unit) ? '' : `${a}`) + unit + (r === 1n ? '' : `√${r}`);
    if (i === 0) s += (c < 0n ? '−' : '') + body;
    else s += (c < 0n ? ' − ' : ' + ') + body;
  });
  return s;
}

/** unit — буквенный множитель (см. unitStr): fmtNum(3√3/4, 'a²') = «3a²√3/4» */
export function fmtNum(x, unit = '') {
  if (x.isZero()) return '0';
  const { num, den } = overCommonDen(x);
  const tail = den === 1n ? '' : `/${den}`;
  if (num.length === 1) return numeratorStr(num, unit) + tail;
  const s = numeratorStr(num);
  return unit || tail ? `${unit}(${s})${tail}` : s;
}

export function fmtVal(v, unit = '') {
  if (v instanceof Num) return fmtNum(v, unit);
  if (v.sum) { const s = v.sum.map((t) => fmtVal(t)).join(' + '); return unit ? `${unit}(${s})` : s; }
  // √x, x не упрощается: выносим рациональный множитель
  const { num, den } = overCommonDen(v.root);
  let g = 0n;
  for (const [, c] of num) g = gcd(g, c);
  // x = (g/den)·y,  √(g/den) = s·√t / den
  const [s, t] = squareSplit(g * den);
  const inner = new Num(new Map(num.map(([r, c]) => [r, [c / g, 1n]]))).mul(Num.frac(t));
  const coef = norm(s, den);
  const body = `√(${fmtNum(inner)})`;
  return (coef[0] === 1n ? '' : `${coef[0]}`) + unit + body + (coef[1] === 1n ? '' : `/${coef[1]}`);
}

export function fmtApprox(x, digits = 4) {
  if (!Number.isFinite(x)) return '';
  let s = x.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s.replace('.', ',').replace('-', '−');
}

/** Нужно ли показывать приближение (для целых и коротких дробей оно лишнее) */
export function isPlain(v) { return v instanceof Num && v.isInteger(); }

// ─────────────────────────────── Разбор ввода ───────────────────────────────
// Понимает: 3, 1.5, 1,5, 3/2, 2√3, sqrt(2), (1+√5)/2, 2^3,
// а для размеров фигуры — ещё и одну букву-масштаб: a, 2a, a/2, a√3.
//
// Буква означает положительную длину. Внутри разбора значение — одночлен c·aᵈ
// (c — точное число, d — целая степень), поэтому складывать можно только
// слагаемые одной степени: «a + 1» не пропорционально a и размером быть не может.

function parseExpr(src) {
  const s = String(src).replace(/\s+/g, '').replace(/sqrt/gi, '√').replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/:/g, '/');
  if (!s) throw new Error('Пустое значение');
  let i = 0, sym = null;
  const peek = () => s[i];
  const fail = () => { throw new Error(`Не удалось разобрать «${src}»`); };
  const isLetter = (c) => c !== undefined && /[a-zA-Z]/.test(c);
  const M = (v, d = 0) => ({ v, d });

  function expr() {
    let x = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const y = term();
      if (x.d !== y.d && !x.v.isZero() && !y.v.isZero()) {
        throw new Error(`в «${src}» складываются величины разной размерности (например, буква и число без буквы) — размер должен быть пропорционален ${sym}: 2${sym}, ${sym}/2, ${sym}√3`);
      }
      x = M(op === '+' ? x.v.add(y.v) : x.v.sub(y.v), x.v.isZero() ? y.d : x.d);
    }
    return x;
  }
  function term() {
    let x = unary();
    for (;;) {
      const c = peek();
      if (c === '*') { i++; const y = unary(); x = M(x.v.mul(y.v), x.d + y.d); }
      else if (c === '/') { i++; const y = unary(); if (y.v.isZero()) throw new Error('Деление на ноль'); x = M(x.v.div(y.v), x.d - y.d); }
      else if (c === '√' || c === '(' || isLetter(c)) { const y = unary(); x = M(x.v.mul(y.v), x.d + y.d); }
      else return x;
    }
  }
  function unary() {
    if (peek() === '-') { i++; const x = unary(); return M(x.v.neg(), x.d); }
    if (peek() === '+') { i++; return unary(); }
    let x = atom();
    if (peek() === '^') {
      i++;
      const m = /^\d+/.exec(s.slice(i));
      if (!m || +m[0] > 64) fail();
      i += m[0].length;
      let r = ONE;
      for (let k = 0; k < +m[0]; k++) r = r.mul(x.v);
      x = M(r, x.d * +m[0]);
    }
    return x;
  }
  function atom() {
    const c = peek();
    if (c === '(') { i++; const x = expr(); if (s[i++] !== ')') fail(); return x; }
    if (c === '√') {
      i++;
      const x = atom();
      if (x.v.sign() < 0) throw new Error('Корень из отрицательного числа');
      if (x.d % 2) throw new Error(`корень из буквы ${sym} не поддерживается — размер должен быть пропорционален самой букве`);
      const r = sqrtNum(x.v);
      if (!r) throw new Error(`Корень в «${src}» не упрощается — такой размер не поддерживается`);
      return M(r, x.d / 2); // √(a²) = a, потому что a > 0
    }
    if (isLetter(c)) {
      if (sym && sym !== c) throw new Error(`в размере встречаются две буквы, ${sym} и ${c}. Поддерживается одна буква-масштаб: все размеры должны быть пропорциональны ей (${sym}, 2${sym}, ${sym}√3)`);
      sym = c; i++;
      return M(ONE, 1);
    }
    if (c !== undefined && /\p{L}/u.test(c)) throw new Error(`«${c}» — не латинская буква; размер обозначается латинской буквой (a, b, h…)`);
    const m = /^(\d+)(?:[.,](\d+))?/.exec(s.slice(i));
    if (!m) fail();
    i += m[0].length;
    const frac = m[2] || '';
    return M(Num.frac(BigInt(m[1] + frac), 10n ** BigInt(frac.length)));
  }

  const x = expr();
  if (i !== s.length) fail();
  return { v: x.v, deg: x.v.isZero() ? 0 : x.d, sym };
}

/** Число без букв */
export function parseNum(src) {
  const x = parseExpr(src);
  if (x.sym) throw new Error(`в «${src}» есть буква, а здесь нужно число`);
  return x.v;
}

/**
 * Размер фигуры: число (sym = null) или c·буква — тогда v = c, а sym — буква.
 * @returns {{ v: Num, sym: string | null }}
 */
export function parseDim(src) {
  const x = parseExpr(src);
  if (x.deg === 0) return { v: x.v, sym: null };
  if (x.deg !== 1) throw new Error(`«${src}» — не длина: буква ${x.sym} должна входить в первой степени (${x.sym}, 2${x.sym}, ${x.sym}/2, ${x.sym}√3)`);
  return { v: x.v, sym: x.sym };
}
