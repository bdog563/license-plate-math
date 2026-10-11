// ===== License Plate Math: equation checker core (exact BigInt rationals, float fallback for irrational roots) =====
const Core = (() => {
  const big = (x) => BigInt(x);
  function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }
  function R(n, d = 1n) {
    if (d === 0n) throw new MathErr("You can't divide by zero.");
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    return { exact: true, n: n / g, d: d / g };
  }
  const A = (x) => ({ exact: false, x });
  class MathErr extends Error {}
  class SyntaxErr extends Error { constructor(msg, pos) { super(msg); this.pos = pos; } }

  function bigToFloat(n, d) {
    const ln = n.toString().replace('-', '').length, ld = d.toString().length;
    const k = 18 - (ln - ld);
    let q;
    if (k >= 0) q = (n * 10n ** big(k)) / d; else q = n / (d * 10n ** big(-k));
    return Number(q) * Math.pow(10, -k);
  }
  const toF = (v) => (v.exact ? bigToFloat(v.n, v.d) : v.x);
  function nearInt(v) {
    if (v.exact) return v.d === 1n ? v.n : null;
    const r = Math.round(v.x);
    return Math.abs(v.x - r) < 1e-9 * Math.max(1, Math.abs(r)) && Math.abs(r) < 1e15 ? big(r) : null;
  }
  function isqrt(n) {
    if (n < 2n) return n;
    let x = big(Math.floor(Math.sqrt(Number(n))));
    if (x === 0n) x = 1n;
    while (true) { const y = (x + n / x) >> 1n; if (y >= x) { if (x * x > n) x -= 1n; while ((x + 1n) * (x + 1n) <= n) x += 1n; return x; } x = y; }
  }
  const ops = {
    add: (a, b) => (a.exact && b.exact ? R(a.n * b.d + b.n * a.d, a.d * b.d) : A(toF(a) + toF(b))),
    sub: (a, b) => (a.exact && b.exact ? R(a.n * b.d - b.n * a.d, a.d * b.d) : A(toF(a) - toF(b))),
    mul: (a, b) => (a.exact && b.exact ? R(a.n * b.n, a.d * b.d) : A(toF(a) * toF(b))),
    div: (a, b) => {
      if ((b.exact && b.n === 0n) || (!b.exact && b.x === 0)) throw new MathErr("You can't divide by zero.");
      return a.exact && b.exact ? R(a.n * b.d, a.d * b.n) : A(toF(a) / toF(b));
    },
    neg: (a) => (a.exact ? R(-a.n, a.d) : A(-a.x)),
    sqrt: (a) => {
      if (toF(a) < 0) throw new MathErr("You can't take the square root of a negative number.");
      if (a.exact) {
        const rn = isqrt(a.n), rd = isqrt(a.d);
        if (rn * rn === a.n && rd * rd === a.d) return R(rn, rd);
      }
      return A(Math.sqrt(toF(a)));
    },
    pow: (a, b) => {
      const e = nearInt(b), af = toF(a);
      if (af === 0 && toF(b) <= 0) throw new MathErr(toF(b) === 0 ? '0^0 has no agreed value, so it isn\'t allowed.' : 'Raising 0 to a negative power divides by zero.');
      if (e !== null && a.exact) {
        const absE = e < 0n ? -e : e;
        const digits = Math.max(a.n.toString().length, a.d.toString().length);
        if (absE > 100000n || digits * Number(absE) > 20000) throw new MathErr('That power is too big to compute.');
        const n = a.n ** absE, d = a.d ** absE;
        return e < 0n ? R(d, n) : R(n, d);
      }
      if (af < 0 && e === null) throw new MathErr('A negative number can\'t be raised to a fractional power here.');
      if (a.exact && b.exact && af > 0) { // exact roots like 4^.5 or 8^(2/3)
        const q = Number(b.d);
        if (q <= 64) {
          const root = (x) => { let r = BigInt(Math.round(Math.pow(Number(x), 1 / q))); for (const c of [r - 1n, r, r + 1n]) if (c >= 0n && c ** big(q) === x) return c; return null; };
          const rn = root(a.n), rd = root(a.d);
          if (rn !== null && rd !== null) return ops.pow(R(rn, rd), R(b.n));
        }
      }
      const x = Math.pow(af, toF(b));
      if (!isFinite(x)) throw new MathErr('That power is too big to compute.');
      return A(x);
    },
    root: (a, n) => { // nth root, n a whole number; odd roots of negatives are fine
      if (n === 0n) throw new MathErr('A 0th root isn\'t defined.');
      const af = toF(a);
      if (af < 0) {
        if (n % 2n === 0n) throw new MathErr('You can\'t take an even root of a negative number.');
        return ops.neg(ops.root(ops.neg(a), n));
      }
      if (af === 0 || (a.exact && a.n === a.d)) return R(a.exact ? a.n : 0n, a.exact ? a.d : 1n); // 0 and 1 stay exact for any index
      return ops.pow(a, R(1n, n));
    },
    fact: (a, dbl) => {
      const n = nearInt(a);
      const sym = dbl ? '!!' : '!';
      if (n === null || n < 0n) throw new MathErr(`${sym} only works on whole numbers 0 or bigger.`);
      if (n > 3000n) throw new MathErr(`That ${sym} is too big to compute.`);
      let p = 1n;
      for (let i = n; i > 1n; i -= dbl ? 2n : 1n) p *= i;
      return R(p);
    },
  };

  // ---- tokenizer ----
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', sup = (d) => [...d].map((c) => SUP[c]).join('');
  function normalize(s) {
    s = s.replace(/\*\*/g, '^').replace(/sqrt/gi, '√').replace(/[*xX·]/g, '×').replace(/[/:]/g, '÷').replace(/[-–—]/g, '−');
    // "root" makes an nth root with the digits typed just before it as the raised index (3root8 is ³√8);
    // a raised digit with no √ after it turns back into an ordinary one.
    return s.replace(/(?<![\d.])(\d+)root/gi, (m, d) => sup(d) + '√')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+(?![⁰¹²³⁴⁵⁶⁷⁸⁹√])/g, (m) => [...m].map((c) => SUP.indexOf(c)).join(''));
  }
  function tokenize(src) {
    const s = normalize(src), toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const m = /^(\d+\.\d*|\.\d+|\d+)/.exec(s.slice(i));
      if (m) {
        const t = m[1], digits = t.replace('.', '');
        if (!t.includes('.') && t.length > 1 && t[0] === '0')
          throw new SyntaxErr(`"${t}" isn't allowed. A number can't start with 0 unless it has a decimal point, like 0.7.`, i);
        toks.push({ type: 'num', text: t, digits, pos: i });
        i += t.length; continue;
      }
      const r = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/.exec(s.slice(i));
      if (r) {
        const t = [...r[0]].map((c) => SUP.indexOf(c)).join('');
        if (t.length > 1 && t[0] === '0') throw new SyntaxErr(`"${r[0]}√" isn't allowed. A root index can't start with 0.`, i);
        toks.push({ type: 'idx', text: t, digits: t, pos: i });
        i += r[0].length; continue;
      }
      if (c === '!' && s[i + 1] === '!') { toks.push({ type: '!!', pos: i }); i += 2; continue; }
      if ('+−×÷()√!=^'.includes(c)) { toks.push({ type: c, pos: i }); i++; continue; }
      if (/^root/i.test(s.slice(i))) throw new SyntaxErr('Type the index digits right before "root", like 3root8 for ³√8.', i);
      if (c === '|') throw new SyntaxErr('Absolute value isn\'t needed: use a negative sign instead.', i);
      if (c === '%') throw new SyntaxErr('% isn\'t one of the allowed operations.', i);
      if (c === ',') throw new SyntaxErr('Use a period for decimals, like .7', i);
      throw new SyntaxErr(`"${c}" isn't an allowed symbol.`, i);
    }
    return toks;
  }

  // ---- parser: expr := term (± term)* ; term := unary (×÷ unary)* ; unary := − unary | power ; power := postfix (^ unary)? ; postfix := atom (! | !!)* ; atom := idx? √ atom | primary
  // So √9! = (√9)!, ³√8! = (³√8)!, −3! = −(3!), −2^2 = −4, 2^3! = 2^6. Write √(9!) for the root of 9!.
  function parse(toks) {
    let p = 0;
    const peek = () => toks[p], eat = (t) => (toks[p] && toks[p].type === t ? toks[p++] : null);
    const endPos = () => (toks.length ? toks[toks.length - 1].pos + 1 : 0);
    function expr() {
      let node = term();
      while (peek() && (peek().type === '+' || peek().type === '−')) {
        const op = toks[p++].type;
        node = { k: op === '+' ? 'add' : 'sub', a: node, b: term() };
      }
      return node;
    }
    function term() {
      let node = unary();
      while (peek() && (peek().type === '×' || peek().type === '÷')) {
        const op = toks[p++].type;
        node = { k: op === '×' ? 'mul' : 'div', a: node, b: unary() };
      }
      return node;
    }
    function unary() {
      if (eat('−')) return { k: 'neg', a: unary() };
      return power();
    }
    function power() {
      const base = postfix();
      if (eat('^')) return { k: 'pow', a: base, b: unary() }; // right-associative; exponent may be negative
      return base;
    }
    function postfix() {
      let node = atom();
      while (peek() && (peek().type === '!' || peek().type === '!!')) node = { k: toks[p++].type === '!!' ? 'dfact' : 'fact', a: node };
      return node;
    }
    function atom() {
      if (eat('√')) return { k: 'sqrt', a: atom() };
      const i = eat('idx');
      if (i) {
        if (!eat('√')) throw new SyntaxErr(`A raised ${sup(i.text)} is a root index, so it needs √ right after it.`, i.pos);
        return { k: 'root', i, a: atom() };
      }
      return primary();
    }
    function primary() {
      const t = peek();
      if (!t) throw new SyntaxErr('The equation ends too early. Something is missing at the end.', endPos());
      if (t.type === 'num') { p++; return { k: 'num', t }; }
      if (eat('(')) {
        const e = expr();
        if (!eat(')')) throw new SyntaxErr('A "(" is missing its closing ")".', peek() ? peek().pos : endPos());
        return e;
      }
      if (t.type === '+') throw new SyntaxErr('Put a number or "(" before "+".', t.pos);
      throw new SyntaxErr(`Unexpected "${t.type}". A number, "(", "√" or "−" should go here.`, t.pos);
    }
    const node = expr();
    if (p < toks.length) {
      const t = toks[p];
      if (t.type === ')') throw new SyntaxErr('There\'s a ")" without a matching "(".', t.pos);
      if (t.type === 'num') throw new SyntaxErr('Two numbers sit next to each other. Put an operation between them.', t.pos);
      if (t.type === '√' && toks[p - 1].type === 'num') throw new SyntaxErr('Put an operation like × before "√", or press ⁿ√ to make the digits before it an nth root.', t.pos);
      if (t.type === '(' || t.type === '√' || t.type === 'idx') throw new SyntaxErr(`Put an operation like × before "${t.type === 'idx' ? sup(t.text) + '√' : t.type}".`, t.pos);
      throw new SyntaxErr(`Unexpected "${t.type}".`, t.pos);
    }
    return node;
  }
  function evaluate(n) {
    switch (n.k) {
      case 'num': {
        const t = n.t.text, i = t.indexOf('.');
        if (i < 0) return R(big(t));
        const dec = t.length - i - 1;
        return R(big(n.t.digits || '0'), 10n ** big(dec));
      }
      case 'add': return ops.add(evaluate(n.a), evaluate(n.b));
      case 'sub': return ops.sub(evaluate(n.a), evaluate(n.b));
      case 'mul': return ops.mul(evaluate(n.a), evaluate(n.b));
      case 'div': return ops.div(evaluate(n.a), evaluate(n.b));
      case 'neg': return ops.neg(evaluate(n.a));
      case 'sqrt': return ops.sqrt(evaluate(n.a));
      case 'root': return ops.root(evaluate(n.a), big(n.i.text));
      case 'pow': return ops.pow(evaluate(n.a), evaluate(n.b));
      case 'fact': return ops.fact(evaluate(n.a), false);
      case 'dfact': return ops.fact(evaluate(n.a), true);
    }
  }
  function equal(a, b) {
    if (a.exact && b.exact) return a.n * b.d === b.n * a.d;
    const x = toF(a), y = toF(b);
    return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
  }
  function fmt(v) { return fmt0(v).replace(/^(≈ )?-/, '$1−'); }
  function fmt0(v) {
    if (!v.exact) {
      const x = v.x;
      return '≈ ' + (Math.abs(x) >= 1e9 || (Math.abs(x) < 1e-4 && x !== 0) ? x.toExponential(4) : String(+x.toPrecision(7)));
    }
    if (v.d === 1n) {
      const s = v.n.toString();
      if (s.replace('-', '').length > 15) return '≈ ' + bigToFloat(v.n, 1n).toExponential(4);
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    // terminating decimal?
    let d = v.d; while (d % 2n === 0n) d /= 2n; while (d % 5n === 0n) d /= 5n;
    if (d === 1n) {
      const x = bigToFloat(v.n, v.d);
      const s = String(+x.toPrecision(12));
      if (!s.includes('e')) return s.replace(/^(-?)0\./, '$1.');
    }
    return `${v.n}/${v.d}`;
  }

  // Check a full equation against the puzzle digits (string of 4 chars).
  function check(src, puzzle) {
    const res = { ok: false, digitsUsed: [], sides: [null, null], error: null, errPos: null, kind: null };
    let toks;
    try { toks = tokenize(src); } catch (e) { res.error = e.message; res.errPos = e.pos; res.kind = 'syntax'; return res; }
    const used = toks.filter((t) => t.type === 'num' || t.type === 'idx').map((t) => t.digits).join('');
    res.digitsUsed = used.split('');
    const eqs = toks.filter((t) => t.type === '=');
    // digit order check (prefix-tolerant so partial input can be tracked)
    const want = puzzle;
    if (!want.startsWith(used) || used.length > want.length) {
      res.kind = 'digits';
      res.error = `Use the digits ${want.split('').join(', ')} in that order, each exactly once. You've used ${used.split('').join(', ') || 'none'}.`;
    }
    // per-side previews
    const sides = [];
    let cur = [];
    for (const t of toks) { if (t.type === '=') { sides.push(cur); cur = []; } else cur.push(t); }
    sides.push(cur);
    for (let s = 0; s < Math.min(2, sides.length); s++) {
      if (!sides[s].length) continue;
      try { res.sides[s] = evaluate(parse(sides[s])); } catch (e) { res.sides[s] = { err: e.message, pos: e.pos }; }
    }
    if (res.error) return res;
    if (eqs.length === 0) { res.kind = 'incomplete'; res.error = 'Add an "=" sign somewhere between the digits.'; return res; }
    if (eqs.length > 1) { res.kind = 'syntax'; res.error = 'Use exactly one "=" sign.'; return res; }
    if (used.length < want.length) { res.kind = 'incomplete'; res.error = `You still need to use ${want.slice(used.length).split('').join(', ')}.`; return res; }
    if (!sides[0].length || !sides[1].length) { res.kind = 'syntax'; res.error = 'Both sides of "=" need something on them.'; return res; }
    for (const v of res.sides) if (v && v.err) { res.kind = 'syntax'; res.error = v.err; res.errPos = v.pos; return res; }
    if (equal(res.sides[0], res.sides[1])) { res.ok = true; return res; }
    res.kind = 'unequal';
    res.error = `Not balanced: the left side is ${fmt(res.sides[0])} and the right side is ${fmt(res.sides[1])}.`;
    return res;
  }

  // ---- what each √ covers, for drawing its bar ----
  // Matches the parser: √ takes the next number, bracket or √. Returns {from, to} character ranges
  // (to is exclusive; an unclosed bracket runs to the end) with h = 1 for an innermost bar, 2 above that, ...
  function radicands(s) {
    const skip = (i) => { while (/\s/.test(s[i] || '')) i++; return i; };
    function end(i) {
      if (s[i] === '√') return end(skip(i + 1));
      if (s[i] === '(') {
        for (let j = i, depth = 0; j < s.length; j++) if (s[j] === '(') depth++; else if (s[j] === ')' && --depth === 0) return j + 1;
        return s.length;
      }
      const m = /^(\d+\.\d*|\.\d+|\d+)/.exec(s.slice(i));
      return m ? i + m[0].length : -1;
    }
    const out = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '√') continue;
      const from = skip(i + 1), to = end(from);
      if (to > from) out.push({ from, to, h: 1 });
    }
    out.sort((a, b) => (a.to - a.from) - (b.to - b.from));
    for (const r of out) for (const q of out) if (q !== r && q.from >= r.from && q.to <= r.to) r.h = Math.max(r.h, q.h + 1);
    return out;
  }
  // ---- how an answer is scored ----
  // Every symbol counts as an operation except brackets and =; a decimal point counts, joining digits and a root's index don't.
  function opCount(src) {
    return tokenize(src).filter((t) => (t.type === 'num' || t.type === 'idx' ? t.text.includes('.') : !'()='.includes(t.type))).length;
  }
  // The tier of tools an answer uses, matching the solver: 1 basic (+ − × ÷, minus signs, brackets, joined digits),
  // 2 advanced (√ ! and whole-number ^), 3 expert (a decimal point, !!, nth roots and fractional powers like 8^(1/3)).
  function toolTier(src) {
    let tier = 1;
    const walk = (n) => {
      if (n.k === 'num') { if (n.t.text.includes('.')) tier = 3; return; }
      if (n.k === 'dfact' || n.k === 'root') tier = 3;
      else if (n.k === 'sqrt' || n.k === 'fact') tier = Math.max(tier, 2);
      else if (n.k === 'pow') {
        let whole = true;
        try { whole = nearInt(evaluate(n.b)) !== null; } catch (e) {}
        tier = Math.max(tier, whole ? 2 : 3);
      }
      if (n.a) walk(n.a);
      if (n.b) walk(n.b);
    };
    for (const side of normalize(src).split('=')) walk(parse(tokenize(side)));
    return tier;
  }
  // ---- Random's tool switches ----
  // The switches an answer uses: s √, f !, p ^ (whole or fractional powers), d decimal point, w !!, r nth root.
  function toolCodes(src) {
    const used = new Set(), code = { sqrt: 's', fact: 'f', pow: 'p', dfact: 'w', root: 'r' };
    const walk = (n) => {
      if (n.k === 'num') { if (n.t.text.includes('.')) used.add('d'); return; }
      if (code[n.k]) used.add(code[n.k]);
      if (n.a) walk(n.a);
      if (n.b) walk(n.b);
    };
    for (const side of normalize(src).split('=')) walk(parse(tokenize(side)));
    return used;
  }
  // A plate's options field (see solver/build_data.py) as [{ codes, sol }], most basic first.
  function parseOptions(field, basic) {
    return field ? field.split(';').map((o) => {
      const i = o.indexOf(':');
      return { codes: new Set(o.slice(0, i).split('+').filter(Boolean)), sol: o.slice(i + 1) || basic };
    }) : [];
  }
  // The answer to point a player to with the switches in `off` turned off: the most basic answer if it avoids them,
  // otherwise the most basic option that does; null when the plate can't be done without an off switch.
  function answerFor(basic, options, off) {
    const avoids = (codes) => ![...codes].some((c) => off.has(c));
    if (!off.size || avoids(toolCodes(basic))) return basic;
    const o = options.find((x) => avoids(x.codes));
    return o ? o.sol : null;
  }
  return { check, fmt, tokenize, parse, evaluate, normalize, radicands, opCount, toolTier, toolCodes, parseOptions, answerFor };
})();
if (typeof module !== 'undefined') module.exports = Core;
