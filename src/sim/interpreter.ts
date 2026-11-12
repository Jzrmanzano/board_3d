/* An interpreter for the subset of Arduino C++ the lessons use. */

export interface Hardware {
  consts: Record<string, number>;
  sleep(ms: number): Promise<void>;
  pause(): Promise<void>;
  now(): number;
  pinMode(pin: number, mode: number): void;
  digitalWrite(pin: number, value: number): void;
  digitalRead(pin: number): number;
  analogRead(pin: number): number;
  analogWrite(pin: number, value: number): void;
  tone(pin: number, freq: number, duration?: number): void;
  noTone(pin: number): void;
  pulseIn(pin: number): number;
  touchRead(pin: number): number;
  print(text: string): void;
}
export interface RunControl {
  stop: boolean;
  onLoop?: () => void;
  /** Called with the line of each statement just before it runs. Return a promise to hold the sketch there. */
  step?: (line: number) => Promise<void> | void;
}

export class SimError extends Error {
  line: number;
  constructor(msg: string, line: number) { super(msg); this.line = line; }
}

type Tok =
  | { t: 'str' | 'id' | 'op' | 'eof'; v: string; line: number }
  | { t: 'chr'; v: number; line: number }
  | { t: 'num'; v: number; f: boolean; line: number };
type IdTok = { t: 'id'; v: string; line: number };

interface Ty { float: boolean; str: boolean; isVoid: boolean }
type Expr =
  | { k: 'num'; v: number; f?: boolean }
  | { k: 'str'; v: string }
  | { k: 'chr'; v: number }
  | { k: 'id'; name: string; line: number }
  | { k: 'bin'; op: string; l: Expr; r: Expr; line: number }
  | { k: 'un'; op: string; a: Expr; line: number }
  | { k: 'incr'; op: string; pre: boolean; a: Expr; line: number }
  | { k: 'assign'; op: string; l: Expr; r: Expr; line: number }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr }
  | { k: 'seq'; a: Expr; b: Expr }
  | { k: 'cast'; ty: Ty; a: Expr; digits?: Expr }
  | { k: 'sizeof'; a: Expr }
  | { k: 'idx'; a: Expr; i: Expr; line: number }
  | { k: 'call'; name: string; args: Expr[]; line: number }
  | { k: 'mcall'; obj: Expr; name: string; args: Expr[]; line: number };
type CallExpr = Extract<Expr, { k: 'call' }>;
type McallExpr = Extract<Expr, { k: 'mcall' }>;
interface VarDecl { name: string; line: number; arr?: boolean; size?: Expr; init?: Expr; list?: Expr[] }
type Stmt =
  | { k: 'block'; body: Stmt[] }
  | { k: 'empty' } | { k: 'break' } | { k: 'continue' }
  | { k: 'decl'; ty: Ty; vars: VarDecl[] }
  | { k: 'expr'; e: Expr; line: number }
  | { k: 'if'; c: Expr; a: Stmt; b: Stmt | null; line: number }
  | { k: 'while' | 'dowhile'; c: Expr; body: Stmt; line: number }
  | { k: 'for'; init: Stmt | null; c: Expr | null; step: Expr | null; body: Stmt; line: number }
  | { k: 'return'; e: Expr | null; line: number };
type DeclStmt = Extract<Stmt, { k: 'decl' }>;
interface Func { params: { name: string; ty: Ty }[]; ty: Ty; body: Stmt; line: number }
export interface Program { globals: DeclStmt[]; funcs: Map<string, Func> }

type Val = number | string | Val[];
interface Rec { float: boolean; str: boolean; v: Val }

const TYPES = new Set('int long short float double bool boolean byte char void unsigned signed const static volatile String uint8_t uint16_t uint32_t int8_t int16_t int32_t size_t word'.split(' '));
const FLOATS = new Set(['float', 'double']);
const FLOAT_FN = new Set(['sqrt', 'pow', 'sin', 'cos', 'tan']);
const MIXED_FN = new Set(['min', 'max', 'abs', 'constrain']);
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
const BIN = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
const STOP = { stop: true }, BRK = { brk: true }, CNT = { cnt: true };
type Flow = void | typeof BRK | typeof CNT | { ret: Val };
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', 0: '\0' };
const unesc = (s: string) => s.replace(/\\(.)/g, (_m, c: string) => ESCAPES[c] ?? c);

function lex(src: string, line0 = 1): { toks: Tok[]; lastLine: number } {
  const re = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])'|0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[fFuUlL]*|[A-Za-z_]\w*|<<=|>>=|\+\+|--|&&|\|\||[-+*\/%&|^!=<>]=|<<|>>|[-+*\/%&|^!=<>~?:;,.(){}\[\]]/y;
  const toks: Tok[] = [], defs = new Map<string, Tok[]>();
  let line = line0, pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new SimError(`Unexpected character "${src[pos]}"`, line);
    const s = m[0], c = s[0];
    pos = re.lastIndex;
    if (/\s/.test(c) || s.startsWith('//') || s.startsWith('/*')) { /* skip */ }
    else if (c === '#') {
      const d = /^#\s*define\s+([A-Za-z_]\w*)\s+(.+)$/.exec(s.replace(/\/\/.*$/, '').trim());
      if (d) defs.set(d[1], lex(d[2], line).toks);
    }
    else if (c === '"') toks.push({ t: 'str', v: unesc(s.slice(1, -1)), line });
    else if (c === "'") toks.push({ t: 'chr', v: unesc(s.slice(1, -1)).charCodeAt(0), line });
    else if (/[0-9.]/.test(c) && s !== '.') {
      const hex = /^0[xX]/.test(s), bin = /^0[bB]/.test(s);
      const body = hex || bin ? s : s.replace(/[fFuUlL]+$/, '');
      const v = hex ? parseInt(body, 16) : bin ? parseInt(body.slice(2), 2) : parseFloat(body);
      toks.push({ t: 'num', v, f: !hex && !bin && (/[.eE]/.test(body) || /[fF]$/.test(s)), line });
    }
    else if (/[A-Za-z_]/.test(c)) {
      const def = defs.get(s);
      if (def) def.forEach(d => toks.push({ ...d, line }));
      else toks.push({ t: 'id', v: s, line });
    }
    else toks.push({ t: 'op', v: s, line });
    line += (s.match(/\n/g) || []).length;
  }
  return { toks, lastLine: line };
}

export function parse(src: string): Program {
  const { toks, lastLine } = lex(src);
  let i = 0;
  const EOF: Tok = { t: 'eof', v: 'the end of the code', line: lastLine };
  const peek = (o = 0): Tok => toks[i + o] || EOF;
  const isOp = (v: string, o = 0) => { const t = peek(o); return t.t === 'op' && t.v === v; };
  const isId = (v: string, o = 0) => { const t = peek(o); return t.t === 'id' && t.v === v; };
  const isType = (o = 0) => { const t = peek(o); return t.t === 'id' && TYPES.has(t.v); };
  const eat = (v: string) => (isOp(v) ? toks[i++] : null);
  const show = (t: Tok) => t.t === 'str' ? 'a text string' : t.t === 'eof' ? t.v : `"${t.t === 'chr' ? String.fromCharCode(t.v) : t.v}"`;
  const need = (v: string): Tok => {
    const t = eat(v); if (t) return t;
    const prev = toks[i - 1] || peek();
    if (v === ';') throw new SimError('Missing ";" at the end of this line', prev.line);
    throw new SimError(`Expected "${v}" but found ${show(peek())}`, peek().line);
  };
  const ident = (): IdTok => {
    const t = peek();
    if (t.t !== 'id' || TYPES.has(t.v)) throw new SimError(`Expected a name but found ${show(t)}`, t.line);
    i++; return t as IdTok;
  };
  function readType(): Ty {
    const ty: Ty = { float: false, str: false, isVoid: false };
    while (isType()) { const w = toks[i++].v as string; if (FLOATS.has(w)) ty.float = true; if (w === 'String') ty.str = true; if (w === 'void') ty.isVoid = true; }
    while (isOp('*') || isOp('&')) { i++; ty.str = true; }
    return ty;
  }
  function declRest(ty: Ty, nameTok: IdTok): DeclStmt {
    const vars: VarDecl[] = [];
    for (;;) {
      const v: VarDecl = { name: nameTok.v, line: nameTok.line };
      if (eat('[')) { v.arr = true; if (!isOp(']')) v.size = expr(); need(']'); }
      if (eat('=')) {
        if (eat('{')) { v.list = []; while (!isOp('}')) { v.list.push(assign()); if (!eat(',')) break; } need('}'); }
        else v.init = assign();
      } else if (isOp('(')) throw new SimError(`Objects like "${v.name}(...)" are not supported in this simulator yet`, v.line);
      vars.push(v);
      if (!eat(',')) break;
      while (isOp('*')) i++;
      nameTok = ident();
    }
    need(';');
    return { k: 'decl', ty, vars };
  }
  function block(): Stmt {
    need('{'); const body: Stmt[] = [];
    while (!isOp('}')) { if (peek().t === 'eof') throw new SimError('Missing "}" to close a block', peek().line); body.push(stmt()); }
    need('}'); return { k: 'block', body };
  }
  function stmt(): Stmt {
    const t = peek(), line = t.line;
    if (isOp('{')) return block();
    if (eat(';')) return { k: 'empty' };
    if (t.t === 'id') {
      if (t.v === 'if') { i++; need('('); const c = expr(); need(')'); const a = stmt(); let b: Stmt | null = null; if (isId('else')) { i++; b = stmt(); } return { k: 'if', c, a, b, line }; }
      if (t.v === 'while') { i++; need('('); const c = expr(); need(')'); return { k: 'while', c, body: stmt(), line }; }
      if (t.v === 'do') { i++; const body = stmt(); if (!isId('while')) throw new SimError('Expected "while" after the do block', peek().line); i++; need('('); const c = expr(); need(')'); need(';'); return { k: 'dowhile', c, body, line }; }
      if (t.v === 'for') {
        i++; need('(');
        let init: Stmt | null = null, c: Expr | null = null, step: Expr | null = null;
        if (!eat(';')) { if (isType()) { const ty = readType(); init = declRest(ty, ident()); } else { init = { k: 'expr', e: expr(), line }; need(';'); } }
        if (!isOp(';')) c = expr(); need(';');
        if (!isOp(')')) step = expr(); need(')');
        return { k: 'for', init, c, step, body: stmt(), line };
      }
      if (t.v === 'return') { i++; let e: Expr | null = null; if (!isOp(';')) e = expr(); need(';'); return { k: 'return', e, line }; }
      if (t.v === 'break') { i++; need(';'); return { k: 'break' }; }
      if (t.v === 'continue') { i++; need(';'); return { k: 'continue' }; }
      if (t.v === 'switch') throw new SimError('"switch" is not supported in this simulator yet. Use if / else if instead.', line);
      if (isType()) { const ty = readType(); return declRest(ty, ident()); }
    }
    const e = expr(); need(';');
    return { k: 'expr', e, line };
  }
  function expr(): Expr { let e = assign(); while (eat(',')) e = { k: 'seq', a: e, b: assign() }; return e; }
  function assign(): Expr {
    const l = ternary(), t = peek();
    if (t.t === 'op' && ASSIGN.has(t.v)) {
      if (l.k !== 'id' && l.k !== 'idx') throw new SimError('The left side of "=" must be a variable', t.line);
      i++; return { k: 'assign', op: t.v, l, r: assign(), line: t.line };
    }
    return l;
  }
  function ternary(): Expr { const c = binary(0); if (eat('?')) { const a = assign(); need(':'); const b = assign(); return { k: 'cond', c, a, b }; } return c; }
  function binary(lv: number): Expr {
    if (lv === BIN.length) return unary();
    let l = binary(lv + 1);
    for (;;) { const t = peek(); if (t.t !== 'op' || !BIN[lv].includes(t.v)) return l; i++; l = { k: 'bin', op: t.v, l, r: binary(lv + 1), line: t.line }; }
  }
  function unary(): Expr {
    const t = peek();
    if (t.t === 'op') {
      if (t.v === '!' || t.v === '-' || t.v === '+' || t.v === '~') { i++; return { k: 'un', op: t.v, a: unary(), line: t.line }; }
      if (t.v === '++' || t.v === '--') { i++; return { k: 'incr', op: t.v, pre: true, a: unary(), line: t.line }; }
      if (t.v === '(' && isType(1)) { let j = 1; while (isType(j) || isOp('*', j)) j++; if (isOp(')', j)) { i++; const ty = readType(); need(')'); return { k: 'cast', ty, a: unary() }; } }
    }
    if (isId('sizeof')) { i++; need('('); let n: Expr; if (isType()) { readType(); n = { k: 'num', v: 2 }; } else n = { k: 'sizeof', a: expr() }; need(')'); return n; }
    return postfix();
  }
  function args(): Expr[] { const a: Expr[] = []; need('('); while (!isOp(')')) { a.push(assign()); if (!eat(',')) break; } need(')'); return a; }
  function postfix(): Expr {
    let e = primary();
    for (;;) {
      const t = peek();
      if (isOp('[')) { i++; const ix = expr(); need(']'); e = { k: 'idx', a: e, i: ix, line: t.line }; }
      else if (isOp('(') && e.k === 'id') e = { k: 'call', name: e.name, args: args(), line: e.line };
      else if (isOp('.')) { i++; const n = ident(); if (!isOp('(')) throw new SimError(`Expected "(" after ".${n.v}"`, n.line); e = { k: 'mcall', obj: e, name: n.v, args: args(), line: n.line }; }
      else if (isOp('++') || isOp('--')) { i++; e = { k: 'incr', op: t.v as string, pre: false, a: e, line: t.line }; }
      else return e;
    }
  }
  function primary(): Expr {
    const t = peek();
    if (t.t === 'num') { i++; return { k: 'num', v: t.v, f: t.f }; }
    if (t.t === 'str') { i++; return { k: 'str', v: t.v }; }
    if (t.t === 'chr') { i++; return { k: 'chr', v: t.v }; }
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') { i++; return { k: 'num', v: t.v === 'true' ? 1 : 0 }; }
      if (isType() && isOp('(', 1)) { const ty = readType(); const a = args(); return { k: 'cast', ty, a: a[0] || { k: 'num', v: 0 }, digits: a[1] }; }
      if (TYPES.has(t.v)) throw new SimError(`"${t.v}" cannot be used here`, t.line);
      i++; return { k: 'id', name: t.v, line: t.line };
    }
    if (eat('(')) { const e = expr(); need(')'); return e; }
    throw new SimError(`Did not expect ${show(t)} here`, t.line);
  }

  const prog: Program = { globals: [], funcs: new Map() };
  while (peek().t !== 'eof') {
    if (!isType()) throw new SimError(`Expected a declaration such as "int x = 0;" or a function such as "void setup() { }" but found ${show(peek())}`, peek().line);
    const ty = readType(), name = ident();
    if (isOp('(')) {
      need('('); const params: Func['params'] = [];
      while (!isOp(')')) { if (isId('void') && isOp(')', 1)) { i++; break; } const pt = readType(); const pn = ident(); if (eat('[')) need(']'); params.push({ name: pn.v, ty: pt }); if (!eat(',')) break; }
      need(')');
      prog.funcs.set(name.v, { params, ty, body: block(), line: name.line });
    } else prog.globals.push(declRest(ty, name));
  }
  return prog;
}

class Env {
  m = new Map<string, Rec>();
  p: Env | null;
  constructor(p: Env | null) { this.p = p; }
  get(n: string): Rec | undefined { for (let e: Env | null = this; e; e = e.p) { const r = e.m.get(n); if (r) return r; } }
}

/** Runs setup() once and then loop() until ctl.stop is set. Rejects with a SimError when the sketch is wrong. */
export async function run(src: string, hw: Hardware, ctl: RunControl): Promise<void> {
  const prog = parse(src);
  const G = new Env(null);
  let ops = 0, depth = 0;
  const tick = async () => { if (ctl.stop) throw STOP; if (++ops % 400 === 0) await hw.pause(); };
  const err = (msg: string, line: number) => new SimError(msg, line);
  const constOf = (name: string): number | undefined => (Object.hasOwn(hw.consts, name) ? hw.consts[name] : undefined);

  function isF(n: Expr, env: Env): boolean {
    switch (n.k) {
      case 'num': return !!n.f;
      case 'id': return !!env.get(n.name)?.float;
      case 'idx': return isF(n.a, env);
      case 'bin': return '+-*/%'.includes(n.op) && (isF(n.l, env) || isF(n.r, env));
      case 'un': return n.op !== '!' && isF(n.a, env);
      case 'incr': return isF(n.a, env);
      case 'assign': return isF(n.l, env);
      case 'cond': return isF(n.a, env) || isF(n.b, env);
      case 'seq': return isF(n.b, env);
      case 'cast': return n.ty.float;
      case 'call': if (FLOAT_FN.has(n.name)) return true; if (MIXED_FN.has(n.name)) return n.args.some(a => isF(a, env)); return !!prog.funcs.get(n.name)?.ty.float;
      case 'mcall': return n.name === 'toFloat';
    }
    return false;
  }
  const fmt = (v: Val, n: Expr | undefined, env: Env, digits?: Val): string => {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return '[array]';
    if (n && n.k === 'chr') return String.fromCharCode(v);
    if (n && isF(n, env)) return Number(v).toFixed(digits == null ? 2 : (digits as number));
    return String(Math.trunc(v));
  };
  const coerce = (rec: { float: boolean; str: boolean }, v: Val): Val => {
    if (rec.str) return typeof v === 'string' ? v : String(v);
    if (typeof v === 'string') return v;
    if (rec.float) return Number(v);
    return Number.isFinite(v) ? Math.trunc(v as number) : 0;
  };
  function arith(op: string, a: number, b: number, floaty: boolean, line: number): number {
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': if (floaty) return a / b; if (b === 0) throw err('Division by zero', line); return Math.trunc(a / b);
      case '%': if (b === 0) throw err('Division by zero', line); return a % b;
      case '&': return a & b; case '|': return a | b; case '^': return a ^ b; case '<<': return a << b; case '>>': return a >> b;
      case '==': return a === b ? 1 : 0; case '!=': return a !== b ? 1 : 0;
      case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
    }
    throw err(`Cannot use "${op}" here`, line);
  }
  const outside = (ix: number, len: number) => `Index ${ix} is outside the array (it has ${len} items, numbered 0 to ${len - 1})`;
  async function slot(n: Expr, env: Env): Promise<{ get(): Val; set(v: Val): Val }> {   // a place that can be read and written
    if (n.k === 'id') {
      const r = env.get(n.name);
      if (!r) throw err(constOf(n.name) !== undefined ? `"${n.name}" is a built-in constant and cannot be changed` : `"${n.name}" is not defined. Check the spelling, or declare it first.`, n.line);
      return { get: () => r.v, set: v => (r.v = coerce(r, v)) };
    }
    if (n.k === 'idx') {
      const a = await ev(n.a, env), ix = (await ev(n.i, env)) as number;
      if (!Array.isArray(a)) throw err('Only arrays can be changed with [ ]', n.line);
      if (ix < 0 || ix >= a.length) throw err(outside(ix, a.length), n.line);
      const f = isF(n.a, env);
      return { get: () => a[ix], set: v => (a[ix] = f ? Number(v) : Math.trunc(v as number)) };
    }
    throw err('This cannot be assigned to', 'line' in n ? n.line : 0);
  }
  async function ev(n: Expr, env: Env): Promise<Val> {
    switch (n.k) {
      case 'num': case 'chr': case 'str': return n.v;
      case 'id': { const r = env.get(n.name); if (r) return r.v; const c = constOf(n.name); if (c !== undefined) return c; throw err(`"${n.name}" is not defined. Check the spelling, or declare it first.`, n.line); }
      case 'bin': {
        if (n.op === '&&') return (await ev(n.l, env)) && (await ev(n.r, env)) ? 1 : 0;
        if (n.op === '||') return (await ev(n.l, env)) || (await ev(n.r, env)) ? 1 : 0;
        const a = await ev(n.l, env), b = await ev(n.r, env);
        if (n.op === '+' && (typeof a === 'string' || typeof b === 'string')) return fmt(a, n.l, env) + fmt(b, n.r, env);
        return arith(n.op, a as number, b as number, isF(n.l, env) || isF(n.r, env), n.line);
      }
      case 'un': { const a = (await ev(n.a, env)) as number; return n.op === '!' ? (a ? 0 : 1) : n.op === '-' ? -a : n.op === '~' ? ~a : +a; }
      case 'incr': { const s = await slot(n.a, env), old = s.get(), nv = s.set((old as number) + (n.op === '++' ? 1 : -1)); return n.pre ? nv : old; }
      case 'assign': {
        const s = await slot(n.l, env); let v = await ev(n.r, env);
        if (n.op !== '=') {
          const cur = s.get(), op = n.op.slice(0, -1);
          v = op === '+' && typeof cur === 'string' ? cur + fmt(v, n.r, env) : arith(op, cur as number, v as number, isF(n.l, env) || isF(n.r, env), n.line);
        }
        return s.set(v);
      }
      case 'cond': return (await ev(n.c, env)) ? ev(n.a, env) : ev(n.b, env);
      case 'seq': await ev(n.a, env); return ev(n.b, env);
      case 'cast': {
        const v = await ev(n.a, env);
        if (n.ty.str) return fmt(v, n.a, env, n.digits ? await ev(n.digits, env) : undefined);
        if (typeof v === 'string') return n.ty.float ? parseFloat(v) || 0 : parseInt(v, 10) || 0;
        return n.ty.float ? v : Math.trunc(v as number);
      }
      case 'sizeof': { if (n.a.k === 'idx') return 2; const v = await ev(n.a, env); return Array.isArray(v) ? v.length * 2 : typeof v === 'string' ? v.length + 1 : 2; }
      case 'idx': {
        const a = await ev(n.a, env), ix = (await ev(n.i, env)) as number;
        if (typeof a === 'string') return ix < a.length ? a.charCodeAt(ix) : 0;
        if (!Array.isArray(a)) throw err('[ ] only works on arrays', n.line);
        if (ix < 0 || ix >= a.length) throw err(outside(ix, a.length), n.line);
        return a[ix];
      }
      case 'call': return call(n, env);
      case 'mcall': return mcall(n, env);
    }
  }
  async function callFn(name: string, f: Func, vals: Val[], line: number): Promise<Val> {
    if (vals.length !== f.params.length) throw err(`${name}() needs ${f.params.length} value(s) but got ${vals.length}`, line);
    if (++depth > 200) throw err(`${name}() keeps calling itself and never stops`, line);
    const env = new Env(G);
    f.params.forEach((p, k) => { const rec: Rec = { float: p.ty.float, str: p.ty.str, v: 0 }; rec.v = Array.isArray(vals[k]) ? vals[k] : coerce(rec, vals[k]); env.m.set(p.name, rec); });
    const r = await exec(f.body, env);
    depth--;
    return r && 'ret' in r ? r.ret : 0;
  }
  async function call(n: CallExpr, env: Env): Promise<Val> {
    const vals: Val[] = [];
    for (const x of n.args) vals.push(await ev(x, env));
    const f = prog.funcs.get(n.name);
    if (f) return callFn(n.name, f, vals, n.line);
    const a = vals as number[];
    const need = (k: number) => { if (a.length < k) throw err(`${n.name}() needs ${k} value(s) inside the brackets`, n.line); };
    switch (n.name) {
      case 'pinMode': need(2); hw.pinMode(a[0], a[1]); return 0;
      case 'digitalWrite': need(2); hw.digitalWrite(a[0], a[1]); return 0;
      case 'digitalRead': need(1); return hw.digitalRead(a[0]);
      case 'analogRead': need(1); return hw.analogRead(a[0]);
      case 'analogWrite': need(2); hw.analogWrite(a[0], a[1]); return 0;
      case 'delay': need(1); await hw.sleep(Math.max(0, a[0])); if (ctl.stop) throw STOP; return 0;
      case 'delayMicroseconds': return 0;
      case 'millis': return Math.floor(hw.now());
      case 'micros': return Math.floor(hw.now() * 1000);
      case 'map': need(5); if (a[2] === a[1]) throw err('map() needs a starting range with two different numbers', n.line); return Math.trunc((a[0] - a[1]) * (a[4] - a[3]) / (a[2] - a[1]) + a[3]);
      case 'constrain': need(3); return Math.min(Math.max(a[0], a[1]), a[2]);
      case 'min': need(2); return Math.min(a[0], a[1]);
      case 'max': need(2); return Math.max(a[0], a[1]);
      case 'abs': need(1); return Math.abs(a[0]);
      case 'sqrt': need(1); return Math.sqrt(a[0]);
      case 'pow': need(2); return Math.pow(a[0], a[1]);
      case 'sin': return Math.sin(a[0]); case 'cos': return Math.cos(a[0]); case 'tan': return Math.tan(a[0]);
      case 'round': return Math.round(a[0]);
      case 'isnan': return Number.isNaN(a[0]) ? 1 : 0;
      case 'random': { need(1); const lo = a.length > 1 ? a[0] : 0, hi = a.length > 1 ? a[1] : a[0]; return lo + Math.floor(Math.random() * Math.max(0, hi - lo)); }
      case 'randomSeed': return 0;
      case 'tone': need(2); hw.tone(a[0], a[1], a[2]); return 0;
      case 'noTone': need(1); hw.noTone(a[0]); return 0;
      case 'pulseIn': need(2); return hw.pulseIn(a[0]);
      case 'touchRead': need(1); return hw.touchRead(a[0]);
    }
    throw err(`"${n.name}()" is not a function this simulator knows. Check the spelling and capital letters.`, n.line);
  }
  async function mcall(n: McallExpr, env: Env): Promise<Val> {
    const a: Val[] = [];
    for (const x of n.args) a.push(await ev(x, env));
    if (n.obj.k === 'id' && n.obj.name === 'Serial' && !env.get('Serial')) {
      switch (n.name) {
        case 'begin': return 0;
        case 'print': case 'println': hw.print((n.args.length ? fmt(a[0], n.args[0], env, a[1]) : '') + (n.name === 'println' ? '\n' : '')); return 0;
        case 'printf': {
          let k = 1;
          hw.print(String(a[0]).replace(/%(?:\.(\d+))?([dfsuc%])/g, (_m, d: string | undefined, c: string) =>
            c === '%' ? '%' : c === 'f' ? Number(a[k++]).toFixed(d == null ? 6 : +d) : c === 'c' ? String.fromCharCode(a[k++] as number) : c === 's' ? String(a[k++]) : String(Math.trunc(a[k++] as number))));
          return 0;
        }
        case 'available': return 0;
        case 'read': return -1;
      }
      throw err(`Serial.${n.name}() is not supported in this simulator`, n.line);
    }
    const v = await ev(n.obj, env);
    if (typeof v === 'string') {
      if (n.name === 'length') return v.length;
      if (n.name === 'toInt') return parseInt(v, 10) || 0;
      if (n.name === 'toFloat') return parseFloat(v) || 0;
    }
    throw err(`".${n.name}()" is not supported in this simulator`, n.line);
  }
  async function declare(n: DeclStmt, env: Env): Promise<void> {
    for (const d of n.vars) {
      const rec: Rec = { float: n.ty.float, str: n.ty.str && !d.arr, v: 0 };
      if (d.arr) {
        if (d.list) { const items: Val[] = []; for (const it of d.list) { const x = await ev(it, env); items.push(typeof x === 'string' || n.ty.float ? x : Math.trunc(x as number)); } rec.v = items; }
        else if (d.init) rec.v = await ev(d.init, env);
        else rec.v = new Array<Val>(d.size ? Math.max(0, (await ev(d.size, env)) as number) : 0).fill(0);
      } else rec.v = coerce(rec, d.init ? await ev(d.init, env) : (rec.str ? '' : 0));
      env.m.set(d.name, rec);
    }
  }
  /** The line a statement starts on, or 0 for the ones that are only braces or keywords. */
  const lineOf = (n: Stmt): number => (n.k === 'decl' ? n.vars[0]?.line ?? 0 : 'line' in n ? n.line : 0);
  async function exec(n: Stmt, env: Env): Promise<Flow> {
    await tick();
    if (ctl.step) {
      const line = lineOf(n), held = line ? ctl.step(line) : undefined;
      if (held) { await held; if (ctl.stop) throw STOP; }
    }
    switch (n.k) {
      case 'block': { const e = new Env(env); for (const s of n.body) { const r = await exec(s, e); if (r) return r; } return; }
      case 'decl': return declare(n, env);
      case 'expr': await ev(n.e, env); return;
      case 'if': if (await ev(n.c, env)) return exec(n.a, env); if (n.b) return exec(n.b, env); return;
      case 'while': while (await ev(n.c, env)) { const r = await exec(n.body, env); if (r === BRK) break; if (r && r !== CNT) return r; await tick(); } return;
      case 'dowhile': do { const r = await exec(n.body, env); if (r === BRK) break; if (r && r !== CNT) return r; await tick(); } while (await ev(n.c, env)); return;
      case 'for': {
        const e = new Env(env);
        if (n.init) await exec(n.init, e);
        while (!n.c || await ev(n.c, e)) { const r = await exec(n.body, e); if (r === BRK) break; if (r && r !== CNT) return r; if (n.step) await ev(n.step, e); await tick(); }
        return;
      }
      case 'return': return { ret: n.e ? await ev(n.e, env) : 0 };
      case 'break': return BRK;
      case 'continue': return CNT;
    }
  }

  try {
    for (const g of prog.globals) await declare(g, G);
    const setup = prog.funcs.get('setup'), loop = prog.funcs.get('loop');
    if (!setup || !loop) throw err('A sketch needs both a setup() and a loop() function', 1);
    await callFn('setup', setup, [], setup.line);
    while (!ctl.stop) { await callFn('loop', loop, [], loop.line); ctl.onLoop?.(); await hw.pause(); }
  } catch (e) { if (e !== STOP) throw e; }
}
