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
ok('十个天干都引了《滴天髓》的原文', ev("G.split('').every(g=>DTS[g]&&DTS[g][0].length===9&&DTS[g][0].startsWith(g)&&dts(g).includes(DTS[g][0]))"));
ok('一共 55 个神煞，每个都登记了出处；在典籍里没找到、只有现代出处的是天医、披麻、十灵日、六秀日、童子煞', ev("SS_NAMES.length===55&&SS_NAMES.every(n=>SSD[n]&&SSD[n].d)&&SS_NAMES.filter(n=>SSD[n].m).join()==='天医,披麻,十灵日,六秀日,童子煞'"));
ok('每个神煞都有说明和口诀', ev("SS_NAMES.every(n=>SS[n]&&SS[n].w&&SS[n].q&&'吉凶中'.includes(SS[n].k))"));
ok('每个神煞都有出现频率', ev("SS_NAMES.every(n=>typeof DATA.freq[n]==='number')"));
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
  eq('大运、流年等外来的一柱：只看原局自己的那十六个不会出现，其余三十九个都出现过', ssCheck ? [ev('SS_NAMES').filter(n => !ssCheck.extra.counts[n]).length, ev('SS_NAMES').filter(n => ssCheck.extra.counts[n]).length] : [], [16, 39]);
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
  eq('格局的分类：甲生寅月建禄，甲生卯月阳刃，乙生寅月月劫，戊生午月阳刃，丙生亥月按本气归七杀格', ev(`(function(){const keep=[P,DM,DMN,NATAL,MEMO];
    const one=(g,z)=>{DM=g;DMN=gN(g);NATAL=[{k:'年',g:'癸',z:'丑'},{k:'月',g:'癸',z:z},{k:'日',g:g,z:'丑',day:true},{k:'时',g:'癸',z:'丑'}];const r=geju();return r.kind+(r.list?'·'+gejuNames(r).join():'');};
    const out=[one('甲','寅'),one('甲','卯'),one('乙','寅'),one('戊','午'),one('丙','亥')];[P,DM,DMN,NATAL,MEMO]=keep;return out;})()`), ['建禄', '阳刃', '月劫', '阳刃', '不透·七杀格']);
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
  eq('五行个数', [...$('bars').querySelectorAll('.n')].map(txt), E.wuxing.all.map((n, i) => `${n} 个（${E.wuxing.face[i]}）`));
  eq('神煞', rows['神煞'].slice(DYN).map(td => [...td.querySelectorAll('[data-x]')].map(txt).sort()), E.shensha.map(a => [...a].sort()));
  eq('解读方框有 9 个', d.querySelectorAll('.read').length, 9);
  eq('标题下面四柱都有标注，「日主」只标在日干上', [[...$('title').querySelectorAll('.pl')].map(x => x.dataset.k), [...$('title').querySelectorAll('.dm')].map(txt)], [['年柱', '月柱', '日柱', '时柱'], [E.pillars[2][0]]]);
  const metaKeys = q => [...d.querySelectorAll(q + ' dt')].map(txt);
  eq('顶部信息分两处放，一行不少：起运和交运在大运旁边，其余的在标题下面，公历排第一', [metaKeys('#meta')[0], metaKeys('#meta-yun'), metaKeys('#meta').concat(metaKeys('#meta-yun')).sort()], ['公历', ['起运', '交运'], JSON.parse(ev('JSON.stringify(metaRows().map(r=>r.k))')).sort()]);
  eq('「这张盘先看什么」列了四件事，五行的个数和五行一栏的相同', [d.querySelectorAll('#rd-key li').length, ev("wxCounts().cnt.every((n,i)=>document.getElementById('rd-key').textContent.includes(EL[i]+' '+n))")], [4, true]);
  eq('版块的先后：细盘、十神对照、五行和日主、干支关系', ['h-pan', 'h-gods', 'h-wx', 'h-tk', 'h-rel'].map(id => $(id)).every((el, i, a) => !i || (a[i - 1].compareDocumentPosition(el) & 4) === 4), true);
  eq('读盘顺序里的链接都指向页面上有的地方', [...d.querySelectorAll('.guide a')].map(a => a.getAttribute('href')).filter(h => !/^#./.test(h) || !d.getElementById(h.slice(1))), []);
  const groups = [...d.querySelectorAll('#kv .kv')], last = groups[groups.length - 1];
  eq('日主一栏分两组，各家的四行（强弱、格局、调候、三行对照）在后一组，前面有小标题', [groups.length, ['强弱参考', '格局参考', '调候参考', '三行对照'].map(k => !!byX('kv|' + k) && byX('kv|' + k).closest('.kv') === last), !!d.querySelector('#kv .kv-h')], [2, [true, true, true, true], true]);
  const fixed = ['meta', 'meta-yun', 'kv', 'foot', 'note-yun', 'note-wx', 'rd-key', 'rd-pan', 'rd-yun', 'rd-rel', 'rd-rel2', 'rd-wx', 'rd-tk', 'rd-gods'].filter(k => !txt($(k)) || BAD.test(txt($(k))));
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
  if (F.bars) eq('五行个数', [...$('bars').querySelectorAll('.n')].map(txt), F.bars);
  if (F.shensha) eq('神煞', rows['神煞'].slice(DYN).map(td => [...td.querySelectorAll('[data-x]')].map(txt).sort()), F.shensha.map(a => [...a].sort()));
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
    ok('每个人一个切换按钮', chips().length === people.length);
    click(byX('row|神煞'));
    click(chips()[1]);
    ok('换人后标题、选中状态跟着变，面板收起', $('sheet').hidden && chips()[1].getAttribute('aria-pressed') === 'true' && chips()[0].getAttribute('aria-pressed') === 'false' && (!expected[people[1]] || txt($('title')) === expected[people[1]].pillars.join('')));
    click(chips()[0]);
    ok('换回来', chips()[0].getAttribute('aria-pressed') === 'true' && (!expected[people[0]] || txt($('title')) === expected[people[0]].pillars.join('')));
  } else ok('只有一个人时只有一个切换按钮', d.querySelectorAll('#people [data-p]').length === 1);
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
  const typePlace = v => { $('pf-place').value = v; $('pf-place').dispatchEvent(new w.Event('input', { bubbles: true })); };
  const cd = ev("(CITIES.find(c=>c[0]==='成都市')||[])[2]");
  typePlace('成都市');
  ok('出生地填表里的城市，经度自动填上，并说明是按哪个城市取的', typeof cd === 'number' && Number($('pf-lon').value) === cd && !$('pf-lonhint').hidden && txt($('pf-lonhint')).includes('成都市'), [cd, $('pf-lon').value]);
  $('pf-lon').value = '120'; typePlace('成都');
  ok('不带「市」字也认得', Number($('pf-lon').value) === cd);
  $('pf-lon').value = '100'; typePlace('表里没有的一个地方');
  ok('填表里没有的地方，经度不动，说明收起', $('pf-lon').value === '100' && $('pf-lonhint').hidden);
  submit();
  ok('日期和时间没填时不保存，并给出提示', ev('PEOPLE.length') === n0 && !$('pform').hidden && !$('pf-msg').hidden && txt($('pf-msg')).length > 0, txt($('pf-msg')));
  fill({ name: '测试甲', gender: '男', date: '2000-01-01', time: '12:00', place: '北京市', lon: '116.4' });
  submit();
  ok('填好保存后多出一个人并选中，四柱和 lunar_python 排出的相同', ev('PEOPLE.length') === n0 + 1 && txt($('title')) === '己卯丙子戊午戊午' && ev('P.local') === true && $('pform').hidden, [ev('PEOPLE.length'), txt($('title'))]);
  ok('出生信息存进了浏览器', stored().length === 1 && stored()[0].birth === '2000-01-01 12:00' && stored()[0].lon === 116.4, stored());
  const before = checked;
  checkAll('新添加的人');
  ok(`新添加的人，${checked - before} 条解释都有内容`, checked > before && !bad.length, bad.slice(0, 3));
  click($('pp-edit'));
  ok('点「编辑这一位」，表单里是原来填的内容', !$('pform').hidden && $('pf-name').value === '测试甲' && $('pf-date').value === '2000-01-01' && $('pf-time').value === '12:00' && $('pf-lon').value === '116.4');
  fill({ time: '23:30', name: '测试乙' });
  submit();
  ok('改了时间保存，人数不变，时柱跟着变', ev('PEOPLE.length') === n0 + 1 && ev('P.name') === '测试乙' && txt($('title')) !== '己卯丙子戊午戊午' && stored().length === 1, txt($('title')));
  const msg = ev(`importText(${JSON.stringify(JSON.stringify([{ name: '导入的人', gender: '女', birth: '1993-10-10 09:30', place: '成都市', lon: 104.07, notes: { x: { 'g|年|癸': [['你的盘', '<b>手写的话</b><script>window.hacked=1</' + 'script><img src="x" onerror="window.hacked=2">']] } } }]))})`);
  ok('导入一个带手写解读的人，四柱和 lunar_python 排出的相同', ev('PEOPLE.length') === n0 + 2 && txt($('title')) === '癸酉壬戌甲子戊辰' && /导入了 1 个人/.test(msg), [msg, txt($('title'))]);
  const note = ev(`X('g|年|癸')`).p.find(p => p[0] === '你的盘');
  ok('手写解读显示出来了，夹带的脚本被去掉', !!note && note[1].includes('<b>手写的话</b>') && !/script|onerror|<img/i.test(note[1]) && ev('window.hacked') === undefined, note);
  // 导入 gen_data.py 生成的那种数据：一个排好的人。这里用上面那个虚构的出生时间，由页面自己排好再导回去。
  const ready = ev(`JSON.stringify({people:[chartOf({id:'x1',name:'排好的人',gender:'女',birth:'1993-10-10',shichen:'辰',place:'成都市'})]})`);
  const again = ev(`importText(${JSON.stringify(ready)})`);
  ok('导入排好的人（people.json 的格式）也可以；只知道时辰的，辰时排出来和上面 8 点多出生的四柱相同', ev('PEOPLE.length') === n0 + 3 && txt($('title')) === '癸酉壬戌甲子戊辰' && ev('P.shichen') === '辰' && byX('meta|时辰') && !byX('meta|真太阳时'), [again, txt($('title'))]);
  const kept = checked;
  checkAll('只知道时辰的人');
  ok(`只知道时辰的人，${checked - kept} 条解释都有内容`, checked > kept && !bad.length, bad.slice(0, 3));
  ok('文件不是 JSON、日期不对时，导入会说明原因', /不是 JSON/.test(ev(`importText('abc')`)) && /没有导入任何人/.test(ev(`importText('[{"name":"坏的","gender":"男","birth":"2001-02-30 10:00","lon":120}]')`)) && ev('PEOPLE.length') === n0 + 3);
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
