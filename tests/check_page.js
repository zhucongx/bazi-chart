#!/usr/bin/env node
// 页面检查。
//
//   node tests/check_page.js            检查公开的示例页面 dist/index.html，约 40 秒
//   node tests/check_page.js --private  检查个人页面 private/dist/index.html
//   加 --quick                          跳过耗时的两项（神煞口诀的全量对照、所有状态的遍历），几秒钟
//   加 --base <目录>                    检查 <目录>/dist/index.html，预期和事实也从这个目录里找（tools/fuzz.py 在用）
//   加 --quiet                          只打印失败的项目和最后的结论
//
// 检查四件事：
//   1. 计算部分（src/engine.js）：干支换算、十五种干支关系、神煞口诀。和具体的人无关。
//   2. 每个人的细盘，对照 lunar_python 独立算出的预期（data/expected.json，由 tools/gen_data.py 生成）。
//   3. 人工核对过的事实：tests/facts.json；个人的在 private/tests/facts.json。
//   4. 解释面板的行为，以及所有状态下每一条解释都有内容。
//
// 需要先 npm install（只用到 jsdom）。有任何一项失败，退出码为 1。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const priv = process.argv.includes('--private');
const quick = process.argv.includes('--quick');
if (process.argv.includes('--quiet')) {   // 只打印失败的项目和最后的结论
  const say = console.log;
  console.log = s => { if (/失败|全部通过|^检查 /.test(String(s))) say(s); };
}
const baseArg = process.argv.indexOf('--base');
const BASE = baseArg > 0 ? path.resolve(process.argv[baseArg + 1]) : priv ? path.join(ROOT, 'private') : ROOT;
const FILE = path.join(BASE, 'dist', 'index.html');
const readJSON = (f, fallback) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback;
if (!fs.existsSync(FILE)) { console.log(`找不到 ${path.relative(ROOT, FILE)}，先运行 python3 tools/build.py${priv ? ' --private' : ''}`); process.exit(1); }
const expected = readJSON(path.join(BASE, 'data', 'expected.json'), {});
const facts = readJSON(path.join(BASE, 'tests', 'facts.json'), {});
const ssCheck = readJSON(path.join(ROOT, 'data', 'shensha_check.json'), null);

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true });
const w = dom.window, d = w.document;
const $ = id => d.getElementById(id);
const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const ev = code => w.eval(code);
const strip = s => String(s).replace(/<[^>]+>/g, '');
const byX = key => [...d.querySelectorAll('[data-x]')].find(n => n.dataset.x === key);
const BAD = /undefined|NaN|null|\[object/;

let failed = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  通过  ' + name); return; }
  failed++;
  console.log('  失败  ' + name + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : ''));
}
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { 实际: got, 应为: want });
const sameSet = (name, got, want) => eq(name, [...got].sort(), [...want].sort());

console.log(`检查 ${path.relative(ROOT, FILE)}`);
eq('脚本没有报错', errors, []);
const people = ev('DATA.people.map(p=>p.id)');
ok('至少有一个人', people.length > 0);
const pick = i => { if (people.length > 1 && ev('sel.p') !== i) click(d.querySelector(`#people [data-p="${i}"]`)); };
const rels = id => [...$(id).querySelectorAll('[data-x]')].map(b => b.dataset.x.split('|').slice(1, 3).join(''));
function tableRows() {
  const rows = {};
  [...$('pan').rows].forEach(tr => { rows[txt(tr.cells[0])] = [...tr.cells].slice(1); });
  return rows;
}

// ---------- 1. 计算部分 ----------
console.log('干支换算');
eq('2026 年是丙午年', ev('yearGZ(2026)'), '丙午');
eq('2000 年是庚辰年', ev('yearGZ(2000)'), '庚辰');
eq('甲子年的正月是丙寅', ev('monthGZ(1984,0)'), '丙寅');
eq('2026 年立冬月是己亥', ev('monthGZ(2026,9)'), '己亥');
eq('2000-01-01 是戊午日', ev('dayGZ(Date.UTC(2000,0,1))'), '戊午');
eq('2026-11-13 是辛卯日', ev('dayGZ(Date.UTC(2026,10,13))'), '辛卯');

console.log('干支关系');
const mkCols = ps => ps.map((p, i) => ({ k: '年月日时'[i], g: p[0], z: p[1] }));
const relOf = ps => ev(`relations(${JSON.stringify(mkCols(ps))}).map(r=>r.t+r.c)`);
[
  ['甲己五合，子丑六合', ['甲子', '己丑'], ['五合甲己', '六合子丑']],
  ['甲庚相冲，子午相冲', ['甲午', '庚子'], ['相冲甲庚', '相冲子午']],
  ['甲戊相克，辰戌相冲', ['甲辰', '戊戌'], ['相克甲戊', '相冲辰戌']],
  ['寅戌拱合', ['丙寅', '丙戌'], ['拱合寅戌']],
  ['寅午半合', ['丙寅', '丙午'], ['半合寅午']],
  ['申子辰三合，成局后不再列半合', ['壬申', '壬子', '壬辰'], ['三合申子辰']],
  ['寅卯辰三会，另有卯辰相害', ['甲寅', '乙卯', '甲辰'], ['三会寅卯辰', '相害卯辰']],
  ['寅辰拱会', ['甲寅', '甲辰'], ['拱会寅辰']],
  ['午亥暗合', ['壬午', '癸亥'], ['暗合午亥']],
  ['寅巳申三刑，成刑后不再单列相刑', ['甲寅', '丁巳', '庚申'], ['三刑寅巳申', '相害寅巳', '六合巳申', '相破巳申', '相冲寅申', '相冲甲庚']],
  ['子卯相刑', ['甲子', '乙卯'], ['相刑子卯']],
  ['午午自刑', ['甲午', '丙午'], ['自刑午午']],
  ['子未相害', ['甲子', '乙未'], ['相害子未']],
  ['子酉相破', ['甲子', '乙酉'], ['相破子酉']],
].forEach(([name, ps, want]) => sameSet(name, relOf(ps), want));
eq('大运带来的关系记在大运那一层', ev(`relations(${JSON.stringify(mkCols(['甲子']).concat([{ k: '大运', g: '己', z: '丑', layer: 1 }]))}).map(r=>[r.t+r.c,r.top,r.where.join()])`), [['五合甲己', 1, '年干'], ['六合子丑', 1, '年支']]);
const kindsUnit = new Set();
{
  const all = [['甲子', '己丑'], ['甲午', '庚子'], ['甲辰', '戊戌'], ['丙寅', '丙戌'], ['丙寅', '丙午'], ['壬申', '壬子', '壬辰'], ['甲寅', '乙卯', '甲辰'], ['甲寅', '甲辰'], ['壬午', '癸亥'], ['甲寅', '丁巳', '庚申'], ['甲子', '乙卯'], ['甲午', '丙午'], ['甲子', '乙未'], ['甲子', '乙酉']];
  const bad = [];
  all.forEach(ps => ev(`relations(${JSON.stringify(mkCols(ps))}).map(r=>['rel',r.t,r.c,r.n,r.where.join('、'),r.top,r.grp].join('|'))`).forEach(key => {
    const r = ev(`X(${JSON.stringify(key)})`);
    kindsUnit.add(key.split('|')[1]);
    if (!r || r.p.length < 3 || BAD.test(JSON.stringify(r))) bad.push(key);
  }));
  eq('十五种干支关系都能算出来', ev('REL_TYPES').filter(t => !kindsUnit.has(t)), []);
  eq('每一种都有解释', bad, []);
}

console.log('神煞口诀');
ok('羊刃都落在日干的帝旺位', ev("G.split('').every((g,i)=>stage(g,SS_YANGREN[i])==='帝旺')"));
eq('由天德合反推出的天德，和歌诀对得上（正丁二申，三壬四辛，五亥六甲，七癸八寅，九丙十乙，子巳丑庚）', ev("'寅卯辰巳午未申酉戌亥子丑'.split('').map(tianDe).join('')"), '丁申壬辛亥甲癸寅丙乙巳庚');
eq('由月德合反推出的月德：申子辰壬，亥卯未甲，寅午戌丙，巳酉丑庚', ev("['子','卯','午','酉'].map(yueDe).join('')"), '壬甲丙庚');
ok('每个神煞都有说明和口诀', ev("SS_NAMES.every(n=>SS[n]&&SS[n].w&&SS[n].q&&'吉凶中'.includes(SS[n].k))"));
ok('每个神煞都有出现频率', ev("SS_NAMES.every(n=>typeof DATA.freq[n]==='number')"));
if (!ssCheck) ok('有 data/shensha_check.json', false);
else if (quick) console.log('  跳过  和 Python 那份口诀的全量对照（快速模式）');
else {
  const got = JSON.parse(ev(`(function(){
    let hash=7,total=0;const counts={};SS_NAMES.forEach(n=>{counts[n]=[0,0,0,0];});
    for(let yi=0;yi<60;yi++){const yg=yi%10,yp=G[yg]+Z[yi%12];
      for(let m=0;m<12;m++){const mp=G[((yg%5)*2+2+m)%10]+Z[(m+2)%12];
        for(let di=0;di<60;di++){const dg=di%10,dp=G[dg]+Z[di%12];
          for(let h=0;h<12;h++){const r=shenshaOf([yp,mp,dp,G[((dg%5)*2+h)%10]+Z[h]],DATA.nayin);
            for(let i=0;i<4;i++){hash=(Math.imul(hash,31)+shenshaMask(r[i]))>>>0;r[i].forEach(o=>{counts[o.n][i]++;});}
            total++;}}}}
    return JSON.stringify({names:SS_NAMES,total,hash,counts});})()`));
  eq('神煞的名单和顺序一致', got.names, ssCheck.names);
  eq(`${got.total} 种四柱组合逐柱对照，结果和 Python 那份完全相同`, [got.total, got.hash], [ssCheck.total, ssCheck.hash]);
  eq('每个神煞落在每一柱上的次数相同', got.counts, ssCheck.counts);
}

// ---------- 2. 每个人的细盘 ----------
people.forEach((id, pi) => {
  pick(pi);
  const E = expected[id];
  console.log(`细盘 · ${ev('P.name')}`);
  if (!E) { ok('data/expected.json 里有这个人的预期', false); return; }
  const rows = tableRows(), natal = label => rows[label].slice(2).map(txt);
  eq('标题是四柱', txt($('title')), E.pillars.join(''));
  eq('主星', natal('主星'), E.zhuxing);
  eq('天干', natal('天干'), E.pillars.map(p => p[0]));
  eq('地支', natal('地支'), E.pillars.map(p => p[1]));
  eq('藏干和十神', natal('藏干'), E.canggan.map(c => c.map(x => x[0] + x[1]).join('')));
  eq('星运', natal('星运'), E.xingyun);
  eq('自坐', natal('自坐'), E.zizuo);
  eq('空亡', natal('空亡'), E.xunkong);
  eq('纳音', natal('纳音'), E.nayin);
  eq('大运八步', [...$('dayun').children].map(b => txt(b.querySelector('.gz'))), E.dayun);
  eq('五行个数', [...$('bars').querySelectorAll('.n')].map(txt), E.wuxing.all.map((n, i) => `${n} 个（${E.wuxing.face[i]}）`));
  eq('神煞', rows['神煞'].slice(2).map(td => [...td.querySelectorAll('[data-x]')].map(txt).sort()), E.shensha.map(a => [...a].sort()));
  eq('解读方框有 8 个', d.querySelectorAll('.read').length, 8);
  const fixed = ['meta', 'kv', 'foot', 'note-yun', 'note-wx', 'rd-pan', 'rd-yun', 'rd-rel', 'rd-rel2', 'rd-wx', 'rd-tk', 'rd-gods'].filter(k => !txt($(k)) || BAD.test(txt($(k))));
  eq('顶部信息和各版块的解读都有内容', fixed, []);
});

// ---------- 3. 人工核对过的事实 ----------
Object.keys(facts).forEach(id => {
  const pi = people.indexOf(id), F = facts[id];
  if (pi < 0) return;
  pick(pi);
  console.log(`人工核对过的事实 · ${ev('P.name')}`);
  if (F.title) eq('标题', txt($('title')), F.title);
  const rows = tableRows();
  Object.keys(F.rows || {}).forEach(label => eq(label, rows[label].slice(2).map(txt), F.rows[label]));
  if (F.dayun) eq('大运八步', [...$('dayun').children].map(b => txt(b.querySelector('.gz'))), F.dayun);
  if (F.bars) eq('五行个数', [...$('bars').querySelectorAll('.n')].map(txt), F.bars);
  if (F.shensha) eq('神煞', rows['神煞'].slice(2).map(td => [...td.querySelectorAll('[data-x]')].map(txt).sort()), F.shensha.map(a => [...a].sort()));
  Object.keys(F.meta || {}).forEach(k => {
    const dt = [...$('meta').querySelectorAll('dt')].find(x => txt(x) === k);
    ok(`顶部信息 · ${k}`, !!dt && txt(dt.nextElementSibling).includes(F.meta[k]), dt ? txt(dt.nextElementSibling) : '没有这一行');
  });
  Object.keys(F.rel || {}).forEach(k => sameSet(`原局关系 ${k}`, rels(k), F.rel[k]));
  (F.steps || []).forEach(s => {
    click($('dayun').querySelector(`[data-dy="${s.dy}"]`));
    if (s.y) click($('liunian').querySelector(`[data-y="${s.y}"]`));
    const at = `第 ${s.dy + 1} 步大运` + (s.y ? ` ${s.y} 年` : '');
    if (s.cols) { const r = tableRows(); eq(`${at}：流年、大运两列`, [0, 1].map(i => txt(r['天干'][i]) + txt(r['地支'][i])), s.cols); }
    Object.keys(s.eq || {}).forEach(k => sameSet(`${at}：${k}`, rels(k), s.eq[k]));
    Object.keys(s.has || {}).forEach(k => ok(`${at}：${k} 里有 ${s.has[k].join('、')}`, s.has[k].every(x => rels(k).includes(x)), rels(k)));
  });
});

// ---------- 4. 解释面板 ----------
console.log('解释面板');
pick(0);
{
  const rowBtn = byX('row|星运');
  click(rowBtn);
  ok('点行名打开面板并高亮', !$('sheet').hidden && txt($('sheet-t')) === '星运' && rowBtn.classList.contains('on'));
  click(rowBtn);
  ok('再点一次收起', $('sheet').hidden);
  const years = () => [...$('liunian').children];
  const other = () => years().find(b => b.getAttribute('aria-pressed') !== 'true');
  click(byX('st|流年'));
  const before = txt($('sheet-t'));
  click(other());
  ok('换流年后面板内容跟着变', !$('sheet').hidden && txt($('sheet-t')) !== before, [before, txt($('sheet-t'))]);
  click(d.querySelector('[data-x^="g|流年|"]'));
  click(other());
  ok('所指的字消失后面板自动收起', $('sheet').hidden);
  click($('rd'));
  ok('开关关掉解读', d.documentElement.dataset.read === 'off' && $('rd').getAttribute('aria-pressed') === 'false');
  click($('rd'));
  ok('开关打开解读', d.documentElement.dataset.read === 'on' && $('rd').getAttribute('aria-pressed') === 'true');
  click(byX('row|神煞'));
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('按 Esc 收起', $('sheet').hidden);
  if (people.length > 1) {
    const chips = () => [...d.querySelectorAll('#people [data-p]')];
    ok('多个人时显示切换按钮', !$('people').hidden && chips().length === people.length);
    click(byX('row|神煞'));
    click(chips()[1]);
    ok('换人后标题、选中状态跟着变，面板收起', $('sheet').hidden && chips()[1].getAttribute('aria-pressed') === 'true' && chips()[0].getAttribute('aria-pressed') === 'false' && (!expected[people[1]] || txt($('title')) === expected[people[1]].pillars.join('')));
    click(chips()[0]);
    ok('换回来', chips()[0].getAttribute('aria-pressed') === 'true' && (!expected[people[0]] || txt($('title')) === expected[people[0]].pillars.join('')));
  } else ok('只有一个人时不显示切换按钮', $('people').hidden);
}

// ---------- 5. 每一个可点的解释都有内容 ----------
const bad = [];
let checked = 0;
const kinds = new Set();
function checkAll(tag) {
  d.querySelectorAll('[data-x]').forEach(n => {
    const key = n.dataset.x;
    const r = ev(`X(${JSON.stringify(key)})`);
    checked++;
    if (!r || !r.t || !r.p) { bad.push([tag, key, '没有解释']); return; }
    const parts = r.p.filter(Boolean);
    if (!parts.length) bad.push([tag, key, '解释是空的']);
    const all = r.t + ' ' + parts.map(p => p[0] + ' ' + strip(p[1])).join(' ');
    if (BAD.test(all)) bad.push([tag, key, all.slice(0, 120)]);
    parts.forEach(p => { if (!p[0] || !strip(p[1]).trim()) bad.push([tag, key, '有空段落 ' + p[0]]); });
    if (key.startsWith('rel|')) kinds.add(key.split('|')[1]);
  });
  const lay = txt($('layers'));
  if (BAD.test(lay) || $('layers').children.length !== 4) bad.push([tag, 'layers', lay.slice(0, 80)]);
}
console.log('解释内容');
people.forEach((id, pi) => {
  pick(pi);
  const name = ev('P.name');
  checkAll(`${name} 当前状态`);
  if (quick) return;
  const y0 = ev('sel.y'), dy0 = ev('sel.dy');
  for (let dy = 0; dy < 8; dy++) {
    click($('dayun').querySelector(`[data-dy="${dy}"]`));
    for (const y of [...$('liunian').children].map(b => b.dataset.y)) {
      click($('liunian').querySelector(`[data-y="${y}"]`));
      for (let m = 0; m < 12; m++) { click($('liuyue').querySelector(`[data-m="${m}"]`)); checkAll(`${name} 大运${dy} ${y}年 第${m}月`); }
    }
  }
  click($('dayun').querySelector(`[data-dy="${dy0}"]`));
  click($('liunian').querySelector(`[data-y="${y0}"]`));
  for (let m = 0; m < 12; m++) {
    click($('liuyue').querySelector(`[data-m="${m}"]`));
    for (const t of [...$('liuri').children].map(b => b.dataset.d)) { click($('liuri').querySelector(`[data-d="${t}"]`)); checkAll(`${name} ${y0}年 第${m}月 ${t}`); }
  }
});
eq(`${checked} 条解释都有内容` + (quick ? '（快速模式，每人只查当前状态）' : `（${people.length} 个人，每人 8 步大运 × 10 年 × 12 月，外加选中那一年的每一天）`), bad.slice(0, 8), []);
if (!quick) console.log(`  说明  遍历中实际出现过 ${kinds.size} 种干支关系：${[...kinds].join('、')}`);
eq('全程脚本没有报错', errors, []);

console.log(failed ? `\n有 ${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
