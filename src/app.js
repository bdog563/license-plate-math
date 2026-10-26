// ===== License Plate Math: game UI =====
(function () {
  const LEVELS = [
    { id: 'easy', name: 'Easy', pts: 1, rule: 'Solvable with + − × ÷ and no brackets, joined digits like 12, fractions or minus out front, or in two different ways.' },
    { id: 'medium', name: 'Medium', pts: 2, rule: 'Either + − × ÷ work but only one way, with brackets, a joined number, a fraction or a minus out front, or it takes √, ! or ^ and there’s a simple way in (like √9 or 0!) or more than one idea.' },
    { id: 'hard', name: 'Hard', pts: 4, rule: 'Impossible without √, ! or ^, and there’s really only one idea: a √ or ! around a calculation, or a trick stacked on a trick like (√9)!.' },
    { id: 'expert', name: 'Expert', pts: 6, rule: 'Impossible without a decimal point, a double factorial or an nth root like ³√8 or 8^(1 ÷ 3). The rarest plates.' },
    { id: 'random', name: 'Random', rule: 'Any plate from 0000 to 9999 except those with two or more zeros, all equally likely. The difficulty stays hidden until you reveal it, take a hint or finish.' },
  ];
  // Challenge modes. Restricted: only the tools the plate needs. Eco: the fewest operations. Both hide the running totals.
  const MODES = [
    { id: 'normal', name: 'Normal', note: 'Any correct equation scores.' },
    { id: 'restricted', name: 'Restricted', note: 'Use only the tools this plate needs. Totals are hidden.' },
    { id: 'eco', name: 'Eco', note: 'Find the fewest operations. Totals are hidden.' },
  ];
  const TIERS = ['', 'Basic', 'Advanced', 'Expert'];
  const CEILING = { easy: 1, medium: 2, hard: 2, expert: 3, random: 3 }; // the highest tool tier any plate at this level needs
  const $ = (id) => document.getElementById(id);

  // ---- puzzle catalogue ----
  const isDigits = (t) => t.type === 'num' || t.type === 'idx';
  const opCount = Core.opCount;
  const LEVEL_CODE = { e: 'easy', m: 'medium', h: 'hard', x: 'expert' }; // the solver grades each plate (solver/levels.py)
  function info(n) {
    const [t, lv, sol, short, need, opts] = PUZZLES[n].split('|'); // short: a fewest-operations answer, if sol isn't one; need, opts: see build_data.py
    const tier = +t, d = String(n).padStart(4, '0'), level = LEVEL_CODE[lv];
    const pool = (d.split('0').length - 1) < 2; // keep zero-heavy tickets out of random draws
    return { n, d, tier, sol, short, need, options: Core.parseOptions(opts, sol), level, pool };
  }
  const ALL = PUZZLES.map((_, i) => info(i));
  const POOLS = {};
  for (const L of LEVELS) POOLS[L.id] = ALL.filter((p) => p.pool && (L.id === 'random' || p.level === L.id));

  // ---- persisted stats (per viewer, optional) ----
  const KEY = 'license-plate-math-v1';
  let stats = { score: 0, solved: 0, streak: 0, best: 0, level: 'easy', mode: 'normal' };
  try { const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('four-in-order-v1') || 'null'); if (s) stats = Object.assign(stats, s); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch (e) {} };

  // ---- state ----
  const hot = window.claude && window.claude.hot;
  const restored = (hot && hot.data) || {};
  let state = {
    level: restored.level || stats.level || 'easy',
    current: null,
    hintsUsed: 0,
    solved: false,
    revealed: false,
    shown: false, // difficulty shown on a Random ticket
    mode: MODES.some((M) => M.id === stats.mode) ? stats.mode : 'normal',
    goalShown: false, // Eco's goal sticker turned over
    recent: [],
  };

  // ---- level picker ----
  const levelsEl = $('levels');
  for (const L of LEVELS) {
    const lab = document.createElement('label');
    lab.style.setProperty('--c', `var(--lv-${L.id})`);
    lab.innerHTML = `<input type="radio" name="level" id="lv-${L.id}" value="${L.id}"><span class="lv-name">${L.name}</span>`;
    levelsEl.appendChild(lab);
  }
  levelsEl.addEventListener('change', (e) => {
    state.level = e.target.value; stats.level = state.level; save();
    newPuzzle(true);
    renderSwitches();
  });
  const lvRules = $('lvRules');
  for (const L of LEVELS) {
    const row = document.createElement('div');
    row.className = 'lv-row';
    row.style.setProperty('--c', `var(--lv-${L.id})`);
    row.innerHTML = `<strong>${L.name}</strong><span>${L.rule} <span class="muted">${POOLS[L.id].length.toLocaleString()} plates · ${L.pts ? `${L.pts} pt${L.pts > 1 ? 's' : ''}` : 'points by its real level'}</span></span>`;
    lvRules.appendChild(row);
  }

  // ---- Random's tool switches: leave out plates that need a tool you've switched off (paused in Eco) ----
  const SWITCHES = [['s', '√'], ['f', '!'], ['p', '^'], ['r', 'ⁿ√'], ['w', '!!'], ['d', '.']]; // Advanced, then Expert
  const KEY_SWITCH = { '√': 's', '!': 'f', '^': 'p', 'ⁿ√': 'r', '!!': 'w', '.': 'd' };
  const off = new Set(Array.isArray(stats.offTools) ? stats.offTools : []), NONE = new Set();
  const filterOn = () => state.level === 'random' && state.mode !== 'eco' && off.size > 0;
  const fits = (p) => p.tier === 1 || p.options.some((o) => ![...o.codes].some((c) => off.has(c)));
  const offFor = (p) => (p && filterOn() && fits(p) ? off : NONE); // a typed-in plate that needs an off tool plays with every tool
  const chipsEl = $('switchChips');
  for (const [code, sym] of SWITCHES) {
    if (code === 'r') chipsEl.append(Object.assign(document.createElement('span'), { className: 'chip-gap' }));
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = sym; b.dataset.code = code;
    b.addEventListener('click', () => {
      if (off.has(code)) off.delete(code); else off.add(code);
      stats.offTools = [...off]; save();
      const p = state.current;
      if (p && !state.solved && !state.revealed && filterOn() && !fits(p)) newPuzzle(true); // this plate needs it: deal another
      else renderMode();
    });
    chipsEl.appendChild(b);
  }
  function renderSwitches() {
    const row = $('switches'), eco = state.mode === 'eco', p = state.current;
    row.hidden = state.level !== 'random';
    row.classList.toggle('paused', eco);
    for (const b of chipsEl.querySelectorAll('button')) { b.setAttribute('aria-pressed', String(!off.has(b.dataset.code))); b.disabled = eco; }
    const n = POOLS.random.filter(fits).length;
    $('switchNote').innerHTML = eco ? 'Eco uses every tool, so these are paused.'
      : p && filterOn() && !fits(p) && !state.solved && !state.revealed ? 'This plate needs a tool you switched off, so every tool is on for it.'
      : `<b>${n.toLocaleString()}</b> plates.${off.size ? '' : ' Tap a tool to leave out plates that need it.'}`;
  }

  // ---- challenge mode switch ----
  const modesEl = $('modes');
  for (const M of MODES) {
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="radio" name="mode" value="${M.id}"><span>${M.name}</span>`;
    modesEl.appendChild(lab);
  }
  modesEl.addEventListener('change', (e) => { state.mode = e.target.value; stats.mode = state.mode; save(); renderMode(); });
  const restricted = () => state.mode === 'restricted';
  const cap = () => (restricted() ? CEILING[state.level] : 3);
  function renderMode() {
    for (const r of document.querySelectorAll('input[name=mode]')) r.checked = r.value === state.mode;
    $('modeNote').textContent = MODES.find((M) => M.id === state.mode).note;
    renderKeys(); renderSwitches();
    if (!state.current) return;
    autoSymbols(); renderPlate(); renderHints(); live(); snapshot();
  }

  // ---- keypad ----
  // [key, tool tier]: Basic keys on top; the bottom row is Advanced (^ √ !) then Expert (ⁿ√ !! .), each under a tier label
  const KEYS = [['+', 1], ['−', 1], ['×', 1], ['÷', 1], ['(', 1], [')', 1], ['=', 1], ['⌫', 1], ['^', 2], ['√', 2], ['!', 2], ['ⁿ√', 3], ['!!', 3], ['.', 3], ['Clear', 1]];
  const keysEl = $('keys');
  function tierLabel(tier, span) {
    const l = document.createElement('span');
    l.className = 'tier-label'; l.textContent = tier ? TIERS[tier] : ''; l.style.gridColumn = `span ${span}`;
    // the bar alternates the colors of the levels that use this tier: Basic easy/medium, Advanced medium/hard, Expert expert
    const [c1, c2] = [[], ['easy', 'medium'], ['medium', 'hard'], ['expert', 'expert']][tier] || [];
    if (tier) { l.style.setProperty('--c1', `var(--lv-${c1})`); l.style.setProperty('--c2', `var(--lv-${c2})`); } else l.classList.add('blank');
    return l;
  }
  keysEl.append(tierLabel(1, 8));
  for (const [k, tier] of KEYS) {
    if (k === '^') keysEl.append(tierLabel(2, 3), tierLabel(3, 3), tierLabel(0, 2));
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = k; b.dataset.tier = tier;
    if (k === 'Clear') { b.className = 'wide'; b.setAttribute('aria-label', 'Clear equation'); }
    if (k === '⌫') b.setAttribute('aria-label', 'Delete');
    if (k === 'ⁿ√') b.setAttribute('aria-label', 'nth root: the digits before it become the index');
    b.addEventListener('click', () => key(k));
    keysEl.appendChild(b);
  }
  // Restricted switches off every key above the level's tier (typing them is blocked too, in autoSymbols)
  function renderKeys() {
    const no = restricted() ? offFor(state.current) : NONE;
    for (const b of keysEl.querySelectorAll('button')) b.disabled = +b.dataset.tier > cap() || no.has(KEY_SWITCH[b.textContent]);
  }
  const eq = $('eq');
  function key(k) {
    const s = eq.value, a = eq.selectionStart ?? s.length, b = eq.selectionEnd ?? s.length;
    if (k === 'ⁿ√') { // the digits just before the cursor become the index, the same as typing "root"
      if (!/(?<![\d.])\d+$/.test(s.slice(0, a))) { msg('info', 'Type the index digits first, then press ⁿ√: 3, ⁿ√, 8 makes ³√8.'); eq.focus({ preventScroll: true }); return; }
      k = 'root';
    }
    if (k === 'Clear') { eq.value = ''; }
    else if (k === '⌫') {
      if (a !== b) eq.value = s.slice(0, a) + s.slice(b);
      else if (a > 0) { eq.value = s.slice(0, a - 1) + s.slice(a); eq.setSelectionRange(a - 1, a - 1); }
    } else {
      eq.value = s.slice(0, a) + k + s.slice(b);
      const p = a + k.length; eq.setSelectionRange(p, p);
    }
    eq.focus({ preventScroll: true });
    autoSymbols(); live();
  }

  // ---- rendering ----
  function levelOf(id) { return LEVELS.find((L) => L.id === id); }
  function renderPlate() {
    const p = state.current, L = levelOf(p.level);
    const st = $('lvstamp'), done = state.solved || state.revealed;
    const hide = state.level === 'random' && !state.shown && !done; // points would give the level away too
    const pts = Math.max(1, L.pts - state.hintsUsed);
    // the registration sticker: level, plus what it's worth while it's still open
    st.innerHTML = `<span>${L.name}</span>${done ? '' : `<small>${pts} pt${pts > 1 ? 's' : ''}</small>`}`;
    st.style.setProperty('--c', `var(--lv-${L.id})`);
    st.hidden = hide; $('lvReveal').hidden = !hide;
    // Eco's goal sticker, in the month corner: the fewest operations, turned over on request
    const eco = state.mode === 'eco', goal = opCount(p.short || p.sol), showGoal = eco && (state.goalShown || done);
    $('goalSticker').innerHTML = `<span>Goal</span><small>${goal} op${goal === 1 ? '' : 's'}</small>`;
    $('goalSticker').hidden = !showGoal; $('goalReveal').hidden = !eco || showGoal;
    $('solvedStamp').hidden = !state.solved;
    for (const r of document.querySelectorAll('input[name=level]')) r.checked = r.value === state.level;
  }
  function renderDigits(used, wrongAt) {
    const box = $('digits'); box.innerHTML = '';
    state.current.d.split('').forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'digit' + (i < used ? ' used' : '') + (i === wrongAt ? ' wrong' : '');
      s.textContent = ch;
      box.appendChild(s);
    });
  }
  function renderStats() {
    $('sScore').textContent = stats.score; $('sSolved').textContent = stats.solved;
    $('sStreak').textContent = stats.streak; $('sBest').textContent = stats.best;
  }
  function msg(kind, html) {
    const m = $('msg');
    if (!kind) { m.hidden = true; return; }
    m.hidden = false; m.className = 'msg ' + kind; m.innerHTML = html;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Math text with a bar over whatever each √ applies to. dropBrackets: let the bar stand in for a bracket right after √.
  function radHtml(s, dropBrackets) {
    const rads = Core.radicands(s), hidden = new Set(), open = [];
    if (dropBrackets) for (const r of rads) if (s[r.from] === '(' && s[r.to - 1] === ')') { hidden.add(r.from); hidden.add(r.to - 1); }
    let html = '';
    for (let i = 0; i <= s.length; i++) {
      while (open.length && open[open.length - 1].to === i) { open.pop(); html += '</span>'; }
      if (i === s.length) break;
      for (const r of rads.filter((r) => r.from === i).sort((a, b) => b.to - a.to)) { open.push(r); html += `<span class="rad" style="--h:${r.h}">`; }
      if (!hidden.has(i)) html += esc(s[i]);
    }
    return html;
  }
  // The equation box can't draw bars itself, so a transparent copy of its text sits on top and draws only the bars.
  const bars = $('eqBars');
  const syncBars = () => { if (bars.firstChild) bars.firstChild.style.transform = `translateX(${-eq.scrollLeft}px)`; };
  function drawBars() { bars.innerHTML = `<span>${radHtml(eq.value)}</span>`; syncBars(); }
  eq.addEventListener('scroll', syncBars);
  document.addEventListener('selectionchange', syncBars);
  // Restricted: take out the tools in `no` (switch codes), however they got typed or pasted. Returns [text, what was dropped].
  function dropTools(s, no) {
    const dropped = new Set(), SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹', name = (c) => `<code>${c}</code>`;
    if (no.has('r')) s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+√/g, (m) => { dropped.add('nth roots'); return [...m.slice(0, -1)].map((c) => SUPS.indexOf(c)).join(''); });
    s = s.replace(/!!?/g, (m) => {
      if (m === '!!' && !no.has('w')) return m;
      if (m === '!!') dropped.add(name('!!'));
      if (no.has('f')) { dropped.add(name('!')); return ''; }
      return '!';
    });
    if (no.has('d')) s = s.replace(/\./g, () => { dropped.add('decimal points'); return ''; });
    if (no.has('s')) s = s.replace(/(?<![⁰¹²³⁴⁵⁶⁷⁸⁹])√/g, () => { dropped.add(name('√')); return ''; });
    if (no.has('p')) s = s.replace(/\^/g, () => { dropped.add(name('^')); return ''; });
    return [s, [...dropped]];
  }
  const CAP_OFF = { 1: new Set(['s', 'f', 'p', 'r', 'w', 'd']), 2: new Set(['r', 'w', 'd']), 3: NONE }; // switches above each tier
  // Turn typed stand-ins into symbols as you go: * and x → ×, / → ÷, - → −, ** → ^, sqrt → √.
  // In Restricted, tools above the level and switched-off tools are dropped; returns [dropped by level, dropped by switch].
  function autoSymbols() {
    const byLevel = CAP_OFF[cap()], bySwitch = restricted() ? offFor(state.current) : NONE;
    let dropped = [[], []];
    const fix = (t) => {
      const [v1, d1] = dropTools(Core.normalize(t.replace(/×\*/g, '**')), byLevel); // the first * of ** has already become ×
      const [v2, d2] = dropTools(v1, bySwitch);
      dropped = [d1, d2]; return v2;
    };
    const s = eq.value, a = eq.selectionStart ?? s.length, v = fix(s), all = dropped;
    if (v !== s) { eq.value = v; const c = fix(s.slice(0, a)).length; eq.setSelectionRange(c, c); }
    return all;
  }

  // live feedback while typing
  function live() {
    drawBars();
    const p = state.current; if (!p) return;
    const r = Core.check(eq.value, p.d);
    const used = r.digitsUsed.length, ok = p.d.startsWith(r.digitsUsed.join(''));
    renderDigits(ok ? used : 0, ok ? -1 : Math.min(used - 1, 3));
    const pv = $('preview'); pv.innerHTML = '';
    if (state.mode === 'eco') { // counts as you type, so it works on half-finished equations too
      const n = (Core.normalize(eq.value).match(/!!|[+−×÷^√!.]/g) || []).length, goal = opCount(p.short || p.sol);
      const shown = state.goalShown || state.solved || state.revealed;
      pv.innerHTML = `<span class="${shown && n && n <= goal ? 'at-goal' : ''}">Operations <b>${n}</b>${shown ? ` · goal <b>${goal}</b>` : ''}</span>`;
    }
    if (!eq.value.trim()) return;
    const names = ['Left', 'Right'];
    if (state.mode === 'normal') r.sides.forEach((v, i) => {
      if (!v) return;
      const span = document.createElement('span');
      span.innerHTML = v.err ? `${names[i]}: <span style="background:none;padding:0">…</span>` : `${names[i]} = <b>${esc(Core.fmt(v))}</b>`;
      pv.appendChild(span);
    });
    const midSqrt = /(s(q(r)?)?|r(o(o)?)?)$/i.test(eq.value.slice(0, eq.selectionStart ?? eq.value.length)); // don't complain while "sqrt" or "root" is half typed
    if (r.kind === 'syntax' && /isn't|aren't|Use exactly|start with 0|Two numbers/.test(r.error || '') && !midSqrt) msg('bad', esc(r.error));
    else if (r.kind === 'digits') msg('bad', esc(r.error));
    else if (!state.solved) msg(null);
  }
  eq.addEventListener('input', () => {
    const [byLevel, bySwitch] = autoSymbols(); live();
    const notes = [];
    if (byLevel.length) notes.push(`Restricted doesn’t allow ${listify(byLevel, 'or')} on ${levelOf(state.level).name}.`);
    if (bySwitch.length) notes.push(`You’ve switched off ${listify(bySwitch, 'and')}.`);
    if (notes.length) msg('info', notes.join(' '));
  });

  // ---- hints ----
  const HINTS = 4; // each one more specific than the last
  // Each kind of operation in my answer with how often it's used, e.g. "− twice".
  function opsUsed(sol) {
    const n = {}, bump = (k) => { n[k] = (n[k] || 0) + 1; };
    const walk = (t) => {
      if (t.k === 'num') { if (t.t.text.includes('.')) bump('dec'); if (t.t.digits.length > 1) bump('join'); return; }
      if (t.k === 'root' && t.i.digits.length > 1) bump('join');
      bump(t.k); if (t.a) walk(t.a); if (t.b) walk(t.b);
    };
    for (const side of sol.split('=')) walk(Core.parse(Core.tokenize(side)));
    const sym = { add: '+', sub: '−', mul: '×', div: '÷', pow: '^', sqrt: '√', root: 'ⁿ√', fact: '!', dfact: '!!' };
    const words = { neg: ['a negative sign', 'negative signs'], dec: ['a decimal point', 'decimal points'], join: ['a joined number like 47', 'joined numbers like 47'] };
    const times = (c) => (c === 1 ? 'once' : c === 2 ? 'twice' : `${c} times`);
    return ['add', 'sub', 'mul', 'div', 'neg', 'pow', 'sqrt', 'root', 'fact', 'dfact', 'dec', 'join'].filter((k) => n[k])
      .map((k) => (sym[k] ? `<code>${sym[k]}</code> ${times(n[k])}` : n[k] === 1 ? words[k][0] : `${n[k]} ${words[k][1]}`));
  }
  function listify(a, and = 'and') { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ` ${and} ` + a[a.length - 1]; }
  // The tools a ticket can't do without, from its need code: "d,w" → "a decimal point or !!", "f,s+p" → "!, or both √ and ^".
  const TOOL = { s: '<code>√</code>', f: '<code>!</code>', p: '<code>^</code>', d: 'a decimal point', w: '<code>!!</code>', r: 'an nth root', q: 'a fractional power' };
  function needsText(need) {
    const opts = need.split(',').map((o) => o.split('+').map((c) => TOOL[c])).map((t) => (t.length === 2 ? 'both ' : '') + listify(t));
    return need.includes('+') && opts.length > 1 ? opts.slice(0, -1).join(', ') + ', or ' + opts[opts.length - 1] : listify(opts, 'or');
  }
  // The answer the hints walk you to: in Eco a fewest-operations one, otherwise the most basic one,
  // which never uses a tier above the plate's (so it's always allowed in Restricted).
  // With tool switches off, it's the most basic answer that avoids them.
  const hintAnswer = (p) => (state.mode === 'eco' ? p.short || p.sol : Core.answerFor(p.sol, p.options, offFor(p)) || p.sol);
  function hintText(i) {
    const p = state.current, sol = hintAnswer(p), eco = state.mode === 'eco';
    if (i === 0 && eco) {
      const tools = ['', 'only + − × ÷', 'an Advanced tool (<code>√</code> <code>!</code> <code>^</code>)', 'an Expert tool (a decimal point, <code>!!</code>, an nth root or a fractional power)'][Core.toolTier(sol)];
      return `<b>Toolbox</b>My shortest answer uses ${tools}.`;
    }
    if (i === 0 && offFor(p).size) { // with switches off: the tool sets still open to you (all of them, so no Expert note)
      const open = p.options.filter((o) => ![...o.codes].some((c) => offFor(p).has(c)));
      return `<b>Toolbox</b>${p.tier === 1 ? 'You won’t need any advanced tools' : `You’ll need ${needsText(open.map((o) => [...o.codes].join('+')).join(','))}`}.`;
    }
    if (i === 0) {
      const any = p.need && p.need.split(',').sort().join(',') === { 2: 'f,p,s', 3: 'd,q,r,w' }[p.tier]; // each of the tier's tools works alone
      const tools = p.tier === 1 ? 'You won’t need any advanced tools' : any ? `You can use any ${p.tier === 3 ? 'Expert' : 'advanced'} tool (${needsText(p.need)})` : `You’ll need ${needsText(p.need)}`;
      const note = p.tier === 3 ? ' (Note: some advanced tools, <code>√</code> <code>!</code> <code>^</code>, may still be necessary.)' : '';
      return `<b>Toolbox</b>${tools}.${note}`;
    }
    if (i === 2) return `<b>Tools</b>My ${eco ? 'shortest ' : ''}answer uses ${listify(opsUsed(sol))}.`;
    if (i === 1) {
      const left = sol.split('=')[0], k = Core.tokenize(left).filter(isDigits).reduce((n, t) => n + t.digits.length, 0);
      const d = p.d.split('');
      return `<b>Equals sign</b>It goes after digit ${k}: <code>${d.slice(0, k).join(' ')} = ${d.slice(k).join(' ')}</code>`;
    }
    const left = sol.split('=')[0];
    const v = Core.evaluate(Core.parse(Core.tokenize(left)));
    return `<b>Target</b>Both sides equal <code>${esc(Core.fmt(v))}</code>.`;
  }
  function renderHints() {
    const ol = $('hints'); ol.innerHTML = '';
    for (let i = 0; i < state.hintsUsed; i++) { const li = document.createElement('li'); li.innerHTML = hintText(i); ol.appendChild(li); }
    const done = state.solved || state.revealed;
    $('hintBtn').disabled = done || state.hintsUsed >= HINTS;
    $('hintBtn').textContent = state.hintsUsed === 0 ? 'Get a hint' : state.hintsUsed >= HINTS ? 'No more hints' : 'Another hint';
    $('revealBtn').disabled = done;
    $('newBtn').textContent = done ? 'Next plate' : 'New plate';
    $('checkBtn').disabled = done;
  }
  $('hintBtn').addEventListener('click', () => {
    if (state.hintsUsed < HINTS) state.hintsUsed++;
    state.shown = true; // the hints give the level away anyway, so a Random ticket shows its difficulty
    renderHints(); renderPlate(); snapshot();
  });
  // ---- stored answers ----
  const opsText = (k) => `${k} operation${k === 1 ? '' : 's'}`;
  // beaten: the player found an answer with fewer operations than any on file (possible outside the solver's search limits)
  // mine: the player's own answer after a solve; a stored answer that matches it gets marked, not hidden
  function answersHtml(p, mine, beaten) {
    const norm = (s) => Core.normalize(s).replace(/\s/g, '');
    const no = offFor(p), basic = Core.answerFor(p.sol, p.options, no) || p.sol; // with switches off, answers that avoid them
    const short = p.short && ![...Core.toolCodes(p.short)].some((c) => no.has(c)) && opCount(p.short) < opCount(basic) ? p.short : '';
    const rows = beaten ? [['My answer', basic]]
      : short ? [['Most basic', basic], ['Fewest operations', short]] : [['Most basic and fewest operations', basic]];
    const html = rows.map(([label, s]) => {
      const same = mine && norm(s) === norm(mine) ? ' · same as yours' : '';
      return `<div><span class="lbl">${label} · ${opsText(opCount(s))}${same}</span><code>${radHtml(s, true)}</code></div>`;
    }).join('');
    return `<div class="answers">${html}</div>`;
  }
  $('revealBtn').addEventListener('click', () => {
    state.revealed = true;
    if (stats.streak) { stats.streak = 0; save(); }
    msg('info', answersHtml(state.current));
    renderHints(); renderPlate(); renderStats(); snapshot();
  });

  // ---- checking ----
  $('eqForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.solved || state.revealed) return;
    const p = state.current, r = Core.check(eq.value, p.d);
    if (!eq.value.trim()) { msg('bad', 'Type an equation using the four digits first.'); return; }
    if (!r.ok) { msg('bad', r.kind === 'unequal' && state.mode !== 'normal' ? 'Not balanced.' : esc(r.error)); return; } // challenge modes don't give the totals away
    if (restricted()) { // a correct answer still has to stay within the level's tools, then within this plate's tier
      const used = Core.toolTier(eq.value), lv = levelOf(state.level).name, need = Core.toolTier(hintAnswer(p)); // the plate's tier with your tools
      if (used > cap()) { msg('bad', `That uses ${TIERS[used]} tools${used === 3 ? ' (fractional powers like 8^(1 ÷ 3) count as Expert)' : ''}, which Restricted doesn’t allow on ${lv}.`); return; }
      const banned = [...Core.toolCodes(eq.value)].filter((c) => offFor(p).has(c));
      if (banned.length) { msg('bad', `That uses ${listify(banned.map((c) => `<code>${SWITCHES.find((w) => w[0] === c)[1]}</code>`))}, which you’ve switched off.`); return; }
      if (used > need) { msg('info', `That works, but this plate can be done ${need === 1 ? 'with + − × ÷ only' : 'without Expert tools'}. Try again for points.`); return; }
    }
    if (state.mode === 'eco') { // a correct answer still has to reach the goal
      const n = opCount(eq.value), goal = opCount(p.short || p.sol);
      if (n > goal) { msg('info', state.goalShown ? `That works with ${opsText(n)}. The goal is ${goal}. Trim it down for points.` : `That works with ${opsText(n)}, but it can be done in fewer. Try again for points.`); return; }
    }
    const L = levelOf(p.level), pts = Math.max(1, L.pts - state.hintsUsed);
    state.solved = true;
    stats.score += pts; stats.solved += 1; stats.streak += 1; stats.best = Math.max(stats.best, stats.streak); save();
    const same = r.sides[0] && Core.fmt(r.sides[0]);
    const mine = opCount(eq.value), fewest = opCount(p.short || p.sol), beaten = mine < fewest;
    const note = beaten ? ' That’s fewer than any answer I found!' : mine === fewest ? (state.mode === 'eco' ? ' That’s the goal!' : ' That’s the fewest operations I found!') : '';
    msg('good', `Balanced at ${esc(same)} with ${opsText(mine)}.${note} +${pts} point${pts > 1 ? 's' : ''}.` + answersHtml(p, eq.value, beaten));
    renderDigits(4, -1); renderHints(); renderPlate(); renderStats(); snapshot();
  });

  // ---- the plate's state: a random pun state for each new plate, its slogan riffing on the real one ----
  // [state, slogan, what it riffs on, its sky: 'sunset' or 'day']; the Rules screen lists them too.
  const STATES = [
    ['Minusota', 'Land of 10,000 Plates', 'Minnesota, “Land of 10,000 Lakes”', 'day'],
    ['Califormula', 'Find Your X Here', 'California’s tourism slogan, “Find Yourself Here”', 'day'],
    ['Mathachusetts', 'The Spirit of Arithmetic', 'Massachusetts plates, “The Spirit of America”', 'day'],
    ['Floorida', 'The Sumshine State', 'Florida, “The Sunshine State”', 'day'],
    ['Algebraska', 'Equality on Both Sides', 'Nebraska’s motto, “Equality Before the Law”', 'sunset'],
    ['Root Island', 'The Quotient State', 'Rhode Island, “The Ocean State”', 'sunset'],
    ['New Mathico', 'Land of Exponents', 'New Mexico, “Land of Enchantment”', 'sunset'],
    ['North Calculina', 'First in Factorials', 'North Carolina plates, “First in Flight”', 'sunset'],
  ];
  $('statesRows').innerHTML = STATES.map(([name, slogan, real]) => `<tr><td><span class="mini-plate state-chip">${name}</span></td><td>${slogan}</td><td class="muted">${real}</td></tr>`).join('');
  let stateNo = -1;
  function newState() {
    let k; do { k = Math.floor(Math.random() * STATES.length); } while (k === stateNo);
    stateNo = k; $('plateState').textContent = STATES[k][0]; $('plateSlogan').textContent = STATES[k][1];
    document.querySelector('.plate').dataset.sky = Math.random() < 0.05 ? 'night' : STATES[k][3]; // a rare night plate, any state
  }

  // ---- puzzles ----
  function load(p, keepInput) {
    newState();
    state.current = p; state.hintsUsed = 0; state.solved = false; state.revealed = false; state.shown = false; state.goalShown = false;
    renderKeys(); renderSwitches(); // Restricted's keys follow the level and the switches
    if (!keepInput) eq.value = '';
    msg(null); $('preview').innerHTML = '';
    renderDigits(0, -1); renderPlate(); renderHints(); live(); snapshot();
  }
  function newPuzzle(fromLevelChange) {
    if (!fromLevelChange && state.current && !state.solved && !state.revealed && stats.streak) { stats.streak = 0; save(); renderStats(); }
    const pool = filterOn() ? POOLS.random.filter(fits) : POOLS[state.level]; // tier-1 plates always fit, so it's never empty
    let p, tries = 0;
    do { p = pool[Math.floor(Math.random() * pool.length)]; } while (state.recent.includes(p.n) && tries++ < 50);
    state.recent = [p.n, ...state.recent].slice(0, 40);
    load(p);
  }
  $('newBtn').addEventListener('click', () => newPuzzle(false));
  // Once a plate is solved or shown, Enter or → deals the next one at the same level and mode. Keys meant for
  // another working control are left alone: Enter clicks a focused button, arrows move between radio choices.
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== 'ArrowRight') || e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!(state.solved || state.revealed) || $('view-play').hidden) return;
    const c = e.target.closest && e.target.closest('input, textarea, select, button, a, [contenteditable]');
    if (c && c !== eq && !c.disabled && (e.key === 'Enter' || !c.matches('button, a'))) return;
    e.preventDefault();
    newPuzzle(false);
  });
  $('customForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('custom').value.trim();
    if (!/^\d{4}$/.test(v)) { msg('bad', 'Enter exactly four digits, like 4797.'); return; }
    state.level = 'random'; stats.level = 'random'; save(); // so your own digits don't show their difficulty
    load(ALL[+v]);
    $('custom').value = '';
  });
  $('lvReveal').addEventListener('click', () => { state.shown = true; renderPlate(); snapshot(); });
  $('goalReveal').addEventListener('click', () => { state.goalShown = true; renderPlate(); live(); snapshot(); });

  // ---- tabs (with #rules deep link) ----
  function show(tab) {
    const rules = tab === 'rules';
    $('view-play').hidden = rules; $('view-rules').hidden = !rules;
    $('tab-play').setAttribute('aria-selected', String(!rules)); $('tab-rules').setAttribute('aria-selected', String(rules));
  }
  $('tab-play').addEventListener('click', () => show('play'));
  $('tab-rules').addEventListener('click', () => show('rules'));
  if (location.hash === '#rules') show('rules');

  // ---- live-update snapshot ----
  function snapshot() {
    if (!hot || !hot.snapshot) return;
    try { hot.snapshot(() => ({ level: state.level, n: state.current && state.current.n, input: eq.value, hintsUsed: state.hintsUsed, solved: state.solved, revealed: state.revealed, shown: state.shown })); } catch (e) {}
  }

  // ---- start: open on a real puzzle ----
  function start(data) {
    renderStats(); renderMode();
    if (data && typeof data.n === 'number') {
      state.level = data.level || state.level;
      load(ALL[data.n], true);
      eq.value = data.input || '';
      state.hintsUsed = data.hintsUsed || 0; state.solved = !!data.solved; state.revealed = !!data.revealed; state.shown = !!data.shown;
      renderPlate(); renderHints(); live();
    } else {
      newPuzzle(true);
    }
  }
  if (hot && hot.ready) hot.ready(start); else start(restored);
})();
