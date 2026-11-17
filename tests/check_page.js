#!/usr/bin/env node
// 页面检查。
//
//   node tests/check_page.js            检查公开的示例页面 index.html，约半分钟
//   node tests/check_page.js --private  检查个人页面 private/build/index.html
//   加 --quick                          跳过耗时的两项（神煞口诀的全量对照、所有状态的遍历），几秒钟
//   加 --base <目录>                    检查 <目录>/index.html，预期也从这个目录里找（tools/fuzz.py 在用）
//   加 --quiet                          只打印失败的项目和最后的结论
//
// 检查四件事：
//   1. 计算部分（src/engine.js）：干支换算、十五种干支关系、神煞口诀。和具体的人无关。
//   2. 每个人的细盘，对照 lunar_python 独立算出的预期（data/expected.json，由 tools/gen_data.py 生成）。
//   3. 人工核对过的事实：people/<id>.facts.json；个人的在 private/people/ 里。
//   4. 解释面板的行为，在页面上添加、编辑、删除、导入人物，以及所有状态下每一条解释都有内容。
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
// BASE 是页面和生成的数据所在的目录，PEOPLE 是出生信息和人工核对过的事实所在的目录
const BASE = baseArg > 0 ? path.resolve(process.argv[baseArg + 1]) : priv ? path.join(ROOT, 'private', 'build') : ROOT;
const PEOPLE = baseArg > 0 ? path.join(BASE, 'people') : priv ? path.join(ROOT, 'private', 'people') : path.join(ROOT, 'people');
const FILE = path.join(BASE, 'index.html');
const readJSON = (f, fallback) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback;
if (!fs.existsSync(FILE)) { console.log(`找不到 ${path.relative(ROOT, FILE)}，先运行 python3 tools/build.py${priv ? ' --private' : ''}`); process.exit(1); }
const expected = readJSON(path.join(BASE, 'data', 'expected.json'), {});
const facts = {};        // {人物的 id: 人工核对过的事实}，每个人一个文件：<id>.facts.json
if (fs.existsSync(PEOPLE)) fs.readdirSync(PEOPLE).filter(f => f.endsWith('.facts.json')).forEach(f => { facts[f.slice(0, -'.facts.json'.length)] = readJSON(path.join(PEOPLE, f), {}); });
const ssCheck = readJSON(path.join(ROOT, 'data', 'shensha_check.json'), null);

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true, url: 'https://bazi.test/' });   // 给一个网址，localStorage 才能用
const w = dom.window, d = w.document;
const $ = id => d.getElementById(id);
const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const ev = code => w.eval(code);
const strip = s => String(s).replace(/<[^>]+>/g, '');
const byX = key => [...d.querySelectorAll('[data-x]')].find(n => n.dataset.x === key);
const BAD = /undefined|NaN|null|\[object/;
const DYN = 4;        // 细盘前四列是选中的流日、流月、流年、大运，后四列才是原局

let failed = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  通过  ' + name); return; }
  failed++;
  console.log('  失败  ' + name + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : ''));
}
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { 实际: got, 应为: want });
const sameSet = (name, got, want) => eq(name, [...got].sort(), [...want].sort());
// 随机数：mulberry32，seed 一样结果就一样。原来用的线性同余乘出来超过 2^53，浮点丢了低位，seed 几乎都是 4 的倍数，
// 「4000 组随机的四柱」其实只有阳干和子、辰、申三个地支（2026-11-15 审核时查出来的）
const rng = seed => { let s = seed | 0; return n => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * n); }; };

console.log(`检查 ${path.relative(ROOT, FILE)}`);
eq('脚本没有报错', errors, []);
const people = ev('DATA.people.map(p=>p.id)');
ok('至少有一个人', people.length > 0);
const pick = i => { if (ev('sel.p') !== i) click(d.querySelector(`#people [data-p="${i}"]`)); };
const rels = id => [...$(id).querySelectorAll('[data-x]')].map(b => b.dataset.x.split('|').slice(1, 3).join(''));
function tableRows() {
  const rows = {};
  [...$('pan').rows].forEach(tr => { rows[txt(tr.cells[0].querySelector('[data-x]'))] = [...tr.cells].slice(1); });   // 行名取那个可点的字
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
eq('每条关系记着是哪几柱凑成的：寅巳申三刑是年、月、日三柱；甲戊相克有两处时记两次', [ev(`JSON.stringify(relations(${JSON.stringify(mkCols(['甲寅', '丁巳', '庚申']))}).find(r=>r.t==='三刑').inst)`), ev(`JSON.stringify(relations(${JSON.stringify(mkCols(['甲子', '戊子', '戊子']))}).find(r=>r.t==='相克').inst)`)], ['[["年","月","日"]]', '[["年","月"],["年","日"]]']);
{
  // 点开一条关系看到的解释。原局里同一种关系有两处时，两处都要说到；和日主同一个字的天干，在日干上是日主，在别处是比肩。
  // 用虚构的四柱（日主戊土）临时顶替当前的盘，算完换回来
  const xr = (where, top, y) => JSON.parse(ev(`(()=>{const d0=DM,n0=NATAL,y0=sel.y;DM='戊';NATAL=${JSON.stringify(mkCols(['甲子', '戊子', '戊子', '丁巳']))};${y ? 'sel.y=' + y + ';' : ''}
    try{return JSON.stringify(xRel('相克','甲戊','',${JSON.stringify(where)},${top},'g').p.filter(r=>r[0]==='这一条'||r[0]==='涉及的十神').map(r=>r[1]))}finally{DM=d0;NATAL=n0;sel.y=y0}})()`));
  eq('解释里的位置：甲戊相克只在年干和月干之间', xr('年干–月干', 0), ['在原局的年干和月干之间。两柱紧挨着。', '甲是七杀，戊是比肩。']);
  eq('解释里的位置：只在年干和日干之间，戊是日主', xr('年干–日干', 0), ['在原局的年干和日干之间。中间隔了一柱，作用打了折扣。', '甲是七杀，戊是日主。']);
  eq('解释里的位置：两处都有时两处都说到，戊分开说', xr('年干–月干、年干–日干', 0), ['原局里有两处：年干和月干之间，两柱紧挨着；年干和日干之间，中间隔了一柱，作用打了折扣。', '甲是七杀，戊在日干是日主，在月干是比肩。']);
  eq('解释里的位置：流年的甲（2024 甲辰）对上月干和日干的戊', xr('月干、日干', 2, 2024), ['流年的甲，对上原局月干、原局日干的戊。', '甲是七杀，戊在日干是日主，在月干是比肩。']);
  eq('解释里的位置：流年的戊（2028 戊申）对上年干的甲，流年的戊是比肩', xr('年干', 2, 2028), ['流年的戊，对上原局年干的甲。', '甲是七杀，戊是比肩。']);
}
eq('大运带来的关系记在大运那一层', ev(`relations(${JSON.stringify(mkCols(['甲子']).concat([{ k: '大运', g: '己', z: '丑', layer: 1 }]))}).map(r=>[r.t+r.c,r.top,r.where.join()])`), [['五合甲己', 1, '年干'], ['六合子丑', 1, '年支']]);
// 三合、三会、三刑算在凑齐它的那一层：原局已经凑齐的，流年再来一个同样的字，不再列一遍，也不再写「凑齐了」
eq('三合算在凑齐它的那一层：原局已经凑齐申子辰，流年再来一个子不再列；原局有申、辰，大运带来子才凑齐，算在大运那一层，流年的子不再列',
  [ev(`relations(${JSON.stringify(mkCols(['甲申', '丙子', '戊辰', '壬子']).concat([{ k: '流年', g: '庚', z: '子', layer: 2 }]))}).filter(r=>r.t==='三合').map(r=>[r.c,r.top,r.inst.length].join('|'))`),
   ev(`relations(${JSON.stringify(mkCols(['甲申', '丙寅', '戊辰', '壬戌']).concat([{ k: '大运', g: '甲', z: '子', layer: 1 }, { k: '流年', g: '庚', z: '子', layer: 2 }]))}).filter(r=>r.t==='三合').map(r=>[r.c,r.top,r.where.join('、')].join('|'))`)],
  [['申子辰|0|1'], ['申子辰|1|年支、日支']]);
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

console.log('根和透');
{
  // gtOf(天干, 地支)：地支里和天干同一五行的那个藏干。拿《子平真诠》「论十干得时不旺失时不弱」举的例子对一遍
  const gt = (g, z) => JSON.parse(ev(`JSON.stringify(gtOf(${JSON.stringify(g)},${JSON.stringify(z)}))`));
  eq('书里说的墓库和余气，表里都认作根：甲逢未、丙逢戌、乙逢辰、丁逢未', [gt('甲', '未'), gt('丙', '戌'), gt('乙', '辰'), gt('丁', '未')].map(t => t && t.h), ['乙', '丁', '乙', '丁']);
  eq('书里说不算的，表里也是空的：乙逢戌、丁逢丑（戌里没有木，丑里没有火）', [gt('乙', '戌'), gt('丁', '丑')], [null, null]);
  eq('书里算作明根、表里没有标的两处：乙在午、丁在酉是阴干的长生，午里没有木，酉里没有火', [ev(`stage('乙','午')`), ev(`stage('丁','酉')`), gt('乙', '午'), gt('丁', '酉')], ['长生', '长生', null, null]);
  eq('解读里拿甲木举例：长生在亥，禄（临官）在寅，旺（帝旺）在卯，三处都是根', ['亥', '寅', '卯'].map(z => [ev(`stage('甲','${z}')`), !!gt('甲', z)]), [['长生', true], ['临官', true], ['帝旺', true]]);
  eq('本气和透：甲在寅是本气又是同一个字，乙在寅是本气但不是同一个字，甲在亥是同一个字但不是本气', [gt('甲', '寅'), gt('乙', '寅'), gt('甲', '亥')].map(t => [t.h, t.ben, t.tou]), [['甲', true, true], ['甲', true, false], ['甲', false, true]]);
  // 一个地支里同一五行的藏干最多一个，所以一个格子里只会有一个字
  const hid = JSON.parse(ev('JSON.stringify(HID)')), el = g => ev(`gEl(${JSON.stringify(g)})`);
  eq('十二个地支里，同一五行的藏干都不超过一个', Object.keys(hid).filter(z => { const es = hid[z].split('').map(el); return new Set(es).size !== es.length; }), []);
}

console.log('阴阳');
{
  // 六十甲子里阳干只配阳支、阴干只配阴支，所以照配法子寅辰午申戌是阳支。照本气的阴阳算，只有子、午、巳、亥四支和它相反
  const G10 = '甲乙丙丁戊己庚辛壬癸', Z12 = '子丑寅卯辰巳午未申酉戌亥', hid = JSON.parse(ev('JSON.stringify(HID)'));
  eq('六十甲子里，天干和地支的阴阳都相配', [...Array(60)].every((_, i) => (i % 10) % 2 === (i % 12) % 2), true);
  eq('地支照本气算阴阳，和照配法算相反的只有子、午、巳、亥', Z12.split('').filter(z => (G10.indexOf(hid[z][0]) % 2 === 0) !== (Z12.indexOf(z) % 2 === 0)).sort(), ['亥', '午', '子', '巳'].sort());
  eq('页面里天干的阴阳：甲丙戊庚壬是阳，乙丁己辛癸是阴', G10.split('').map(g => ev(`yy(${JSON.stringify(g)})`)).join(''), '阳阴阳阴阳阴阳阴阳阴');
}

console.log('五行能量和强弱计分');
{
  // 算法出自台湾吉祥坊《大师教你论八字》第二章第十四、十五节（存档的网址见 docs/取法约定.md）。下面的数字是从文章里抄下来的，和页面的实现分开写
  const EL5 = ['木', '火', '土', '金', '水'];
  const sumOf = ps => JSON.parse(ev(`JSON.stringify(nlScore(${JSON.stringify(mkCols(ps))}))`));
  // 文章自己算的例子：辛酉、癸巳、壬寅、辛亥，金 22、水 15、木 8、火 12、土 3，一共 60 分
  eq('文章举的例子，五行的分数和文章算的一样', sumOf(['辛酉', '癸巳', '壬寅', '辛亥']).sum.map((n, i) => EL5[i] + n), ['木8', '火12', '土3', '金22', '水15']);
  // 文章的藏干分数表。巳照文章的例子（庚 2 分、戊 1 分）；文章的表里巳的藏干排成庚、戊、丙，照表是戊 2 分、庚 1 分
  const TABLE = { 子: '癸8', 丑: '己5癸2辛1', 寅: '甲5丙2戊1', 卯: '乙8', 辰: '戊5乙2癸1', 巳: '丙5庚2戊1', 午: '丁5己3', 未: '己5丁2乙1', 申: '庚5壬2戊1', 酉: '辛8', 戌: '戊5辛2丁1', 亥: '壬5甲3' };
  const mine = JSON.parse(ev('JSON.stringify(Object.fromEntries(Z.split("").map(z=>[z,nlOf(z).map(x=>x[0]+x[1]).join("")])))'));
  eq('十二个地支里各藏干的分数，和从文章里抄下来的表相同；每个地支合计 8 分', [mine, Object.values(mine).every(v => (v.match(/\d/g) || []).reduce((a, b) => a + +b, 0) === 8)], [TABLE, true]);
  // 开源排盘脚本 china-testing/bazi 用的是同一篇文章的表（它的注释里写着这个网址）。它照表把巳算成丙 5、戊 2、庚 1，只有这一处和页面不同
  const ZHI5 = { 子: { 癸: 8 }, 丑: { 己: 5, 癸: 2, 辛: 1 }, 寅: { 甲: 5, 丙: 2, 戊: 1 }, 卯: { 乙: 8 }, 辰: { 戊: 5, 乙: 2, 癸: 1 }, 巳: { 丙: 5, 戊: 2, 庚: 1 }, 午: { 丁: 5, 己: 3 }, 未: { 己: 5, 丁: 2, 乙: 1 }, 申: { 庚: 5, 壬: 2, 戊: 1 }, 酉: { 辛: 8 }, 戌: { 戊: 5, 辛: 2, 丁: 1 }, 亥: { 壬: 5, 甲: 3 } };
  const asMap = v => Object.fromEntries((v.match(/\D\d/g) || []).map(x => [x[0], +x[1]]));
  eq('和开源脚本的表逐支对照，只有巳的庚和戊两个分数对调', Object.keys(ZHI5).filter(z => JSON.stringify(Object.entries(asMap(mine[z])).sort()) !== JSON.stringify(Object.entries(ZHI5[z]).sort())), ['巳']);
  // 随便取一批四柱：一共 60 分；另写一遍照表加的算法，逐项对照
  const G10 = '甲乙丙丁戊己庚辛壬癸', Z12 = '子丑寅卯辰巳午未申酉戌亥', elG = g => Math.floor(G10.indexOf(g) / 2);
  const rnd = rng(20261114), mzSeen = new Set(), dgSeen = new Set();
  const bad = [], seen = {};
  const helpOf = (dm, sum) => sum[elG(dm)] + sum[(elG(dm) + 4) % 5];
  const monthEl = z => ({ 辰: 0, 未: 1, 戌: 3, 丑: 4 })[z] !== undefined ? ({ 辰: 0, 未: 1, 戌: 3, 丑: 4 })[z] : ev(`zEl(${JSON.stringify(z)})`);
  for (let it = 0; it < 4000; it++) {
    const ps = [0, 1, 2, 3].map(() => { const i = rnd(60); return G10[i % 10] + Z12[i % 12]; });
    mzSeen.add(ps[1][1]); dgSeen.add(ps[2][0]);
    const want = [0, 0, 0, 0, 0];
    ps.forEach((x, i) => { want[elG(x[0])] += 5; Object.entries(asMap(TABLE[x[1]])).forEach(([h, n]) => { want[elG(h)] += i === 1 ? n * 2 : n; }); });
    const got = sumOf(ps);
    if (JSON.stringify(got.sum) !== JSON.stringify(want) || got.total !== 60) bad.push([ps.join(' '), got.sum, want]);
    // 强弱计分：帮日主的一组（比肩、劫财、正印、偏印）的分数。照文章的话另算一遍：30 分以上强，25 分以下弱；正好 25 分而月支的五行和日主相同或者生日主的算强；26 到 29 分文章没有说
    const dm = ps[2][0], help = helpOf(dm, want), me = monthEl(ps[1][1]), mHelp = me === elG(dm) || me === (elG(dm) + 4) % 5;
    const tier = help >= 30 ? '强' : help > 25 ? '间' : help === 25 && mHelp ? '强' : '弱';
    const q = JSON.parse(ev(`JSON.stringify(qsOf(${JSON.stringify(dm)},${JSON.stringify(mkCols(ps))}))`));
    if (q.help !== help || q.rest !== 60 - help || q.tier !== tier || q.mHelp !== mHelp) bad.push([ps.join(' '), '强弱计分', q, { help, tier, mHelp }]);
    // 强弱拆开：日主自己 5 分，月支（加倍）、另外三个地支、三个天干里的比劫和印，四块加起来就是 help
    const ok = e => e === elG(dm) || e === (elG(dm) + 4) % 5;
    let yue = 0, zhi = 0, gan = 0;
    ps.forEach((x, i) => { if (i !== 2 && ok(elG(x[0]))) gan += 5; Object.entries(asMap(TABLE[x[1]])).forEach(([h, n]) => { if (ok(elG(h))) { if (i === 1) yue += n * 2; else zhi += n; } }); });
    const pt = JSON.parse(ev(`JSON.stringify(qsParts(${JSON.stringify(dm)},${JSON.stringify(mkCols(ps))}))`));
    if (pt.self !== 5 || pt.yue !== yue || pt.zhi !== zhi || pt.gan !== gan || 5 + yue + zhi + gan !== help) bad.push([ps.join(' '), '拆开', pt, { yue, zhi, gan }]);
    // 扶抑喜用：身弱取印和比劫，身强取另外三行。26 到 29 分强弱居中，喜用照用神取（2026-11-17 起，原来不定）：这里照任铁樵的注另算一遍，
    // 克泄耗三类里官杀最重取食伤、财最重取印和比劫两类、食伤最重借身强的两条（印重取财，比劫重取食伤），一样重照官杀、财、食伤的先后；一类用神的再照有余、不足分喜神、忌神、仇神
    const de0 = elG(dm), R = k => (de0 + k) % 5, relEl = [0, 1, 2, 3, 4].map(k => want[R(k)]), relCat = relEl.slice(); relCat[0] -= 5;
    let xiWant, jiWant;
    if (tier === '强') { xiWant = [R(1), R(2), R(3)]; jiWant = [R(4), R(0)]; }
    else if (tier === '弱') { xiWant = [R(4), R(0)]; jiWant = [R(1), R(2), R(3)]; }
    else {
      const m = Math.max(relCat[1], relCat[2], relCat[3]), k = [3, 2, 1].find(j => relCat[j] === m), u = k === 3 ? 1 : k === 2 ? null : relCat[4] >= relCat[0] ? 2 : 1;      // 食伤最重借身强的两条
      if (u === null) { xiWant = [R(4), R(0)]; jiWant = [R(1), R(2), R(3)]; }
      else { const off = relEl[u] > 12 ? [1, 3, 4] : [4, 2, 3]; xiWant = [R(u), R(u + off[0])]; jiWant = [R(u + off[1]), R(u + off[2])]; }      // 喜神、忌神、仇神
    }
    const xi = JSON.parse(ev(`JSON.stringify(xiOf(${JSON.stringify(dm)},${JSON.stringify(mkCols(ps))}))`));
    if (JSON.stringify([xi.xi, xi.ji]) !== JSON.stringify([xiWant, jiWant]) || xi.lean !== (tier === '间') || (tier === '间') !== (help > 25 && help < 30)) bad.push([ps.join(' '), '喜用', xi, xiWant, jiWant]);
    // 从格的条件：年、月、时三个天干和四个地支里藏的天干，一个比肩、劫财、正印、偏印也没有；根是藏在地支里和日主同类的
    let helpN = 0, rootN = 0;
    ps.forEach((x, i) => { if (i !== 2 && ok(elG(x[0]))) helpN++; Object.keys(asMap(TABLE[x[1]])).forEach(h => { if (ok(elG(h))) helpN++; if (elG(h) === elG(dm)) rootN++; }); });
    const cg = JSON.parse(ev(`JSON.stringify(congOf(${JSON.stringify(dm)},${JSON.stringify(mkCols(ps))}))`));
    if (cg.helps.length !== helpN || cg.roots.length !== rootN || cg.ok !== (helpN === 0)) bad.push([ps.join(' '), '从格', cg, { helpN, rootN }]);
    seen[helpN === 0 ? '从格的条件合' : rootN ? '有根' : '没有根、有别的帮手'] = 1;
    const kind = help >= 30 ? '30 分以上' : help > 25 ? '26 到 29 分' : help === 25 ? (mHelp ? '25 分、月支帮日主' : '25 分、月支不帮') : '25 分以下';
    seen[kind] = (seen[kind] || 0) + 1;
  }
  eq('4000 组随机的四柱：五行的分数和照表另算的一致，一共都是 60 分；强弱计分的归类、拆开的四块、扶抑取的喜用、从格的条件，都和照书里的话另算的一致', bad.slice(0, 3), []);
  eq('随机的四柱里从格的三种情形都碰到了：合条件的、有根的、没有根但有别的帮手的', ['从格的条件合', '有根', '没有根、有别的帮手'].filter(k => !seen[k]), []);
  eq('随机的四柱里五种情形都碰到了：30 分以上、26 到 29 分、正好 25 分（月支帮和不帮）、25 分以下', ['30 分以上', '26 到 29 分', '25 分、月支帮日主', '25 分、月支不帮', '25 分以下'].filter(k => !seen[k]), []);
  eq('随机的四柱里十二个月支、十个日干都碰到了', [mzSeen.size, dgSeen.size], [12, 10]);
}

console.log('神煞口诀');
ok('羊刃都落在日干的帝旺位', ev("G.split('').every((g,i)=>stage(g,SS_YANGREN[i])==='帝旺')"));
eq('由天德合反推出的天德，和歌诀对得上（正丁二申，三壬四辛，五亥六甲，七癸八寅，九丙十乙，子巳丑庚）', ev("'寅卯辰巳午未申酉戌亥子丑'.split('').map(tianDe).join('')"), '丁申壬辛亥甲癸寅丙乙巳庚');
eq('由月德合反推出的月德：申子辰壬，亥卯未甲，寅午戌丙，巳酉丑庚', ev("['子','卯','午','酉'].map(yueDe).join('')"), '壬甲丙庚');
ok('十个天干都引了《滴天髓》的原文', ev("G.split('').every(g=>DTS[g]&&DTS[g][0].length===9&&DTS[g][0].startsWith(g)&&dts(g).includes(DTS[g][0]))"));
ok('一共 58 个神煞（问真的 55 个，加上照典籍补的六厄、病符、隔角），每个都登记了出处；在典籍里没找到、只有现代出处的是天医、披麻、十灵日、六秀日、童子煞', ev("SS_NAMES.length===58&&SS_EXTRA.join()==='六厄,病符,隔角'&&SS_NAMES.slice(55).join()===SS_EXTRA.join()&&SS_NAMES.every(n=>SSD[n]&&SSD[n].d)&&SS_NAMES.filter(n=>SSD[n].m).join()==='天医,披麻,十灵日,六秀日,童子煞'"));
ok('每个神煞都有说明和口诀', ev("SS_NAMES.every(n=>SS[n]&&SS[n].w&&SS[n].q&&'吉凶中'.includes(SS[n].k))"));
ok('每个神煞都有出现频率', ev("SS_NAMES.every(n=>typeof DATA.freq[n]==='number')"));
{ // 「有多常见」那句话里的「每几个人里有一个」要和频率对得上，相差不到两成。原来 8% 以下一律写每三十个人，8% 到 20% 一律写每十个人
  const cnNum = s => { let n = 0, cur = 0; for (const ch of s) { const d = '零一二三四五六七八九'.indexOf(ch); if (ch === '两') cur = 2; else if (d >= 0) cur = d; else if (ch === '十') { n += (cur || 1) * 10; cur = 0; } else if (ch === '百') { n += cur * 100; cur = 0; } } return n + cur; };
  const all = JSON.parse(ev('JSON.stringify(SS_NAMES.map(n=>[n,DATA.freq[n],howCommon(n)]))'));
  const off = all.filter(([n, v, s]) => { const m = s.match(/每(.+?)个人里有(一|两)个/); return m && Math.abs((m[2] === '两' ? 2 : 1) / cnNum(m[1]) * 100 - v) / v > 0.2; });
  eq('「有多常见」里的「每几个人里有一个」和出现频率对得上，相差不到两成', off, []);
  eq('几个例子：十恶大败 16.7% 是每六个人一个，魁罡 6.7% 每十五个，隔角 5.6% 每十八个，拱禄 0.7% 每一百四十个', ['十恶大败', '魁罡', '隔角', '拱禄'].map(n => all.find(a => a[0] === n)[2].match(/每(.+?)个人/)[1]), ['六', '十五', '十八', '一百四十']); }
if (!ssCheck) ok('有 data/shensha_check.json', false);
else if (quick) console.log('  跳过  和 Python 那份口诀的全量对照（快速模式）');
else {
  const got = JSON.parse(ev(`(function(){
    let hash=7,total=0;const counts={};SS_NAMES.forEach(n=>{counts[n]=[0,0,0,0];});
    let xh=7,xt=0;const xc={};SS_NAMES.forEach(n=>{xc[n]=0;});
    const mix=(h,m)=>{h=(Math.imul(h,31)+m[0])>>>0;return (Math.imul(h,31)+m[1])>>>0;};
    for(let yi=0;yi<60;yi++){const yg=yi%10,yp=G[yg]+Z[yi%12];
      for(let m=0;m<12;m++){const mp=G[((yg%5)*2+2+m)%10]+Z[(m+2)%12];
        for(let di=0;di<60;di++){const dg=di%10,dp=G[dg]+Z[di%12];
          for(let h=0;h<12;h++){const r=shenshaOf([yp,mp,dp,G[((dg%5)*2+h)%10]+Z[h]],DATA.nayin,(yi+di+h)%2===0);
            for(let i=0;i<4;i++){hash=mix(hash,shenshaMask(r[i]));r[i].forEach(o=>{counts[o.n][i]++;});}
            total++;}
          const p=[yp,mp,dp,G[((dg%5)*2)%10]+'子'];
          for(let xi=0;xi<60;xi++){const r=shenshaFor(p,DATA.nayin,(yi+di+xi)%2===0,G[xi%10]+Z[xi%12],'流年');
            xh=mix(xh,shenshaMask(r));r.forEach(o=>{xc[o.n]++;});xt++;}}}}
    return JSON.stringify({names:SS_NAMES,total,hash,counts,extra:{total:xt,hash:xh,counts:xc}});})()`));
  eq('神煞的名单和顺序一致', got.names, ssCheck.names);
  eq(`原局四柱：${got.total} 种组合逐柱对照，结果和 Python 那份完全相同`, [got.total, got.hash], [ssCheck.total, ssCheck.hash]);
  eq('每个神煞落在每一柱上的次数相同', got.counts, ssCheck.counts);
  eq(`外来的一柱（大运、流年、流月、流日）：${got.extra.total} 种组合逐一对照，结果和 Python 那份完全相同`, [got.extra.total, got.extra.hash, got.extra.counts], [ssCheck.extra.total, ssCheck.extra.hash, ssCheck.extra.counts]);
}

// ---------- 1a. 典籍引文，以及口诀和原文的对照 ----------
console.log('典籍引文');
{
  const qc = readJSON(path.join(ROOT, 'data', 'quotes_check.json'), null);
  const list = JSON.parse(ev('JSON.stringify(quoteList())'));
  let hash = 2166136261;
  for (const ch of JSON.stringify(list.map(x => x.join('\u0001')).sort())) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  ok(`页面里的 ${list.length} 句引文，就是 tools/check_quotes.js 对着原文逐字核对过的那一批（改了引文要重新运行它）`, !!qc && qc.total === list.length && qc.hash === hash, qc ? { 核对过的: [qc.total, qc.hash], 页面里的: [list.length, hash] } : '没有 data/quotes_check.json');
  eq('调候表十个日干、十二个月共 120 格都有，点到的天干都出现在引的原文里', ev("G.split('').flatMap(g=>Z.split('').filter(z=>{const e=TH[g]&&TH[g][z];return !e||!e[0]||!e[0].split('').every(s=>G.includes(s)&&e[1].includes(s));}).map(z=>g+z))"), []);
  eq('调候的引文里没有富贵、命的高下这类断语（页面接着拿这张盘去对句中的条件，引了就等于把断语套到盘上）', ev("Object.entries(TH).flatMap(([g,o])=>Object.entries(o).filter(([z,e])=>/富贵|上命|大富|荣华|贫贱|下格|下命|夭/.test(e[1])).map(([z])=>g+z))"), []);
  eq('讲意外、血光、伤病一类的神煞，说明里都写着和这个人实际的健康、遭遇没有联系', ev("Object.entries(SS).filter(([k,v])=>/意外|血光|伤病|受伤|手术|疾病|病/.test(v.w)&&!(v.c&&/没有(任何)?联系/.test(v.c))).map(([k])=>k)"), []);
  eq('页脚的书单列着出处表里的每一部书', ev("(()=>{const t=footItems().join('');return Object.entries(SOURCES).filter(([k,v])=>!t.includes(k==='wz'?'《神煞大全》':v.book)).map(([k])=>k);})()"), []);
  // 下面拿引文本身当口诀来解，和页面里实际用的表对照
  const G = ev('G'), Z = ev('Z'), Q = k => ev(`Q[${JSON.stringify(k)}][1]`);
  const AN = { 鼠: '子', 牛: '丑', 虎: '寅', 兔: '卯', 龙: '辰', 蛇: '巳', 马: '午', 羊: '未', 猴: '申', 鸡: '酉', 犬: '戌', 猪: '亥' };
  const MON = { 正: '寅', 二: '卯', 三: '辰', 四: '巳', 五: '午', 六: '未', 七: '申', 八: '酉', 九: '戌', 十: '亥', 十一: '子', 十二: '丑' };
  const WEI = { 坤: '申', 乾: '亥', 艮: '寅', 巽: '巳' };
  // 歌诀：几个天干后面跟着几个生肖或地支，就是这几个天干见这几支
  const decode = text => { const out = {}; let cur = [], fresh = true;
    for (const ch of text) {
      if (G.includes(ch)) { if (!fresh) { cur = []; fresh = true; } cur.push(ch); }
      else if (AN[ch] || Z.includes(ch)) { cur.forEach(g => { out[g] = (out[g] || '') + (AN[ch] || ch); }); fresh = false; }
    }
    return out; };
  const tianyi = JSON.parse(ev('JSON.stringify(SS_TIANYI)'));
  eq('天乙贵人：《三命通会》的结论（甲戊庚牛羊，六辛逢马虎）和页面的口诀相同', decode(Q('sm_tianyi')), { 甲: tianyi.甲, 戊: tianyi.戊, 庚: tianyi.庚, 辛: tianyi.辛 });
  const ty2 = decode(Q('sf_tianyi'));
  eq('天乙贵人：《神峰通考》的歌诀和页面的口诀只差庚一干（它让庚见午寅）', [G.split('').filter(g => ty2[g] !== tianyi[g]), ty2.庚], [['庚'], '午寅']);
  eq('流霞：《神峰通考》的歌诀和页面的口诀逐干相同', G.split('').map(g => decode(Q('sf_liuxia'))[g]).join(''), ev('SS_LIUXIA'));
  const fx = JSON.parse(ev('JSON.stringify(SS_FUXING)')), fx2 = decode(Q('sf_fuxing'));
  eq('福星贵人：《神峰通考》的歌诀和页面的口诀只差乙、癸（歌诀只有丑，页面是丑或卯）', [G.split('').filter(g => fx2[g] !== fx[g]), fx2.乙, fx2.癸, fx.乙], [['乙', '癸'], '丑', '丑', '丑卯']);
  const td = {}; Q('xj_tiande').replace(/(十一|十二|[正二三四五六七八九十])月(.)/g, (m, a, b) => { td[MON[a]] = WEI[b] || b; });
  eq('天德：《协纪辨方书》引的十二个月（坤乾艮巽换成申亥寅巳）和页面的表相同', '寅卯辰巳午未申酉戌亥子丑'.split('').map(z => td[z]).join(''), ev("'寅卯辰巳午未申酉戌亥子丑'.split('').map(tianDe).join('')"));
  const yd = {}; Q('xj_yuede').split('，').forEach(s => { const m = s.match(/^(.+)月在(.)$/); if (m) m[1].match(/十一|十二|[正二三四五六七八九十]/g).forEach(a => { yd[MON[a]] = m[2]; }); });
  eq('月德：《协纪辨方书》引的十二个月和页面的表相同', Z.split('').map(z => yd[z]).join(''), ev("Z.split('').map(yueDe).join('')"));
  const he = []; Q('sm_yuedehe').replace(/(正|二|三|四)月(.)与(.)合/g, (m, a, b, c) => { he.push([MON[a], b, c]); });
  eq('月德合：《三命通会》举的四个月，月德和月德合都和页面的表相同', he, he.map(([z]) => [z, ev(`yueDe('${z}')`), ev(`SS_YUEDEHE[ssGrp('${z}')]`)]));
  const th = []; Q('sm_tiandehe').replace(/(正|二|三|四)月(.)与(.)合/g, (m, a, b, c) => { th.push([MON[a], WEI[b] || b, WEI[c] || c]); });
  eq('天德合：《三命通会》举的四个月，天德和天德合都和页面的表相同', th, th.map(([z]) => [z, ev(`tianDe('${z}')`), ev(`SS_TIANDEHE['${z}']`)]));
  const sf = []; Q('xj_sifei').replace(/(春|夏|秋|冬)(..)(..)/g, (m, a, b, c) => { sf.push([b, c]); });
  eq('四废日：《协纪辨方书》引的八个日子和页面的表相同', sf, JSON.parse(ev('JSON.stringify(SS_SIFEI)')));
  const gl = Q('sm_guluan').match(new RegExp(`[${G}][${Z}]`, 'g')), mine = JSON.parse(ev('JSON.stringify(SS_GULUAN)'));
  sameSet('孤鸾煞：页面的八个日子就是《三命通会》列的八个', mine, gl);
  const dx = {}; Q('sm_dexiu').split('；').forEach(s => { const [k, rest] = s.split('月，'); dx[k.replace('己酉丑', '巳酉丑')] = [...new Set(rest.split('').filter(c => G.includes(c)))].sort().join(''); });
  eq('德秀贵人：《三命通会》四组月份的德和秀并起来，和页面的表相同', ev("SS_GRP.map((s,i)=>[s,[...new Set(SS_DEXIU[i].split(''))].sort().join('')])"), ev('SS_GRP').map(s => [s, dx[s]]));
  const ym = []; Q('sf_yima').replace(/(...)生见(.)字/g, (m, a, b) => { ym.push([a, b]); });
  eq('驿马：《神峰通考》的四句和页面的表相同', ym, ym.map(([s]) => [s, ev(`SS_YIMA[ssGrp('${s[0]}')]`)]));
  const at = st => `G.split('').map(g=>Z.split('').find(z=>stage(g,z)==='${st}'))`;
  eq('金舆：十个天干都是禄（临官）往前数两位，合《三命通会》的「禄前二辰」', ev(`${at('临官')}.map(z=>Z[(Z.indexOf(z)+2)%12]).join('')`), ev('SS_JINYU'));
  eq('羊刃：五个阳干都是禄往前数一位，合《三命通会》的「禄前一辰」', ev(`${at('临官')}.map(z=>Z[(Z.indexOf(z)+1)%12]).filter((z,i)=>i%2===0).join('')`), ev("SS_YANGREN.split('').filter((z,i)=>i%2===0).join('')"));
  const ju = st => ev(`['壬','甲','丙','庚'].map(g=>Z.split('').find(z=>stage(g,z)==='${st}')).join('')`);   // 四个三合局依次属水、木、火、金
  eq('劫煞在三合局五行的绝位，亡神在临官位，华盖在墓位，合《三命通会》的说法', [ju('绝'), ju('临官'), ju('墓')], [ev('SS_JIESHA'), ev('SS_WANGSHEN'), ev('SS_HUAGAI')]);
  // ---- 后来补的神煞 ----
  const set = s => [...new Set(s.split(''))].sort().join('');
  // 成对读的歌诀：几个天干后面跟着同样个数的地支时，一个对一个
  const decodePair = text => { const out = {}; let gs = [], zs = [];
    const flush = () => { gs.forEach((g, i) => { out[g] = (out[g] || '') + (zs.length === gs.length ? zs[i] : zs.join('')); }); gs = []; zs = []; };
    for (const ch of text) {
      if (G.includes(ch)) { if (zs.length) flush(); gs.push(ch); }
      else if (AN[ch] || Z.includes(ch)) zs.push(AN[ch] || ch);
    }
    flush(); return out; };
  const pairs = k => Q(k).match(new RegExp(`[${G}][${Z}]`, 'g'));
  const lu = ev('SS_LU'), luOf = g => lu[G.indexOf(g)];
  const tj = decode(Q('wz_taiji')), taiji = JSON.parse(ev('JSON.stringify(SS_TAIJI)'));
  eq('太极贵人：通行的歌诀里八个天干和页面的表相同，戊己是「临四季」', ['甲', '乙', '丙', '丁', '庚', '辛', '壬', '癸'].filter(g => set(tj[g]) !== set(taiji[g])).concat(Q('wz_taiji').includes('戊己两干临四季') && set(taiji.戊) === set('辰戌丑未') && taiji.己 === taiji.戊 ? [] : ['戊己']), []);
  const wc = decodePair(Q('wz_wenchang')), wc2 = decodePair(Q('xx_wenchang').replace('丁巳鸡', '丁己鸡'));
  eq('文昌贵人：通行的歌诀和页面的表逐干相同；《星学大成》的歌诀只差辛（它是戌）', [G.split('').map(g => wc[g]).join(''), G.split('').filter(g => wc2[g] !== wc[g]), wc2.辛], [ev('SS_WENCHANG'), ['辛'], '戌']);
  eq('禄神：通行的口诀和页面的表逐干相同，也就是十二长生的临官', [G.split('').map(g => decode(Q('wz_lu'))[g]).join(''), ev(`${at('临官')}.join('')`)], [lu, lu]);
  eq('国印贵人：十个天干都是从禄数起的第九位，合《星学大成》的「禄前九位」', G.split('').map(g => Z[(Z.indexOf(luOf(g)) + 8) % 12]).join(''), ev('SS_GUOYIN'));
  eq('天厨贵人：十个天干都是食神的禄，合《三命通会》的「食神逢禄号天厨」', G.split('').map((g, i) => luOf(G[(i + 2) % 10])).join(''), ev('SS_TIANCHU'));
  eq('将星在三合局五行的帝旺位，桃花在沐浴位；灾煞是将星的对冲，也是劫煞的下一位', [ju('帝旺'), ju('沐浴'), ev('SS_JIANGXING').split('').map(z => Z[(Z.indexOf(z) + 6) % 12]).join(''), ev('SS_JIESHA').split('').map(z => Z[(Z.indexOf(z) + 1) % 12]).join('')], [ev('SS_JIANGXING'), ev('SS_TAOHUA'), ev('SS_ZAISHA'), ev('SS_ZAISHA')]);
  eq('孤辰是年支那一方往前出头的一位，寡宿是往后退出的一位，合《三命通会》举的亥子丑见寅、见戌', [ev('SS_FANG').map(f => Z[(Z.indexOf(f[2]) + 1) % 12]).join(''), ev('SS_FANG').map(f => Z[(Z.indexOf(f[0]) + 11) % 12]).join(''), Q('sm_gugua').includes('见寅为孤') && Q('sm_gugua').includes('见戌为寡')], [ev('SS_GUCHEN'), ev('SS_GUASU'), true]);
  eq('红鸾：子年在卯，往回数；天喜在对面', [Z.split('').map(z => ev(`hongLuan('${z}')`)).join(''), Q('sf_hongluan').startsWith('卯起红鸾逆数通')], ['卯寅丑子亥戌酉申未午巳辰', true]);
  const ty = {}; Q('wz_tianyi').replace(/(十一|十二|[正二三四五六七八九十])月生见(.)/g, (m, a, b) => { ty[MON[a]] = b; });
  eq('天医：通行的口诀十二个月都是月支往回数一位', Z.split('').filter(z => ty[z] !== Z[(Z.indexOf(z) + 11) % 12]), []);
  const xr = {}, xr2 = {}; Q('wz_xueren').replace(/(.)月(.)。/g, (m, a, b) => { xr[a] = b; }); Q('xj_xueji').replace(/(十一|十二|[正二三四五六七八九十])月(.)/g, (m, a, b) => { xr2[MON[a]] = b; });
  eq('血刃：通行的表和页面相同，也和《协纪辨方书》里的续世（血忌）逐月相同', [xr, xr2], [JSON.parse(ev('JSON.stringify(SS_XUEREN)')), JSON.parse(ev('JSON.stringify(SS_XUEREN)'))]);
  const shie = JSON.parse(ev('JSON.stringify(SS_SHIE)'));
  sameSet('十恶大败：《协纪辨方书》列的十天和页面的表相同', pairs('xj_shie'), shie);
  sameSet('十恶大败：这十天正好是日干的禄落在本旬空亡里的全部日子', ev("Array.from({length:60},(x,i)=>G[i%10]+Z[i%12]).filter(d=>xunkong(d[0],d[1]).includes(SS_LU[G.indexOf(d[0])]))"), shie);
  sameSet('阴差阳错：《三命通会》列的十二天和页面的表相同', pairs('sm_chacuo'), JSON.parse(ev('JSON.stringify(SS_CHACUO)')));
  sameSet('魁罡：《渊海子平》列的四天和页面的表相同', pairs('yh_kuigang'), JSON.parse(ev('JSON.stringify(SS_KUIGANG)')));
  sameSet('金神：《渊海子平》列的三个干支和页面的表相同', pairs('yh_jinshen'), JSON.parse(ev('JSON.stringify(SS_JINSHEN)')));
  const hy = {}; Q('wz_hongyan').replace(/(.)日(.)。/g, (m, a, b) => { hy[a] = b; });
  eq('红艳煞：问真的表和页面逐干相同', G.split('').map(g => hy[g]).join(''), ev('SS_HONGYAN'));
  eq('天赦日：《协纪辨方书》的四个日子和页面的表相同', Q('xj_tianshe').match(/[春夏秋冬](..)/g).map(s => s.slice(1)), JSON.parse(ev('JSON.stringify(SS_TIANSHE)')));
  const tz = []; Q('sm_tianzhuan').replace(/[春夏秋冬](..)、(..)/g, (m, a, b) => { tz.push([a, b]); });
  eq('天转、地转：《三命通会》每季的两个日子，前一个是天转，后一个是地转', [tz.map(x => x[0]), tz.map(x => x[1])], [JSON.parse(ev('JSON.stringify(SS_TIANZHUAN)')), JSON.parse(ev('JSON.stringify(SS_DIZHUAN)'))]);
  sameSet('八专：《三命通会》列的八天和页面的表相同', pairs('sm_bazhuan'), JSON.parse(ev('JSON.stringify(SS_BAZHUAN)')));
  const jc = JSON.parse(ev('JSON.stringify(SS_JIUCHOU)')), jc3 = pairs('sm_jiuchou');
  eq('九丑：页面照问真的九天；和《三命通会》的十天相比，多一个丁酉，少乙酉、乙卯', [[...pairs('wz_jiuchou')].sort(), jc.filter(x => !jc3.includes(x)), jc3.filter(x => !jc.includes(x)).sort()], [[...jc].sort(), ['丁酉'], ['乙卯', '乙酉']]);
  sameSet('十灵日：问真列的十天和页面的表相同', pairs('wz_shiling'), JSON.parse(ev('JSON.stringify(SS_SHILING)')));
  sameSet('六秀日：问真列的六天和页面的表相同', pairs('wz_liuxiu'), JSON.parse(ev('JSON.stringify(SS_LIUXIU)')));
  const gj = []; Q('wz_goujiao').replace(/(.)见(.)。/g, (m, a, b) => { gj.push(a + b); });
  eq('勾绞煞：问真的十二对都是年支往下数三位', gj.filter(x => Z[(Z.indexOf(x[0]) + 3) % 12] !== x[1]).concat(gj.length === 12 ? [] : ['不是十二对']), []);
  const xt = {}; Q('wz_xuetang').replace(/(.)命见(.)/g, (m, a, b) => { xt[a] = b; });
  const xtang = JSON.parse(ev('JSON.stringify(SS_XUETANG)'));
  eq('学堂：问真的五行和页面的表相同；词馆是它往后第三位（临官在长生后面第三位）', [xt, Object.fromEntries(Object.keys(xtang).map(e => [e, Z[(Z.indexOf(xtang[e]) + 3) % 12]]))], [xtang, JSON.parse(ev('JSON.stringify(SS_CIGUAN)'))]);
  eq('披麻：问真的表是年支往回数三位', Q('wz_pima').replace('披麻：', '').split(' ').join(''), Z.split('').map(z => Z[(Z.indexOf(z) + 9) % 12]).join(''));
  // 要几柱配合的几条，用虚构的盘各试一例
  const has = (p, male, n) => JSON.parse(ev(`JSON.stringify(shenshaOf(${JSON.stringify(p)},DATA.nayin,${male}).map(r=>r.some(o=>o.n==='${n}')))`));
  eq('三奇贵人：年月日的天干依次是乙丙丁，落在这三柱上；颠倒了顺序不算', [has(['乙丑', '丙戌', '丁巳', '戊申'], true, '三奇贵人'), has(['丁丑', '丙午', '乙巳', '戊寅'], true, '三奇贵人')], [[true, true, true, false], [false, false, false, false]]);
  eq('拱禄：丁巳日丁未时，落在日柱和时柱上', has(['甲子', '丙寅', '丁巳', '丁未'], true, '拱禄'), [false, false, true, true]);
  eq('元辰：子年出生，男命见未、女命见巳', [has(['甲子', '丙寅', '丁未', '乙巳'], true, '元辰'), has(['甲子', '丙寅', '丁未', '乙巳'], false, '元辰')], [[false, false, true, false], [false, false, false, true]]);
  eq('童子煞：春天生的日支见寅；年柱纳音属金的时支见午', [has(['甲子', '丙寅', '戊寅', '戊午'], true, '童子煞'), ev("DATA.nayin['甲子']")], [[false, false, true, true], '海中金']);
  // 照典籍补的三个：六厄、病符、隔角。问真八字的《神煞大全》里没有
  const le = {}; Q('sm_liue2').replace(/(...)(.)局.死在(.)/g, (m, a, e, b) => { le[a] = b; });
  eq('六厄：《三命通会》四个局的死地和页面的表相同；也是驿马的前一位、劫煞的后两位，合「常居马前一辰，劫后二辰」；又是三合局五行的死位',
    [ev('SS_GRP').map(s => le[s]).join(''), ev('SS_YIMA').split('').map(z => Z[(Z.indexOf(z) + 1) % 12]).join(''), ev('SS_JIESHA').split('').map(z => Z[(Z.indexOf(z) + 10) % 12]).join(''), ju('死'), Q('sm_liue').includes('常居马前一辰，劫后二辰')],
    [ev('SS_LIUE'), ev('SS_LIUE'), ev('SS_LIUE'), ev('SS_LIUE'), true]);
  eq('病符：《三命通会》《协纪辨方书》都是岁后一辰，就是年支往回数一位', [Q('sm_bingfu').includes('取太岁后一辰'), Q('xj_bingfu').includes('常居岁后一辰'), has(['甲子', '乙亥', '丙寅', '戊子'], true, '病符')], [true, true, [false, true, false, false]]);
  const dayHour = k => [...Q(k).matchAll(new RegExp(`([${Z}])日([${Z}])时`, 'g'))].map(m => m[1] + m[2]), gjo = dayHour('sf_gejiao'), gjo2 = dayHour('sm_gejiao');      // 「以日时上起」不算
  eq('隔角：《神峰通考》的四对和《三命通会》的四对相同，中间隔着的都是寅、申、巳、亥（「寅申巳亥为角」）；「互换看之」，页面的表就是这四对加上反过来的',
    [[...gjo].sort(), gjo.map(x => Z[(Z.indexOf(x[0]) + 1) % 12]).join(''), Q('sm_gejiao').includes('互换看之') && Q('sm_gejiao2').startsWith('寅申巳亥为角'), [...JSON.parse(ev('JSON.stringify(SS_GEJIAO)'))].sort()],
    [[...gjo2].sort(), '寅巳申亥', true, gjo.concat(gjo.map(x => x[1] + x[0])).sort()]);
  eq('隔角：丑日卯时、卯日丑时都落在日柱和时柱上；惆怅煞的寅日丑时不算', [has(['甲子', '丙寅', '乙丑', '己卯'], true, '隔角'), has(['甲子', '丙寅', '丁卯', '辛丑'], true, '隔角'), has(['甲子', '丙寅', '丙寅', '己丑'], true, '隔角')],
    [[false, false, true, true], [false, false, true, true], [false, false, false, false]]);
  eq('六厄：子年见卯落在月柱上；日支午属寅午戌火局，见酉才算', has(['甲子', '丁卯', '甲午', '甲子'], true, '六厄'), [false, true, false, false]);
  // ---- 格局组合 ----
  // 拿「论正官」举的三个命例跑一遍（四柱从引文里解出来），结果要和书里的说法对得上
  const exPs = k => Q(k).match(new RegExp(`[${G}][${Z}]`, 'g')).slice(0, 4);
  const gjOf = ps => JSON.parse(ev(`JSON.stringify((()=>{const ps=${JSON.stringify(ps)}.map((s,i)=>({k:'年月日时'[i],g:s[0],z:s[1],day:i===2}));const r=gjzOf(ps[2].g,ps);return Object.fromEntries(r.list.map(o=>[o.n,{st:o.st,ext:o.ext.map(e=>e[1]),gn:o.gn}]));})())`));
  const jin = gjOf(exPs('zp_ex_jin')), xuan = gjOf(exPs('zp_ex_xuan')), li = gjOf(exPs('zp_ex_li'));
  eq('格局组合：「论正官」的金状元命，书里说「此并用财印，无伤官而不杂煞」：财官印全记藏着（正官在亥的本气里），伤官见官、官杀混杂都没有', [exPs('zp_ex_jin').join(' '), jin.财官印全.st, jin.伤官见官.st, jin.官杀混杂.st], ['乙卯 丁亥 丁未 庚戌', '藏', '无', '无']);
  eq('格局组合：宣参国命，书里说「是遇伤而佩印也」：伤官见官、伤官配印都记藏着', [exPs('zp_ex_xuan').join(' '), xuan.伤官见官.st, xuan.伤官配印.st], ['己卯 辛未 壬寅 辛亥', '藏', '藏']);
  eq('格局组合：李参政命，书里说「庚金混杂，乙以合之，合煞留官」：官杀混杂记藏着，「有字合住七杀」这一条合', [exPs('zp_ex_li').join(' '), li.官杀混杂.st, li.官杀混杂.ext[0]], ['庚寅 乙酉 甲子 戊辰', '藏', true]);
  // 虚构的盘：庚金的阳刃在酉，七杀丙只在巳的本气里，照《穷通宝鉴》「丙杀藏支，名为羊刃驾杀」记藏着；阴干日主没有阳刃
  eq('格局组合：羊刃驾杀，七杀藏在地支里也算（记藏着）；阴干日主没有这一条', [gjOf(['甲子', '癸酉', '庚辰', '辛巳']).羊刃驾杀.st, gjOf(['甲子', '丁卯', '乙卯', '辛巳']).羊刃驾杀.st, Q('qt_jiasha').includes('阳刃驾杀')], ['藏', '无', true]);
  eq('格局组合：合财合官，辛日丙时是合官；丙在年干、隔着月干不算', [gjOf(['癸卯', '甲寅', '辛卯', '丙申']).合财合官, gjOf(['丙申', '庚寅', '辛卯', '庚寅']).合财合官.st], [{ st: '透', ext: [true], gn: '正官' }, '无']);
  // 2026-11-17 审阅报告：R1 日干合化以后，取用神时不算日主自己那一笔，要从它改记到的那一行减；R2 月干、时干两个丁一起合壬是争合；O1 印有根照「根和透」的认法
  // pick 是不管化气格、只照强弱取的用神（yongPick），R1 查的就是这一步用的五类分数
  const yo = ps => JSON.parse(ev(`JSON.stringify((()=>{const p=${JSON.stringify(ps)}.map((s,i)=>({k:'年月日时'[i],g:s[0],z:s[1],day:i===2}));const y=yongOf(p[2].g,p,true);return {cat:y.cat,yong:y.yong,pick:yongPick(qsOf(p[2].g,p,true).tier,y.cat,y.el).yong};})())`));
  // 这副四柱也合化气格条件（戊癸生在寅月化火），2026-11-17 起用神照任铁樵以化神为体：火有余，取泄火的土，也就是正官和七杀
  eq('用神：日干癸和月干戊化火，日主自己那 5 分改记到火，就从正财、偏财里减：五类是 0、19、16、15、5，照强弱取是食神、伤官最重，取印；合化气格条件，实际照化神取正官和七杀', yo(['庚午', '戊寅', '癸卯', '己未']), { cat: [0, 19, 16, 15, 5], yong: 3, pick: 4 });
  const zg = ps => ev(`(()=>{const p=${JSON.stringify(ps)}.map((s,i)=>({k:'年月日时'[i],g:s[0],z:s[1],day:i===2}));return gjzOf(p[2].g,p).list.find(o=>o.n==='合财合官').zheng;})()`);
  eq('合财合官的争合：月干、时干两个丁合壬算争合，「没有别的字来争合」不合；年干乙和日干乙一起合月干庚也算；只有一对不算', [zg(['己巳', '丁丑', '壬申', '丁未']), gjOf(['己巳', '丁丑', '壬申', '丁未']).合财合官.ext[0], zg(['乙丑', '庚辰', '乙卯', '丙子']), zg(['癸卯', '甲寅', '辛卯', '丙申'])], ['two', false, 'year', '']);
  eq('伤官配印的「印有根」照「根和透」的认法：己巳、丙子、庚午、丙子里午中有己，算有根；地支里没有一点土的不算', [gjOf(['己巳', '丙子', '庚午', '丙子']).伤官配印.ext[0], gjOf(['己卯', '丙子', '庚子', '丙子']).伤官配印.ext[0]], [true, false]);
  eq('格局组合引的原文里没有富贵、贫贱一类断语（页面拿这张盘去对条件，引了就等于把断语套到盘上）', ev("GJZ.flatMap(o=>o.q).filter(k=>/富贵|贵格|大贵|小贵|贫|贱|夭|寿|祸/.test(Q[k][1]))"), []);
  eq('格局组合：十五个组合，成格九个、败格六个；印禄相随、食伤混杂没有找到原文，不列', [ev('GJZ.length'), ev("GJZ.filter(o=>o.c==='成').length"), ev("GJZ.some(o=>/印禄相随|食伤混杂/.test(o.n))")], [15, 9, false]);
  eq('大运、流年等外来的一柱：只看原局自己的那十七个不会出现，其余四十一个都出现过', ssCheck ? [ev('SS_NAMES').filter(n => !ssCheck.extra.counts[n]).length, ev('SS_NAMES').filter(n => ssCheck.extra.counts[n]).length] : [], [17, 41]);
  // 格局和调候：十个日干 × 十二个月支，每一种都能走出结果
  const badGe = ev(`(function(){const bad=[],keep=[P,DM,DMN,NATAL,MEMO];
    G.split('').forEach(g=>Z.split('').forEach(z=>{DM=g;DMN=gN(g);MEMO={};NATAL=[{k:'年',g:'甲',z:'子'},{k:'月',g:'丙',z:z},{k:'日',g:g,z:'子',day:true},{k:'时',g:'庚',z:'午'}];
      try{const a=gejuRow(),b=tiaohouRow(),c=qiangruoRow(),e=duizhaoRow();[a,b,c,e].forEach(r=>{if(!r.dd||!r.p||r.p.some(x=>!x||!x[1]||/undefined|NaN|null/.test(x[1]))||/undefined|NaN|null/.test(r.dd)) bad.push(g+z+r.k);});}catch(e){bad.push(g+z+String(e.message));}}));
    [P,DM,DMN,NATAL,MEMO]=keep;return bad;})()`);
  eq('强弱参考、格局参考、调候参考和三行对照：十个日干生在十二个月，120 种情形都能生成', badGe, []);
  // 三行对照：重合不重合是纯计算。先用三种情形核对 dzOf，再在 120 种情形里拿另算的交集对照页面上写的话
  eq('三行对照：两行有相同的天干、只有五行相同、完全不重合，三种情形都分得出来；每个字归帮扶还是克泄也对',
    [ev("JSON.stringify(dzOf('戊',['甲'],['甲','丙','癸']))"), ev("JSON.stringify(dzOf('甲',['己'],['戊','丙']))"), ev("JSON.stringify(dzOf('丁',['己'],['甲','庚']))")].map(s => JSON.parse(s)).map(r => [r.same.join(''), r.el.join(''), r.side.map(x => x.g + (x.fu ? '扶' : '泄')).join('')]),
    [['甲', '', '甲泄丙扶癸泄'], ['', '2', '己泄戊泄丙泄'], ['', '', '己泄甲扶庚泄']]);
  const badDz = ev(`(function(){const bad=[],keep=[P,DM,DMN,NATAL,MEMO];
    G.split('').forEach(g=>Z.split('').forEach(z=>{DM=g;DMN=gN(g);MEMO={};NATAL=[{k:'年',g:'甲',z:'子'},{k:'月',g:'丙',z:z},{k:'日',g:g,z:'子',day:true},{k:'时',g:'庚',z:'午'}];
      const ge=geju(), gj=ge.list?ge.list.map(x=>x.h):ge.out.map(p=>p.g), th=tiaohou().stems.map(x=>x.s), dd=duizhaoRow().dd;
      const same=gj.some(x=>th.includes(x)), el=gj.some(x=>!th.includes(x)&&th.some(y=>y!==x&&gEl(x)===gEl(y)&&!gj.includes(y)));
      const say=dd.includes('两行重合在')?'same':dd.includes('五行相同的有')?'el':dd.includes('两行不重合')?'none':'empty';
      const want=!gj.length?'empty':same?'same':el?'el':'none';
      if(say!==want) bad.push(g+z+':'+say+'/'+want);}));
    [P,DM,DMN,NATAL,MEMO]=keep;return bad;})()`);
  eq('三行对照：120 种情形里，页面上写的「重合」「五行相同」「不重合」，和另算的交集一致', badDz, []);
  // 强弱：《千里命稿》强弱篇自己举的八个例子，照这一页的数法归出来要和书上一致
  const QR = [['甲寅', '丁卯', '甲子', '甲子', '最强'], ['甲寅', '癸酉', '乙亥', '丙子', '中'], ['甲寅', '丙子', '壬寅', '丙午', '中'], ['辛亥', '丁酉', '甲寅', '丁卯', '次强'],
    ['戊申', '庚申', '甲午', '庚午', '最弱'], ['丙辰', '庚寅', '甲午', '庚午', '中'], ['甲寅', '丙子', '丁卯', '乙巳', '中'], ['辛巳', '辛丑', '壬寅', '癸卯', '次弱']];
  eq('强弱：《千里命稿》举的八个例子，照这一页的数法都归到书上说的那一档（书里的中强和中弱是同一种情形，这里记作「中」）', QR.map(x => ev(`qrOf('${x[2][0]}',${JSON.stringify(x.slice(0, 4))},false).tier`)), QR.map(x => x[4]));
  eq('强弱：月令的旺相休囚死，甲木和戊土各五种，和《千里命稿》天干篇列的相同', [['寅', false], ['子', false], ['午', false], ['辰', true], ['酉', false]].map(([z, tu]) => ev(`qrOf('甲',['甲子','甲${z}','甲子','甲子'],${tu}).st`)).concat([['辰', true], ['午', false], ['酉', false], ['子', false], ['寅', false]].map(([z, tu]) => ev(`qrOf('戊',['甲子','甲${z}','戊子','甲子'],${tu}).st`))), ['旺', '相', '休', '囚', '死', '旺', '相', '休', '囚', '死']);
  eq('强弱：辰月出生，在立夏前十八天以内算土当令，以外算木当令', [ev("qrOf('戊',['甲子','戊辰','戊子','甲子'],true).deLing"), ev("qrOf('戊',['甲子','戊辰','戊子','甲子'],false).deLing")], [true, false]);
  // 真实的盘上，土当令（qrOf 的第三个参数）照规矩另算：月支是辰、未、戌、丑，离下一个节（一定是立春、立夏、立秋、立冬）不超过 18 天。
  // 虚构的出生时间，两边都有：辰月离立夏 17 天和 19 天，寅月离惊蛰不到 18 天（寅月不算土当令）；再加页面自带的三位
  const tuCases = JSON.parse(ev(`JSON.stringify((()=>{const keep=[P,DM,DMN,NATAL,MEMO], out=[];
    const one=p=>{P=p;DM=P.pillars[2][0];DMN=gN(DM);NATAL='年月日时'.split('').map((k,j)=>({k,g:P.pillars[j][0],z:P.pillars[j][1],day:j===2}));MEMO={};
      const tu='辰未戌丑'.includes(NATAL[1].z)&&P.nextJie.min<=18*1440, r=qrNow(), w=qrOf(DM,P.pillars,tu);
      out.push([P.name, NATAL[1].z, Math.round(P.nextJie.min/1440), tu, r.tier===w.tier&&r.deLing===w.deLing]);};
    [['辰月 17 天','2001-04-18 12:00'],['辰月 19 天','2001-04-16 12:00'],['寅月','1990-02-20 10:00'],['丑月 10 天','1995-01-25 12:00']].forEach(([n,b])=>one(chartOf({id:'tu',name:n,gender:'男',birth:b,lon:120})));
    DATA.people.forEach(one);
    [P,DM,DMN,NATAL,MEMO]=keep;return out;})())`));
  eq('强弱参考里的土当令：只在辰、未、戌、丑月离下一个节不超过 18 天时算，页面用的和照规矩另算的一致；虚构的盘两边都碰到了',
    [tuCases.filter(c => !c[4]).map(c => c[0]), tuCases.slice(0, 4).map(c => c[3])], [[], [true, false, false, true]]);
  eq('格局的分类：甲生寅月建禄，甲生卯月阳刃，乙生寅月月劫，戊生午月阳刃，丙生亥月按本气归七杀格', ev(`(function(){const keep=[P,DM,DMN,NATAL,MEMO];
    const one=(g,z)=>{DM=g;DMN=gN(g);NATAL=[{k:'年',g:'癸',z:'丑'},{k:'月',g:'癸',z:z},{k:'日',g:g,z:'丑',day:true},{k:'时',g:'癸',z:'丑'}];const r=geju();return r.kind+(r.list?'·'+gejuNames(r).join():'');};
    const out=[one('甲','寅'),one('甲','卯'),one('乙','寅'),one('戊','午'),one('丙','亥')];[P,DM,DMN,NATAL,MEMO]=keep;return out;})()`), ['建禄', '阳刃', '月劫', '阳刃', '不透·七杀格']);
}

// ---------- 1a1. 成败救应、用神变化、相神 ----------
console.log('成败救应、用神变化、相神');
{
  const gjb = JSON.parse(ev("JSON.stringify(GJB.map(o=>({id:o.id,ge:o.ge,k:o.k,t:o.t,q:o.q,more:(o.more||[]).map(m=>m[1]),todo:!!o.todo,xg:!!o.xg})))"));
  const Qt = k => ev(`Q[${JSON.stringify(k)}]?Q[${JSON.stringify(k)}][1]:''`);
  eq('成败救应：一共六十条，编号不重复；八个格都有，正官 8、财 10、印 10、食神 8、七杀 4、伤官 11、阳刃 3、建禄月劫 6；分成、败、带忌、救应四类，各 20、14、10、16 条',
    [gjb.length, new Set(gjb.map(o => o.id)).size, ['正官格', '财格', '印格', '食神格', '七杀格', '伤官格', '阳刃格', '建禄月劫'].map(g => gjb.filter(o => o.ge === g).length), ['成', '败', '带忌', '救应'].map(k => gjb.filter(o => o.k === k).length)],
    [60, 60, [8, 10, 10, 8, 4, 11, 3, 6], [20, 14, 10, 16]]);
  eq('成败救应：每一条的话都是登记过的引文里的一截；成格、败格的话在讲这一格的那一句里，带忌、救应的话在那两整句里', gjb.filter(o => !Qt(o.q).includes(o.t) || (o.k === '带忌' && o.q !== 'zp_dj_all') || (o.k === '救应' && o.q !== 'zp_jy_all')).map(o => o.id), []);
  // 那一章的四段原文，照分号、逗号拆开，每一截都落在某一条里（「或」「如」这些连接的字不算）
  const cover = ['zp_c_guan', 'zp_c_cai', 'zp_c_yin', 'zp_c_shi', 'zp_c_sha', 'zp_c_shang', 'zp_c_ren', 'zp_c_jl', 'zp_b_guan', 'zp_b_cai', 'zp_b_yin', 'zp_b_shi', 'zp_b_sha', 'zp_b_shang', 'zp_b_ren', 'zp_b_jl', 'zp_dj_all', 'zp_jy_all'];
  const pieces = cover.flatMap(k => Qt(k).split(/[；，。、]/).map(x => x.replace(/^(如|或)/, '')).filter(x => x && !/格成也$|格败也$|之格成也$|之格败也$|是皆谓之带忌也|是谓之救应也|^建禄月劫$/.test(x)));
  eq('成败救应：这一章讲成、败、带忌、救应的十八句，拆开的每一截都有一条对着，没有漏的', pieces.filter(p => !gjb.some(o => o.t.includes(p))), []);
  eq('直白的解释：成败救应的六十条、十五个组合、八个格各有一句，没有漏的；解释里不出现富贵、贫贱一类断语', [gjb.filter(o => !ev(`GJB_HW['${o.id}']`)).map(o => o.id), ev('Object.keys(GJB_HW).length'), ev("GJZ.filter(o=>!o.hua).length"), ev("['正官格','财格','印格','食神格','七杀格','伤官格','阳刃格','建禄月劫'].filter(g=>!GE_HUMAN[g]).length"), ev("Object.values(GJB_HW).concat(Object.values(GE_HUMAN),GJZ.map(o=>o.hua)).filter(t=>/富|贵|贫|贱|夭|寿|灾|祸|病|死|婚|离|发财|升官/.test(t)).length")], [[], 60, 0, 0, 0]);
  eq('成败救应引的原文里没有富贵、贫贱一类断语', [...new Set(gjb.flatMap(o => [o.q].concat(o.more)))].filter(k => !Qt(k) || /富贵|贵格|大贵|小贵|贫|贱|夭|寿|祸/.test(Qt(k))), []);
  // 书里各格那几章举的命例。四柱从引文里解出来；照哪一格核对、归纳成什么、合了哪一条，和书里说的对得上
  const run = ps => JSON.parse(ev(`(function(){const keep=[P,DM,DMN,NATAL,MEMO];
    NATAL=${JSON.stringify(ps)}.map((x,i)=>({k:'年月日时'[i],g:x[0],z:x[1],day:i===2}));DM=NATAL[2].g;DMN=gN(DM);MEMO={};
    const b=bianNow(), g=gjbGes(), r=gjbNow(), kv=kvRows();
    const out={cur:gjzGe(),hit:b.hit,benTou:b.benTou,bge:b.ge,ges:g.ges,bian:g.bian,v:r.groups.map(x=>x.v),ok:r.rows.filter(o=>o.ok===true).map(o=>o.id),xiang:r.xiang.map(o=>o.k+(o.z?'支'+o.z:'干'+o.h)),
      dd:[kv.find(x=>x.k==='用神变化').dd,kv.find(x=>x.k==='相神').dd]};
    [P,DM,DMN,NATAL,MEMO]=keep;return JSON.stringify(out);})()`));
  const four = k => (Qt(k).match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g) || []).slice(0, 4);
  const BOOK = [['zp_ex_jin', '印格', '成', '印成财'], ['zp_ex_xuan', '正官格', '救应', '官救印'], ['zp_ex_li', '正官格', '救应', '官救合'], ['zp_ex_mao', '财格', '救应', '财救合'], ['zp_ex_liyu', '财格', '救应', '财救制'],
    ['zp_ex_ge', '财格', '成', '财成官'], ['zp_ex_wang', '建禄月劫', '救应', '禄救伤'], ['zp_ex_jin2', '建禄月劫', '成', '禄成官'], ['zp_ex_zhang', '建禄月劫', '成', '禄成财'], ['zp_ex_yuan', '建禄月劫', '救应', '禄救杀'],
    ['zp_ex_sha', '七杀格', '成', '杀成'], ['zp_ex_ren1', '阳刃格', '成', '刃成'], ['zp_ex_ren2', '阳刃格', '成', '刃成'], ['zp_ex_liang', '食神格', '成', '食成财'], ['zp_ex_hu', '食神格', '成', '食成杀'],
    ['zp_ex_shi', '伤官格', '成', '伤成财'], ['zp_ex_zhangcz', '印格', '成', '印成官'], ['zp_ex_wangsl', '印格', '成', '印成财']];
  const got = BOOK.map(([k]) => { const p = four(k), r = run(p); return [p.length, r.ges.join(), r.v.join(), r]; });
  eq('成败救应：书里举的十八个命例，照哪一格核对、归纳成成格还是有救应、合的是书里说的那一条，都对得上（合煞存财、制煞生财、遇伤佩印、杂煞取清、去伤存官……）',
    BOOK.filter(([k, ge, v, id], i) => !(got[i][0] === 4 && got[i][1] === ge && got[i][2] === v && got[i][3].ok.includes(id))).map((x, i) => x[0]), []);
  const yang = run(four('zp_ex_yang')), sg = run(four('zp_ex_sg'));
  eq('成败救应：有两个命例和书里说的不一样，记在这里。杨侍郎命书里说身强、财用食生，强弱计分归身弱，一条也不合；金水伤官用官的那一个，财和印紧贴着透出，归带忌', [yang.v, yang.ok, sg.v, sg.ok.includes('伤忌印')], [['都不合'], [], ['带忌'], true]);
  eq('金状元命：亥、卯、未三合木局，月令的正官化成印，成败救应照印格核对（书里说「化官为印而透财」）；宣参国命也是亥卯未，月令的本气己透在年干，照书仍照正官格',
    [got[0][3].cur, got[0][3].hit, got[0][3].bian, got[0][3].ges, got[1][3].hit, got[1][3].benTou, got[1][3].bian, got[1][3].ges], [['正官格'], true, true, ['印格'], true, true, false, ['正官格']]);
  // 用神变化：书里的几句话各配一副虚构的四柱
  const bian = (dm, ps) => JSON.parse(ev(`JSON.stringify((b=>({full:b.full,hit:b.hit,cat:b.cat,from:b.from,ge:b.ge,benTou:b.benTou,half:b.half}))(bianOf('${dm}',${JSON.stringify(ps)}.map((x,i)=>({k:'年月日时'[i],g:x[0],z:x[1]})))))`));
  eq('用神变化：丁生亥月支全卯未，正官化成印；丙生寅月会午会戌、甲不透，印化成比肩和劫财；同一副换成透甲，本气透出；癸生寅月会午戌，食神和伤官化成财；丙生申月会子辰、透壬，财化成七杀',
    [bian('丁', ['乙卯', '丁亥', '丁未', '庚戌']), bian('丙', ['戊午', '庚寅', '丙戌', '己丑']), bian('丙', ['甲午', '丙寅', '丙戌', '己丑']), bian('癸', ['戊午', '甲寅', '癸酉', '壬戌']), bian('丙', ['壬子', '戊申', '丙辰', '己丑'])].map(b => [b.hit, b.from, b.cat, b.ge, b.benTou]),
    [[true, 3, 4, '印格', false], [true, 4, 0, '建禄月劫', false], [true, 4, 0, '建禄月劫', true], [true, 1, 2, '财格', true], [true, 2, 3, '七杀格', false]]);
  eq('用神变化：只有两支的半合不算；三合的五行和月令本气是同一类的不变', [bian('丁', ['乙卯', '丁亥', '丁酉', '庚戌']), bian('丙', ['戊寅', '戊午', '丙戌', '己丑'])].map(b => [b.full, b.hit, b.half.join('')]), [[false, false, '卯'], [true, false, '寅戌']]);
  // 被合住：年干和月干紧贴的算；月干和时干隔着日干也算，除非日干克其中一个；年干和时干太远不算；日干自己不算
  const heBy = (ps, i) => ev(`ganHeBy(${JSON.stringify(ps)}.map(x=>({g:x[0],z:x[1]})),${i})`);
  eq('被合住：王总兵命月干乙被时干庚合住（隔着日干壬）；日干丙克庚时，月干庚和时干乙合不成；年干和时干不算；年干和月干紧贴的算；日干自己不算',
    [heBy(four('zp_ex_wang'), 1), heBy(['己酉', '庚午', '丙戌', '乙未'], 1), heBy(['庚子', '戊子', '甲子', '乙丑'], 0), heBy(['庚寅', '乙酉', '甲子', '戊辰'], 0), heBy(['戊辰', '己未', '甲子', '戊辰'], 2)], [3, -1, -1, 1, -1]);
  // 归纳的那个词
  const vOf = c => ev(`(c=>c.救应?'救应':c.败+c.带忌?(c.成||!c.败?'带忌':'败'):c.成?'成':'都不合')(${JSON.stringify(c)})`);
  const rnd4 = (() => { let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n); }; const G = '甲乙丙丁戊己庚辛壬癸', Z = '子丑寅卯辰巳午未申酉戌亥';
    return () => { const y = rnd(60), m = rnd(12), dd = rnd(60), h = rnd(12), yg = y % 10, dg = dd % 10; return [G[yg] + Z[y % 12], G[(yg % 5 * 2 + 2 + m) % 10] + Z[(m + 2) % 12], G[dg] + Z[dd % 12], G[(dg % 5 * 2 + h) % 10] + Z[h]]; }; })();
  const seenV = new Set(), seenGe = new Set(), badV = [];
  for (let t = 0; t < 600; t++) {
    const ps = rnd4(), r = JSON.parse(ev(`(function(){const keep=[P,DM,DMN,NATAL,MEMO];
      NATAL=${JSON.stringify(ps)}.map((x,i)=>({k:'年月日时'[i],g:x[0],z:x[1],day:i===2}));DM=NATAL[2].g;DMN=gN(DM);MEMO={};
      const g=gjbGes(), r=gjbNow();const out={ges:g.ges,groups:r.groups.map(x=>({ge:x.ge,cnt:x.cnt,v:x.v,n:x.rows.length,bad:x.rows.filter(o=>o.need.some(n=>typeof n[0]!=='string'||![true,false,null].includes(n[1]))).length})),
        xi:r.rows.filter(o=>o.ok!==true&&o.xiang.length).length,tx:[gjbSay(),bianRow().dd,xiangRow().dd].join('|')};
      [P,DM,DMN,NATAL,MEMO]=keep;return JSON.stringify(out);})()`));
    r.groups.forEach(g => { seenV.add(g.v); seenGe.add(g.ge); if (g.v !== vOf(g.cnt) || g.bad || g.n !== gjb.filter(o => o.ge === g.ge).length) badV.push([ps.join(' '), g]); });
    if (r.xi || BAD.test(r.tx) || !r.ges.length) badV.push([ps.join(' '), r.tx]);
  }
  eq('成败救应：600 副随机的四柱，每一格列的条数、每一项条件的样子、归纳的词都对；五种归纳、八个格都碰到了；没有合的条不列相神；三处文字里没有空的',
    [badV.slice(0, 2), [...seenV].sort(), seenGe.size], [[], ['成', '带忌', '救应', '败', '都不合'].sort(), 8]);
}

// ---------- 1a3. 调候的情形 ----------
console.log('调候的情形');
{
  const G = '甲乙丙丁戊己庚辛壬癸', Z = '子丑寅卯辰巳午未申酉戌亥', E = '木火土金水';
  const th2 = JSON.parse(ev('JSON.stringify(TH2)'));
  const one = `(?:(?:tou|zang|has|no|notou|root):[${G}]|(?:pai|ju|el|noel):[${E}]|(?:zhi|nozhi):[${Z}])`, ATOM = new RegExp(`^(?:${one}|or:${one}(?:\\|${one})+)$`);
  const all = Object.entries(th2).flatMap(([g, o]) => Object.entries(o).map(([z, e]) => [g + z, e]));
  eq('调候的情形：十个日干、十二个月支都有一项；每一种情形是条件的原文加几个原子，原子的写法都认得',
    [Object.keys(th2).sort().join(''), all.length, all.filter(([k, e]) => !Array.isArray(e.need) || !Array.isArray(e.cases) || !Number.isInteger(e.skip || 0) || e.cases.some(c => !(typeof c[0] === 'string' && c[0] && Array.isArray(c[1]) && c[1].length && c[1].every(a => ATOM.test(a))))).map(x => x[0])],
    [[...G].sort().join(''), 120, []]);
  // 「孤阴」是书里给「无丙」起的名目，「死金」是五行的状态，不是对人的断语
  const BADW = /富|贵|贫|贱|夭|寿|上命|下命|下格|荣华|科甲|功名|秀才|进士|举人|异路|妻|孤(?!阴)|寡|僧|残疾|死(?![金木水火土])|劳苦|愚|懦|奸|福|凶|吉|灾|祸|常人|庸|衣食|一榜|黄堂/;
  eq('调候的情形和接着讲用字的话里没有富贵、贫贱一类断语（页面拿这张盘去对条件，引了就等于把断语套到盘上）', all.flatMap(([k, e]) => e.need.concat(e.cases.map(c => c[0])).filter(t => BADW.test(t)).map(t => k + t)), []);
  eq('调候的情形：条件的原文不超过 32 个字，讲用字的话不超过 45 个字，每个月的情形没有重复的', all.flatMap(([k, e]) => e.cases.filter(c => c[0].length > 32).map(c => k + c[0]).concat(e.need.filter(t => t.length > 45).map(t => k + t), new Set(e.cases.map(c => c[0] + c[1].join())).size === e.cases.length ? [] : [k + '重复'])), []);
  // 原子怎么算，照说明另写一遍，和页面的 thOf 在随机的四柱上逐条对照
  const HIDT = { 子: '癸', 丑: '己癸辛', 寅: '甲丙戊', 卯: '乙', 辰: '戊乙癸', 巳: '丙庚戊', 午: '丁己', 未: '己丁乙', 申: '庚壬戊', 酉: '辛', 戌: '戊辛丁', 亥: '壬甲' };
  const JU = { 水: ['申子辰', '亥子丑'], 木: ['亥卯未', '寅卯辰'], 火: ['寅午戌', '巳午未'], 金: ['巳酉丑', '申酉戌'], 土: [] }, elOf = g => Math.floor(G.indexOf(g) / 2);
  function atom2(a, ps) {
    if (a.startsWith('or:')) return a.slice(3).split('|').some(b => atom2(b, ps));
    const [k, v] = a.split(':'), gan = [ps[0][0], ps[1][0], ps[3][0]], zs = ps.map(p => p[1]), all = [...zs.map(z => HIDT[z]).join('')], hid = [...[0, 2, 3].map(i => HIDT[zs[i]]).join('')], e = E.indexOf(v);      // hid 不含月支：月支是这个月本来就有的
    switch (k) {
      case 'tou': return gan.includes(v); case 'zang': return !gan.includes(v) && hid.includes(v); case 'has': return gan.includes(v) || hid.includes(v);
      case 'no': return !gan.includes(v) && !hid.includes(v); case 'notou': return !gan.includes(v); case 'root': return gan.includes(v) && all.some(h => elOf(h) === elOf(v));
      case 'pai': return gan.concat(zs.map(z => HIDT[z][0])).filter(g => elOf(g) === e).length >= 3; case 'ju': return JU[v].some(t => [...t].every(z => zs.includes(z)));
      case 'zhi': return zs.includes(v); case 'nozhi': return !zs.includes(v); case 'el': return gan.concat(hid).some(g => elOf(g) === e); case 'noel': return !gan.concat(hid).some(g => elOf(g) === e);
    }
    return null;
  }
  let seed = 31; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n); };
  const badTh = [], kinds = {}; let nHit = 0, nCase = 0;
  for (let t = 0; t < 1500; t++) {
    const y = rnd(60), m = rnd(12), dd = rnd(60), h = rnd(12), yg = y % 10, dg = dd % 10;
    const ps = [G[yg] + Z[y % 12], G[(yg % 5 * 2 + 2 + m) % 10] + Z[(m + 2) % 12], G[dg] + Z[dd % 12], G[(dg % 5 * 2 + h) % 10] + Z[h]];
    const got = JSON.parse(ev(`JSON.stringify(thOf('${ps[2][0]}',${JSON.stringify(ps)}.map((x,i)=>({k:'年月日时'[i],g:x[0],z:x[1]}))).cases.map(c=>[c.ok,c.atoms.map(a=>a.ok),c.atoms.every(a=>typeof a.l==='string'&&a.l.length>0)]))`));
    const cs = ((th2[ps[2][0]] || {})[ps[1][1]] || { cases: [] }).cases;
    if (got.length !== cs.length) { badTh.push([ps.join(' '), '条数']); continue; }
    cs.forEach(([q, atoms], i) => { const w = atoms.map(a => atom2(a, ps)); nCase++; if (w.every(Boolean)) nHit++;
      atoms.forEach((a, j) => { const k = a.split(':')[0]; kinds[k] = kinds[k] || [0, 0]; kinds[k][w[j] ? 0 : 1]++; });
      if (got[i][0] !== w.every(Boolean) || got[i][1].join() !== w.join() || !got[i][2]) badTh.push([ps.join(' '), q]); });
  }
  eq('调候的情形：1500 副随机的四柱，每一种情形合不合、每一个原子合不合，和照说明另算的相同', badTh.slice(0, 3), []);
  ok('调候的情形：随机的四柱里，十二种原子合和不合的都碰到了；合的情形占一小部分', ['tou', 'zang', 'has', 'no', 'notou', 'root', 'pai', 'ju', 'zhi', 'nozhi', 'el', 'noel', 'or'].every(k => !Object.values(th2).some(o => Object.values(o).some(e => e.cases.some(c => c[1].some(a => a.startsWith(k + ':'))))) || (kinds[k] && kinds[k][0] > 0 && kinds[k][1] > 0)) && nHit > 0 && nHit < nCase / 2, [kinds, nHit, nCase]);
  // 书里的头一个例子：正月甲木「癸藏丙透」「如无丙癸」
  const jia = ps => JSON.parse(ev(`JSON.stringify(thOf('甲',${JSON.stringify(ps)}.map((x,i)=>({k:'年月日时'[i],g:x[0],z:x[1]}))).cases.filter(c=>c.ok).map(c=>c.q))`));
  eq('调候的情形：正月甲木，丙透在天干、癸只藏在地支的盘合「癸藏丙透」；丙、癸都没有的盘合「如无丙癸」', [jia(['丙子', '庚寅', '甲午', '乙丑']).includes('癸藏丙透'), jia(['戊午', '甲寅', '甲午', '己巳']).includes('癸藏丙透'), jia(['戊戌', '甲寅', '甲戌', '甲戌']).includes('如无丙癸')], [true, false, true]);
  // 页面上的那一块
  const tn = JSON.parse(ev('JSON.stringify((t=>({n:t.cases.length,hit:t.hit,need:t.need.length}))(thNow()))'));
  eq('喜忌一页「调候的情形」：这个月收的每一种情形各一枚小标签，合的在前面；上面一句话写着收了几种、合几种',
    [$('thc').querySelectorAll('.tg').length, $('thc').querySelectorAll('.tg.yes').length, tn.n ? txt($('thc-say')).includes(`收了 ${tn.n} 种，这张盘合 ${tn.hit} 种`) : txt($('thc-say')).includes('没有页面能照着数的')], [tn.n, tn.hit, true]);
}

// ---------- 1a2. 打分法 ----------
console.log('打分法');
{
  const G = '甲乙丙丁戊己庚辛壬癸', Z = '子丑寅卯辰巳午未申酉戌亥';
  // 讲义把六十甲子分成五种各十二柱，这里照讲义列的抄一遍，核对页面按五行算出来的分法
  const KIND = {
    天干克地支: '甲辰 甲戌 乙丑 乙未 丙申 丁酉 戊子 己亥 庚寅 辛卯 壬午 癸巳',
    地支克天干: '甲申 乙酉 丙子 丁亥 戊寅 己卯 庚午 辛巳 壬辰 癸丑 癸未 壬戌',
    天干生地支: '甲午 乙巳 丙戌 丙辰 丁未 丁丑 戊申 己酉 庚子 辛亥 壬寅 癸卯',
    地支生天干: '甲子 乙亥 丙寅 丁卯 戊午 己巳 庚辰 庚戌 辛丑 辛未 壬申 癸酉',
    干支同气: '甲寅 乙卯 丙午 丁巳 戊辰 戊戌 己未 己丑 庚申 辛酉 壬子 癸亥' };
  const kindOf = gz => Object.keys(KIND).find(k => KIND[k].split(' ').includes(gz));
  const JZ = Array.from({ length: 60 }, (_, i) => G[i % 10] + Z[i % 12]);
  eq('打分法：六十甲子照天干和地支的关系分成五种，每种十二柱，和讲义列的相同', [JZ.every(gz => ev(`DF_TYPE[(zEl('${gz[1]}')-gEl('${gz[0]}')+5)%5]`) === kindOf(gz)), Object.values(KIND).map(v => v.split(' ').length)], [true, [12, 12, 12, 12, 12]]);
  // 地支的藏干分值：藏的字和页面别处相同，本气相同，每一支合计 100 分；藏一个字 100，两个 70、30，三个 60、30、10
  eq('打分法：地支藏的字和页面别处的藏干相同，本气在最前面，分值是 100，或者 70、30，或者 60、30、10',
    [...Z].filter(z => { const h = JSON.parse(ev(`JSON.stringify(DF_Z['${z}'])`)), hid = ev(`HID['${z}']`); const want = { 1: '100', 2: '70,30', 3: '60,30,10' }[h.length]; return !(h.map(x => x[0]).sort().join('') === [...hid].sort().join('') && h[0][0] === hid[0] && h.map(x => x[1]).join() === want); }), []);
  // 讲义单独说的十三柱，增减的方向要和这一柱的关系对得上
  const fixes = JSON.parse(ev('JSON.stringify(DF_FIX)'));
  const sign = { 天干克地支: [0, -1], 地支克天干: [-1, -1], 天干生地支: [0, 1], 地支生天干: [1, -1] };      // 天干那一项的 0 表示可以不减（甲辰、丁未）
  eq('打分法：单独定数的十三柱都是六十甲子里的，增减的方向和这一柱的关系对得上', [Object.keys(fixes).length, Object.keys(fixes).filter(gz => { const k = kindOf(gz), [a, b] = fixes[gz], w = sign[k]; return !(JZ.includes(gz) && w && (w[0] === 0 ? a <= 0 : Math.sign(a) === w[0]) && Math.sign(b) === w[1]); })], [13, []]);

  // 照讲义的规则另写的一遍，和页面的 dfOf 在随机的四柱上逐行对照
  const HIDN = { 子: '癸100', 丑: '己60 癸30 辛10', 寅: '甲60 丙30 戊10', 卯: '乙100', 辰: '戊60 乙30 癸10', 巳: '丙60 戊30 庚10', 午: '丁70 己30', 未: '己60 丁30 乙10', 申: '庚60 壬30 戊10', 酉: '辛100', 戌: '戊60 辛30 丁10', 亥: '壬70 甲30' };
  const PCT = { 天干克地支: [-30, -45], 地支克天干: [-50, -25], 天干生地支: [-30, 30], 地支生天干: [30, -30] };
  const ONE = { 甲辰: [0, -70], 甲戌: [-30, -50], 乙丑: [-30, -50], 乙未: [-30, -50], 壬辰: [-40, -30], 癸丑: [-40, -30], 丙戌: [-25, 30], 丁未: [0, 30], 甲子: [20, -20], 丁卯: [20, -20], 庚辰: [20, -20], 辛未: [20, -20], 癸酉: [20, -20] };
  const el5 = g => Math.floor(G.indexOf(g) / 2), r1 = x => Math.round(x * 10) / 10;
  function df2(ps, dm) {
    const gan = [], roots = [];        // 第一步：本柱
    ps.forEach(gz => {
      const kind = kindOf(gz), hid = HIDN[gz[1]].split(' ').map(x => [x[0], +x.slice(1)]);
      if (kind === '干支同气') gan.push(36 + hid[0][1] / 2);
      else { const [a, b] = ONE[gz] || PCT[kind]; gan.push(36 * (100 + a) / 100); hid[0][1] = hid[0][1] * (100 + b) / 100; }
      roots.push(hid);
    });
    const pct = [0, 0, 0, 0];           // 第二步：紧贴的天干
    for (let i = 0; i < 3; i++) {
      const a = ps[i][0], b = ps[i + 1][0], same = G.indexOf(a) % 2 === G.indexOf(b) % 2;
      for (const [x, y, xi, yi] of [[a, b, i, i + 1], [b, a, i + 1, i]]) {
        if ((el5(x) + 1) % 5 === el5(y)) { pct[xi] -= same ? 20 : 30; pct[yi] += same ? 20 : 30; }      // x 生 y
        if ((el5(x) + 2) % 5 === el5(y)) { pct[xi] -= same ? 30 : 15; pct[yi] -= same ? 50 : 30; }      // x 克 y
      }
    }
    const g1 = gan.map((v, i) => Math.max(0, v * (100 + pct[i]) / 100));
    const far = [100, 100, 90, 80], away = [100, 90, 75, 60];
    return [0, 1, 2, 3, 4].map(e => {     // 第三步：每一行的总分
      const stems = [0, 1, 2, 3].filter(i => el5(ps[i][0]) === e), rt = roots.map(h => h.find(x => el5(x[0]) === e));
      const base = HIDN, raw = ps.map(gz => (base[gz[1]].split(' ').find(x => el5(x[0]) === e) || '').slice(1) | 0);
      let core = -1;
      if (e === el5(dm)) core = 2;
      else if (stems.length) stems.forEach(i => { if (core < 0 || r1(g1[i]) > r1(g1[core])) core = i; });      // 一样多的取靠前的一柱
      else [0, 1, 2, 3].forEach(i => { if (rt[i] && (core < 0 || raw[i] > raw[core] || (raw[i] === raw[core] && r1(rt[i][1]) > r1(rt[core][1])))) core = i; });
      if (core < 0) return 0;
      let tg = 0, tz = 0;
      stems.forEach(i => { tg += g1[i] * far[Math.abs(i - core)] / 100; });
      let i = 0;
      while (i < 4) {
        if (!rt[i]) { i++; continue; }
        let j = i; while (j + 1 < 4 && rt[j + 1]) j++;
        let near = 9; for (let k = i; k <= j; k++) near = Math.min(near, Math.abs(k - core));
        for (let k = i; k <= j; k++) tz += rt[k][1] * away[near] / 100;
        i = j + 1;
      }
      return r1(tg + tz);
    });
  }
  const dfPage = ps => JSON.parse(ev(`(()=>{const ps=${JSON.stringify(ps)}.map((x,i)=>({k:'年月日时'[i],g:x[0],z:x[1]}));const r=dfOf(ps[2].g,ps,huaOf(ps).moves);
    return JSON.stringify({sum:r.sum,g1:r.g1,name:r.name,lv:r.lv,by:r.by,S:r.S,roots:r.roots,H:r.H,K:r.K,mk:r.mk,c:r.c,xi:r.xi,ji:r.ji,why:r.why,zn:r.el[gEl(ps[2].g)].zhi.length})})()`));
  // 讲义自己算的两个例子。讲义的数和页面的数并排：页面把「四、五成」取四成半、「二、三成」取两成半，讲义手算时各处取的不一样
  const W1 = dfPage(['己亥', '甲戌', '辛巳', '丙申']), W2 = dfPage(['戊辰', '辛酉', '壬午', '甲辰']);
  eq('打分法：讲义算的第一个例子（己亥、甲戌、辛巳、丙申），页面算出木 40.9、火 70.9、土 80.6、金 82.9、水 56.5，四个天干 17.6、13.9、9.9、21.4', [W1.sum, W1.g1], [[40.9, 70.9, 80.6, 82.9, 56.5], [17.6, 13.9, 9.9, 21.4]]);
  eq('打分法：讲义算的第二个例子（戊辰、辛酉、壬午、甲辰），页面算出木 91.2、火 38.5、土 142.2、金 186、水 44.2', W2.sum, [91.2, 38.5, 142.2, 186, 44.2]);
  const BOOK1 = [41, 66.8, 107.6, 85.9, 53], BOOK2 = [91.2, 42, 151.2, 186, 41.7];
  eq('打分法：两个例子十行里，九行和讲义手算的数相差不到 10 分；第一个例子的土差 27 分，讲义这里没有照它自己说的甲戌柱给戌土减分',
    [W1.sum.map((v, i) => Math.abs(v - BOOK1[i]) < 10), W2.sum.map((v, i) => Math.abs(v - BOOK2[i]) < 10), r1(BOOK1[2] - W1.sum[2])], [[true, true, false, true, true], [true, true, true, true, true], 27]);
  // 讲义两章里写明日主归哪一档的例子。四柱照讲义抄，只取四柱和归的档，不取别的。有一个例子的四柱在讲义里印错了（阳干配了阴支），没有收
  const LV = `庚子 己卯 乙未 壬午 偏旺|丁丑 甲辰 戊辰 壬戌 太旺|丁丑 癸卯 己未 辛未 偏旺|戊戌 戊午 戊辰 丙辰 旺极|癸卯 甲寅 甲辰 甲子 旺极|庚子 辛亥 壬子 戊申 太旺|己亥 壬申 己卯 丁卯 太弱|己亥 壬申 己卯 乙丑 偏弱|己未 丙寅 壬午 壬寅 太弱|己未 丙寅 壬午 乙巳 弱极|
庚辰 己卯 乙亥 丁丑 偏旺|甲申 壬申 庚申 辛巳 太旺|己丑 戊辰 己巳 戊辰 旺极|庚申 乙酉 辛丑 庚辰 旺极|己酉 乙亥 乙未 丁丑 中和|戊申 乙卯 辛未 壬辰 偏弱|丙申 甲寅 庚午 丁未 太弱|甲寅 丁卯 己亥 丙寅 太弱|壬寅 壬寅 庚子 丙子 弱极|癸酉 甲寅 乙巳 庚辰 偏旺|
癸酉 甲寅 甲申 甲辰 偏旺|癸酉 甲寅 乙亥 庚辰 偏旺|戊申 乙卯 己丑 癸酉 偏弱|甲寅 甲戌 甲申 庚午 偏旺|丁巳 戊午 己未 庚申 偏旺|乙亥 癸未 癸巳 壬戌 偏弱|丙子 己亥 己未 壬申 偏旺|丁丑 癸丑 戊戌 丙辰 旺极|丁丑 庚戌 丁亥 庚子 太弱|乙未 壬午 壬子 癸卯 偏旺|
己卯 庚午 己丑 癸酉 偏旺|癸丑 甲寅 甲午 乙亥 偏旺|壬寅 甲辰 乙亥 丙戌 偏旺|壬寅 壬戌 庚寅 壬午 太弱|己卯 壬申 壬寅 辛丑 偏旺|甲戌 戊辰 壬申 癸卯 偏弱|己未 戊辰 己酉 甲子 偏旺|戊申 乙丑 乙酉 己卯 偏弱|癸丑 丙辰 丁酉 丙午 偏旺|戊申 甲寅 丁巳 壬寅 偏旺|
癸丑 癸亥 庚申 戊寅 偏弱|癸未 甲寅 甲辰 庚午 偏旺|戊戌 乙卯 庚戌 丙子 偏弱|甲辰 甲戌 甲寅 乙丑 偏旺|庚辰 癸未 乙卯 乙酉 偏旺|壬午 甲辰 辛酉 甲午 偏旺|庚戌 壬午 丁亥 甲辰 偏弱|壬子 丙午 壬午 乙巳 偏弱|辛卯 庚寅 丁丑 庚子 偏弱|乙未 乙酉 乙未 庚辰 偏弱|
庚子 庚辰 乙丑 己卯 偏弱|癸丑 乙丑 癸亥 庚申 偏旺|戊午 丁巳 己卯 乙亥 中和|丁酉 乙巳 庚辰 戊寅 中和|癸丑 丁巳 癸亥 乙卯 中和|戊子 甲寅 乙亥 丙子 太旺|庚辰 庚辰 戊戌 庚戌 太旺|丙戌 戊戌 戊寅 癸丑 太旺|庚辰 己丑 辛酉 甲午 太旺|戊申 己未 辛丑 丁酉 太旺|
庚戌 己丑 戊戌 癸丑 太旺|庚戌 癸未 戊戌 丙辰 太旺|乙亥 己卯 乙卯 乙酉 太旺|戊申 庚申 辛未 丁酉 太旺|癸丑 己未 辛酉 戊子 太旺|癸未 甲寅 乙亥 己卯 旺极|癸亥 癸亥 壬子 庚子 旺极|庚辰 庚辰 庚申 庚辰 旺极|丁丑 癸卯 丁丑 辛亥 太弱|丁未 癸卯 丁丑 辛亥 偏弱|
辛巳 丁酉 甲申 戊辰 太弱|壬寅 癸亥 辛亥 庚寅 太弱|辛亥 庚子 丙戌 壬辰 太弱|癸丑 己未 癸丑 己未 太弱|戊戌 乙丑 丁亥 庚戌 太弱|丁巳 丙午 癸丑 甲寅 太弱|丙寅 甲午 辛巳 戊戌 太弱|癸卯 甲子 庚子 丁亥 弱极`.replace(/\n/g, '').split('|').map(x => x.split(' '));
  const lvGot = LV.map(x => dfPage(x.slice(0, 4)).name), lvMiss = LV.filter((x, i) => lvGot[i] !== x[4]).map((x, i) => x.slice(0, 4).join('') + x[4]);
  // 没对上的十八个：讲义凭合化、冲和通盘权衡定的，或者分数正好在线的两边。名单写死在这里，算法一动就看得见
  const MISS = ['庚子己卯乙未壬午偏旺', '甲申壬申庚申辛巳太旺', '庚申乙酉辛丑庚辰旺极', '己酉乙亥乙未丁丑中和', '丁丑癸丑戊戌丙辰旺极', '癸丑癸亥庚申戊寅偏弱', '壬子丙午壬午乙巳偏弱', '辛卯庚寅丁丑庚子偏弱', '乙未乙酉乙未庚辰偏弱',
    '庚子庚辰乙丑己卯偏弱', '戊午丁巳己卯乙亥中和', '丁酉乙巳庚辰戊寅中和', '癸丑丁巳癸亥乙卯中和', '庚辰庚辰戊戌庚戌太旺', '癸未甲寅乙亥己卯旺极', '丁未癸卯丁丑辛亥偏弱', '癸丑己未癸丑己未太弱', '丙寅甲午辛巳戊戌太弱'];
  eq('打分法：讲义里写明日主归哪一档的 78 个例子，页面的算法对上 60 个；没对上的 18 个和记下来的名单相同', [LV.length, LV.every(x => x.slice(0, 4).every(gz => JZ.includes(gz))), LV.length - lvMiss.length, lvMiss], [78, true, 60, MISS]);
  eq('打分法：讲义第三章讲七档时举的十个例子对上九个；中和以外的六档都有例子对上，中和的四个例子一个也没有对上（讲义的中和是通盘权衡出来的，分数线只有十分宽）',
    [LV.slice(0, 10).filter((x, i) => lvGot[i] === x[4]).length, [...new Set(LV.filter((x, i) => lvGot[i] === x[4]).map(x => x[4]))].sort(), LV.filter(x => x[4] === '中和').length], [9, ['偏弱', '偏旺', '太弱', '太旺', '弱极', '旺极'].sort(), 4]);
  // 随机的四柱：页面的分数和另写的一遍逐行相同；归档和照规矩另算的相同；取的和忌的不重叠
  let seed = 20261117; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n); };
  const badSum = [], badLv = [], badXi = [], seen = new Set(), seenWhy = new Set();
  for (let t = 0; t < 3000; t++) {
    const y = rnd(60), m = rnd(12), dd = rnd(60), h = rnd(12), yg = y % 10, dg = dd % 10;
    const ps = [G[yg] + Z[y % 12], G[(yg % 5 * 2 + 2 + m) % 10] + Z[(m + 2) % 12], G[dg] + Z[dd % 12], G[(dg % 5 * 2 + h) % 10] + Z[h]];
    const r = dfPage(ps), w = df2(ps, ps[2][0]);
    if (w.some((v, i) => Math.abs(v - r.sum[i]) > 0.11)) badSum.push([ps.join(' '), r.sum, w]);      // 两边各自四舍五入到一位小数，容许差 0.1
    const lv = r.K === 0 || r.S >= 435 ? 6 : r.S > 114 ? (r.S >= 272 || (r.K <= 2 && r.mk < 104) ? 5 : 4) : r.S >= 104 ? 3 : (r.H === 0 && r.zn === 0) ? 0 : (r.S < 45 || r.roots < 30) ? 1 : 2;
    if (lv !== r.lv || r.H + r.K !== 7 || r.S !== r.c[0] || r.mk !== Math.max(r.c[1], r.c[2], r.c[3])) badLv.push([ps.join(' '), r.name, lv]);
    if (r.lv === 3 ? r.xi !== null : !(r.xi.length && r.ji.length && r.xi.every(k => !r.ji.includes(k)) && r.xi.concat(r.ji).every(k => k >= 0 && k <= 4) && (r.lv < 3 ? true : r.lv === 6 || !r.xi.includes(4)))) badXi.push([ps.join(' '), r.name, r.xi, r.ji]);
    seen.add(r.name); seenWhy.add(r.why);
  }
  eq('打分法：3000 副随机的四柱，五行的分数和照讲义另写的一遍逐行相同', badSum.slice(0, 3), []);
  eq('打分法：3000 副随机的四柱，归的档和照分数线、字数另算的相同；七档都碰到了', [badLv.slice(0, 3), [...seen].sort()], [[], ['中和', '偏弱', '偏旺', '太弱', '太旺', '弱极', '旺极'].sort()]);
  eq('打分法：取的和忌的不重叠；中和不取；偏旺、太旺不取正印和偏印', badXi.slice(0, 3), []);
  // 各档怎么取，逐条核对。五类的先后：比肩和劫财、食神和伤官、正财和偏财、正官和七杀、正印和偏印
  const yong = (lv, c) => { const r = JSON.parse(ev(`JSON.stringify(dfYong(${lv},${JSON.stringify(c)}))`)); return [r.xi, r.ji]; };
  eq('打分法取喜用：偏旺而别的都不旺，取正官和七杀、正财和偏财；正官和七杀不到 45 分，改取食神和伤官、正财和偏财',
    [yong(4, [150, 60, 60, 60, 60]), yong(4, [150, 60, 60, 44, 60])], [[[3, 2], [4, 0]], [[1, 2], [4, 0]]]);
  eq('打分法取喜用：偏旺而另一类也过了 114 分：印旺取财、食伤；财旺取官杀；官杀旺取食伤；食伤旺取财、官杀',
    [yong(4, [150, 60, 60, 60, 120]), yong(4, [150, 60, 120, 60, 60]), yong(4, [150, 60, 60, 120, 60]), yong(4, [150, 120, 60, 60, 60])], [[[2, 1], [4, 0, 3]], [[3], [4, 0, 2, 1]], [[1], [4, 0, 2, 3]], [[2, 3], [4, 0, 1]]]);
  eq('打分法取喜用：偏弱而别的都不旺，取印、比劫；官杀旺取印、比劫；财旺取比劫、印；食伤旺只取印；印旺取比劫、财',
    [yong(2, [80, 60, 60, 60, 60]), yong(2, [80, 60, 60, 120, 60]), yong(2, [80, 60, 120, 60, 60]), yong(2, [80, 120, 60, 60, 60]), yong(2, [80, 60, 60, 60, 120])],
    [[[4, 0], [2, 3]], [[4, 0], [2, 3]], [[0, 4], [2, 3, 1]], [[4], [1, 2, 3]], [[0, 2], [4, 1, 3]]]);
  eq('打分法取喜用：太旺取食伤，印比日主那一行还多时取比劫；旺极取印、比劫、食伤；中和不取',
    [yong(5, [300, 50, 50, 50, 90]), yong(5, [200, 50, 50, 50, 210]), yong(6, [450, 20, 0, 0, 60]), yong(3, [109, 100, 100, 100, 100])], [[[1], [4, 0, 2, 3]], [[0], [3, 4]], [[4, 0, 1], [3, 2]], [null, null]]);
  eq('打分法取喜用：太弱看另外四类里最旺的：食伤旺取财，财旺取官杀，官杀旺取官杀、财，印旺取比劫；弱极顺着克、泄、耗里最旺的一类',
    [yong(1, [30, 200, 90, 90, 50]), yong(1, [30, 90, 200, 90, 50]), yong(1, [30, 90, 90, 200, 50]), yong(1, [30, 90, 90, 90, 200]), yong(0, [20, 90, 90, 200, 0]), yong(0, [20, 90, 200, 90, 0]), yong(0, [20, 200, 90, 90, 0])],
    [[[2], [3, 4]], [[3], [0, 4]], [[3, 2], [4, 0, 1]], [[0], [1, 2, 3]], [[2, 3], [4, 0, 1]], [[1, 2], [4, 0]], [[1, 2], [3, 4]]]);
  ok('打分法：取喜用的每一条都有说明的话，随机的四柱里用到的条目都在里面', [...seenWhy].every(k => ev(`typeof DF_WHY['${k}']`) === 'string') && ev('Object.keys(DF_WHY).length') === 22, [...seenWhy]);
}

// ---------- 1b. 页面内排盘，对照 lunar_python ----------
console.log('页面内排盘');
{
  const oracle = readJSON(path.join(BASE, 'data', 'people.json'), null);
  if (!oracle) ok('有 data/people.json 可以对照', false);
  else {
    const FIELDS = ['gender', 'clock', 'lon', 'dlonSec', 'eotSec', 'tst', 'lunar', 'xingzuo', 'pillars', 'pillarsClock', 'prevJie', 'nextJie', 'taiyuan', 'minggong', 'shengong', 'taixi', 'yun', 'dayun'];
    const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x);
    const diff = [];
    const inRange = oracle.people.filter(p => p.clock[0] >= ev('BIRTH_MIN') && p.clock[0] <= ev('BIRTH_MAX'));   // 页面内排盘只支持这个范围
    inRange.forEach(p => {
      const got = JSON.parse(ev(`JSON.stringify(chartOf(infoFrom(${JSON.stringify(p)})))`));
      FIELDS.concat('shichen').forEach(f => { if (canon(got[f]) !== canon(p[f])) diff.push([p.id, f, got[f], p[f]]); });
    });
    if (!inRange.length) console.log('  跳过  页面自带的人都出生在 1900 年以前，页面内排盘不支持，这一项由 tools/fuzz.py 覆盖');
    else eq(`${inRange.length} 个人由出生信息在页面里重新排盘，${FIELDS.length} 项结果和 lunar_python 逐项相同` + (inRange.length < oracle.people.length ? `（另有 ${oracle.people.length - inRange.length} 个出生在 1900 年以前，不在页面内排盘的范围里）` : ''), diff.slice(0, 5), []);
    const years = Object.keys(oracle.jie), wrong = years.filter(y => JSON.stringify(ev(`jieMD(${y})`)) !== JSON.stringify(oracle.jie[y]));
    eq(`${years[0]} 到 ${years[years.length - 1]} 年每年十二个节的日期，页面推出来的和 lunar_python 相同`, wrong.slice(0, 5), []);
  }
  eq('不存在的日期、范围之外的年份、不认识的时辰会被拒绝', ev(`[checkInfo({birth:'2001-02-30 10:00',gender:'男',lon:120}),checkInfo({birth:'1899-12-31 10:00',gender:'男',lon:120}),checkInfo({birth:'2000-01-01 10:00',gender:'男',lon:'x'}),checkInfo({birth:'2000-01-01',shichen:'甲',gender:'男'}),checkInfo({birth:'2000-01-01 10:00',gender:'男',lon:120}),checkInfo({birth:'2000-01-01',shichen:'午',gender:'女'})].map(s=>s?'拒绝':'接受')`), ['拒绝', '拒绝', '拒绝', '拒绝', '接受', '接受']);
}

// ---------- 2. 每个人的细盘 ----------
people.forEach((id, pi) => {
  pick(pi);
  const E = expected[id];
  console.log(`细盘 · ${ev('P.name')}`);
  if (!E) { ok('data/expected.json 里有这个人的预期', false); return; }
  const rows = tableRows(), natal = label => rows[label].slice(DYN).map(txt);
  const bzRows = Object.fromEntries([...$('bz').rows].map(tr => [txt(tr.cells[0].querySelector('[data-x]')), [...tr.cells].slice(1).map(txt)]));
  eq('八字一页的表就是四柱细盘的后四列：行名相同，每一行的四格逐字相同', [Object.keys(bzRows), Object.keys(bzRows).every(k => JSON.stringify(bzRows[k]) === JSON.stringify(natal(k)))], [Object.keys(rows), true]);
  eq('标题是四柱', txt($('title')), E.pillars.join(''));
  eq('十神（天干的）', natal('十神'), E.zhuxing);
  eq('天干', natal('天干'), E.pillars.map(p => p[0]));
  eq('地支', natal('地支'), E.pillars.map(p => p[1]));
  eq('藏干和十神', natal('藏干'), E.canggan.map(c => c.map(x => x[0] + x[1]).join('')));
  eq('星运', natal('星运'), E.xingyun);
  eq('自坐', natal('自坐'), E.zizuo);
  eq('空亡', natal('空亡'), E.xunkong);
  eq('纳音', natal('纳音'), E.nayin);
  eq('大运八步', [...$('dayun').children].map(b => txt(b.querySelector('.gz'))), E.dayun);
  const wxCol = m => { click($('wx-seg').querySelector(`[data-map="wx:${m}"]`)); return [...$('wxt').querySelectorAll('tr')].map(tr => txt(tr.querySelector('.wn b'))); };
  eq('五行个数（只数盘面八个字）和含藏干数：五行一页的表点按钮换数法', [wxCol('face'), wxCol('cnt')], [E.wuxing.face.map(n => `${n} 个`), E.wuxing.all.map(n => `${n} 个`)]);
  wxCol('nl');
  eq('神煞', rows['神煞'].slice(DYN).map(td => [...td.querySelectorAll('[data-x]')].map(txt).sort()), E.shensha.map(a => [...a].sort()));
  eq('解读方框有 15 个：每一页一个，干支关系、计分、六亲三页各两个', [d.querySelectorAll('.read').length, [...d.querySelectorAll('[role="tabpanel"]')].map(p => p.querySelectorAll('.read').length), $('p-lq').querySelectorAll('.read').length], [15, [1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2], 2]);
  eq('标题下面四柱都有标注，「日主」只标在日干上', [[...$('title').querySelectorAll('.pl')].map(x => x.dataset.k), [...$('title').querySelectorAll('.dm')].map(txt)], [['年柱', '月柱', '日柱', '时柱'], [E.pillars[2][0]]]);
  const metaKeys = q => [...d.querySelectorAll(q + ' dt')].map(txt);
  eq('顶部信息分两处放，一行不少：起运和交运在大运旁边，其余的在标题下面，公历排第一', [metaKeys('#meta')[0], metaKeys('#meta-yun'), metaKeys('#meta').concat(metaKeys('#meta-yun')).sort()], ['公历', ['起运', '交运'], JSON.parse(ev('JSON.stringify(metaRows().map(r=>r.k))')).sort()]);
  // 关系图和小签是同一批关系；每条线上圈出来的字就是这条关系的字
  const lks = [...d.querySelectorAll('#lkmap .lk-t')], pills = [...d.querySelectorAll('.relpills .rel')];
  eq('关系图上的名字和小签是同一批关系，一条不多一条不少', [[...new Set(lks.map(b => b.dataset.x))].sort(), lks.length >= pills.length], [[...new Set(pills.map(b => b.dataset.x))].sort(), true]);
  eq('关系图每条线上圈出来的字，就是这条关系里的字', lks.filter(b => { const nodes = [...b.closest('.lk').querySelectorAll('i')].map(txt), c = b.dataset.x.split('|')[2]; return [...new Set(nodes)].sort().join('') !== [...new Set(c)].sort().join('') || nodes.length < 2; }).map(b => b.dataset.x), []);
  // 每条关系点开的解释：落在哪几处一处不漏；和日主同一个字的天干，日干上的叫日主，别处的叫比肩
  {
    const dm = ev('DM'), stemOf = Object.fromEntries(JSON.parse(ev('JSON.stringify(cols().map(c=>[c.dyn?c.k:c.k+"干",c.g]))')));
    const LAYERS = ['原局', '大运', '流年', '流月', '流日'];
    const bad = pills.map(b => b.dataset.x).filter(key => {
      const a = key.split('|'), where = a[4].split('、'), top = +a[5];
      const p = JSON.parse(ev(`JSON.stringify(X(${JSON.stringify(key)}).p)`)), row = k => (p.find(r => r[0] === k) || [])[1] || '';
      const here = row('这一条');
      if (top === 0 ? where.some(w => !here.includes(w.replace(/–/g, '和') + '之间')) || (where.length > 1) !== /^原局里有.处：/.test(here) : where.some(w => !here.includes(w))) return true;
      if (a[6] !== 'g' || !a[2].includes(dm)) return false;
      const toks = a[4].split(/[、–]/), gods = row('涉及的十神');
      const elsewhere = toks.some(t => t !== '日干' && stemOf[t] === dm) || (top > 0 && stemOf[LAYERS[top]] === dm);
      return toks.includes('日干') !== gods.includes('日主') || elsewhere !== gods.includes('比肩');
    });
    eq('每条关系的解释：落在哪几处都说到了，日主和比肩没有说混', bad, []);
  }
  // 关系图中间的生克：前四列一串、原局四柱一串，加上每一柱的干和支。拿五行另算一遍对照
  const el8 = JSON.parse(ev('JSON.stringify(cols().map(c=>[gEl(c.g),zEl(c.z)]))'));
  const skName = (a, b) => { const k = (b - a + 5) % 5; return ['tong', 'sheng', 'ke', 'ke', 'sheng'][k] + (k >= 3 ? ' rev' : ''); };
  const skWant = [];        // 页面上的顺序：每一柱先是干支之间，然后（大运和时柱除外）是它和下一柱的天干、地支
  el8.forEach(([g, z], i) => { skWant.push(skName(g, z)); if (i !== DYN - 1 && i < 7) skWant.push(skName(g, el8[i + 1][0]), skName(z, el8[i + 1][1])); });
  eq('关系图中间的生克：二十处的生、克、同类和方向，和按五行另算的一致', [...d.querySelectorAll('#lkmap .sk-x, #lkmap .sk-y')].map(el => ['sheng', 'ke', 'tong'].find(c => el.classList.contains(c)) + (el.classList.contains('rev') ? ' rev' : '')), skWant);
  eq('图下面那句话数的是原局相邻的十处', ev('skPairs().length'), 10);
  // 2026-11-18 用户指着关系图说「这些还是不能点」：生克的小圈、线两头圈出来的字都能点。左右相邻的小圈是 sk|，上下的是这一柱合起来的解释 gz|
  {
    const c8 = JSON.parse(ev('JSON.stringify(cols().map(c=>[c.k,c.g,c.z,!!c.dyn]))')), EN = ['木', '火', '土', '金', '水'];
    const nm = (i, p) => c8[i][0] + (c8[i][3] ? (p ? '地支' : '天干') : (p ? '支' : '干')) + c8[i][1 + p];
    const want = [];      // 每个小圈该有的 data-x 和解释的标题，照页面上的先后
    c8.forEach((c, i) => {
      want.push([`gz|${c[0]}`, `${c[3] ? c[0] : c[0] + '柱'} · ${c[1]}${c[2]}`]);
      if (i !== DYN - 1 && i < 7) [0, 1].forEach(p => {
        const a = el8[i][p], b = el8[i + 1][p], k = (b - a + 5) % 5, A = nm(i, p), B = nm(i + 1, p);
        want.push([`sk|${c[0]}|${'gz'[p]}|${c8[i + 1][0]}|${'gz'[p]}`, k === 0 ? `${A}、${B} · 同属${EN[a]}` : k === 1 ? `${A}生${B}` : k === 2 ? `${A}克${B}` : k === 3 ? `${B}克${A}` : `${B}生${A}`]);
      });
    });
    const dots = [...d.querySelectorAll('#lkmap .sk-x b, #lkmap .sk-y b')];
    eq('关系图的生克小圈都能点：二十个，各带 data-x，标题照五行另算的方向写出是谁生谁、谁克谁', dots.map(b => [b.dataset.x, b.getAttribute('role'), b.getAttribute('tabindex'), ev(`X(${JSON.stringify(b.dataset.x)}).t`)]), want.map(([k, t]) => [k, 'button', '0', t]));
    const ends = [...d.querySelectorAll('#lkmap .lk > i')];
    eq('关系图线两头圈出来的字都能点，点开是那个天干或者地支的解释', ends.filter(i => { const a = (i.dataset.x || '').split('|'), c = c8.find(x => x[0] === a[1]); return !(c && (a[0] === 'g' ? c[1] : a[0] === 'z' ? c[2] : '') === txt(i) && a[2] === txt(i) && i.getAttribute('role') === 'button' && ev(`!!X(${JSON.stringify(i.dataset.x)})`)); }).map(txt), []);
  }
  // 十神的个数、六亲表
  eq('十神对照里的个数加起来，等于三个天干加地支里藏的天干', [...d.querySelectorAll('#gods .gn')].map(el => parseInt(txt(el), 10) || 0).reduce((a, b) => a + b, 0), ev('natalStems().length+natalHidden().length'));
  eq('六亲表有六行，位置一栏和各个十神自己的解释里列的相同', [d.querySelectorAll('#liuqin tr').length, ev("liuqinRows().every(r=>r.at===(whereGod(g=>god(g)===r.god).join('、')||'原局里没有'))"), [...d.querySelectorAll('#liuqin tr')].map(tr => txt(tr.cells[1])).join()], [6, true, ev('P.gender') ? '偏财,正印,比肩,正财,七杀,正官' : '偏财,正印,比肩,正官,食神,伤官']);
  // 版面：原局一张卡片照读盘的先后排（八字、日主、五行、强弱、十神、喜忌），大运流年一张卡片：选择器和四个标签（四柱细盘、干支关系、根和透、计分）。六亲和宫位是原局的最后一页：原来是页面最下面单独的一张卡片，2026-11-18 挪进了标签栏
  eq('版块的先后：原局的八个标签（十神和喜忌中间是格局，最后是六亲）、选择器、排盘的四个标签；六亲和宫位两张表都在「六亲」一页里，页面最下面不再有单独的卡片', [['h-bz', 'h-tk', 'h-wx', 'h-qr', 'h-gods', 'h-gj', 'h-ys', 'h-lq', 'h-yun', 'h-pan', 'h-rel', 'h-gt', 'h-sy'].map(id => $(id)).every((el, i, a) => !!el && (!i || (a[i - 1].compareDocumentPosition(el) & 4) === 4)), $('h-lq').getAttribute('role'), txt($('h-lq')), $('p-lq').contains($('liuqin')) && $('p-lq').contains($('gwmap')), $('card-natal').contains($('p-lq')), $('card-lq')], [true, 'tab', '六亲', true, true, null]);
  eq('每个标签对着自己的那一页，里面的东西各归各位', [['bz', 'bz'], ['tk', 'quad'], ['wx', 'wxt'], ['qr', 'kv'], ['qr', 'qs'], ['gods', 'gods'], ['gj', 'kv-gj'], ['gj', 'gjz'], ['gj', 'rd-gj'], ['ys', 'xi'], ['ys', 'kv2'], ['lq', 'liuqin'], ['lq', 'gwmap'], ['lq', 'rd-lq'], ['lq', 'rd-gw'], ['pan', 'pan'], ['rel', 'lkmap'], ['gt', 'gtmap'], ['sy', 'sy']].filter(([t, inner]) => { const b = $('h-' + t), pn = $('p-' + t); return !(b && pn && b.getAttribute('role') === 'tab' && b.getAttribute('aria-controls') === pn.id && pn.getAttribute('aria-labelledby') === b.id && pn.contains($(inner))); }).map(x => x[0]), []);
  // 日主一页只有四项（日主属性、阴阳参考就是「日主」「阴阳」两行；旺衰参考、格局参考是强弱、格局两页的结论）；月令、根、印、月令透干在强弱一页的最上面
  const inBox = (box, k) => !!$(box).querySelector(`[data-x="kv|${k}"]`), kvNames = [...$('kv').querySelectorAll('dt')].map(txt), quadNames = [...$('quad').querySelectorAll('.qd-k')].map(txt);
  eq('日主一页是四个方块；强弱一页最上面是得令、得地、得势、得气四张卡片（月令、根、印三行并在里面），下面有月令透干、强弱计分的卡片和强弱参考；格局参考在十神一页；调候参考、三行对照在喜忌一页', [quadNames, ['日主', '阴阳', '强弱参考', '格局参考'].map(k => inBox('quad', k)), [...$('sd').querySelectorAll('.sd-h .x')].map(txt), ['月令', '根', '印'].some(k => kvNames.includes(k)), kvNames.includes('月令透干'), ['日主', '阴阳'].some(k => inBox('kv', k)), inBox('kv-qr', '强弱参考'), inBox('kv-gj', '格局参考'), ['调候参考', '三行对照'].map(k => inBox('kv2', k)), inBox('qs', '强弱计分'), d.querySelectorAll('#kv dt, #kv-qr dt, #kv-gj dt, #kv2 dt').length], [['日主属性', '阴阳参考', '旺衰参考', '格局参考'], [true, true, true, true], ['得令', '得地', '得势', '得气'], false, true, false, true, true, [true, true], true, ev('kvRows().length') - 6]);
  // 手写解读另加的行：插在哪一行后面就跟着那一行进哪一页，没写插在哪里的排在最后，在喜忌一页
  ev("window.__notes=P.notes;P.notes={kv:[{k:'试一',after:'根',dd:'一'},{k:'试二',after:'格局参考',dd:'二'},{k:'试三',dd:'三'},{k:'试四',after:'强弱计分',dd:'四'}]};MEMO={};renderPerson();");
  const noteAt = k => ['kv', 'kv-qr', 'kv-gj', 'kv2'].filter(b => inBox(b, k));
  eq('手写另加的行跟着它插在哪一行后面进哪一页，没写插在哪里的在喜忌一页', ['试一', '试二', '试三', '试四'].map(noteAt), [['kv'], ['kv-gj'], ['kv2'], ['kv-qr']]);
  ev("P.notes=window.__notes;delete window.__notes;MEMO={};renderPerson();");
  // 从格一行：在强弱一页，写的合不合和 congOf 一致；喜忌一页只在合的时候提一句
  const congDD = () => txt($('kv-qr').querySelector('[data-x="kv|从格"]').closest('dt').nextElementSibling);
  eq('从格一行在强弱一页「强弱参考」的下面，写的合不合和另算的一致，喜忌一页不提', [inBox('kv-qr', '从格'), congDD().startsWith(ev('congNow().ok') ? '合：' : '不合：'), txt($('xi')).includes('从格')], [true, true, ev('congNow().ok')]);
  // 一张合条件的虚构的盘：甲木日主，四柱里没有木和水。在 1900 到 2100 年里找一天
  const congInfo = ev(`(()=>{for(const b of ['丙午 戊戌 甲戌 庚午','丙午 戊戌 甲午 庚午','丙午 丁酉 甲戌 己巳','丙午 丁酉 甲午 庚午']){const ds=datesOf(b.split(' '));if(ds.length) return JSON.stringify(Object.assign({id:'cong-test',name:'从格',gender:'男'},ds[0]));}return 'null';})()`);
  const keepP = ev('sel.p');
  ev(`PEOPLE.push(chartOf(${congInfo}));usePerson(PEOPLE.length-1);`);
  eq('一张合从格条件的虚构的盘：从格一行写「合」，喜忌一页在扶抑的喜用下面说照从格喜忌相反', [congInfo !== 'null', ev('congNow().ok'), congDD().startsWith('合：'), txt($('xi')).includes('照从格的书，喜忌和这里正好相反')], [true, true, true, true]);
  ev(`PEOPLE.pop();usePerson(${keepP});`);
  // 喜忌一页的「忌」和「喜用」一样能点，打开的是忌自己的解释，五行和格子里列的相同
  const jiBtn = $('xi').querySelector('[data-x="ji"]');
  if (jiBtn) { ev('closeSheet()'); click(jiBtn); }
  eq('喜忌一页的「忌」也能点开解释，标题里的五行就是格子里列的忌', ev('xiNow().ji') ? [!!jiBtn, !$('sheet').hidden, txt($('sheet-t')).replace('忌（扶抑） · ', ''), ev('X("ji").p.length')] : [!!jiBtn], ev('xiNow().ji') ? [true, true, ev("elNames(xiNow().ji)"), 4] : [false]);
  ev('closeSheet()');
  {
    // 四项里的话和它们指的那几行一致；阴阳照另算的结果
    const dds = Object.fromEntries([...$('quad').querySelectorAll('.qd')].map(q => [txt(q.querySelector('.qd-k')), txt(q)]));
    const ps4 = JSON.parse(ev('JSON.stringify(NATAL.map(p=>[p.g,p.z]))')), hid = JSON.parse(ev('JSON.stringify(HID)')), G10 = '甲乙丙丁戊己庚辛壬癸', Z12 = '子丑寅卯辰巳午未申酉戌亥';
    const yang = ps4.filter(x => G10.indexOf(x[0]) % 2 === 0).length + ps4.filter(x => Z12.indexOf(x[1]) % 2 === 0).length;      // 地支照六十甲子的配法
    const yang2 = ps4.filter(x => G10.indexOf(x[0]) % 2 === 0).length + ps4.filter(x => G10.indexOf(hid[x[1]][0]) % 2 === 0).length;      // 照本气
    eq('阴阳参考：八个字里阳几个、阴几个，地支照六十甲子的配法算；照本气数出来不一样时，另写那一种的数', [dds['阴阳参考'].includes(`阳 ${yang} · 阴 ${8 - yang}`), dds['阴阳参考'].includes('照本气算'), yang2 === yang || dds['阴阳参考'].endsWith(`照本气算是阳 ${yang2} · 阴 ${8 - yang2}`)], [true, yang2 !== yang, true]);
    const q0 = ev('qrNow().tier==="中"?"中强（中弱）":qrNow().tier'), qt = ev('qsNow().tier'), gj = JSON.parse(ev('JSON.stringify((g=>g.list?gejuNames(g):[g.kind==="阳刃"?"阳刃":"建禄月劫"])(geju()))'));
    eq('旺衰参考和格局参考：写着照的是哪一种办法，归的类和强弱、十神两页相同；日主属性写着日主和它的阴阳五行', [dds['旺衰参考'].includes(`${q0}《千里命稿》`), dds['旺衰参考'].includes({ 强: '身强', 弱: '身弱', 间: '强弱居中' }[qt] + '强弱计分'), dds['格局参考'].includes('照《子平真诠》') && gj.every(x => dds['格局参考'].includes(x)), dds['日主属性'].includes(ev('DMN')) && dds['日主属性'].includes(ev('yy(DM)+EL[gEl(DM)]'))], [true, true, true, true]);
  }
  // 合化：天干照《千里命稿》外格篇的十五个命例（构成五个，破败三个，转败为成五个，必不可成两个）；地支照补充篇编几种情形；改记以后的分数
  {
    const HUA_CASES = [['戊辰 壬戌 甲辰 己巳', true, ''], ['甲申 癸酉 乙丑 庚辰', true, ''], ['甲辰 丙子 辛丑 壬辰', true, ''], ['乙卯 丁卯 壬午 癸卯', true, ''], ['丙戌 戊戌 癸巳 甲寅', true, ''],
      ['庚戌 戊子 辛未 丙申', false, '因克而破'], ['甲戌 丁卯 壬午 丁未', false, '因妒而破'], ['壬辰 丁未 甲子 己巳', false, '因化而破'],
      ['辛酉 丙申 乙丑 庚辰', true, ''], ['甲子 戊辰 丙申 辛卯', true, ''], ['甲戌 丁丑 甲申 己巳', true, ''], ['壬寅 丁未 壬子 丁未', true, ''], ['丁丑 辛亥 丙午 辛卯', true, ''],
      ['辛亥 庚子 丙寅 壬辰', false, '隔位'], ['丙午 戊戌 丁亥 壬寅', false, '不得月令']];
    const hg = ps => JSON.parse(ev(`JSON.stringify(huaGan(${JSON.stringify(mkCols(ps.split(' ')))}))`));
    eq('合化：《千里命稿》外格篇化气格的十五个命例，成的、破的、转败为成的、必不可成的，逐个和书上的结论相同', HUA_CASES.map(([ps]) => { const r = hg(ps); return [ps, r.ok, r.why]; }), HUA_CASES.map(([ps, okW, why]) => [ps, okW, why]));
    const hz = zs => JSON.parse(ev(`JSON.stringify(huaZhi(${JSON.stringify(mkCols(zs.split('').map((z, i) => '甲乙丙丁'[i] + z)))}))`));
    const zc = [hz('亥卯丑未'), hz('亥卯酉未'), hz('卯亥未酉'), hz('寅卯申辰'), hz('亥卯午申'), hz('亥丑卯子')];
    eq('合化：三合三支全就改记（隔一个字也算），旺支被紧贴的冲着作冲不作合，冲不紧贴仍作合，三会见冲仍作合，半合不改记', zc.map(r => [r.ok, r.kind, r.to ?? null]), [[true, '局合', 0], [false, '局合', 0], [true, '局合', 0], [true, '方合', 0], [false, '', null], [true, '方合', 4]]);
    const raw = JSON.parse(ev(`JSON.stringify(nlScore(${JSON.stringify(mkCols('戊辰 壬戌 甲辰 己巳'.split(' ')))}).sum)`)), hua = JSON.parse(ev(`JSON.stringify(nlScoreHua(${JSON.stringify(mkCols('戊辰 壬戌 甲辰 己巳'.split(' ')))}).sum)`));
    eq('合化改记：甲己化土的盘，日干甲的 5 分从木改记到土，别的不动，总数还是 60', [hua[0] - raw[0], hua[2] - raw[2], hua.reduce((a, b) => a + b, 0), [1, 3, 4].every(e => hua[e] === raw[e])], [-5, 5, 60, true]);
  }
  // 五行能量：页面上的分数、占比、合称，和另算的一致；点开每一行，各笔加起来等于这一行的分数。合化成立的字照「合化」一行改记到化神，这里照它给的改记另算
  {
    const mvs = JSON.parse(ev('JSON.stringify(huaNow().moves)')), elG1 = g => ev(`gEl('${g}')`), p4m = JSON.parse(ev('JSON.stringify(NATAL.map(p=>[p.g,p.z]))'));
    const mvG = {}, mvZ = {}; mvs.forEach(m => { (m.pos === '干' ? mvG : mvZ)[m.i] = m.to; });
    const sum = JSON.parse(ev('JSON.stringify(nlScore(NATAL).sum)'));
    p4m.forEach(([g, z], i) => { if (mvG[i] !== undefined) { sum[elG1(g)] -= 5; sum[mvG[i]] += 5; } if (mvZ[i] !== undefined) JSON.parse(ev(`JSON.stringify(nlOf('${z}'))`)).forEach(([h, n]) => { const v = i === 1 ? n * 2 : n; sum[elG1(h)] -= v; sum[mvZ[i]] += v; }); });
    const de = ev('gEl(DM)'), GRPS = ['比劫', '食伤', '财才', '官杀', '印绶'];
    const rowsNl = [...$('wxt').querySelectorAll('tr')].map(tr => ({ name: txt(tr.querySelector('.el')), grp: txt(tr.querySelector('.gp')) }));
    const nums = [...$('wxt').querySelectorAll('.wn b')].map(x => parseInt(txt(x), 10)), pcs = [...$('wxt').querySelectorAll('tr')].map(tr => txt(tr.children[3]));
    eq('五行能量：五行的分数加起来 60 分，页面上的分数、占比和合称都和另算的一致', [nums, nums.reduce((a, b) => a + b, 0), pcs, rowsNl.map(r => r.name + r.grp)], [sum, 60, sum.map(n => Math.round(n / 60 * 100) + '%'), ['木', '火', '土', '金', '水'].map((e, i) => e + GRPS[(i - de + 5) % 5])]);
    const parts = [0, 1, 2, 3, 4].map(i => { const p = JSON.parse(ev(`JSON.stringify(X('nl|${i}').p)`)).find(x => x[0] === '怎么加的')[1]; const ns = (p.match(/ (\d+) 分/g) || []).map(x => parseInt(x, 10)); return sum[i] ? ns.slice(0, -1).reduce((a, b) => a + b, 0) === sum[i] && ns[ns.length - 1] === sum[i] : /0 分/.test(p); });
    eq('五行能量：点开每一行，各笔加起来就是这一行的分数', parts, [true, true, true, true, true]);
    // 五行一页的生克图：五个圈各是一行五行，圈旁边写着五行能量的分数，圈填多少照分数（最多的填满），日主那一行加粗；箭头方向拿圈的位置另算
    const ELC5 = ['wood', 'fire', 'earth', 'metal', 'water'], nds = [...$('wxmap').querySelectorAll('.nd')], fillH = n => { const r = n.querySelector('rect.lvl'); return r ? (+r.getAttribute('height')).toFixed(1) : '0.0'; };
    eq('五行一页的生克图：五个圈各是一行五行，圈旁边写着它的分数，填多少照分数，日主那一行加粗；相生五条实线、相克五条虚线', [nds.map(n => ELC5.find(c => n.classList.contains(c)) + ' ' + txt(n.querySelector('.ch')) + ' ' + txt(n.querySelector('.gp')) + (n.classList.contains('me') ? ' me' : '')), nds.map(fillH), $('wxmap').querySelectorAll('line.sh').length, $('wxmap').querySelectorAll('line.ke').length], [ELC5.map((c, e) => `${c} ${'木火土金水'[e]} ${sum[e]} 分` + (e === de ? '（日主） me' : '')), sum.map(v => (v ? 50 * v / Math.max(...sum) : 0).toFixed(1)), 5, 5]);
    const ctr = nds.map(n => { const c = n.querySelector('circle'); return [+c.getAttribute('cx'), +c.getAttribute('cy')]; }), dist = (x, y, k) => Math.hypot(x - ctr[k][0], y - ctr[k][1]);
    const dirOk = (cls, step) => [...$('wxmap').querySelectorAll('line.' + cls)].every((l, e) => { const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(a => +l.getAttribute(a)); return dist(x1, y1, e) < dist(x1, y1, (e + step) % 5) && dist(x2, y2, (e + step) % 5) < dist(x2, y2, e); });
    eq('生克图的箭头：相生从每一行指向它生的那一行（木到火），相克指向它克的那一行（木到土）', [dirOk('sh', 1), dirOk('ke', 2)], [true, true]);
    // 十神一页的生克图：外面一圈十个十神，名字、几处、同性异性和十神表一致，圈填多少照几处（最多的填满）；里面一圈五类照两个加起来的数；五类之间的箭头方向和五行的生克一致
    const cntOf = JSON.parse(ev('JSON.stringify(Object.fromEntries(G.split("").map(g=>[god(g),natalStems().concat(natalHidden()).filter(x=>x===g).length])))'));
    const NAMES = [['劫财', '比肩'], ['伤官', '食神'], ['正财', '偏财'], ['正官', '七杀'], ['正印', '偏印']], mxG = Math.max(1, ...NAMES.flat().map(nm => cntOf[nm])), sums = NAMES.map(p => cntOf[p[0]] + cntOf[p[1]]), mxC = Math.max(1, ...sums);
    const gsm = [...$('godmap').querySelectorAll('.nd.sm')], gcat = [...$('godmap').querySelectorAll('.nd:not(.sm):not(.me)')];
    const gctr = gcat.map(n => { const c = n.querySelector('circle.ring'); return [+c.getAttribute('cx'), +c.getAttribute('cy')]; }), gdist = (x, y, k) => Math.hypot(x - gctr[k][0], y - gctr[k][1]);
    const gdirOk = (cls, step) => [...$('godmap').querySelectorAll('line.' + cls)].every((l, k) => { const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(a => +l.getAttribute(a)); return gdist(x1, y1, k) < gdist(x1, y1, (k + step) % 5) && gdist(x2, y2, (k + step) % 5) < gdist(x2, y2, k); });
    eq('十神一页的生克图：外面一圈十个十神，名字、几处、同性异性和十神表一致，填多少照几处', [gsm.map(n => txt(n.querySelector('.nm')) + ' ' + txt(n.querySelector('.ct')) + ' ' + txt(n.querySelector('.sx'))), gsm.map(fillH)], [NAMES.flatMap(p => p.map((nm, j) => `${nm} ${cntOf[nm]} 处 ${j ? '同性' : '异性'}`)), NAMES.flatMap(p => p.map(nm => (cntOf[nm] ? 38 * cntOf[nm] / mxG : 0).toFixed(1)))]);
    // 图里的圈都能点：五行图点圈看五行能量的明细，十神图点外圈看十神、点里圈看合称、点中间看日主；键盘按回车也行
    const clickOpen = el => { ev('closeSheet()'); click(el); return [!$('sheet').hidden, ev('sel.x'), txt($('sheet-t'))]; };
    const wx0 = clickOpen(nds[0]), god0 = clickOpen(gsm[6]), cat0 = clickOpen(gcat[3]), dm0 = clickOpen($('godmap').querySelector('.nd.me'));
    ev('closeSheet()'); gsm[0].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); const kb0 = [!$('sheet').hidden, ev('sel.x')]; ev('closeSheet()');
    eq('生克图里的圈都能点开解释：五行图看五行能量的明细，十神图看十神、合称和日主；键盘按回车也能打开', [wx0, god0.slice(0, 2), cat0.slice(0, 2), dm0.slice(0, 2), kb0], [[true, 'nl|0', ev("X('nl|0').t")], [true, 'tg|正官'], [true, 'grp|3'], [true, 'kv|日主'], [true, 'tg|劫财']]);
    // 生克图上方的按钮：换一种数法，圈旁的数、填多少、点圈打开的解释都跟着换；选的数法记在浏览器里。试完换回默认（五行图五行能量，十神图含藏干数）
    const wcs = JSON.parse(ev('JSON.stringify(wxCounts())')), mapPressed = id => [...$(id).querySelectorAll('[data-map]')].map(b => b.getAttribute('aria-pressed'));
    const wxBy = m => { click($('wx-seg').querySelector(`[data-map="wx:${m}"]`)); const nd = [...$('wxmap').querySelectorAll('.nd')]; return [nd.map(n => txt(n.querySelector('.gp')).replace('（日主）', '')), nd.map(fillH), nd.map(n => n.dataset.x), mapPressed('wx-seg')]; };
    const wxWant = (v, u, kp, i) => { const mx = Math.max(1, ...v); return [v.map(x => `${x} ${u}`), v.map(x => (x ? 50 * x / mx : 0).toFixed(1)), v.map((_, e) => kp + e), [0, 1, 2].map(j => String(j === i))]; };
    eq('五行生克图点「五行个数」：圈旁写几个，填多少照盘面八个字的个数，点圈看在哪里', wxBy('face'), wxWant(wcs.face, '个', 'wxf|', 0));
    const wxf0 = clickOpen($('wxmap').querySelector('.nd'));
    eq('五行个数时点圈：打开只数盘面的那一种解释', [wxf0[0], wxf0[1], wxf0[2].endsWith(`${wcs.face[0]} 个（只数盘面）`)], [true, 'wxf|0', true]);
    ev('closeSheet()');
    eq('五行生克图点「含藏干数」', wxBy('cnt'), wxWant(wcs.cnt, '个', 'wx|', 1));
    eq('五行生克图点回「五行能量」', wxBy('nl'), wxWant(sum, '分', 'nl|', 2));
    // 五行一页的表跟着同一组按钮换：名字点开的解释对应这种数法；「在哪里」一列，个数的数法列出的字数就是个数，五行能量各笔的分数加起来就是分数
    const wxRowsBy = m => { click($('wx-seg').querySelector(`[data-map="wx:${m}"]`)); return [...$('wxt').querySelectorAll('tr')].map(tr => { const n = parseInt(txt(tr.querySelector('.wn b')), 10), wh = txt(tr.querySelector('.wh')), items = wh === '没有' ? [] : wh.split('、'); return [tr.querySelector('[data-x]').dataset.x.split('|')[0], m === 'nl' ? items.reduce((a, t) => a + parseInt(t.match(/ (\d+) 分$/)[1], 10), 0) === n : items.length === n]; }); };
    eq('五行一页的表：三种数法下，点名字打开对应的解释，「在哪里」和这一行的数对得上', [wxRowsBy('face'), wxRowsBy('cnt'), wxRowsBy('nl')], [['wxf', 'wx', 'nl']].flatMap(([a, b2, c]) => [[0, 1, 2, 3, 4].map(() => [a, true]), [0, 1, 2, 3, 4].map(() => [b2, true]), [0, 1, 2, 3, 4].map(() => [c, true])]));
    const gcount = list => JSON.parse(ev(`JSON.stringify(Object.fromEntries(G.split("").map(g=>[god(g),(${list}).filter(x=>x===g).length])))`));
    const faceOf = gcount('natalStems().concat(NATAL.map(p=>HID[p.z][0]))'), ptsOf = {};
    ev('G').split('').forEach(g => { ptsOf[ev(`god('${g}')`)] = 0; });
    JSON.parse(ev('JSON.stringify(NATAL.map(p=>[p.g,p.z]))')).forEach(([g, z], i) => { if (i !== 2) ptsOf[ev(`god('${g}')`)] += 5; JSON.parse(ev(`JSON.stringify(nlOf(${JSON.stringify(z)}))`)).forEach(([h, n]) => { ptsOf[ev(`god('${h}')`)] += i === 1 ? n * 2 : n; }); });
    const gBy = m => { click($('gods-seg').querySelector(`[data-map="gods:${m}"]`)); const sm = [...$('godmap').querySelectorAll('.nd.sm')]; return [sm.map(n => txt(n.querySelector('.ct'))), sm.map(fillH), mapPressed('gods-seg')]; };
    const godTable = () => [...$('gods').querySelectorAll('td')].filter(td => td.querySelector('.gn')).map(td => [txt(td.querySelector('[data-x]')), txt(td.querySelector('.gn'))]).sort();
    const tableWant = (o, u) => Object.keys(o).map(nm => [nm, o[nm] ? `${o[nm]} ${u}` : '没有']).sort();
    const gWant = (o, u, i) => { const mx = Math.max(1, ...NAMES.flat().map(nm => o[nm])); return [NAMES.flatMap(p => p.map(nm => `${o[nm]} ${u}`)), NAMES.flatMap(p => p.map(nm => (o[nm] ? 38 * o[nm] / mx : 0).toFixed(1))), [0, 1, 2].map(j => String(j === i))]; };
    eq('十神一页点「十神个数」：三个天干加四个地支的本气，不算日主；生克图和上面的表一起换', [gBy('face'), godTable()], [gWant(faceOf, '处', 0), tableWant(faceOf, '处')]);
    eq('十神一页点「能量」：照五行能量的分法分给十个十神，加起来 55 分；表里写分数，解读里按能量排', [gBy('nl'), NAMES.flat().reduce((a, nm) => a + ptsOf[nm], 0), txt($('note-godmap')).includes('五行能量'), godTable(), ev("note('read','gods')!==undefined") || txt($('rd-gods')).includes('按能量')], [gWant(ptsOf, '分', 2), 55, true, tableWant(ptsOf, '分'), true]);      // 手写的解读不跟着换
    eq('十神一页点回「含藏干数」：表和图都回到含藏干的个数', [gBy('cnt'), godTable()], [gWant(cntOf, '处', 1), tableWant(cntOf, '处')]);
    eq('选的数法记在浏览器里（格局一页看哪一张表也记在一起）', JSON.parse(ev("localStorage.getItem('bz-map')")), { wx: 'nl', gods: 'cnt', yun: 'fy', gj: 'gjb' });
    eq('十神一页的生克图：里面一圈是比劫、食伤、财才、官杀、印绶和它们对日主的关系，颜色是各自属的五行，填多少照两个加起来的数；相生指向下一类，相克隔一类；中间是日主', [gcat.map(n => ELC5.find(c => n.classList.contains(c)) + ' ' + txt(n.querySelector('.ch2')) + ' ' + txt(n.querySelector('.ct'))), gcat.map(fillH), gdirOk('sh', 1), gdirOk('ke', 2), txt($('godmap').querySelector('.nd.me .ch'))], [GRPS.map((g, k) => `${ELC5[(de + k) % 5]} ${g} ${['同我', '我生', '我克', '克我', '生我'][k]}`), sums.map(v => (v ? 48 * v / mxC : 0).toFixed(1)), true, true, ev('DM')]);
    // 强弱分析卡片：分数、归类、拆开的四块、每一笔、扶抑取的喜用和忌，都拿原局另算一遍
    const se = (de + 4) % 5, ELN = ['木', '火', '土', '金', '水'], q = JSON.parse(ev('JSON.stringify(qsNow())'));
    const ps4 = JSON.parse(ev('JSON.stringify(NATAL.map(p=>[p.g,p.z]))')), elOf = JSON.parse(ev('JSON.stringify(Object.fromEntries(G.split("").map(g=>[g,gEl(g)])))'));
    const isHelp = e => e === de || e === se, part = { yue: 0, zhi: 0, gan: 0 }, items = [];
    ps4.forEach(([g, z], i) => { if (i !== 2 && isHelp(mvG[i] ?? elOf[g])) { part.gan += 5; items.push(5); } JSON.parse(ev(`JSON.stringify(nlOf(${JSON.stringify(z)}))`)).forEach(([h, n]) => { if (isHelp(mvZ[i] ?? elOf[h])) { const v = i === 1 ? n * 2 : n; if (i === 1) part.yue += v; else part.zhi += v; items.push(v); } }); });
    const selfW = isHelp(mvG[2] ?? de) ? 5 : 0;
    const head = txt($('qs').querySelector('.qs-h')), tiles = [...$('qs').querySelectorAll('.qt b')].map(b => parseInt(txt(b), 10)), lis = [...$('qs').querySelectorAll('.qs-li li')].map(li => (txt(li).match(/(\d+) 分/) || [])[1]).filter(Boolean).map(Number);
    eq('强弱分析：卡片上的分数就是五行能量里帮日主的一组（比肩、劫财、正印、偏印）的分数，归类照书里的线；日主自己、月支、另外三个地支、三个天干四块，和下面列的每一笔，都和另算的一致', [q.help, q.rest, head.includes(`比肩、劫财、正印、偏印 ${q.help} 分`), head.includes({ 强: '身强', 弱: '身弱', 间: '强弱居中' }[q.tier]), tiles, tiles.reduce((a, b) => a + b, 0), lis], [sum[de] + sum[se], 60 - sum[de] - sum[se], true, true, [selfW, part.yue, part.zhi, part.gan], sum[de] + sum[se], items]);
    eq('合称只在十神表、五行能量、十神生克图里用：强弱卡片、喜忌、计分表和图例、宫位表、选中的四层、几处解读都照全称写',
      ['qs', 'xi', 'sy-h', 'sy-lg', 'gwmap', 'note-sy', 'note-syfig', 'layers', 'rd-qr', 'rd-ys', 'rd-tr', 'rd-yun'].filter(id => $(id) && /比劫|食伤|财才|官杀|印绶/.test(txt($(id)))), []);
    // 用神：照任铁樵《滴天髓阐微》「体用」的注取，喜神、忌神、仇神、闲神照「闲神」的注分。先拿编出来的分数核对规则的每一支，再拿这张盘另算一遍
    const yp = (t, cat, el) => JSON.parse(ev(`JSON.stringify(yongPick(${JSON.stringify(t)},${JSON.stringify(cat)},${JSON.stringify(el)}))`)).yong;
    eq('用神：身弱时克泄耗里官杀最重取印，食伤最重取印，财最重取比肩和劫财；财和官杀一样重时照注里先说的官杀取印，官杀和食伤一样重也取印', [yp('弱', [2, 5, 10, 20, 3], [7, 5, 10, 20, 3]), yp('弱', [2, 20, 10, 5, 3], [7, 20, 10, 5, 3]), yp('弱', [2, 5, 20, 10, 3], [7, 5, 20, 10, 3]), yp('弱', [2, 10, 15, 15, 3], [7, 10, 15, 15, 3]), yp('弱', [2, 15, 10, 15, 3], [7, 15, 10, 15, 3])], [4, 4, 0, 4, 4]);
    eq('用神：身强时印比比肩和劫财重取财，比肩和劫财重取食神和伤官，一样重照注里先说的印多取财；强弱未定、克泄耗三类一样重，照先说的官杀取食神和伤官', [yp('强', [10, 5, 5, 5, 20], [15, 5, 5, 5, 20]), yp('强', [20, 5, 5, 5, 10], [25, 5, 5, 5, 10]), yp('强', [15, 5, 5, 5, 15], [20, 5, 5, 5, 15]), yp('间', [10, 10, 10, 10, 10], [15, 10, 10, 10, 10])], [2, 1, 2, 1]);
    // 强弱未定（26 到 29 分）照注里讲两头都不是的盘那一句（tc_ting）：官杀最重算「两停」取食伤，财最重算「均敌」取印和比劫两类（pair），
    // 食伤最重的注里没讲，借身强的两条（borrow）：比劫比印重取食伤，印重取财；最重的有两类、两条取的不一样时照注里先说的那一条（tie）。每张盘都有结果；
    // 身弱、身强的盘不会有 pair（2026-11-17，用户说「还是希望能看到结果」）
    const ypx = (t, cat, el) => { const r = JSON.parse(ev(`JSON.stringify(yongPick(${JSON.stringify(t)},${JSON.stringify(cat)},${JSON.stringify(el)}))`)); return [r.yong, r.pair, r.shen ? 'shen' : null, r.tie, r.borrow]; };
    eq('用神：强弱未定时官杀最重取食神和伤官（分喜神），财最重取印和比劫两类（不分喜神），食伤最重借身强的两条（比劫重取食伤，印重取财）；官杀和财、官杀和食伤一样重，照先说的官杀取；身弱、身强不取两类',
      [ypx('间', [5, 6, 2, 24, 18], [10, 6, 2, 24, 18]), ypx('间', [0, 1, 17, 16, 21], [5, 1, 17, 16, 21]), ypx('间', [18, 21, 5, 5, 6], [23, 21, 5, 5, 6]), ypx('间', [5, 21, 5, 5, 18], [10, 21, 5, 5, 18]), ypx('间', [6, 10, 11, 11, 17], [11, 10, 11, 11, 17]), ypx('间', [5, 15, 5, 15, 15], [10, 15, 5, 15, 15]), ypx('弱', [2, 5, 20, 10, 3], [7, 5, 20, 10, 3]), ypx('强', [20, 5, 5, 5, 10], [25, 5, 5, 5, 10])],
      [[1, null, 'shen', false, false], [null, [4, 0], null, false, false], [1, null, 'shen', false, true], [2, null, 'shen', false, true], [1, null, 'shen', true, false], [1, null, 'shen', true, false], [0, null, 'shen', false, false], [1, null, 'shen', false, false]]);
    // 化气格（2026-11-17）：照任铁樵「化之真者，即以化神为体」，化神有余取泄它的一行，不足取生它的和它自己两类。
    // 《千里命稿》外格篇构成化气格的三个命例，加一副化神正好 12 分的四柱（随机找的，正好 12 分不算超过平均）
    const yh = ps => JSON.parse(ev(`JSON.stringify((()=>{const p=${JSON.stringify(ps)}.split(' ').map((s,i)=>({k:'年月日时'[i],g:s[0],z:s[1],day:i===2}));const y=yongOf(p[2].g,p,true);return [y.hua,y.yong,y.pair,y.shen&&y.shen.xi];})())`));
    eq('用神：化气格照任铁樵以化神为体。甲己化土有余取金、喜神土；乙庚化金有余取水、喜神金；丁壬化木有余取火、喜神木；戊癸化火正好 12 分算不足，取木和火两类',
      ['戊辰 壬戌 甲辰 己巳', '甲申 癸酉 乙丑 庚辰', '乙卯 丁卯 壬午 癸卯', '辛卯 戊戌 癸卯 庚申'].map(yh),
      [[{ to: 2, you: true }, 3, null, 2], [{ to: 3, you: true }, 4, null, 3], [{ to: 0, you: true }, 2, null, 1], [{ to: 1, you: false }, null, [1, 2], null]]);
    const mu = ev('Q.tc_mu[1]'), mus = mu.split('；').map(t => Object.fromEntries([...t.matchAll(/以(.)为(.)神/g)].map(m => [m[2], m[1]])));
    const shenEl = (cat, el) => { const y = JSON.parse(ev(`JSON.stringify(yongPick('弱',${JSON.stringify(cat)},${JSON.stringify(el)}))`)); return Object.fromEntries([['喜', 'xi'], ['忌', 'ji'], ['仇', 'chou'], ['闲', 'xian']].map(([c, f]) => [c, ELN[(1 + y.shen[f]) % 5]])); };
    eq('喜神、忌神、仇神、闲神：日主丁火、用神是印（木）时，有余、不足两种分法和任铁樵注里用木的例子逐个相同', [shenEl([5, 5, 5, 20, 13], [10, 5, 5, 20, 13]), shenEl([5, 5, 5, 20, 12], [10, 5, 5, 20, 12]), mus.length], [mus[0], mus[1], 2]);
    // 不算日主自己那 5 分：日干合化了，就从它改记到的那一行减（mvG 是「合化」一行给的天干改记，上面照它另算了分数；2026-11-17 审阅报告 R1）
    const elRel = [0, 1, 2, 3, 4].map(k => sum[(de + k) % 5]), catRel = elRel.slice(); catRel[((mvG[2] !== undefined ? mvG[2] : de) - de + 5) % 5] -= 5;
    let yW = null, pW = null;      // pW：强弱未定、财最重时取的印和比劫两类
    // 克泄耗三类里最重的一类；一样重时照注里的先后取头一个：身弱是官杀、食伤、财，强弱未定是官杀、财、食伤
    const topOf = ord => { const m = Math.max(catRel[1], catRel[2], catRel[3]); return ord.find(k => catRel[k] === m); };
    const hg0 = JSON.parse(ev('JSON.stringify({ok:huaNow().gan.ok,to:huaNow().gan.to})'));      // 化气格照「合化」一行的结论，它对着《千里命稿》的命例另有检查
    if (hg0.ok) { if (sum[hg0.to] > 12) yW = ((hg0.to + 1) % 5 - de + 5) % 5; else pW = [((hg0.to + 4) % 5 - de + 5) % 5, (hg0.to - de + 5) % 5]; }
    else if (q.tier === '弱') yW = topOf([3, 1, 2]) === 2 ? 0 : 4;
    else if (q.tier === '强') yW = catRel[4] >= catRel[0] ? 2 : 1;      // 一样重照先说的印多
    else { const k = topOf([3, 2, 1]); if (k === 3) yW = 1; else if (k === 2) pW = [4, 0]; else yW = catRel[4] >= catRel[0] ? 2 : 1; }      // 食伤最重借身强的两条：印重取财，比劫重取食伤
    const yOffs = yW === null ? [] : elRel[yW] > 12 ? [0, 1, 3, 4, 2] : [0, 4, 2, 3, 1], CATN = JSON.parse(ev('JSON.stringify(CAT.map(c=>c[0]))'));
    // 扶抑取的喜用和忌：身弱、身强各两组；强弱居中照上面另算的用神取，一类用神的是用神和喜神、忌神和仇神，两类用神的是这两类和其余三行
    const RE = k => (de + k) % 5, restEls = [RE(1), RE(2), RE(3)], lean = q.tier === '间';
    const xiWant = !lean ? (q.tier === '强' ? restEls : [se, de]) : yW !== null ? [RE(yW), RE(yW + yOffs[1])] : pW.map(RE);
    const jiWant = !lean ? (q.tier === '强' ? [se, de] : restEls) : yW !== null ? [RE(yW + yOffs[2]), RE(yW + yOffs[3])] : [se, de, ...restEls].filter(e => !xiWant.includes(e));
    eq('强弱分析：扶抑取的喜用，身弱是印和比劫，身强是食伤、财、官杀；在两条线之间强弱居中，喜用照用神取，写明照的是「用神」那一块；卡片上的喜用和忌和另算的一致', [JSON.parse(ev('JSON.stringify([xiNow().xi,xiNow().ji])')), [...$('xi').querySelectorAll('.qx')].slice(0, 2).map(n => txt(n.querySelector('b'))), txt($('xi').querySelector('.sub')).includes('喜用照「用神」那一块')], [[xiWant, jiWant], [xiWant.map(e => ELN[e]).join(''), jiWant.map(e => ELN[e]).join('')], lean]);
    const yBlocks = [...$('xi').querySelectorAll('.qx')].slice(2).map(n => [txt(n.querySelector('span')), txt(n.querySelector('b')), n.querySelector('small') ? txt(n.querySelector('small')) : '']);
    eq('喜忌一页的用神那一排：用神照另算的取，喜神、忌神、仇神、闲神照有余、不足分，字块是五行，底下写着两个十神；取了两类时一块里两种五行，没有喜神那几块', [JSON.parse(ev('JSON.stringify([yongNow().yong,yongNow().pair])')), yBlocks],
      [[yW, pW], pW ? [['用神', pW.map(k => ELN[(de + k) % 5]).join(''), pW.map(k => CATN[k]).join('、')]] : yW === null ? [['用神', '不定', '']] : ['用神', '喜神', '忌神', '仇神', '闲神'].map((nm, j) => { const k = (yW + yOffs[j]) % 5; return [nm, ELN[(de + k) % 5], CATN[k]]; })]);
    // 喜用、忌、用神那几格里的五行字块都能点（xe|）：标题写这一行照扶抑是喜用还是忌、在用神那一套里叫什么，都拿上面另算的结果对照。2026-11-18 用户说「这些还是不能点」
    {
      const tiles = [...$('xi').querySelectorAll('.qx b span')], roleOf = e => { const k = (e - de + 5) % 5; return pW ? (pW.includes(k) ? '用神' : '') : yW === null ? '' : ['用神', '喜神', '忌神', '仇神', '闲神'][yOffs.findIndex(o => (yW + o) % 5 === k)]; };
      const xeBad = tiles.filter(t => {
        const a = (t.dataset.x || '').split('|'), e = +a[1], r = a[0] === 'xe' && t.getAttribute('role') === 'button' && t.getAttribute('tabindex') === '0' && ELN[e] === txt(t) ? ev(`X(${JSON.stringify(t.dataset.x)})`) : null;
        return !(r && r.t === [ELN[e], xiWant.includes(e) ? '喜用（扶抑）' : '忌（扶抑）', roleOf(e)].filter(Boolean).join(' · ') && r.p[0][0] === '含义' && r.p.map(x => x[0]).join() === '含义,扶抑,用神,这张盘');
      }).map(t => t.dataset.x + ' ' + txt(t));
      eq('喜忌一页的五行字块都能点：一格一个按钮，标题里的喜用、忌和用神的名目和另算的一致', [tiles.length > 0, xeBad], [true, []]);
    }
    const ys0 = [...$('xi').querySelectorAll('[data-x^="ys|"]')].map(b => { click(b); const r = [txt($('sheet-t')).split(' · ')[0], [...$('sheet-b').querySelectorAll('.lb')].map(txt).includes('依据') || yW === null]; ev('closeSheet()'); return r; });
    // 强弱一页最上面的四张卡片：得令照《千里命稿》的月令，得地看四个地支里有没有日主的根，得势数年、月、时三干里帮日主的，得气数年、日、时三支上的气盛。都拿四柱另算一遍
    const qr0 = JSON.parse(ev('JSON.stringify(qrNow())')), sdCard = nm => [...$('sd').querySelectorAll('.sd-c')].find(c => txt(c.querySelector('.sd-h .x')) === nm);
    const sdV = nm => txt(sdCard(nm).querySelector('.sd-v')), sdTiles = nm => [...sdCard(nm).querySelectorAll('.sd-t')].map(t => [txt(t.querySelector('b')), txt(t.querySelector('em')), t.classList.contains('hit')]);
    const HIDs = JSON.parse(ev('JSON.stringify(HID)')), STG = JSON.parse(ev('JSON.stringify(STAGES)')), p4 = JSON.parse(ev('JSON.stringify(NATAL.map(p=>[p.g,p.z]))'));
    const rootOf = z => HIDs[z].split('').find(h => elOf[h] === de) || '', sealOf = z => HIDs[z].split('').find(h => elOf[h] === se) || '';
    const nRoot = p4.filter(([, z]) => rootOf(z)).length, helpG = [0, 1, 3].filter(i => [de, se].includes(elOf[p4[i][0]])).length;
    const qiZ = [0, 2, 3].map(i => [p4[i][1], ev(`stage(DM,'${p4[i][1]}')`)]), nSheng = qiZ.filter(([, st]) => STG.indexOf(st) < 5).length;
    eq('强弱一页的四张卡片：得令一张是旺相休囚死五格，日主落在的那一格垫底色；判语和「强弱参考」用的那一条一致', [sdV('得令'), [...sdCard('得令').querySelectorAll('.sd-st i')].filter(i => i.classList.contains('hit')).map(txt)], [['旺', '相'].includes(qr0.st) ? '得令' : '失令', [qr0.st]]);
    eq('得地一张：四个地支，有日主的根的写着「根」并垫底色，没有根有印的写着「印」；有一处根就算得地', [sdV('得地'), sdTiles('得地')], [nRoot ? '得地' : '失地', p4.map(([, z]) => [z, rootOf(z) ? '根 ' + rootOf(z) : sealOf(z) ? '印 ' + sealOf(z) : '·', !!rootOf(z)])]);
    eq('得势一张：年、月、时三个天干和它们的十神，帮日主的垫底色；帮日主的占多数算得势', [sdV('得势'), sdTiles('得势').map(t => [t[0], t[2]])], [helpG >= 2 ? '得势' : '失势', [0, 1, 3].map(i => [p4[i][0], [de, se].includes(elOf[p4[i][0]])])]);
    eq('得气一张：年、日、时三支上日主的十二长生，气盛的垫底色；三支都盛算得气，都衰算失气', [sdV('得气'), sdTiles('得气')], [nSheng === 3 ? '得气' : nSheng === 0 ? '失气' : '有盛有衰', qiZ.map(([z, st]) => [z, st, STG.indexOf(st) < 5])]);
    const sd0 = ['得令', '得地', '得势', '得气'].map(nm => { click(sdCard(nm).querySelector('[data-x]')); const r = [txt($('sheet-t')).split(' · ')[0], [...$('sheet-b').querySelectorAll('.lb')].map(txt).includes('典籍')]; ev('closeSheet()'); return r; });
    eq('四张卡片的标题都能点开，每张都有「典籍」一段', sd0, ['得令', '得地', '得势', '得气'].map(nm => [nm, true]));
    // 八字一页右边列出四柱之间的关系：和干支关系一页原局的小签逐条相同（data-x 一样），点开的解释也一样
    const relKeys = id => [...$(id).querySelectorAll('[data-x]')].map(b => b.dataset.x), bzRel = $('bz-rel-g').querySelector('[data-x]') || $('bz-rel-z').querySelector('[data-x]');
    const bzOpen = bzRel ? (click(bzRel), [txt($('sheet-t')), ev('sel.x') === bzRel.dataset.x]) : null; ev('closeSheet()');
    eq('八字一页右边列出四柱之间的关系，和干支关系一页原局的小签逐条相同，点开是同一条解释', [relKeys('bz-rel-g'), relKeys('bz-rel-z'), bzOpen], [relKeys('rel-ng'), relKeys('rel-nz'), bzRel ? [ev(`X(${JSON.stringify(bzRel.dataset.x)}).t`), true] : null]);
    eq('用神那一排每一项都能点开，标题对得上，定了的都有「依据」一段', ys0, (yW === null ? ['用神'] : ['用神', '喜神', '忌神', '仇神', '闲神']).map(nm => [nm, true]));
    // 十神表第一列的合称
    // 十神表第一列的合称
    const first = [...d.querySelectorAll('#gods tr')].map(tr => txt(tr.cells[0]));
    eq('十神表的第一列在五种关系后面写着合称，点开的标题里有它包含的两个十神', [first, GRPS.map((g, i) => ev(`X('grp|${i}').t`))], [['同我', '我生', '我克', '克我', '生我'].map((r, i) => r + GRPS[i]), ['比劫 · 比肩和劫财', '食伤 · 食神和伤官', '财才 · 正财和偏财', '官杀 · 正官和七杀', '印绶 · 正印和偏印']]);
  }
  // 根和透的表：八个天干对八个地支，每一格拿藏干表另算一遍
  {
    const cs = JSON.parse(ev('JSON.stringify(cols().map(c=>[c.k,c.g,c.z]))')), rowsWant = cs.slice(DYN).concat(cs.slice(0, DYN).reverse());
    const hid = JSON.parse(ev('JSON.stringify(HID)')), elOf = JSON.parse(ev('JSON.stringify(Object.fromEntries(G.split("").map(g=>[g,gEl(g)])))'));
    const want = rowsWant.map(([rk, g]) => cs.map(([ck, , z]) => { const i = hid[z].split('').findIndex(h => elOf[h] === elOf[g]); return i < 0 ? '' : [`gt|${rk}|${ck}`, hid[z][i], i === 0 ? '本气' : '', hid[z][i] === g ? '透' : ''].join(' '); }));
    const trs = [...d.querySelectorAll('#gtmap tbody tr')];
    const got = trs.map(tr => [...tr.cells].slice(1).map(td => { const b = td.querySelector('[data-x]'); return b ? [b.dataset.x, txt(b.querySelector('i')), b.classList.contains('ben') ? '本气' : '', b.classList.contains('tou') ? '透' : ''].join(' ') : ''; }));
    eq('根和透：八行八列，每一格的藏干、是不是本气、是不是透，和另算的一致', got, want);
    eq('根和透：格子里的小字和淡底、圈说的是同一件事', trs.flatMap(tr => [...tr.querySelectorAll('.gt-c')]).filter(b => { const s = b.querySelector('small'), t = s ? txt(s) : ''; return t.includes('本气') !== b.classList.contains('ben') || t.includes('透') !== b.classList.contains('tou'); }).map(b => b.dataset.x), []);
    eq('根和透：行名是八个天干，原局的四个在上面；表头是八个地支和它们的藏干', [trs.map(tr => txt(tr.cells[0].querySelector('[data-x]'))), [...d.querySelectorAll('#gtmap .zrow th')].slice(1).map(th => txt(th.querySelector('[data-x]')) + ' ' + txt(th.querySelector('small')))], [rowsWant.map(r => r[1]), cs.map(c => c[2] + ' ' + hid[c[2]])]);
    eq('根和透：日主那一行在原局四支里的根，和日主一页「根」一行数的相同', got[2].slice(DYN).filter(Boolean).length, ev('roots().length'));
  }
  // 宫位表（原局最后一页「六亲」的下半）：一列一柱，八行。干支、五行能量、和别的柱、配的亲属、空亡，都拿另算的结果对照
  {
    const G10 = '甲乙丙丁戊己庚辛壬癸', Z12 = '子丑寅卯辰巳午未申酉戌亥', K4 = ['年', '月', '日', '时'];
    const ps4 = JSON.parse(ev('JSON.stringify(NATAL.map(p=>[p.g,p.z]))')), hid = JSON.parse(ev('JSON.stringify(HID)'));
    const godOf = JSON.parse(ev('JSON.stringify(Object.fromEntries(G.split("").map(g=>[g,god(g)])))')), elOf = JSON.parse(ev('JSON.stringify(Object.fromEntries(G.split("").map(g=>[g,gEl(g)])))'));
    const gw = $('gwmap'), trs = [...gw.querySelectorAll('tbody tr')], rowOf = name => [...trs.find(tr => txt(tr.cells[0]) === name).cells].slice(1);
    eq('宫位：四列是年柱、月柱、日柱、时柱，八行依次是配谁、干支、十神、配的亲属、和别的柱、十二长生、空亡、五行能量', [[...gw.querySelectorAll('thead th')].slice(1).map(txt), trs.map(tr => txt(tr.cells[0])), rowOf('干支').map(txt)], [K4.map(k => k + '柱'), ['配谁', '干支', '十神', '配的亲属', '和别的柱', '十二长生', '空亡', '五行能量'], ps4.map(x => x[0] + x[1])]);
    // 干支成对出现的地方点开是这一柱合起来的解释（gz|），不拆成天干、地支两条。2026-11-18 用户说「干支一同出现的时候，直接解读干支」
    {
      const c8 = JSON.parse(ev('JSON.stringify(cols().map(c=>[c.k,c.g,c.z,!!c.dyn]))')), zEl = JSON.parse(ev('JSON.stringify(Object.fromEntries(Z.split("").map(z=>[z,zEl(z)])))'));
      const UP = ['上下同属', '天干生地支', '天干克地支', '地支克天干', '地支生天干'], cell = (name, i) => txt(rows[name][i]);
      eq('宫位表的干支一行：每一柱一个按钮，点开是这一柱合起来的解释；标题的四柱、「现在选中的四层」的干支也是', [rowOf('干支').map(td => [...td.querySelectorAll('[data-x]')].map(n => n.dataset.x).join(' ')), [...$('title').querySelectorAll('[data-x]')].map(n => [n.dataset.x, txt(n)].join(' ')), [...$('layers').querySelectorAll('[data-x]')].map(n => [n.dataset.x, txt(n)].join(' '))],
        [K4.map(k => 'gz|' + k), ps4.map((x, i) => `gz|${K4[i]} ${x[0]}${x[1]}`), c8.slice(0, DYN).reverse().map(c => `gz|${c[0]} ${c[1]}${c[2]}`)]);
      const gzBad = c8.map(([k, g, z, dyn], i) => {
        const r = ev(`X(${JSON.stringify('gz|' + k)})`), P0 = Object.fromEntries(r.p.map(x => [x[0], strip(x[1])])), n60 = [...Array(60).keys()].find(n => G10[n % 10] === g && Z12[n % 12] === z);
        const root = hid[z].split('').some(h => elOf[h] === elOf[g]), xk = cell('空亡', i);
        const ok = r.t === `${dyn ? k : k + '柱'} · ${g}${z}` && r.p[0][0] === '含义' && P0['含义'].includes(UP[(zEl[z] - elOf[g] + 5) % 5])
          && P0['根和自坐'].includes(`十二长生是${cell('自坐', i)}`) && P0['根和自坐'].includes(root ? '这一支上有根' : '这一支上没有根')
          && P0['对日主'].includes(k === '日' ? '日主自己' : godOf[g]) && P0['对日主'].includes(godOf[hid[z][0]])
          && P0['纳音'].startsWith(cell('纳音', i)) && P0['旬和空亡'].includes(`第 ${n60 + 1} 个`) && P0['旬和空亡'].includes(`${xk[0]}、${xk[1]}`);
        return ok ? '' : k + JSON.stringify(P0);
      }).filter(Boolean);
      eq('一柱合起来的解释：上下的生克照五行另算，自坐、纳音、空亡和细盘那几行相同，有没有根照藏干另数，十神和六十甲子里的序号另算', gzBad, []);
    }
    // 五行能量：每一柱天干 5 分、地支 8 分，月支加倍；四柱加起来是 60 分，各行的分数和「五行」一页相同
    const mvW = { 干: {}, 支: {} }; JSON.parse(ev('JSON.stringify(huaNow().moves)')).forEach(m => { mvW[m.pos][m.i] = m.to; });      // 合化成立的字改记到化神
    const nlWant = ps4.map((x, i) => { const sum = [0, 0, 0, 0, 0]; sum[mvW.干[i] ?? elOf[x[0]]] += 5; JSON.parse(ev(`JSON.stringify(nlOf(${JSON.stringify(x[1])}))`)).forEach(([h, n]) => { sum[mvW.支[i] ?? elOf[h]] += i === 1 ? n * 2 : n; }); return sum; });
    const de = ev('gEl(DM)'), se = (de + 4) % 5, five = s => ['木', '火', '土', '金', '水'].map((e, i) => s[i] ? `${e} ${s[i]} 分` : '').filter(Boolean).join('、');
    eq('宫位：每一柱在五行能量里的分数，和照分值另算的一致；四柱加起来就是「五行」一页的五个数', [rowOf('五行能量').map(txt), [0, 1, 2, 3, 4].map(e => nlWant.reduce((a, s) => a + s[e], 0))], [nlWant.map(s => { const t = s.reduce((a, b) => a + b, 0), h = s[de] + s[se]; return `${t} 分：${five(s)}帮日主的 ${h} 分，其余 ${t - h} 分`; }), JSON.parse(ev('JSON.stringify(nlNow().sum)'))]);      // 合化改记以后的
    // 和别的柱：原局的每一条关系，涉及几柱就在几柱下面各出现一次
    const relWant = {}; JSON.parse(ev(`JSON.stringify(relations(NATAL).map(r=>[['rel',r.t,r.c,r.n,r.where.join('、'),r.top,r.grp].join('|'),r.inst]))`)).forEach(([key, inst]) => inst.forEach(ks => ks.forEach(k => { relWant[k + ' ' + key] = (relWant[k + ' ' + key] || 0) + 1; })));
    const relGot = {}; rowOf('和别的柱').forEach((td, i) => td.querySelectorAll('[data-x^="rel|"]').forEach(b => { const id = K4[i] + ' ' + b.dataset.x; relGot[id] = (relGot[id] || 0) + 1; }));
    eq('宫位：「和别的柱」里列的就是原局的那些关系，每一条在它涉及的每一柱下面各出现一次', Object.entries(relGot).sort(), Object.entries(relWant).sort());
    // 配的亲属：照六亲表，这位亲属看的十神在不在配他的那一柱里。日柱只看日支
    const male = !!ev('P.gender'), KIN = { 年: [], 月: [['父亲', '偏财'], ['母亲', '正印'], ['兄弟姐妹', '比肩']], 日: male ? [['妻子', '正财']] : [['丈夫', '正官']], 时: male ? [['儿子', '七杀'], ['女儿', '正官']] : [['儿子', '食神'], ['女儿', '伤官']] };
    const kinWant = K4.map((k, i) => KIN[k].map(([who, gd]) => { const at = (k !== '日' && godOf[ps4[i][0]] === gd ? [`${k}干${ps4[i][0]}`] : []).concat(hid[ps4[i][1]].split('').filter(h => godOf[h] === gd).map(h => `${k}支${ps4[i][1]}里的${h}`)); return `${who}看${gd}：${at.length ? '在这一柱，' + at.join('、') : '不在这一柱'}`; }).join('') || '六亲表里没有配祖上的十神');
    eq('宫位：「配的亲属」一行，每位亲属看的十神在不在这一柱，和另算的一致', rowOf('配的亲属').map(txt), kinWant);
    // 空亡：一柱所在的旬剩下的两个地支。照六十甲子另算
    const xk = (g, z) => { let n = 0; while (n % 10 !== G10.indexOf(g) || n % 12 !== Z12.indexOf(z)) n++; const s = n - n % 10; return Z12[(s + 10) % 12] + Z12[(s + 11) % 12]; };
    const xkD = xk(ps4[2][0], ps4[2][1]), xkY = xk(ps4[0][0], ps4[0][1]);
    eq('宫位：「空亡」一行，落没落在日柱、年柱查出的空亡里，和照六十甲子另算的一致', rowOf('空亡').map(txt), ps4.map((x, i) => { const f = []; if (i !== 2 && xkD.includes(x[1])) f.push(`日柱查出的${xkD}`); if (i !== 0 && xkY.includes(x[1])) f.push(`年柱查出的${xkY}`); return f.length ? `${x[1]}落在${f.join('和')}里` : `${x[1]}没有落空`; }));
    // 计分一页的计分表：原局、大运、流年、流月、流日、合计
    const layers = JSON.parse(ev('JSON.stringify(cols().slice(0,4).reverse().map(c=>[c.k,c.g,c.z]))'));
    const lay = layers.map(([k, g, z]) => { const sum = [0, 0, 0, 0, 0]; sum[elOf[g]] += 5; JSON.parse(ev(`JSON.stringify(nlOf(${JSON.stringify(z)}))`)).forEach(([h, n]) => { sum[elOf[h]] += n; }); return { k, gz: g + z, sum }; });
    const nat = [0, 1, 2, 3, 4].map(e => nlWant.reduce((a, s) => a + s[e], 0)), all = [{ k: '原局', gz: '', sum: nat }].concat(lay);
    let accH = 0, accT = 0;
    const syWant = all.map((r, i) => { const t = r.sum.reduce((a, b) => a + b, 0), h = r.sum[de] + r.sum[se], p = i ? '+' : ''; accH += h; accT += t; return [r.k + r.gz].concat(r.sum.map(v => v ? p + v : ''), [p + h, p + (t - h), Math.round(accH / accT * 100) + '%']); });
    const totS = [0, 1, 2, 3, 4].map(e => all.reduce((a, r) => a + r.sum[e], 0)), totT = totS.reduce((a, b) => a + b, 0), totH = totS[de] + totS[se];
    syWant.push(['合计'].concat(totS.map(v => v ? String(v) : ''), [String(totH), String(totT - totH), Math.round(totH / totT * 100) + '%']));
    eq('大运流年：原局、大运、流年、流月、流日各带来的分数，两组分数和累计的占比，都和照分值另算的一致；外来的四层每层 13 分，表里不列每层的合计', [[...$('sy').rows].map(tr => [...tr.cells].map(txt)), lay.every(r => r.sum.reduce((a, b) => a + b, 0) === 13), [...$('sy-h').querySelectorAll('th')].length], [syWant, true, 9]);
    eq('大运流年：每一行点开，「怎么加的」里各笔加起来就是这一行的合计', layers.map(([k]) => { const r = JSON.parse(ev(`JSON.stringify(X('nly|${k}'))`)), ns = (r.p.find(x => x[0] === '怎么加的')[1].match(/ (\d+) 分/g) || []).map(x => parseInt(x, 10)); return ns.slice(0, -1).reduce((a, b) => a + b, 0) === 13 && ns[ns.length - 1] === 13 && /带来的分数 · 13 分$/.test(r.t); }), [true, true, true, true]);
    // 图：每一段是一种五行，长短照分数（flex 的值），先后是印绶、比劫、食伤、财才、官杀；帮日主的两行和后面三行之间留一道缝
    const ELCN = ['wood', 'fire', 'earth', 'metal', 'water'], order = [se, de, (de + 1) % 5, (de + 2) % 5, (de + 3) % 5];
    const segs = el => [...el.querySelectorAll('i')].filter(i => !i.classList.contains('tk')).map(i => [ELCN.find(c => i.classList.contains(c)), +(i.getAttribute('style').match(/flex:(\d+)/) || [])[1], i.classList.contains('gap')]);
    const segWant = sum => { let helped = false, gapped = false; return order.map((e, j) => { if (!sum[e]) return null; const gap = j >= 2 && helped && !gapped; if (j < 2) helped = true; if (gap) gapped = true; return [ELCN[e], sum[e], gap]; }).filter(Boolean); };
    // 选择器里每张小卡底下一条：这一柱 13 分里喜用（不定时是帮日主的一组）的分数，一段一种五行，后面写着分数。原来是计分一页的四排柱子
    const pillarSum = gz => { const sum = [0, 0, 0, 0, 0]; sum[elOf[gz[0]]] += 5; JSON.parse(ev(`JSON.stringify(nlOf(${JSON.stringify(gz[1])}))`)).forEach(([h, n]) => { sum[elOf[h]] += n; }); return sum; };
    const tier = ev('qsNow().tier'), want = tier === '强' ? [(de + 1) % 5, (de + 2) % 5, (de + 3) % 5] : tier === '弱' ? [se, de] : JSON.parse(ev('JSON.stringify(xiNow().xi)'));      // 小卡的条照扶抑的喜用；强弱居中的照用神取，那几行在上面另算核对过
    const dys = JSON.parse(ev('JSON.stringify(P.dayun.map(d=>[d.gz,d.y0,d.y1]))')), sdy = ev('sel.dy'), sy0 = ev('sel.y'), sm0 = ev('sel.m'), sd0 = ev('sel.d');
    const mbOf = b => { const m = b.querySelector('.mb'); return m ? { v: txt(m.querySelector('b')), seg: [...m.querySelectorAll('.mb-fill i')].map(i => [ELCN.find(c => i.classList.contains(c)), +(i.getAttribute('style').match(/flex:(\d+)/) || [])[1]]), w: m.querySelector('.mb-fill').getAttribute('style') } : null; };
    const mbWant = gz => { const s = pillarSum(gz), v = want.reduce((a, e) => a + s[e], 0); return { v: String(v), seg: want.filter(e => s[e]).map(e => [ELCN[e], s[e]]), w: `width:${(v / 13 * 100).toFixed(1)}%` }; };
    const pkRow = id => [...$(id).querySelectorAll('.pk')];
    const yearsOf = k => { const out = []; for (let y = dys[k][1]; y <= dys[k][2]; y++) out.push(y); return out; };
    const days = JSON.parse(ev('JSON.stringify(monthDays(sel.y,sel.m))'));
    eq('选择器的小卡：八步大运每一步底下一条，长短是这一柱 13 分里喜用的分数，一段一种五行，后面写着分数', pkRow('dayun').map(mbOf), dys.map(([gz]) => mbWant(gz)));
    eq('选择器的小卡：这步大运里的每一年', pkRow('liunian').map(mbOf), yearsOf(sdy).map(y => mbWant(ev(`yearGZ(${y})`))));
    eq('选择器的小卡：这一年的十二个月', pkRow('liuyue').map(mbOf), [...Array(12).keys()].map(m => mbWant(ev(`monthGZ(${sy0},${m})`))));
    eq('选择器的小卡：这个月的每一天', pkRow('liuri').map(mbOf), days.map(t => mbWant(ev(`dayGZ(${t})`))));
    // 换一步大运，流年那一排的小卡和条跟着换成那一步里的各年；再换回来
    const otherDy = (sdy + 1) % dys.length;
    click($('dayun').querySelector(`[data-dy="${otherDy}"]`));
    eq('换一步大运，流年那一排的小卡和条跟着换成那一步里的各年', pkRow('liunian').map(mbOf), yearsOf(otherDy).map(y => mbWant(ev(`yearGZ(${y})`))));
    click($('dayun').querySelector(`[data-dy="${sdy}"]`)); click($('liunian').querySelector(`[data-y="${sy0}"]`)); click($('liuyue').querySelector(`[data-m="${sm0}"]`));
    if ($('liuri').querySelector(`[data-d="${sd0}"]`)) click($('liuri').querySelector(`[data-d="${sd0}"]`));
    eq('换回原来选中的那一天以后，四层都和一开始一样', [ev('sel.dy'), ev('sel.y'), ev('sel.m'), ev('sel.d')], [sdy, sy0, sm0, sd0]);
    // 小卡底下的条能点开这一柱的明细，不换选择：各笔加起来 13 分，喜用的分数和条上写的一样，五行和十神各列一遍，和原局的关系写明不计分；点小卡别的地方才换选择
    const yb2 = pkRow('liunian').find(b => b.dataset.y !== String(sy0)), ygz = ev(`yearGZ(${yb2.dataset.y})`), selBefore = [ev('sel.dy'), ev('sel.y'), ev('sel.m'), ev('sel.d')];
    click(yb2.querySelector('.mb'));
    const pkSh = () => txt($('sheet-t')), pkP = l => { const n = [...$('sheet-b').querySelectorAll('p')].find(p => txt(p.querySelector('.lb')) === l); return n ? txt(n.querySelector('.tx')) : ''; };
    const pkHow = (pkP('怎么分').match(/ (\d+) 分（/g) || []).map(s => parseInt(s, 10)), pkWant = mbWant(ygz);
    eq('点流年小卡底下的条：打开这一柱的明细，选择不变；各笔加起来 13 分，标题和「喜用」里的分数就是条上的数，五行、十神、和原局各有一段', [!$('sheet').hidden, pkSh().startsWith(ygz + '年'), pkSh().endsWith(` ${pkWant.v} 分`), [ev('sel.dy'), ev('sel.y'), ev('sel.m'), ev('sel.d')], pkHow.reduce((a, b) => a + b, 0), pkP('喜用').includes(`占 ${pkWant.v} 分`) || (pkWant.v === '0' && pkP('喜用').includes('一分也没有')), !!pkP('五行') && !!pkP('十神'), pkP('和原局').includes('这些都不改分数'), yb2.querySelector('.mb').classList.contains('on')], [true, true, true, selBefore, 13, true, true, true, true]);
    // 明细里「照用神」一行：用神、喜神、忌神、仇神、闲神五项加起来 13 分，「合起来」是用神加喜神；用神取了印和比劫两类的，说它们就是帮日主的一组；用神不定的盘没有这一行
    const ysLine = pkP('照用神'), ysN = [...ysLine.matchAll(/(用神|喜神|忌神|仇神|闲神)(.) (\d+) 分/g)].map(m => [m[1], +m[3]]), ysSum = (ysLine.match(/合起来 (\d+) 分/) || [])[1], yN = JSON.parse(ev('JSON.stringify(yongNow())'));
    const pairHelpW = !!yN.pair && tier === '间';      // 强弱居中、用神是两类：喜用就是照用神取的这两类
    eq('小卡的明细里「照用神」一行：五项加起来 13 分，用神和喜神合起来的数对得上；用神是两类时列两类、合起来的数对得上，强弱居中而用神是两类时说就是上面的喜用；用神不定时没有这一行',
      pairHelpW ? ysLine.includes('两类，就是上面的喜用') : yN.pair ? [ysN.map(x => x[0]), +ysSum === ysN[0][1] + ysN[1][1]] : yN.yong === null ? ysLine : [ysN.map(x => x[0]), ysN.reduce((a, x) => a + x[1], 0), +ysSum === ysN[0][1] + ysN[1][1]],
      pairHelpW ? true : yN.pair ? [['用神', '用神'], true] : yN.yong === null ? '' : [['用神', '喜神', '忌神', '仇神', '闲神'], 13, true]);
    click(yb2.querySelector('.mb'));
    ok('再点一次同一条，明细收起', $('sheet').hidden);
    click(pkRow('liunian').find(b => b.dataset.y === yb2.dataset.y).querySelector('.gz'));
    eq('点小卡上面的干支：换到这一年', ev('sel.y'), +yb2.dataset.y);
    click($('liunian').querySelector(`[data-y="${sy0}"]`)); click($('liuyue').querySelector(`[data-m="${sm0}"]`));
    if ($('liuri').querySelector(`[data-d="${sd0}"]`)) click($('liuri').querySelector(`[data-d="${sd0}"]`));
    // 选择器图例里的三个按钮：扶抑的喜用（默认）、用神和喜神、两种相加。换成用神，小卡底下的条只算用神和喜神那两行（用神取了印和比劫两类的，算这两类）；
    // 两种相加，条是两种分数的和，满分 26。用神定了才能照用神，扶抑的喜用和用神都定了才能相加；强弱未定的盘选着相加，照用神画。试完换回扶抑
    const ysBtn = $('sy-lg').querySelector('[data-map="yun:ys"]'), sumBtn = $('sy-lg').querySelector('[data-map="yun:sum"]'), canYs = yN.yong !== null || !!yN.pair, canSum = canYs;      // 扶抑的喜用每张盘都有（强弱居中照偏弱取），用神也每张盘都有
    const pressedYun = () => [...$('sy-lg').querySelectorAll('[data-map]')].map(b => b.getAttribute('aria-pressed'));
    eq('「用神和喜神」用神定了才能点；「两种相加」扶抑的喜用和用神都定了才能点', [ysBtn.disabled, sumBtn.disabled], [!canYs, !canSum]);
    if (canYs) {
      click(ysBtn);
      const ysEls = yN.yong !== null ? [(de + yN.yong) % 5, (de + yN.shen.xi) % 5] : yN.pair.map(k => (de + k) % 5), ysName = yN.yong !== null ? '用神和喜神' : '用神';
      const ysWant = gz => { const s2 = pillarSum(gz), v = ysEls.reduce((a, e) => a + s2[e], 0); return { v: String(v), seg: ysEls.filter(e => s2[e]).map(e => [ELCN[e], s2[e]]), w: `width:${(v / 13 * 100).toFixed(1)}%` }; };
      eq('按「用神和喜神」：八步大运的条只算用神和喜神那两行（用神是两类时算这两类），按钮按下，图例换成这两行', [pkRow('dayun').map(mbOf), pressedYun(), txt($('sy-lg')).includes(ysName)], [dys.map(([gz]) => ysWant(gz)), ['false', 'true', 'false'], true]);
      click(pkRow('dayun')[0].querySelector('.mb'));
      eq('照用神时点小卡的条：明细头一段讲用神，另一段对照扶抑', [txt($('sheet-t')).includes(ysName), !!pkP(ysName), !!pkP('照扶抑')], [true, true, true]);
      ev('closeSheet()');
      if (!canSum) {      // 强弱未定：扶抑取不了喜用，选着「两种相加」照用神画
        ev("MAPBY.yun='sum';renderDynamic()");
        eq('强弱未定的盘选着「两种相加」：照用神画，按下的是「用神和喜神」', [pkRow('dayun').map(mbOf), pressedYun()], [dys.map(([gz]) => ysWant(gz)), ['false', 'true', 'false']]);
      } else {
      const [uW, sW] = ysEls;
      click($('sy-lg').querySelector('[data-map="yun:sum"]'));
      // 两种相加：分数是扶抑的喜用分加上用神和喜神的分（同一种五行两种都算的算两遍），条的满分 26；前一段扶抑、后一段用神和喜神，后一段的第一格前面空一道缝
      const mbCut = b => { const o = mbOf(b), is = [...b.querySelectorAll('.mb-fill i')]; return Object.assign(o, { cut: is.findIndex(i => i.classList.contains('cut')) }); };
      const sumWant = gz => { const s2 = pillarSum(gz), fyS = want.filter(e => s2[e]).map(e => [ELCN[e], s2[e]]), ysS = [uW, sW].filter(e => s2[e]).map(e => [ELCN[e], s2[e]]), a = want.reduce((t, e) => t + s2[e], 0), b = s2[uW] + s2[sW];
        return { v: String(a + b), seg: fyS.concat(ysS), w: `width:${((a + b) / 26 * 100).toFixed(1)}%`, cut: fyS.length && ysS.length ? fyS.length : -1, ab: [a, b] }; };
      const sw = dys.map(([gz]) => sumWant(gz)), noAb = o => { const { ab, ...r } = o; return r; };
      eq('按「两种相加」：八步大运的条是扶抑的喜用分加上用神和喜神的分，满分 26，两种之间空一道缝；按钮按下，图例写着满分 26；选的记在浏览器里',
        [pkRow('dayun').map(mbCut), [...$('sy-lg').querySelectorAll('[data-map]')].map(b => b.getAttribute('aria-pressed')), txt($('sy-lg')).includes('满分 26'), JSON.parse(ev("localStorage.getItem('bz-map')")).yun],
        [sw.map(noAb), ['false', 'false', 'true'], true, 'sum']);
      eq('两种相加时，流年、流月、流日三排的分数也是两种的和', [pkRow('liunian'), pkRow('liuyue'), pkRow('liuri')].map(r => r.map(b => txt(b.querySelector('.mb b')))),
        [yearsOf(sdy).map(y => sumWant(ev(`yearGZ(${y})`)).v), [...Array(12).keys()].map(m => sumWant(ev(`monthGZ(${sy0},${m})`)).v), days.map(t => sumWant(ev(`dayGZ(${t})`)).v)]);
      click(pkRow('dayun')[0].querySelector('.mb'));
      // 两种取的五行一样（same）时，头一段只列一遍分数，说相加就是算两遍；不一样时两种各列一遍，两种都算的五行写明算了两遍
      const sp = pkP('两种相加'), spAb = [...sp.matchAll(/它们(?:占 (\d+) 分|一分也没有)/g)].map(m => +(m[1] || 0)), dupE = want.filter(e => e === uW || e === sW).filter(e => pillarSum(dys[0][0])[e]);
      const same = want.length === 2 && want.every(e => e === uW || e === sW), a0 = sw[0].ab[0];
      const sumLine = same ? (a0 ? sp.includes(`这 ${a0} 分算两遍，${sw[0].v} 分`) : sp.includes('两种相加也是 0 分')) : sp.includes(`加起来 ${sw[0].v} 分`) && sp.includes('算了两遍') === dupE.length > 0;
      eq('两种相加时点小卡的条：标题是两种的和；头一段两种各几分、加起来几分，两种都算的五行写明算了两遍，写明相加是页面自己的做法；另有「照用神」一段；排名照相加的分数',
        [txt($('sheet-t')).endsWith(`两种相加 ${sw[0].v} 分`), spAb, sumLine, sp.includes('页面自己的做法'), !!pkP('照用神'), pkP('在这一排').includes(`最高 ${Math.max(...sw.map(o => +o.v))} 分`)],
        [true, same ? [a0] : sw[0].ab, true, true, true, true]);
      ev('closeSheet()');
      eq('两种相加时，计分一页的解读、说明和四层的读法都照相加的分数写',
        [txt($('rd-tr')).includes(`选中的${dys[sdy][0]}运 ${sw[sdy].v} 分`), txt($('rd-tr')).includes('两种分数加起来'), txt($('note-syfig')).includes('满分 26'), txt($('note-sy')).includes('两种分数相加'), txt($('layers')).includes(`两种相加 ${sw[sdy].v} 分`),
          [txt($('rd-tr')), txt($('note-syfig'))].map(t => t.includes('翻一倍'))],
        [true, true, true, true, true, [same, same]]);
      }
      click($('sy-lg').querySelector('[data-map="yun:fy"]'));
      eq('按回「扶抑的喜用」：条回到扶抑', pkRow('dayun').map(mbOf), dys.map(([gz]) => mbWant(gz)));
    }
    eq('选择器在排盘那张卡片里，就在标签栏上面；四排柱子已经去掉', [$('card-pan').contains($('dayun')), ($('liuri').compareDocumentPosition($('h-pan')) & 4) === 4, !!$('trend'), d.querySelectorAll('.tb').length], [true, true, false, 0]);
    // 计分表里大运、流年、流月、流日每一行的名字点开是这一柱的明细：各笔加起来 13 分、每一笔写着十神、在这一排里排第几；四层之间没有一字不差的段落
    const dynK = ['大运', '流年', '流月', '流日'], shs = dynK.map(k => JSON.parse(ev(`JSON.stringify(X('nly|${k}'))`)));
    const how0 = shs[0].p.find(p => p[0] === '怎么加的')[1], ns0 = (how0.match(/ (\d+) 分（/g) || []).map(s => parseInt(s, 10));
    const v0 = +mbWant(dys[sdy][0]).v, rank0 = 1 + dys.filter(([g]) => +mbWant(g).v > v0).length, pos0 = (shs[0].p.find(p => p[0] === '在这一排') || [])[1] || '';
    eq('计分表里点「大运」：各笔加起来是 13 分，每一笔都写着十神，写着它在八步里排第几', [ns0.reduce((a, b) => a + b, 0), ns0.length === (how0.match(/（[^）]+）/g) || []).length, pos0.startsWith(`八步大运里排第${ev(`ordCn(${rank0})`)}`)], [13, true, true]);
    eq('计分表里四层的明细之间没有一字不差的段落', shs[0].p.map(p => p[1]).filter(t => shs.every(sh => sh.p.some(p => p[1] === t))), []);
    // 强弱计分的条：原局的 60 分，两道竖线在 25 分和 30 分；宫位每一柱的小条照这一柱的分数
    const qg = $('qs').querySelector('.qg'), hp = nat[de] + nat[se], w = (hp / 60 * 100).toFixed(2) + '%';
    eq('强弱计分的条：涂色到这张盘的分数，两段是印和比劫各自的分数；两道竖线在 60 分里的 25 分和 30 分；分数标在涂色的末端', [qg.querySelector('.qg-fill').getAttribute('style'), [...qg.querySelectorAll('.qg-fill i')].map(i => [ELCN.find(c => i.classList.contains(c)), +(i.getAttribute('style').match(/flex:(\d+)/) || [])[1]]), [...qg.querySelectorAll('.qg-tk')].map(t => t.getAttribute('style')), qg.querySelector('.qg-v').getAttribute('style') + ' ' + txt(qg.querySelector('.qg-v'))], [`width:${w}`, [se, de].filter(e => nat[e]).map(e => [ELCN[e], nat[e]]), ['left:41.67%', 'left:50.00%'], `left:${w} ${hp} 分`]);
    eq('宫位里每一柱的小条：各段照这一柱的分数，条的宽度照这一柱的合计（月柱 21 分最宽）', rowOf('五行能量').map(td => [segs(td.querySelector('.stk')), td.querySelector('.stkw').getAttribute('style')]), nlWant.map(s2 => [segWant(s2), `width:${Math.round(s2.reduce((a, b) => a + b, 0) / 21 * 100)}%`]));
  }
  { // 格局组合（十神一页最下面）
    const gj = JSON.parse(ev('JSON.stringify(gjzNow())'));
    eq('格局组合：表里一行一个有的组合，没有的并在「这张盘没有」一行里，最后一行指向从格', [[...$('gjz').querySelectorAll('tr:not(.gjz-h):not(.gjz-no) th[scope=row] .x')].map(txt), [...$('gjz').querySelectorAll('.gjz-no .x')].map(txt)],
      [gj.list.filter(o => o.st !== '无').map(o => o.n), gj.list.filter(o => o.st === '无').map(o => o.n).concat('从格')]);
    eq('格局组合：分数就是十神表「能量」那一种，十个十神逐个相同，加起来 55 分', [gj.E, Object.values(gj.E).reduce((a, b) => a + b, 0)],
      [JSON.parse(ev("JSON.stringify((()=>{const v=godVals('nl'),o={};GODS.forEach(g=>{o[g]=0;});Object.entries(v).forEach(([h,n])=>{o[god(h)]+=n;});return o;})())")), 55]);
    const st2 = JSON.parse(ev(`JSON.stringify((()=>{const G2={食伤:['食神','伤官'],财:['正财','偏财'],印:['正印','偏印'],比劫:['比肩','劫财'],正官:['正官'],七杀:['七杀'],伤官:['伤官'],食神:['食神'],偏印:['偏印']};
      const tou=k=>NATAL.some(p=>!p.day&&G2[k].includes(god(p.g))), ben=k=>NATAL.some(p=>G2[k].includes(god(HID[p.z][0]))), has=k=>tou(k)||ben(k);
      const pairs={食伤制杀:['食伤','七杀'],杀印相生:['七杀','印'],伤官配印:['印','伤官'],官印相生:['正官','印'],食伤生财:['食伤','财'],比劫制财:['比劫','财'],贪财坏印:['财','印'],伤官见官:['伤官','正官'],枭神夺食:['偏印','食神']};
      return Object.entries(pairs).map(([n,[a,b]])=>[n,tou(a)&&tou(b)?'透':has(a)&&has(b)&&(tou(a)||tou(b))?'藏':'无']);})())`));
    eq('格局组合：九个两边的组合，照「两边都透出记透出，一边透出、一边只在地支本气里记藏着，其余不算」另算一遍，结果相同', st2.map(([n]) => [n, gj.list.find(o => o.n === n).st]), st2);
    const yc = JSON.parse(ev('JSON.stringify(yongNow().cat)'));
    ok('用神的五类分数都不是负数，加起来 55（不算日主自己那一笔，合化了也一样）', yc.every(n => n >= 0) && yc.reduce((a, b) => a + b, 0) === 55, yc);
    ok('格局组合：食伤制杀和七杀无制不会同时出现', !(gj.list.find(o => o.n === '食伤制杀').st !== '无' && gj.list.find(o => o.n === '七杀无制').st !== '无'));
    const first = $('gjz').querySelector('th[scope=row] .x') || $('gjz').querySelector('.gjz-no .x');
    click(first);
    const gp = l => !![...$('sheet-b').querySelectorAll('p')].find(p => txt(p.querySelector('.lb')) === l);
    eq('格局组合：点组合的名字，解释里有这张盘、怎么查、和格局、典籍、名词、注意，头三段是含义、为什么算成格或者败格、这张盘', [!$('sheet').hidden, ['这张盘', '怎么查', '和格局', '典籍', '名词', '注意'].map(gp), [...$('sheet-b').querySelectorAll('p .lb')].slice(0, 3).map(txt).map(x => x.replace(/为什么算(成|败)格/, '为什么'))], [true, [true, true, true, true, true, true], ['含义', '为什么', '这张盘']]);
    ev('closeSheet()');
    // 成败救应：一行一条；两张表一次只显示一张，上面两个小标签切换
    const gb = JSON.parse(ev("JSON.stringify(gjbNow().rows.map(o=>({id:o.id,ok:o.ok,hw:GJB_HW[o.id]})))"));
    eq('成败救应：表里这张盘归的格的每一条各一行，写着合、不合或者定不了，书里的话下面是一句直白的解释',
      [...$('gjb').querySelectorAll('th[scope=row]')].map(th => [th.querySelector('.x').dataset.x, txt(th.querySelector('small')), txt(th.parentNode.querySelector('.gjz-st'))]),
      gb.map(o => ['gjb|' + o.id, o.hw, o.ok === null ? '定不了' : o.ok ? '合' : '不合']));
    eq('格局组合：组合名字下面是一句直白的解释', [...$('gjz').querySelectorAll('tr:not(.gjz-h):not(.gjz-no) th[scope=row] small')].map(txt), gj.list.filter(o => o.st !== '无').map(o => o.hua));
    click($('gjb').querySelector('th[scope=row] .x'));
    eq('成败救应：点书里的话，解释的头四段是含义、字面的意思、这一格、这张盘，后面有原文、名词、怎么查、注意', [!$('sheet').hidden, [...$('sheet-b').querySelectorAll('p .lb')].slice(0, 4).map(txt), ['原文', '名词', '怎么查', '注意'].map(gp)], [true, ['含义', '字面的意思', '这一格', '这张盘'], [true, true, true, true]]);
    const segNow = () => [...$('gj-seg').querySelectorAll('button')].map(b => [txt(b), b.getAttribute('aria-pressed')]);
    const seg0 = [segNow(), $('gjb-block').hidden, $('gjz-block').hidden];
    click($('gj-seg').querySelector('[data-map="gj:gjz"]'));
    const seg1 = [segNow(), $('gjb-block').hidden, $('gjz-block').hidden, $('sheet').hidden];
    click($('gj-seg').querySelector('[data-map="gj:gjb"]'));
    eq('格局一页的两张表一次显示一张：上面两个小标签「成败救应」「格局组合」，一开始是成败救应；点「格局组合」换成另一张，打开着的成败救应的解释收起；再点回来',
      [seg0, seg1, [$('gjb-block').hidden, $('gjz-block').hidden]],
      [[[['成败救应', 'true'], ['格局组合', 'false']], false, true], [[['成败救应', 'false'], ['格局组合', 'true']], true, false, true], [false, true]]);
    ev('closeSheet()');
  }
  const fixed = ['meta', 'meta-yun', 'bz', 'rd-bz', 'quad', 'kv', 'kv-qr', 'note-gjz', 'rd-gj', 'kv-gj', 'kv2', 'xi', 'note-qr', 'rd-qr', 'qs', 'sy-lg', 'note-syfig', 'foot', 'note-yun', 'note-wx', 'note-sk', 'note-lq', 'note-gt', 'note-nl', 'note-gw', 'note-sy', 'rd-gw', 'rd-pan', 'rd-yun', 'rd-tr', 'rd-rel', 'rd-rel2', 'rd-wx', 'rd-tk', 'rd-gods', 'rd-ys', 'rd-lq', 'rd-gt'].filter(k => !txt($(k)) || BAD.test(txt($(k))));
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
  const ROW_ALIAS = { 主星: '十神' };          // 事实文件是照排盘软件抄的，那里把天干的十神一行叫主星
  Object.keys(F.rows || {}).forEach(label => eq(label, rows[ROW_ALIAS[label] || label].slice(DYN).map(txt), F.rows[label]));
  if (F.dayun) eq('大运八步', [...$('dayun').children].map(b => txt(b.querySelector('.gz'))), F.dayun);
  // 事实文件里每行写的是「含藏干数（只数盘面的个数）」，页面上这两个数分在两块里
  if (F.bars) { const wxF = m => { click($('wx-seg').querySelector(`[data-map="wx:${m}"]`)); return [...$('wxt').querySelectorAll('.wn b')].map(txt); }, cntN = wxF('cnt'), faceN = wxF('face'); wxF('nl'); eq('五行个数', cntN.map((x, i) => `${x}（${parseInt(faceN[i], 10)}）`), F.bars); }
  if (F.shensha) { const extra = ev('SS_EXTRA');      // 事实是照问真抄的，问真没有的六厄、病符、隔角不算
    eq('神煞（问真没有的六厄、病符、隔角不算）', rows['神煞'].slice(DYN).map(td => [...td.querySelectorAll('[data-x]')].map(txt).filter(n => !extra.includes(n)).sort()), F.shensha.map(a => [...a].sort())); }
  Object.keys(F.meta || {}).forEach(k => {
    const dt = [...d.querySelectorAll('#meta dt, #meta-yun dt')].find(x => txt(x) === k);
    ok(`顶部信息 · ${k}`, !!dt && txt(dt.nextElementSibling).includes(F.meta[k]), dt ? txt(dt.nextElementSibling) : '没有这一行');
  });
  Object.keys(F.rel || {}).forEach(k => sameSet(`原局关系 ${k}`, rels(k), F.rel[k]));
  (F.steps || []).forEach(s => {
    click($('dayun').querySelector(`[data-dy="${s.dy}"]`));
    if (s.y) click($('liunian').querySelector(`[data-y="${s.y}"]`));
    const at = `第 ${s.dy + 1} 步大运` + (s.y ? ` ${s.y} 年` : '');
    if (s.cols) { const r = tableRows(); eq(`${at}：流年、大运两列`, [DYN - 2, DYN - 1].map(i => txt(r['天干'][i]) + txt(r['地支'][i])), s.cols); }
    Object.keys(s.eq || {}).forEach(k => sameSet(`${at}：${k}`, rels(k), s.eq[k]));
    Object.keys(s.has || {}).forEach(k => ok(`${at}：${k} 里有 ${s.has[k].join('、')}`, s.has[k].every(x => rels(k).includes(x)), rels(k)));
  });
});

// 检查当前页面上每一个可点的解释。后面几节都要用。
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

// ---------- 3b. 几张虚构的盘 ----------
console.log('几张虚构的盘');
{
  const keep = ev('sel.p');
  const withChart = (info, f) => { ev(`PEOPLE.push(chartOf(${JSON.stringify(info)}));usePerson(PEOPLE.length-1);`); const r = f(); ev(`PEOPLE.pop();usePerson(${keep});`); return r; };
  // 强弱计分 26 到 29 分：强弱居中，喜用照用神取（2026-11-17 起，原来不定喜用）。这一张是 28 分（癸酉 壬戌 己卯 己巳），
  // 克泄耗三类里食神和伤官最重，注里没讲，用神借身强的两条取食神和伤官（金）。选择器小卡底下的条照扶抑画的就是用神和喜神的分，每一柱都照分值另算
  const r26 = withChart({ id: 't26', name: '二八', gender: '男', birth: '1993-10-25 10:00', lon: 120 }, () => JSON.parse(ev(`JSON.stringify((()=>{const x=xiNow(), de=gEl(DM), help=[3,4];      // 己土日主借身强的两条：比肩和劫财比印重，用神是食神和伤官（金，3），金 14 分有余，喜神是它所生的水（4）

    const want=gz=>(help.includes(gEl(gz[0]))?5:0)+nlOf(gz[1]).reduce((a,[h,n])=>a+(help.includes(gEl(h))?n:0),0);
    return {help:x.help, xi:x.xi, yong:[yongNow().yong,yongNow().borrow,yongSay().includes('页面照身强的两条取')], page:[...document.querySelectorAll('#dayun .mb b')].map(b=>+b.textContent), want:P.dayun.map(d=>want(d.gz)), lg:document.getElementById('sy-lg').textContent,
      btn:[...document.querySelectorAll('#sy-lg [data-map]')].map(b=>b.getAttribute('aria-pressed')+(b.disabled?' 不能点':''))};})())`)));
  ev("MAPBY.yun='fy';renderDynamic()");
  eq('强弱居中的虚构盘（强弱计分 26 到 29 分）：食神和伤官最重，用神借身强的两条取食神和伤官；喜用照用神取，是用神金和喜神水；八步大运小卡底下的分数和照分值另算的一致；三个按钮都能点',
    [r26.help >= 26 && r26.help <= 29, r26.xi, r26.yong, r26.page, r26.lg.includes('喜用（扶抑）'), r26.btn], [true, [3, 4], [1, true, true], r26.want, true, ['true', 'false', 'false']]);
  // 强弱未定的盘照任铁樵「两停」「均敌」那一句取用神（2026-11-17 用户说「照这个补」）。三张虚构的盘：
  // 甲辰 乙亥 丙子 癸巳，28 分，正官和七杀 24 分最重，取食神和伤官（土），土 6 分不足，喜神是生它的火；
  // 戊午 辛酉 壬午 丁未，26 分，正财和偏财 17 分最重，取印和比劫两类（金、水），分不出喜神；照用神画的条就是帮日主的分；
  // 甲戌 己巳 辛亥 己亥，28 分，正财和偏财、正官和七杀都是 11 分，照注里先说的官杀那一条取食神和伤官（水），水 10 分不足，喜神金
  const midOf = info => withChart(info, () => JSON.parse(ev(`JSON.stringify((()=>{const y=yongNow(), at=k=>{MAPBY.yun=k;renderDynamic();return {mode:yunBasis().mode,mb:[...document.querySelectorAll('#dayun .mb b')].map(b=>+b.textContent),
      btn:[...document.querySelectorAll('#sy-lg [data-map]')].map(b=>b.getAttribute('aria-pressed')+(b.disabled?' 不能点':''))};};
    const r={pillars:P.pillars.join(' '),help:qsNow().help,yong:y.yong,pair:y.pair,blocks:[...document.querySelectorAll('#xi .qx')].map(n=>n.querySelector('span').textContent+' '+n.querySelector('b').textContent),
      say:yongSay(),basis:X('ys|用神').p.find(p=>p[0]==='依据')[1],xi:X('ys|喜神').p.find(p=>p[0]==='这张盘')[1],fy:at('fy'),ys:at('ys'),sum:at('sum')};MAPBY.yun='fy';renderDynamic();return r;})())`)));
  const mT = midOf({ id: 'tmt', name: '两停', gender: '男', birth: '1964-11-23', shichen: '巳' }), mJ = midOf({ id: 'tmj', name: '均敌', gender: '男', birth: '1978-09-17', shichen: '未' }), mB = midOf({ id: 'tmb', name: '并列', gender: '男', birth: '1994-05-25', shichen: '亥' });
  const ting = ev('Q.tc_ting[1]'), BTN_YS = ['false', 'true', 'false'], BTN_SUM = ['false', 'false', 'true'], addUp = m => m.sum.mb.join() === m.fy.mb.map((v, k) => v + m.ys.mb[k]).join();
  eq('强弱居中、官杀最重（两停）：用神取食神和伤官（土），喜神火、忌神水、仇神木、闲神金；喜用照用神取，是土和火，忌是水和木；喜忌一页照全称转述，点开的依据里是原文；三个按钮都能点，相加是两种的和',
    [mT.pillars, mT.help, mT.yong, mT.pair, mT.blocks, mT.say.includes('日主和正官、七杀势均力敌，用食神和伤官。'), mT.basis.includes(ting), mT.fy.btn, mT.ys.mode, mT.ys.btn, mT.sum.mode, mT.sum.btn, addUp(mT)],
    ['甲辰 乙亥 丙子 癸巳', 28, 1, null, ['喜用 土火', '忌 水木', '用神 土', '喜神 火', '忌神 水', '仇神 木', '闲神 金'], true, true, ['true', 'false', 'false'], 'ys', BTN_YS, 'sum', BTN_SUM, true]);
  eq('强弱居中、财最重（均敌）：用神取印和比劫两类（金、水），一块里两种五行，和扶抑照偏弱取的喜用是同样两行；照全称转述那一条；喜神写两类分不出；照用神画的条和照扶抑的一样',
    [mJ.pillars, mJ.help, mJ.yong, mJ.pair, mJ.blocks, mJ.say.includes('日主和正财、偏财势均力敌，用正印、偏印和比肩、劫财。'), mJ.basis.includes(ting), mJ.xi.includes('两类用神分不出来'), mJ.ys.mode, mJ.ys.btn, mJ.ys.mb.join() === mJ.fy.mb.join()],
    ['戊午 辛酉 壬午 丁未', 26, null, [4, 0], ['喜用 金水', '忌 木火土', '用神 金水'], true, true, true, 'ys', BTN_YS, true]);
  eq('强弱居中、财和官杀一样重：照注里先说的官杀那一条取食神和伤官，写明一样重、照先说的取；三个按钮都能点',
    [mB.pillars, mB.help, mB.yong, mB.pair, mB.blocks, mB.say.includes('一样重，照注里先说的那一条，按正官和七杀最重算'), mB.ys.mode, mB.sum.mode, mB.fy.btn],
    ['甲戌 己巳 辛亥 己亥', 28, 1, null, ['喜用 水金', '忌 火土', '用神 水', '喜神 金', '忌神 火', '仇神 土', '闲神 木'], true, 'ys', 'sum', ['true', 'false', 'false']]);
  // 化气格照任铁樵以化神为体（2026-11-17）：1988-10-16 巳时是《千里命稿》外格篇甲己化土的那副四柱，土有余，用神金、喜神土；
  // 2011-10-15 申时戊癸化火，火正好 12 分算不足，用神是木和火两类。两张都身弱，扶抑的喜用照日干取，所以三个按钮都能点
  const hT = midOf({ id: 'tht', name: '化土', gender: '男', birth: '1988-10-16', shichen: '巳' }), hH = midOf({ id: 'thh', name: '化火', gender: '男', birth: '2011-10-15', shichen: '申' });
  const tcHua = ev('Q.tc_hua[1]');
  eq('化气格、化神有余（甲己化土）：用神取土所生的金，喜神土、忌神木、仇神火、闲神水；扶抑的喜用仍照日干取；依据里是任铁樵讲化格的原文；三个按钮都能点',
    [hT.pillars, hT.yong, hT.pair, hT.blocks, hT.say.includes('化土') && hT.say.includes('算有余'), hT.basis.includes(tcHua), hT.sum.mode, hT.sum.btn],
    ['戊辰 壬戌 甲辰 己巳', 3, null, ['喜用 水木', '忌 火土金', '用神 金', '喜神 土', '忌神 木', '仇神 火', '闲神 水'], true, true, 'sum', ['false', 'false', 'true']]);
  eq('化气格、化神不足（戊癸化火，正好 12 分）：用神取生火的木和火自己两类，分不出喜神；正好 12 分写「没有超过」；能相加',
    [hH.pillars, hH.yong, hH.pair, hH.blocks, hH.say.includes('12 分，没有超过五行平均的 12 分，算不足'), hH.xi.includes('两类用神分不出来'), hH.sum.mode, hH.sum.btn],
    ['辛卯 戊戌 癸卯 庚申', null, [1, 2], ['喜用 金水', '忌 木火土', '用神 木火'], true, true, 'sum', ['false', 'false', 'true']]);
  // ---- 2026-11-17 内容审阅 C1、C2、C5、C3，都用虚构的出生时间 ----
  // C1：年柱、月柱看出生的那一刻在交节之前还是之后，不跟着经度变；日柱、时柱照真太阳时。2026 年立春是北京时间 2 月 4 日 04:02:08
  const jieOf = (birth, lon) => JSON.parse(ev(`JSON.stringify((c=>[c.pillars.join(' '),c.pillarsClock.slice(0,2).join(' '),c.prevJie.name,c.prevJie.min,c.yun.forward,c.dayun[0].gz])(chartOf({id:'tj',name:'交节',gender:'男',birth:${JSON.stringify(birth)},lon:${lon}})))`));
  eq('交节前后：立春后一分钟出生，东经 87.62、120、135 度都排丙午年庚寅月，时柱照各地的真太阳时，大运从同一个月柱排起；立春前一分钟排乙巳年己丑月',
    [jieOf('2026-02-04 04:03:08', 87.62), jieOf('2026-02-04 04:03:08', 120), jieOf('2026-02-04 04:03:08', 135), jieOf('2026-02-04 04:01:08', 135)],
    [['丙午 庚寅 己酉 乙丑', '丙午 庚寅', '立春', 1, true, '辛卯'], ['丙午 庚寅 己酉 丙寅', '丙午 庚寅', '立春', 1, true, '辛卯'], ['丙午 庚寅 己酉 丙寅', '丙午 庚寅', '立春', 1, true, '辛卯'], ['乙巳 己丑 己酉 丙寅', '乙巳 己丑', '小寒', 42457, false, '戊子']]);
  const jqOf = lon => withChart({ id: 'tjq', name: '交节', gender: '男', birth: '2026-02-04 04:03:08', lon }, () => { const r = JSON.parse(ev(`JSON.stringify(X('meta|节气').p)`)); return [r.find(x => x[0] === '这张盘')[1].includes('页面拿出生的那一刻去比'), (r.find(x => x[0] === '注意') || ['', ''])[1]]; });
  const jq1 = jqOf(87.62), jq2 = jqOf(135);
  eq('节气一行：真太阳时落在立春另一边的，写明页面照出生的那一刻排；真太阳时也在立春之后的没有这一段', [jq1[0], jq1[1].includes('真太阳时是 2 月 4 日 1:39，落在立春之前'), jq1[1].includes('年柱丙午、月柱庚寅'), jq2], [true, true, true, [true, '']]);
  // C2：大运照交运的那一天认。2000-01-01 午时的男命 2008 年 3 月 12 日起运：这一天以前还没起运，2018 年 3 月 12 日才交第二步
  const dyT = withChart({ id: 'tdy', name: '起运', gender: '男', birth: '2000-01-01', shichen: '午' }, () => JSON.parse(ev(`JSON.stringify((()=>{
    const at=(dy,y,m,t)=>{sel.dy=dy;sel.y=y;sel.m=m;sel.d=t;renderDynamic();const n=document.getElementById('note-dy');return [sel.d===t,n.hidden,n.textContent];};
    return {start:P.yun.start,at:[[2008,2,11],[2008,2,12],[2018,2,11],[2018,2,12],[2088,2,12]].map(a=>dyAt(Date.UTC(...a))),
      now:[NOW_DY===(dyAt(TODAY)>=0&&dyAt(TODAY)<P.dayun.length?dyAt(TODAY):-1),[...document.querySelectorAll('#dayun .pk')].findIndex(b=>b.classList.contains('now'))===NOW_DY],
      a:at(0,2008,0,Date.UTC(2008,1,10)),b:at(0,2008,1,Date.UTC(2008,2,12)),c:at(1,2018,0,Date.UTC(2018,1,10)),note:document.getElementById('note-yun').textContent};})())`)));
  eq('大运照交运的那一天认：起运日以前是 -1，起运日当天是第一步，十年后的同一天换第二步；「当前」那枚印照今天实际所在的那一步',
    [dyT.start, dyT.at, dyT.now], [[2008, 3, 12], [-1, 0, 0, 1, 8], [true, true]]);
  eq('选中的日子不在选中的那一步大运里：选择器下面说一句，还没起运和还在上一步各有说法；在这一步里的不显示；下面的说明写着起运的日子',
    [dyT.a, dyT.b, dyT.c[0], dyT.c[1], dyT.c[2].includes('还在上一步乙亥运里，2018 年 3 月 12 日才交甲戌运'), dyT.note.includes('2008 年 3 月 12 日起运')],
    [[true, false, '选中的 2008 年 2 月 10 日还没有起运，2008 年 3 月 12 日才交第一步乙亥运。下面各页的大运一列仍是选中的乙亥运。'], [true, true, ''], true, false, true, true]);
  // C5：伤官见官。日主属金的另核对金水伤官见官的三条（生在秋冬、天干有财或印、伤官和正官不并透）；要看强弱的条件，强弱居中时写定不了
  const sgOf = ps => JSON.parse(ev(`JSON.stringify((()=>{const ps=${JSON.stringify(ps.split(' '))}.map((s,i)=>({k:'年月日时'[i],g:s[0],z:s[1],day:i===2}));const r=gjzOf(ps[2].g,ps),o=r.list.find(x=>x.n==='伤官见官');
    return [o.st,o.ext.map(e=>e[1]),o.jinOk,Object.fromEntries(r.list.filter(x=>x.ext.some(e=>e[1]===null)).map(x=>[x.n,x.ext.map(e=>e[1])]))];})())`));
  eq('伤官见官：《子平真诠》「论伤官」举的戊申、甲子、庚午、丁丑，金水伤官见官的三条都合；丁丑、癸卯、庚午、丙子生在春天、没有财印、伤官和正官并透，三条都不合；日主不属金的只有一条',
    [sgOf('戊申 甲子 庚午 丁丑').slice(0, 3), sgOf('丁丑 癸卯 庚午 丙子').slice(0, 3), sgOf('甲子 壬申 己亥 辛未').slice(0, 3)], [['藏', [false, true, true, true], true], ['透', [false, false, false, false], false], ['藏', [true], null]]);
  eq('格局组合里要看强弱的条件：强弱计分在 25 分和 30 分之间时是定不了（null），不写合或不合', sgOf('己卯 丙子 戊午 甲寅')[3], { 食伤制杀: [null, true, false, false], 杀印相生: [null], 伤官配印: [true, null], 食伤生财: [null] });
  const sgX = withChart({ id: 'tsg', name: '金水', gender: '男', birth: '1968-12-26', shichen: '丑' }, () => JSON.parse(ev(`JSON.stringify([P.pillars.join(' '),X('gjz|伤官见官').p.filter(x=>['书里的条件','金水伤官'].includes(x[0]))])`)));
  eq('金水伤官见官的盘点开：条件逐条写合不合，后面一句照《子平真诠》说结果；另有一段引三句原文',
    [sgX[0], sgX[1].map(x => x[0]), sgX[1][0][1].endsWith('日主属金，后三条都合，照《子平真诠》这张盘的伤官见官不算败。'), ['zp_sg_tiao', 'zp_sg_qiu', 'zp_sg_guan'].every(k => sgX[1][1][1].includes(ev(`Q.${k}[1]`)))],
    ['戊申 甲子 庚午 丁丑', ['书里的条件', '金水伤官'], true, true]);
  // C3：用神那一类字原局里一分也没有的，照实说没有（内容审阅举的例子：帮日主的一组 26 分，官杀 18 分最重，食神和伤官 0 分）
  const z0 = withChart({ id: 'tz0', name: '零分', gender: '男', birth: '2000-01-01', shichen: '寅' }, () => JSON.parse(ev(`JSON.stringify([P.pillars.join(' '),qsNow().help,yongNow().yong,yongNow().el[1],yongSay()])`)));
  eq('用神在原局里没有的盘：照样取出用神，写明原局里没有这一类字', [z0.slice(0, 4), z0[4].includes('原局里没有食神和伤官，算不足')], [['己卯 丙子 戊午 甲寅', 26, 1, 0], true]);
  // 同一对天干在原局有两处，一处落在日干上：解读里两处分开说，落在日干上的是日主，另一处是比肩
  const rr = withChart({ id: 'trel', name: '两克', gender: '男', birth: '1984-04-24', shichen: '巳' }, () => [ev('P.pillars.join(" ")'), strip(ev('readRel()'))]);
  eq('甲戊相克在年干和月干、年干和日干两处：解读里分开说，一处是七杀克比肩，一处是七杀克日主', [rr[0], rr[1].includes('年干和月干是七杀克比肩'), rr[1].includes('年干和日干是七杀克日主')], ['甲子 戊辰 戊子 丁巳', true, true]);
}

// ---------- 3c. 人物那一排调整先后 ----------
console.log('人物那一排调整先后');
if (ev('PEOPLE.filter(p=>!p.temp).length') < 3) console.log('  跳过  这个页面上不到三个人');
else {
  pick(0);
  const names = () => [...$('people').querySelectorAll('.pp[data-p]')].map(txt), before = names(), cur = ev('P.id');
  ok('人物那一排的名字上写着可以按住拖动、键盘上用 Alt 加左右方向键', [...$('people').querySelectorAll('.pp[data-p]')].every(b => /按住拖动/.test(b.title) && /Alt/.test(b.title)));
  ev('movePerson(0,2)');
  const after = names();
  eq('把第一位挪到第三位：这一排照新的先后画，选中的还是原来那一位', [after, ev('P.id'), ev('PEOPLE[sel.p].id'), txt($('people').querySelector('[aria-pressed="true"]'))], [[before[1], before[2], before[0], ...before.slice(3)], cur, cur, before[0]]);
  eq('新的先后按 id 记在浏览器里', JSON.parse(ev("localStorage.getItem('bz-order')")), JSON.parse(ev('JSON.stringify(PEOPLE.filter(p=>!p.temp).map(p=>p.id))')));
  ev("readOrder();rebuildPeople();usePerson(PEOPLE.findIndex(p=>p.id===localStorage.getItem('bz-person')))");
  eq('重新读一遍名单：照记下的先后排，选中的还是那一位', [names(), ev('P.id')], [after, cur]);
  const first = $('people').querySelector('.pp[data-p="0"]');
  first.focus(); first.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
  eq('焦点在名字上按 Alt 加右方向键：往后挪一位，焦点跟着这个名字', [names().slice(0, 2), txt(d.activeElement)], [[after[1], after[0]], after[0]]);
  eq('挪不出这一排：第一位不能再往前，最后一位不能再往后', [ev('movePerson(0,-1)'), ev('movePerson(PEOPLE.length-1,PEOPLE.length)')], [false, false]);
  ev("localStorage.removeItem('bz-order');readOrder();rebuildPeople();usePerson(0)");
  eq('清掉记下的先后，回到默认', names(), before);
}

// ---------- 3d. 生在国外的人：顶部信息写当地时间 ----------
console.log('生在国外的人');
{
  const ids = JSON.parse(ev('JSON.stringify(PEOPLE.filter(p=>p.localClock).map(p=>p.id))'));
  if (!ids.length) console.log('  跳过  这个页面上没有生在国外的人');
  else {
    const row = k => JSON.parse(ev(`JSON.stringify(metaRows().find(x=>x.k===${JSON.stringify(k)}))`));
    ids.forEach(id => {
      ev(`usePerson(PEOPLE.findIndex(p=>p.id===${JSON.stringify(id)}))`);
      const L = JSON.parse(ev('JSON.stringify(P.localClock)')), gl = row('公历'), zt = row('真太阳时');
      eq(`${ev('P.name')}：公历一行写当地时间，解释里写着换成北京时间是几点；真太阳时和当地钟表比`,
        [strip(gl.dd), strip(gl.p[0][1]).includes('换成北京时间是'), /当地钟表/.test(strip(zt.dd))], [`${L[0]} 年 ${L[1]} 月 ${L[2]} 日 ${L[3]}:${String(L[4]).padStart(2, '0')}（当地时间）`, true, true]);
    });
    eq('当地时间换成的北京时间，和照 tz 另算的一样（北京时间等于当地时间减去 tz 再加 8 小时，lmt 照经度算）', JSON.parse(ev(`JSON.stringify(PEOPLE.filter(p=>p.localClock).filter(p=>{const off=p.tz==='lmt'?Math.round(p.lon*240):Math.round(p.tz*3600), s=a=>Date.UTC(a[0],a[1]-1,a[2],a[3],a[4],a[5]);return s(p.clock)-s(p.localClock)!==(8*3600-off)*1000;}).map(p=>p.id))`)), []);
    if (ids.includes('steve-jobs')) {
      ev("usePerson(PEOPLE.findIndex(p=>p.id==='steve-jobs'))");
      eq('乔布斯：钟表上的 19:15 落在戌时，换成真太阳时进了酉时；经度修正照太平洋标准时间的西经 120 度算', [strip(row('真太阳时').p[2][1]).includes('钟表上的 19:15 本来落在戌时，换算之后进了酉时'), strip(row('真太阳时').p[1][1]).includes('基准经线（西经 120 度）')], [true, true]);
    }
    pick(0);
  }
}

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
  click($('theme')); const th1 = d.documentElement.dataset.theme, st1 = w.localStorage.getItem('bz-theme');
  click($('theme')); const th2 = d.documentElement.dataset.theme, st2 = w.localStorage.getItem('bz-theme');
  ok('右上角的按钮在浅色和深色之间换，选的那一种记在浏览器里', ['light', 'dark'].includes(th1) && ['light', 'dark'].includes(th2) && th1 !== th2 && st1 === th1 && st2 === th2 && $('theme').title === (th2 === 'dark' ? '换成浅色' : '换成深色'), [th1, th2, st1, st2]);
  delete d.documentElement.dataset.theme; w.localStorage.removeItem('bz-theme');
  ok('右上角有指向 GitHub 项目的链接，在新窗口打开', !!$('gh') && $('gh').getAttribute('href') === 'https://github.com/zhucongx/bazi-chart' && $('gh').getAttribute('target') === '_blank');
  click(byX('row|神煞'));
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('按 Esc 收起', $('sheet').hidden);
  if (people.length > 1) {
    const chips = () => [...d.querySelectorAll('#people [data-p]')];
    ok('每个人一个切换按钮', chips().length === people.length);
    click(byX('row|神煞'));
    click(chips()[1]);
    ok('换人后标题、选中状态跟着变，面板收起', $('sheet').hidden && chips()[1].getAttribute('aria-pressed') === 'true' && chips()[0].getAttribute('aria-pressed') === 'false' && (!expected[people[1]] || txt($('title')) === expected[people[1]].pillars.join('')));
    click(chips()[0]);
    ok('换回来', chips()[0].getAttribute('aria-pressed') === 'true' && (!expected[people[0]] || txt($('title')) === expected[people[0]].pillars.join('')));
  } else ok('只有一个人时只有一个切换按钮', d.querySelectorAll('#people [data-p]').length === 1);
}

// ---------- 4'. 解释卡片挪位置、点完按钮焦点还在 ----------
console.log('解释卡片和焦点');
pick(0);
{
  // 同一条解释挂在两个字上（八字一页年柱的十神和天干是同一个字）：点了一个再点另一个，卡片挪过去，不收起；再点同一个字才收起
  click($('h-bz')); ev('closeSheet()');
  const byKey = {}; d.querySelectorAll('#p-bz [data-x]').forEach(n => (byKey[n.dataset.x] = byKey[n.dataset.x] || []).push(n));
  const pair = Object.values(byKey).find(a => a.length >= 2);
  click(pair[0]); click(pair[1]);
  const moved = !$('sheet').hidden && ev('anchorOf(sel.x,sel.xn)') === pair[1];
  click(pair[1]);
  eq('同一条解释挂在两个字上：点了一个再点另一个，卡片挪到后一个字旁边；再点同一个字才收起', [!!pair, moved, $('sheet').hidden], [true, true, true]);
  // 选择器、人物这几排按钮点了以后整排重画，焦点放回新的同一个按钮上，不掉到页面上
  const yb = d.querySelector('#liunian .pk[aria-pressed="false"]'), yv = yb.dataset.y;
  yb.focus(); click(yb);
  const ya = d.activeElement, yOk = ya !== yb && ya.dataset.y === yv && !!ya.closest('#liunian');      // 点人物会再把这一排重画一遍，所以先记下
  const pb = d.querySelector('#people .pp[data-p="1"]') || d.querySelector('#people .pp[data-p="0"]'), pv = pb.dataset.p;
  pb.focus(); click(pb);
  const pa = d.activeElement;
  eq('点流年的卡片、点人物以后整排重画，焦点放回新的同一张卡片、同一个人上', [yOk, pa.dataset.p === pv && !!pa.closest('#people')], [true, true]);
  pick(0);
}

// ---------- 4c. 标签栏 ----------
console.log('标签栏');
pick(0);
{
  const tabs = card => [...d.querySelectorAll(`#card-${card} [role="tab"]`)];
  const state = card => tabs(card).map(b => (b.getAttribute('aria-selected') === 'true' ? '选中' : '') + ($(b.getAttribute('aria-controls')).hidden ? '藏' : '显'));
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  eq('一开始两张卡片各显示第一页', [state('natal'), state('pan')], [['选中显', '藏', '藏', '藏', '藏', '藏', '藏', '藏'], ['选中显', '藏', '藏', '藏']]);
  click($('h-gods'));
  eq('点「十神」：只有这一页显示，另一张卡片不受影响', [state('natal'), state('pan')], [['藏', '藏', '藏', '藏', '选中显', '藏', '藏', '藏'], ['选中显', '藏', '藏', '藏']]);
  click($('h-gt'));
  eq('点「根和透」：排盘那张卡片换到这一页', state('pan'), ['藏', '藏', '选中显', '藏']);
  eq('翻到哪一页记在浏览器里', w.localStorage.getItem('bz-tabs'), 'gods,gt');
  key($('h-gods'), 'ArrowRight');
  eq('焦点在标签上按右方向键，换到下一页：十神的下一页是格局', state('natal'), ['藏', '藏', '藏', '藏', '藏', '选中显', '藏', '藏']);
  key($('h-ys'), 'End');
  eq('按 End 到最后一页：原局的最后一页是六亲', state('natal'), ['藏', '藏', '藏', '藏', '藏', '藏', '藏', '选中显']);
  key($('h-lq'), 'ArrowRight');
  eq('到了最后一页再按右方向键，回到第一页', state('natal'), ['选中显', '藏', '藏', '藏', '藏', '藏', '藏', '藏']);
  key($('h-bz'), 'ArrowLeft');
  eq('第一页按左方向键，到最后一页', state('natal'), ['藏', '藏', '藏', '藏', '藏', '藏', '藏', '选中显']);
  click($('h-tk'));
  // 打开的解释：所指的字在换下去的那一页里就收起；在另一张卡片里的不受影响
  const cell = d.querySelector('#gtmap .gt-c');
  click(cell);
  ok('点根和透的一个格子，打开解释并高亮', !$('sheet').hidden && cell.classList.contains('on') && /的根 · /.test(txt($('sheet-t'))), txt($('sheet-t')));
  click($('h-wx'));
  ok('换原局那张卡片的页，排盘里打开的解释还在', !$('sheet').hidden);
  click($('h-pan'));
  ok('换掉它所在的那一页，解释收起', $('sheet').hidden);
  click($('h-tk')); click(byX('kv|日主')); click($('h-rel'));
  ok('反过来也一样：原局里打开的解释，不因为排盘换页而收起', !$('sheet').hidden);
  click($('h-wx')); click($('h-tk')); click($('h-pan'));
  ok('换回日主那一页以后解释是收起的', $('sheet').hidden && ev('sel.tab.natal') === 'tk' && ev('sel.tab.pan') === 'pan');
  if (people.length > 1) {
    click($('h-ys')); click($('h-rel'));
    click(d.querySelectorAll('#people [data-p]')[1]);
    eq('换人以后还停在原来翻到的那一页', [ev('sel.tab.natal'), ev('sel.tab.pan'), $('p-ys').hidden, $('p-rel').hidden], ['ys', 'rel', false, false]);
    click(d.querySelectorAll('#people [data-p]')[0]);
    click($('h-tk')); click($('h-pan'));
  }
}

// ---------- 4z. 页面图标 ----------
console.log('页面图标');
{
  // 三个图标都内联成 data: 网址，页面仍然是单个文件：32 像素的 PNG、SVG、苹果设备用的 180 像素 PNG
  const links = [...dom.window.document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => [l.getAttribute('rel'), l.getAttribute('sizes') || '', l.getAttribute('href').split(',')[0]]);
  eq('页面图标：三个 link 都是内联的 data: 网址，先是 32 像素的 PNG，再是 SVG，最后是苹果设备用的', links,
    [['icon', '32x32', 'data:image/png;base64'], ['icon', '', 'data:image/svg+xml;base64'], ['apple-touch-icon', '', 'data:image/png;base64']]);
  // 图标上的八卦照先天八卦排。卦画照朱熹《周易本义》的「八卦取象歌」：乾三连，坤六断，震仰盂，艮覆碗，离中虚，坎中满，兑上缺，巽下断；
  // 方位照先天图：乾南坤北，离东坎西，兑东南，震东北，巽西南，艮西北。图上南在上、东在左，每一卦靠里的是初爻。相对的两卦阴阳正好相反。
  // 每一卦照它的五行上色，照《梅花易数》卷一「八宫所属五行」：乾、兑，金；坤、艮，土；震、巽，木；坎，水；离，火。
  // 这几句 2026-11-17 对着维基文库的页面核对过，页面和版本号记在 docs/取法约定.md 的「页面图标」一节
  const href = dom.window.document.querySelector('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
  const svg = Buffer.from(href.split(',')[1], 'base64').toString('utf8');
  const GUA = { 乾: '111', 坤: '000', 震: '100', 艮: '001', 离: '101', 坎: '010', 兑: '110', 巽: '011' };      // 初爻、二爻、上爻，1 是阳爻
  const ANGLE = { 乾: 0, 巽: 45, 坎: 90, 艮: 135, 坤: 180, 震: 225, 离: 270, 兑: 315 };      // 从正上方起顺时针的度数
  const WXOF = { 乾: '金', 兑: '金', 坤: '土', 艮: '土', 震: '木', 巽: '木', 坎: '水', 离: '火' };
  const fills = {};
  const drawn = [...svg.matchAll(/<g data-gua="(.)"(?: transform="rotate\((\d+) 32 32\)")? fill="(#[0-9a-f]{6})">(.*?)<\/g>/g)].map(([, gua, deg, fill, body]) => {
    fills[gua] = fill;
    // 一道爻一个 path：阳爻是一整块，阴爻中间断开、是两块。起笔的 y 大的靠近中心，是初爻
    const yao = [...body.matchAll(/<path d="([^"]+)"/g)].map(p => [+(p[1].match(/^M[\d.]+ ([\d.]+)/) || [])[1], (p[1].match(/M/g) || []).length]);
    yao.sort((a, b) => b[0] - a[0]);
    return [gua, +(deg || 0), yao.map(y => y[1] === 1 ? '1' : y[1] === 2 ? '0' : '?').join('')];
  });
  eq('图标上的八卦：八个卦各一个，卦画和「八卦取象歌」相同，方位照先天八卦，靠里的是初爻', drawn, Object.keys(ANGLE).map(g => [g, ANGLE[g], GUA[g]]));
  ok('图标上相对的两卦阴阳正好相反（乾坤、震巽、坎离、艮兑）', drawn.length === 8 && drawn.every(([, a, code]) => { const o = drawn.find(x => x[1] === (a + 180) % 360); return o && [...code].every((c, i) => c !== o[2][i]); }));
  // 配色：同一种五行的卦同一种颜色，五种五行五种颜色；色相落在这种五行该有的那一段（火红、土赭、金黄、木绿、水蓝）
  const hue = c => { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); return d === 0 ? -1 : Math.round(60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4)); };
  const HUE = { 火: [0, 15], 土: [16, 35], 金: [36, 60], 木: [100, 170], 水: [190, 240] };
  const byWx = {}; Object.keys(WXOF).forEach(g => { (byWx[WXOF[g]] = byWx[WXOF[g]] || new Set()).add(fills[g]); });
  eq('图标上每一卦照它的五行上色：同一种五行一种颜色，五种颜色各不相同，色相和五行对得上',
    [Object.keys(fills).length, Object.keys(HUE).map(x => byWx[x] ? byWx[x].size : 0), new Set(Object.values(fills)).size, Object.keys(HUE).map(x => { const h = hue([...(byWx[x] || ['#000000'])][0] || '#000000'); return h >= HUE[x][0] && h <= HUE[x][1]; })],
    [8, [1, 1, 1, 1, 1], 5, [true, true, true, true, true]]);
  ok('内联的 SVG 里没有注释，带着 viewBox', !svg.includes('<!--') && svg.includes('viewBox="0 0 64 64"'));
}

// ---------- 4a. 零散的术语、城市经度表 ----------
console.log('术语和城市经度表');
pick(0);
{
  ok('点「乾造」或「坤造」有解释', !!byX('term|造') && !!ev("X('term|造')"));
  const cj = readJSON(path.join(ROOT, 'data', 'cities.json'), null);
  ok('data/cities.json 在', !!cj);
  if (cj) {
    eq('页面里的城市表和 data/cities.json 相同', ev('JSON.stringify(CITIES)'), JSON.stringify(cj.cities.map(c => [c.n, c.p, c.lon])));
    eq('城市的经度都在东经 73 到 136 度之间，名字没有重复，数目和文件里记的相同', [cj.cities.every(c => c.lon >= 73 && c.lon <= 136), new Set(cj.cities.map(c => c.n)).size === cj.cities.length, cj.cities.length], [true, true, cj.count]);
    eq('生成这张表时拿时区数据库里的坐标另外对过，相差都不超过 0.3 度', [cj.check.tz_pairs.length >= 3, cj.check.tz_pairs.every(x => x.diff <= 0.3)], [true, true]);
  }
}

// ---------- 4b. 在页面上添加、编辑、删除、导入 ----------
console.log('添加、编辑、删除、导入');
{
  const n0 = ev('PEOPLE.length');
  const fill = v => Object.keys(v).forEach(k => { $('pf-' + k).value = v[k]; });
  const submit = () => $('pform').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const stored = () => JSON.parse(w.localStorage.getItem('bz-people') || '[]');
  ok('一开始表单是收起的', $('pform').hidden && !!$('pp-add'));
  click($('pp-add'));
  ok('点「添加」打开表单', !$('pform').hidden);
  // 出生地：先选省份，再选城市
  const pickPlace = (p, c) => { $('pf-prov').value = p; $('pf-prov').dispatchEvent(new w.Event('change', { bubbles: true })); if (c !== undefined) { $('pf-city').value = c; $('pf-city').dispatchEvent(new w.Event('change', { bubbles: true })); } };
  const provs = JSON.parse(ev('JSON.stringify([...new Set(CITIES.map(c=>c[1]||c[0]))])'));
  eq('省份的列表就是城市表里出现的全部省份，一个不多一个不少，前面是「不填」，后面是「其他地方」', [[...$('pf-prov').options].map(o => o.value).filter(v => v && v !== '其他').sort(), $('pf-prov').options[0].value, $('pf-prov').options[$('pf-prov').options.length - 1].value], [provs.slice().sort(), '', '其他']);
  const cd = ev("(CITIES.find(c=>c[0]==='成都市')||[])[2]");
  pickPlace('四川省', '成都市');
  ok('选了四川省，城市里只列四川的；再选成都市，经度自动填上，并说明是按哪个城市取的', [...$('pf-city').options].every(o => ev(`(CITIES.find(c=>c[0]===${JSON.stringify(o.value)})||[])[1]`) === '四川省') && typeof cd === 'number' && Number($('pf-lon').value) === cd && !$('pf-lonhint').hidden && txt($('pf-lonhint')).includes('成都市'), [cd, $('pf-lon').value]);
  pickPlace('北京市');
  ok('直辖市只有它自己一项，经度跟着换', $('pf-city').options.length === 1 && $('pf-city').value === '北京市' && Number($('pf-lon').value) === ev("CITIES.find(c=>c[0]==='北京市')[2]"));
  $('pf-lon').value = '100'; pickPlace('其他');
  ok('选「其他地方」，可以自己写地名，经度不动，说明收起', !$('pf-place-l').hidden && $('pf-city').disabled && $('pf-lon').value === '100' && $('pf-lonhint').hidden);
  submit();
  ok('日期和时间没填时不保存，并给出提示', ev('PEOPLE.length') === n0 && !$('pform').hidden && !$('pf-msg').hidden && txt($('pf-msg')).length > 0, txt($('pf-msg')));
  fill({ name: '测试甲', gender: '男', date: '2000-01-01', time: '12:00' }); pickPlace('北京市'); $('pf-lon').value = '116.4';
  submit();
  ok('填好保存后多出一个人并选中，四柱和 lunar_python 排出的相同', ev('PEOPLE.length') === n0 + 1 && txt($('title')) === '己卯丙子戊午戊午' && ev('P.local') === true && $('pform').hidden, [ev('PEOPLE.length'), txt($('title'))]);
  ok('出生信息存进了浏览器，出生地是选的省份和城市', stored().length === 1 && stored()[0].birth === '2000-01-01 12:00' && stored()[0].lon === 116.4 && stored()[0].place === '北京市', stored());
  const before = checked;
  checkAll('新添加的人');
  ok(`新添加的人，${checked - before} 条解释都有内容`, checked > before && !bad.length, bad.slice(0, 3));
  click($('pp-edit'));
  ok('点「编辑这一位」，表单里是原来填的内容，省份和城市也认回来了', !$('pform').hidden && $('pf-name').value === '测试甲' && $('pf-date').value === '2000-01-01' && $('pf-time').value === '12:00' && $('pf-lon').value === '116.4' && $('pf-prov').value === '北京市' && $('pf-city').value === '北京市');
  fill({ time: '23:30', name: '测试乙' });
  submit();
  ok('改了时间保存，人数不变，时柱跟着变', ev('PEOPLE.length') === n0 + 1 && ev('P.name') === '测试乙' && txt($('title')) !== '己卯丙子戊午戊午' && stored().length === 1, txt($('title')));
  const msg = ev(`importText(${JSON.stringify(JSON.stringify([{ name: '导入的人', gender: '女', birth: '1993-10-10 09:30', place: '成都市', lon: 104.07, notes: { x: { 'g|年|癸': [['你的盘', '<b>手写的话</b><script>window.hacked=1</' + 'script><img src="x" onerror="window.hacked=2">']] } } }]))})`);
  ok('导入一个带手写解读的人，四柱和 lunar_python 排出的相同', ev('PEOPLE.length') === n0 + 2 && txt($('title')) === '癸酉壬戌甲子戊辰' && /导入了 1 个人/.test(msg), [msg, txt($('title'))]);
  const note = ev(`X('g|年|癸')`).p.find(p => p[0] === '你的盘');
  ok('手写解读显示出来了，夹带的脚本被去掉', !!note && note[1].includes('<b>手写的话</b>') && !/script|onerror|<img/i.test(note[1]) && ev('window.hacked') === undefined, note);
  eq('导入的是女命：六亲表里配偶看正官，子女看食神和伤官', [...d.querySelectorAll('#liuqin tr')].map(tr => txt(tr.cells[0]) + txt(tr.cells[1])).join(), '父亲偏财,母亲正印,兄弟姐妹比肩,丈夫正官,儿子食神,女儿伤官');
  // 导入 gen_data.py 生成的那种数据：一个排好的人。这里用上面那个虚构的出生时间，由页面自己排好再导回去。
  const ready = ev(`JSON.stringify({people:[chartOf({id:'x1',name:'排好的人',gender:'女',birth:'1993-10-10',shichen:'辰',place:'成都市'})]})`);
  const again = ev(`importText(${JSON.stringify(ready)})`);
  ok('导入排好的人（people.json 的格式）也可以；只知道时辰的，辰时排出来和上面 8 点多出生的四柱相同', ev('PEOPLE.length') === n0 + 3 && txt($('title')) === '癸酉壬戌甲子戊辰' && ev('P.shichen') === '辰' && byX('meta|时辰') && !byX('meta|真太阳时'), [again, txt($('title'))]);
  const kept = checked;
  checkAll('只知道时辰的人');
  ok(`只知道时辰的人，${checked - kept} 条解释都有内容`, checked > kept && !bad.length, bad.slice(0, 3));
  ok('文件不是 JSON、日期不对时，导入会说明原因', /不是 JSON/.test(ev(`importText('abc')`)) && /没有导入任何人/.test(ev(`importText('[{"name":"坏的","gender":"男","birth":"2001-02-30 10:00","lon":120}]')`)) && ev('PEOPLE.length') === n0 + 3);
  { // 编号叫 constructor、toString、__proto__ 的人：照样能导入、显示、存下来（审阅报告 R4）
    const ids = ['constructor', 'toString', '__proto__'];
    const msg = ev(`importText(${JSON.stringify(JSON.stringify(ids.map(id => ({ id, name: '编号' + id.slice(0, 4), gender: '男', birth: '2000-01-01', nohour: true }))))})`);
    eq('编号叫 constructor、toString、__proto__ 的人：导入、显示、存在浏览器里都正常', [/导入了 3 个人/.test(msg), ids.map(id => ev(`PEOPLE.some(p=>p.id===${JSON.stringify(id)})`)), ids.map(id => JSON.parse(ev("localStorage.getItem('bz-people')")).some(p => p.id === id))], [true, [true, true, true], [true, true, true]]);
    ev(`LOCAL=LOCAL.filter(x=>!${JSON.stringify(ids)}.includes(x.id));writeLocal();rebuildPeople();usePerson(0)`);
  }
  click($('pp-add'));
  fill({ name: '表单选时辰', gender: '女', date: '1993-10-10', time: '', shichen: '辰' });
  submit();
  ok('在表单里只选时辰也能保存，四柱相同，存下来的出生信息里没有时间和经度', ev('PEOPLE.length') === n0 + 4 && txt($('title')) === '癸酉壬戌甲子戊辰' && stored().some(x => x.name === '表单选时辰' && x.shichen === '辰' && x.birth === '1993-10-10' && x.lon === undefined), stored().map(x => x.name));
  click($('pp-edit'));
  ok('再点编辑，表单里还是选着时辰', $('pf-shichen').value === '辰' && $('pf-date').value === '1993-10-10' && $('pf-time').value === '');
  click($('pf-del'));
  click($('pf-del'));
  ev(`usePerson(PEOPLE.length-1)`);
  click($('pp-edit'));
  click($('pf-del'));
  ok('删除要点两次，第一次只是询问', ev('PEOPLE.length') === n0 + 3 && /确认/.test(txt($('pf-del'))));
  click($('pf-del'));
  ok('第二次点才删除', ev('PEOPLE.length') === n0 + 2 && $('pform').hidden && stored().length === 2);
  ev('LOCAL=[];writeLocal();rebuildPeople();usePerson(0)');
  ok('清掉之后回到页面自带的人', ev('PEOPLE.length') === n0 && stored().length === 0 && !$('pp-edit'));
  // 存过的出生地是旧的写法（只写城市、或者省份加城市），编辑时也认得出省份和城市
  eq('旧的出生地写法也认得出省份和城市', ['成都市', '四川省成都市', '成都', '台湾台北', '香港', '纽约'].map(s => JSON.stringify(ev(`placeSel(${JSON.stringify(s)})`))), ['{"p":"四川省","c":"成都市"}', '{"p":"四川省","c":"成都市"}', '{"p":"四川省","c":"成都市"}', '{"p":"台湾","c":"台北市"}', '{"p":"香港","c":"香港"}', '{"p":"其他","c":"","t":"纽约"}']);
  // 直接输入八字：认出四柱，在 1900 到 2100 年里找出四柱都对得上的日子，选一个保存
  click($('pp-add'));
  $('pf-mode').value = 'bazi'; $('pf-mode').dispatchEvent(new w.Event('change', { bubbles: true }));
  const typeBazi = v => { $('pf-bazi').value = v; $('pf-bazi').dispatchEvent(new w.Event('input', { bubbles: true })); };
  ok('换成「直接输入八字」，出生时间和出生地那几项收起，八字一项露出来', $('pf-date').closest('label').hidden && $('pf-prov').closest('label').hidden && $('pf-lon').closest('label').hidden && !$('pf-bazi').closest('label').hidden);
  typeBazi('甲丑 丙寅 戊辰 庚申'); const e1 = txt($('pf-dates'));
  typeBazi('甲子 戊寅 戊辰 庚申'); const e2 = txt($('pf-dates'));
  typeBazi('甲子 丙寅 戊辰 甲申'); const e3 = txt($('pf-dates'));
  typeBazi('甲子 丙寅'); const e4 = txt($('pf-dates'));
  ok('四柱有错时说明错在哪里：不成一柱、月干和年干对不上、时干和日干对不上、字数不够', /不成一柱/.test(e1) && /甲年的寅月是丙寅/.test(e2) && /戊日的申时是庚申/.test(e3) && /还差 4 个字/.test(e4), [e1, e2, e3, e4]);
  typeBazi('癸酉，壬戌，甲子，戊辰');
  const found = JSON.parse(ev('JSON.stringify(baziFound)'));
  ok('输入一副对得上的八字（中间夹着标点也行），列出 1900 到 2100 年里四柱都对得上的日子，里面有 1993 年 10 月 10 日辰时；每一个日子排出来的四柱都相同', found.some(x => x.birth === '1993-10-10' && x.shichen === '辰') && found.every(x => ev(`chartOf({id:'t',name:'t',gender:'女',birth:${JSON.stringify(x.birth)},shichen:${JSON.stringify(x.shichen)}}).pillars.join('')`) === '癸酉壬戌甲子戊辰') && $('pf-dates').querySelectorAll('input[type=radio]').length === found.length, found);
  $('pf-dates').querySelectorAll('input[type=radio]')[found.findIndex(x => x.birth === '1993-10-10')].checked = true;
  fill({ name: '输入八字', gender: '女' });
  submit();
  ok('选一个日子保存，四柱就是输入的那一副，存下来的是那一天和时辰，没有经度', txt($('title')) === '癸酉壬戌甲子戊辰' && $('pform').hidden && stored().some(x => x.name === '输入八字' && x.birth === '1993-10-10' && x.shichen === '辰' && x.lon === undefined), stored().map(x => x.name));
  ev('LOCAL=[];writeLocal();rebuildPeople();usePerson(0)');
  // 时辰不详：表单里选「不知道时辰」，存下来只有日期；标题下面一排十二个时辰，先按午时排，点哪个就按哪个排
  click($('pp-add'));
  fill({ name: '时辰不详', gender: '男', date: '1993-10-10', time: '', shichen: 'none' });
  submit();
  const nh = stored().find(x => x.name === '时辰不详');
  ok('选「不知道时辰」可以保存，存下来的只有日期，没有时辰和经度', !!nh && nh.nohour === true && nh.birth === '1993-10-10' && nh.shichen === undefined && nh.lon === undefined, nh);
  const hb = () => [...$('hours').querySelectorAll('[data-hour]')], pressed = () => ($('hours').querySelector('[aria-pressed="true"]') || {}).dataset;
  const pillarsAtHour = h => ev(`chartOf({id:'t',name:'t',gender:'男',birth:'1993-10-10',shichen:${JSON.stringify(h)}}).pillars.join('')`);
  ok('标题下面一排十二个时辰，先按午时排，标题里的时柱标着不详', !$('hours').hidden && hb().length === 12 && pressed().hour === '午' && txt($('title')) === pillarsAtHour('午') && !!$('title').querySelector('.pl.guess'), [hb().length, txt($('title'))]);
  const nhKept = checked; checkAll('时辰不详的人');
  ok(`时辰不详的人，${checked - nhKept} 条解释都有内容`, checked > nhKept && !bad.length, bad.slice(0, 3));
  click(hb()[0]);
  ok('点子时，四柱换成按子时排的，人还是这一位，存下来的出生信息不变', txt($('title')) === pillarsAtHour('子') && ev('P.name') === '时辰不详' && pressed().hour === '子' && JSON.stringify(stored().find(x => x.name === '时辰不详')) === JSON.stringify(nh), txt($('title')));
  const hsWant = '子丑寅卯辰巳午未申酉戌亥'.split('').map(h => ev(`(c=>qsOf(c.pillars[2][0],c.pillars.map((gz,j)=>({k:'年月日时'[j],g:gz[0],z:gz[1],day:j===2})),true).help)(chartOf({id:'t',name:'t',gender:'男',birth:'1993-10-10',shichen:${JSON.stringify(h)}}))`));
  ok('说明里的强弱计分范围，和十二个时辰各排一遍算出来的一致', txt($('hours')).includes(`强弱计分从 ${Math.min(...hsWant)} 分到 ${Math.max(...hsWant)} 分`), [txt($('hours')), hsWant]);
  click($('pp-edit'));
  ok('再点编辑，表单里还是「不知道时辰」', $('pf-shichen').value === 'none' && $('pf-date').value === '1993-10-10');
  click($('pf-cancel'));
  ev('usePerson(0)');
  ok('页面自带的人没有这一排', $('hours').hidden);
  ev('LOCAL=[];writeLocal();rebuildPeople();usePerson(0)');
  // 反查：随便取 300 个虚构的日子和时辰，排出四柱，再拿四柱反查，原来的日子一定在里面，查出来的每一个日子排出来四柱都相同
  {
    const rnd = rng(7);
    const miss = [];
    for (let k = 0; k < 300; k++) {
      const d0 = new Date(Date.UTC(1900, 0, 1) + rnd(73049) * 86400000), pad = n => String(n).padStart(2, '0');
      const birth = `${d0.getUTCFullYear()}-${pad(d0.getUTCMonth() + 1)}-${pad(d0.getUTCDate())}`, sh = '子丑寅卯辰巳午未申酉戌亥'[rnd(12)];
      const res = JSON.parse(ev(`(()=>{const one=(b,s)=>chartOf({id:'r',name:'r',gender:'男',birth:b,shichen:s}).pillars.join(' ');const p=one(${JSON.stringify(birth)},${JSON.stringify(sh)}), c=baziCheck(p), ds=c.p?datesOf(c.p):[];return JSON.stringify({p,msg:c.msg,ds,same:ds.every(x=>one(x.birth,x.shichen)===p)});})()`));
      if (res.msg || !res.ds.some(x => x.birth === birth && x.shichen === sh) || !res.same) miss.push([birth, sh, res]);
    }
    eq('反查：300 个虚构的日子和时辰排出四柱，再拿四柱反查，原来的日子都在里面，查出来的每一个排出来四柱都相同', miss.slice(0, 3), []);
  }
}

// ---------- 4b'. 导入、编辑、删除的几种边角情形 ----------
console.log('导入、编辑、删除的边角情形');
{
  const reset = () => ev('LOCAL=[];writeLocal();rebuildPeople();usePerson(0);say("")');
  // 时辰不详的人导出再导入：nohour 留着，不补经度
  ev(`LOCAL=[{id:'t-nh',name:'不详',gender:'女',birth:'1990-05-01',nohour:true}];writeLocal();rebuildPeople();`);
  const exported = ev('JSON.stringify(LOCAL)'); reset();
  const msgNh = ev(`importText(${JSON.stringify(exported)})`);
  eq('时辰不详的人导出的文件能导回来：nohour 留着，不补经度', [msgNh.startsWith('导入了 1 个人'), ev("JSON.stringify(LOCAL.map(x=>[x.nohour===true,'lon' in x,x.birth]))")], [true, '[[true,false,"1990-05-01"]]']);
  reset();
  // 手写解读的形状不对：对应的项丢掉，导入照样完成，提示里说丢了几项；id 去掉，页面上的 #sheet 不会被顶掉
  const badNotes = { id: 't-bad', name: '坏解读', gender: '男', birth: '1990-05-05 10:00', lon: 120, notes: {
    meta: { k: 'x' }, kv: [{ k: '调候参考', dd: '手写的一行' }, { k: 5 }], x: { 'kv|日主': '不是数组', 'kv|阴阳': [['你的盘', '<b id="x1">手写</b>']] },
    read: { bz: '<p id="sheet">顶替</p>', yun: '<p>没有 layers</p>', nope: '<p>x</p>' }, rel: { 相冲子午: ['数组'] } } };
  const msgBad = ev(`importText(${JSON.stringify(JSON.stringify(badNotes))})`);
  const nb = JSON.parse(ev("JSON.stringify(LOCAL.find(x=>x.name==='坏解读').notes)"));
  click(byX('kv|日主') || d.querySelector('#p-tk [data-x]'));
  eq('导入的手写解读形状不对的项丢掉（这里六项），导入照样完成并说明；id 去掉，点字照样打开解释卡片',
    [msgBad.includes('导入了 1 个人'), msgBad.includes('有 6 项格式不对'), 'meta' in nb, nb.kv.length, Object.keys(nb.x), Object.keys(nb.read), /id=/.test(nb.read.bz + nb.x['kv|阴阳'][0][1]), Object.keys(nb.rel).length, d.querySelectorAll('#sheet').length, $('sheet').hidden],
    [true, true, false, 1, ['kv|阴阳'], ['bz'], false, 0, 1, false]);
  ev('closeSheet()'); reset();
  // 记到秒的出生时间（链接里可以写秒）：编辑时只改称呼，秒留着，时柱不变
  ev(`LOCAL=[{id:'t-sec',name:'秒',gender:'男',birth:'1990-05-05 10:56:59',lon:120}];writeLocal();rebuildPeople();usePerson(PEOPLE.findIndex(p=>p.id==='t-sec'));`);
  const hp0 = ev('P.pillars[3]');
  click($('pp-edit')); $('pf-name').value = '秒二'; ev('saveForm()');
  eq('记到秒的出生时间，编辑时只改称呼：秒留着，时柱不变', [ev("LOCAL.find(x=>x.id==='t-sec').birth"), ev("LOCAL.find(x=>x.id==='t-sec').name"), ev('P.pillars[3]')], ['1990-05-05 10:56:59', '秒二', hp0]);
  reset();
  // 编辑表单开着时换了人，再删除：删掉的是表单里的那一位，删完还看换过去的那一位
  ev(`LOCAL=[{id:'a1',name:'甲一',gender:'男',birth:'1990-05-05 10:00',lon:120},{id:'b1',name:'乙一',gender:'女',birth:'1991-05-05 10:00',lon:120},{id:'c1',name:'丁一',gender:'男',birth:'1992-05-05 10:00',lon:120}];writeLocal();rebuildPeople();usePerson(PEOPLE.findIndex(p=>p.id==='a1'));`);
  click($('pp-edit'));
  click(d.querySelector(`#people [data-p="${ev("PEOPLE.findIndex(p=>p.id==='b1')")}"]`));
  click($('pf-del')); click($('pf-del'));
  eq('编辑表单开着时换了人再删除：删掉的是表单里的那一位，删完还看换过去的那一位', [ev("LOCAL.map(x=>x.id).join()"), ev('P.id')], ['b1,c1', 'b1']);
  reset();
  // 时辰不详的人生在交节气的那天：说明里照实写月柱、年柱、大运顺逆跟着变，起运的日子照十二个时辰实际排出来的最早、最晚写
  const hoursOf = (id, birth) => { ev(`LOCAL=[{id:'${id}',name:'${id}',gender:'男',birth:'${birth}',nohour:true}];writeLocal();rebuildPeople();usePerson(PEOPLE.findIndex(p=>p.id==='${id}'));`);
    const st = JSON.parse(ev(`JSON.stringify(Z.split('').map(h=>chartOf({id:'s',name:'s',gender:'男',birth:'${birth}',shichen:h}).yun.start.join('-')))`)).map(x => x.split('-').map(Number));
    const key = a => a[0] * 10000 + a[1] * 100 + a[2], lo = st.reduce((a, b) => key(b) < key(a) ? b : a), hi = st.reduce((a, b) => key(b) > key(a) ? b : a), ymd = a => `${a[0]} 年 ${a[1]} 月 ${a[2]} 日`;
    return [txt($('hours').querySelector('.note')), ymd(lo), ymd(hi)]; };
  const [mz, mz0, mz1] = hoursOf('t-mz', '2023-06-06'), [lc, lc0, lc1] = hoursOf('t-lc', '2024-02-04');
  eq('时辰不详、生在芒种那天：说月柱跟着时辰变，起运从最早到最晚差了十年上下，写的日子就是十二个时辰排出来的最早和最晚',
    [mz.includes('出生那天交节气，月柱也跟着时辰变'), mz.includes(`从 ${mz0}`) && mz.includes(`到 ${mz1}`), mz.includes('起运就差了十年上下'), mz.includes('最多差几个月')], [true, true, true, false]);
  eq('时辰不详、生在立春那天：说年柱和月柱都跟着时辰变，大运的顺逆也跟着变',
    [lc.includes('出生那天交立春，年柱和月柱都跟着时辰变'), lc.includes('大运的顺逆也跟着变'), lc.includes(`从 ${lc0}`) && lc.includes(`到 ${lc1}`)], [true, true, true]);
  reset();
}

// ---------- 4d. 分享链接 ----------
console.log('分享链接');
{
  const stored = () => JSON.parse(w.localStorage.getItem('bz-people') || '[]');
  const pillarsOf = info => ev(`chartOf(${JSON.stringify(info)}).pillars.join(' ')`);
  const parse = qs => JSON.parse(ev(`JSON.stringify(linkInfo(new URLSearchParams(${JSON.stringify(qs)})))`));
  // 虚构的出生信息：按出生时间（一个带夏令时）、只知道时辰、时辰不详
  const INFOS = [
    { id: 't1', name: '甲', gender: '女', birth: '1985-03-12 09:30', lon: 121.5, place: '' },
    { id: 't2', name: '乙', gender: '男', birth: '1988-07-02 21:05', lon: 104.1, dst: true, place: '' },
    { id: 't3', name: '丙', gender: '男', birth: '2003-06-18', shichen: '卯', place: '' },
    { id: 't4', name: '丁', gender: '女', birth: '1959-09-09', nohour: true, place: '' }];
  const linkFor = info => ev(`linkOf(${JSON.stringify(info)})`);
  eq('链接的参数写出来再读回去：按出生时间（带夏令时的也算）、只知道时辰、时辰不详，排出来的四柱和原来相同，称呼也相同',
    INFOS.map(info => { const r = parse(linkFor(info)); return r.err || (pillarsOf(r.info) === pillarsOf(info) && r.info.name === info.name); }), [true, true, true, true]);
  // 直接给八字：从对得上的日子里取最早的一天；b 可以指定是哪一天
  const bz = pillarsOf(INFOS[2]).replace(/ /g, ''), r1 = parse(`bz=${bz}&g=m&n=x`), r2 = parse(`bz=${bz}&g=m&b=${INFOS[2].birth}`);
  eq('直接给八字：排出来的四柱就是链接里的八字，取的是对得上的日子里最早的一天，原来的日子也在可选的里面；b 指定哪一天就排哪一天',
    [!!r1.info && pillarsOf(r1.info).replace(/ /g, '') === bz, !!r1.dates && r1.dates[0].birth === r1.info.birth, !!r1.dates && r1.dates.some(x => x.birth === INFOS[2].birth && x.shichen === '卯'), !!r2.info && r2.info.birth === INFOS[2].birth],
    [true, true, true, true]);
  eq('坏参数都被拒绝，并说明原因：不存在的日子、经度超出范围、不认识的时辰、1900 年以前、没写性别、四柱不成立',
    ['b=2001-02-30T10:00&g=m&lon=120', 'b=1990-01-01T10:00&g=m&lon=999', 'b=1990-01-01&sh=X&g=f', 'b=1890-01-01&sh=子&g=f', 'b=1990-01-01T10:00&lon=120', 'bz=甲子甲子甲子甲子&g=m'].map(qs => !!parse(qs).err),
    [true, true, true, true, true, true]);
  // 在页面上打开链接：临时的人，标着「来自链接」，不存；停在链接里的那一页、那一步大运
  pick(0);
  const n0 = ev('PEOPLE.length'), st0 = JSON.stringify(stored());
  ev(`openLink('#'+${JSON.stringify(linkFor(INFOS[0]))}+'&tab=qr,sy&dy=2')`);
  eq('打开链接：当作临时的人显示，标着「来自链接」，没有存进浏览器；四柱对；停在链接里的那一页和第三步大运',
    [ev('PEOPLE.length') - n0, ev('!!P.temp'), txt($('people').querySelector('[aria-pressed="true"]')).includes('来自链接'), !$('pp-link').hidden, JSON.stringify(stored()) === st0, ev('P.pillars.join(" ")') === pillarsOf(INFOS[0]), ev('sel.tab.natal'), ev('sel.tab.pan'), ev('sel.dy')],
    [1, true, true, true, true, true, 'qr', 'sy', 2]);
  const yy = ev('P.dayun[1].y0+3');
  ev(`openLink('#'+${JSON.stringify(linkFor(INFOS[0]))}+'&y=${yy}&m=4')`);
  eq('链接里的年份和月份：换到那一年所在的大运，停在那一年、那个月；还是只有一个临时的人', [ev('sel.dy'), ev('sel.y'), ev('sel.m'), ev('PEOPLE.length') - n0], [1, yy, 4, 1]);
  click($('pp-save'));
  eq('点「保存」：存进浏览器，不再标「来自链接」，四柱不变，还停在原来的年份',
    [stored().length - JSON.parse(st0).length, ev('!!P.temp'), ev('!!P.local'), $('pp-link').hidden, ev('P.pillars.join(" ")') === pillarsOf(INFOS[0]), ev('sel.y')], [1, false, true, true, true, yy]);
  const n1 = ev('PEOPLE.length');
  ev(`openLink('#'+${JSON.stringify(linkFor(INFOS[0]))})`);
  eq('再打开同一份出生信息的链接，直接换到存好的那一位，不再多出临时的人', [ev('PEOPLE.length'), ev('!!P.temp'), ev('!!P.local')], [n1, false, true]);
  ev("LOCAL=LOCAL.filter(x=>x.name!=='甲');writeLocal();rebuildPeople();usePerson(0);");
  // 直接给八字、对得上的日子不止一个时，可以在上面那一条里换
  ev(`openLink('#bz=${bz}&g=m&n=x')`);
  const dsel = $('pp-dates');
  if (dsel && dsel.options.length > 1) { dsel.value = String(dsel.options.length - 1); dsel.dispatchEvent(new w.Event('change', { bubbles: true })); }
  eq('直接给八字的链接：对得上的日子不止一个时，上面那一条能换日子，换了以后四柱不变', [!!dsel, !!dsel && ev('P.pillars.join("")') === bz, !!dsel && ev('TEMP.info.birth') === ev('TEMP.dates[TEMP.dates.length-1].birth')], [true, true, true]);
  // 称呼里的网页代码当文字显示
  ev(`openLink('#b=1990-01-01&sh=子&g=f&n='+encodeURIComponent('<img src=x onerror=window.__xss=1>'))`);
  eq('称呼里带网页代码的，当普通文字显示，不会变成页面里的元素', [$('people').querySelector('img'), txt($('people').querySelector('[aria-pressed="true"]')).includes('<img')], [null, true]);
  const nb = ev('PEOPLE.length');
  ev(`openLink('#b=2001-02-30T10:00&g=m&lon=120')`);
  eq('坏的链接不打开，说明原因，人数不变', [ev('PEOPLE.length'), txt($('pp-hint')).includes('不对')], [nb, true]);
  ev('TEMP=null;rebuildPeople();usePerson(0);say("")');
  // 页面自带的每一位都能分享：链接指向公开的页面；打开以后换到同一位，不多出临时的人。1900 年以前排不了的只写编号
  eq('页面自带的每一位都能分享：链接指向公开的页面，打开以后换到同一位，不多出临时的人',
    people.map((id, pi) => { pick(pi); const sh = JSON.parse(ev('JSON.stringify(shareNow())')); pick(pi === 0 ? Math.min(1, people.length - 1) : 0); ev(`openLink(${JSON.stringify(sh.url.slice(sh.url.indexOf('#')))})`); return [sh.url.startsWith(ev('SHARE_BASE') + '#'), ev('P.id') === id, ev('!!P.temp')]; }),
    people.map(() => [true, true, false]));
  // 分享按钮：打开分享框，复制不了时选中链接；换页以后链接跟着变
  pick(0);
  click($('pp-share'));
  eq('点「分享」：打开分享框，链接指向公开的页面、带着现在看的标签和年份，旁边写明链接里有什么；复制不了时说明并选中链接',
    [!$('share').hidden, $('share-url').value.startsWith(ev('SHARE_BASE') + '#'), decodeURIComponent($('share-url').value).includes(`tab=${ev('sel.tab.natal')},${ev('sel.tab.pan')}`), /链接里有/.test(txt($('share-t'))), txt($('share-msg')).length > 0],
    [true, true, true, true, true]);
  click($('h-gods'));
  ok('分享框开着时换页，链接里的标签跟着变', decodeURIComponent($('share-url').value).includes('tab=gods,'));
  click($('share-x'));
  ok('点「关闭」收起分享框', $('share').hidden);
  { // 分享链接带上五行、十神两页的数法和选择器小卡的计分模式（by）；打开时照它恢复，旧链接和认不出的值不动（审阅报告 R3）
    pick(0);
    const setModes = (wx, gods, yun) => ev(`MAPBY.wx='${wx}';MAPBY.gods='${gods}';MAPBY.yun='${yun}';renderBars();renderWxMap();renderGods();renderGodMap();renderDynamic()`);
    const modes = () => JSON.parse(ev('JSON.stringify(MAPBY)')), scores = () => [...$('dayun').querySelectorAll('.mb b')].map(txt);
    const pressed = id => [...$(id).querySelectorAll('[data-map]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.map);
    setModes('face', 'nl', ev('yongNow().yong===null') ? 'fy' : 'sum');
    const want = modes(), hash = ev('shareNow().url').split('#')[1], sent = scores();
    setModes('nl', 'cnt', 'fy');
    ev(`openLink(${JSON.stringify('#' + hash)})`);
    eq('分享链接带着三个模式；打开链接照它恢复，按钮选中态和小卡的分数都和发送方一样', [new URLSearchParams(hash).get('by'), modes(), pressed('wx-seg'), pressed('gods-seg'), pressed('sy-lg'), scores()],
      [`${want.wx},${want.gods},${want.yun}`, want, [`wx:${want.wx}`], [`gods:${want.gods}`], [`yun:${want.yun}`], sent]);
    const noBy = hash.replace(/(^|&)by=[^&]*/, ''), bad = hash.replace(/by=[^&]*/, 'by=xx%2Cyy%2Czz');
    setModes('nl', 'cnt', 'fy'); ev(`openLink(${JSON.stringify('#' + noBy)})`); const a = modes();
    ev(`openLink(${JSON.stringify('#' + bad)})`); const b = modes();
    eq('没带 by 的旧链接、by 里认不出的值：都保持原来的模式', [a, b], [{ wx: 'nl', gods: 'cnt', yun: 'fy', gj: 'gjb' }, { wx: 'nl', gods: 'cnt', yun: 'fy', gj: 'gjb' }]);
    setModes('nl', 'cnt', 'fy'); ev("localStorage.setItem('bz-map',JSON.stringify(MAPBY))");
  }
  click($('h-bz'));
  // 两个时辰不详的链接：前一个点了子时，后一个照样按午时排；分享时带上正在看的时辰，打开照它排；换时辰时选中的年份留着
  ev(`openLink('#n=A&g=m&b=1993-10-10&nh=1')`); click(d.querySelector('#hours [data-hour="子"]'));
  const hA = ev('P.pillars[3][1]');
  ev(`openLink('#n=B&g=f&b=1975-05-05&nh=1')`);
  const hB = ev('P.pillars[3][1]');
  ev('sel.dy=3;sel.y=P.dayun[3].y0+1;renderDynamic()'); const yKeep = ev('sel.y');
  click(d.querySelector('#hours [data-hour="寅"]'));
  const yAfter = ev('sel.y'), urlB = ev('shareNow().url');
  ev('TEMP=null;delete HOUR_PICK.link;rebuildPeople();usePerson(0);say("")');
  ev(`openLink(${JSON.stringify('#' + urlB.split('#')[1])})`);
  eq('时辰不详的链接：前一个点了子时，后一个照样按午时排；换时辰时选中的年份留着；分享时带上正在看的时辰，打开照它排',
    [hA, hB, yAfter === yKeep, decodeURIComponent(urlB).includes('h=寅'), ev('P.pillars[3][1]'), ev('!!P.temp')], ['子', '午', true, true, '寅', true]);
  ev('TEMP=null;delete HOUR_PICK.link;rebuildPeople();usePerson(0);say("")');
  // 没有出生地的人（直接给八字的链接），顶部信息里没有空着的「出生地」一行
  ev(`openLink('#n=测试&g=m&bz=庚午辛巳庚辰癸未')`);
  ok('直接给八字的人没有出生地，顶部信息里不列「出生地」一行', ![...d.querySelectorAll('#meta dt')].some(x => txt(x) === '出生地'));
  ev('TEMP=null;rebuildPeople();usePerson(0);say("")');
  // 打开已有的人的链接会留一句提示；换到别的人时这句提示不留
  ev(`openLink('#p=${people[0]}')`);
  const hintOn = !$('pp-hint').hidden;
  if (people.length > 1) click(d.querySelector('#people [data-p="1"]'));
  eq('打开已经在页面上的人的链接，人物那一排下面有一句提示；换到别的人，提示收起', [hintOn, people.length < 2 || $('pp-hint').hidden], [true, true]);
  pick(0);
  // 带着链接打开整个页面：一开始显示的就是链接里的人和那一页
  const errs2 = [], vc2 = new VirtualConsole(); vc2.on('jsdomError', e => errs2.push(e.message));
  const dom2 = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously', virtualConsole: vc2, pretendToBeVisual: true, url: 'https://bazi.test/#' + linkFor(INFOS[3]) + '&tab=qr' });
  const w2 = dom2.window;
  eq('带着链接打开页面：一开始就是链接里的人（时辰不详的也行），停在链接里的那一页，脚本没有报错',
    [w2.eval('!!P.temp'), w2.eval('!!P.nohour'), w2.eval('P.pillars.join(" ")') === pillarsOf(INFOS[3]), w2.eval('sel.tab.natal'), !w2.document.getElementById('hours').hidden, errs2], [true, true, true, 'qr', true, []]);
  dom2.window.close();
}

// ---------- 5. 每一个可点的解释都有内容 ----------
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
