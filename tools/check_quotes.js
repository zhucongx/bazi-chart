#!/usr/bin/env node
// 核对 src/classics.js 里的每一句引文，都逐字出现在它登记的出处里。
//
//   node tools/check_quotes.js             把出处的网页抓下来（存到 tmp/classics/），逐句核对，约半分钟
//   node tools/check_quotes.js --offline   不联网，只用 tmp/classics/ 里上次抓好的
//
// 通过之后把结果写进 data/quotes_check.json：核对的日期、每个出处的页面和句数、全部引文的校验值。
// tests/check_page.js 会拿页面里的引文算同一个校验值来对照，所以改了引文而没有重新核对，检查会失败。
//
// 怎么算「逐字出现」：
//   - 简体的出处：引文连标点原样出现在页面里。只有标点的全角半角不同时也算通过，但会单独数出来。
//   - 繁体、没有标点的出处（SOURCES 里标了 trad）：先按下面的 VARIANT 表把页面里的字换成简体，
//     再去掉引文里的标点，然后比对。表里没有的繁体字不会被换，所以引文里每个字都要么和原文相同，
//     要么是表里登记过的一对。
// 只用 Node 自带的功能，需要 Node 18 以上（用到 fetch）。有一句对不上，退出码为 1。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'tmp', 'classics');
const offline = process.argv.includes('--offline');
const UA = 'Mozilla/5.0 (compatible; quote-check)';

/* 繁体或异体 → 简体。只登记引文里用到的字。 */
const VARIANT = { 絕: '绝', 㸃: '点', 綬: '绶', 則: '则', 馬: '马', 轝: '舆', 祿: '禄', 為: '为', 處: '处', 庫: '库', 謂: '谓', 華: '华', 葢: '盖', 刼: '劫', 絶: '绝', 臨: '临', 屬: '属',
  對: '对', 衝: '冲', 飛: '飞', 陽: '阳', 無: '无', 廢: '废', 厯: '历', 會: '会', 詞: '词', 館: '馆', 見: '见', 納: '纳', 徳: '德', 與: '与', 喪: '丧', 門: '门', 歲: '岁',
  參: '参', 雖: '虽', 內: '内', 濕: '湿', 帶: '带', 剛: '刚', 強: '强', 軟: '软', 溫: '温', 潤: '润', 洩: '泄', 氣: '气', 達: '达', 於: '于', 綱: '纲', 機: '机', 奧: '奥', 過: '过', 陰: '阴',
  後: '后', 終: '终', 離: '离', 兌: '兑', 廟: '庙', 貴: '贵', 頭: '头', 龍: '龙', 進: '进', 羅: '罗', 網: '网', 餘: '余', 個: '个', 値: '值', 當: '当', 錯: '错', 時: '时', 兩: '两', 極: '极',
  將: '将', 災: '灾', 紅: '红', 艶: '艳', 號: '号', 弔: '吊', 隂: '阴', 醫: '医', 順: '顺', 惡: '恶', 敗: '败', 報: '报', 鷄: '鸡', 兎: '兔', 雲: '云', 獨: '独', 國: '国', 尋: '寻', 須: '须', 類: '类', 長: '长', 㐫: '凶',
  續: '续', 夘: '卯', 專: '专', 醜: '丑', 轉: '转', 亂: '乱', 據: '据', 間: '间', 經: '经', 學: '学', 絞: '绞', 說: '说', 傷: '伤', 幫: '帮', 財: '财', 從: '从', 論: '论' };

const src = fs.readFileSync(path.join(ROOT, 'src', 'classics.js'), 'utf8');
const { SOURCES, DTS, TH, Q, quoteList } = new Function(src + '\nreturn {SOURCES,DTS,TH,Q,quoteList};')();

const G = '甲乙丙丁戊己庚辛壬癸', Z = '寅卯辰巳午未申酉戌亥子丑';
const problems = [];

/* 结构：十干都有《滴天髓》的两句；调候表 10 × 12 格都有，点到的天干都出现在引的原文里 */
G.split('').forEach(g => {
  if (!DTS[g] || !DTS[g][0].startsWith(g)) problems.push(`DTS 缺 ${g}，或者不是以 ${g} 开头`);
  Z.split('').forEach(z => {
    const e = TH[g] && TH[g][z];
    if (!e || !e[0] || !e[1]) { problems.push(`调候表缺 ${g}日${z}月`); return; }
    e[0].split('').forEach(s => { if (!G.includes(s)) problems.push(`调候表 ${g}日${z}月：${s} 不是天干`); else if (!e[1].includes(s)) problems.push(`调候表 ${g}日${z}月：点到了 ${s}，引的原文里却没有这个字`); });
  });
});
Object.keys(Q).forEach(k => { if (!SOURCES[Q[k][0]]) problems.push(`Q.${k} 的出处 ${Q[k][0]} 没有登记`); });

const strip = s => s.replace(/[^\p{L}\p{N}]/gu, '');           // 去掉标点和空白，只留字
const fold = s => strip(s.replace(/./gu, c => VARIANT[c] || c));
function cleanWiki(t) {
  return t.replace(/\{\{SKchar\|[^}]*\}\}/g, '□').replace(/<[^>]+>/g, '');
}
function cleanHtml(t) {
  return t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n));
}
async function get(url, file) {
  const f = path.join(CACHE, file);
  if (offline) {
    if (!fs.existsSync(f)) throw new Error(`离线模式下找不到 ${path.relative(ROOT, f)}，先联网跑一次`);
    return fs.readFileSync(f, 'utf8');
  }
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url} 返回 ${r.status}`);
  const t = await r.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, t);
  return t;
}

(async () => {
  const texts = {}, pages = {};
  for (const id of Object.keys(SOURCES)) {
    const s = SOURCES[id]; let all = ''; pages[id] = [];
    for (const [i, [title, oldid]] of (s.wiki || []).entries()) {
      const url = 'https://zh.wikisource.org/w/index.php?title=' + encodeURIComponent(title) + '&action=raw' + (oldid ? '&oldid=' + oldid : '');
      all += '\n' + cleanWiki(await get(url, `${id}-${i}.txt`));
      pages[id].push(oldid ? `${title}（版本 ${oldid}）` : title);
    }
    for (const [i, url] of (s.url || []).entries()) {
      all += '\n' + cleanHtml(await get(url, `${id}-u${i}.html`));
      pages[id].push(url);
    }
    texts[id] = { raw: all, folded: s.trad ? fold(all) : strip(all) };
  }

  const list = quoteList(), count = {}, loose = [];
  list.forEach(([id, text]) => {
    const t = texts[id]; if (!t) return;
    count[id] = (count[id] || 0) + 1;
    if (!SOURCES[id].trad && t.raw.includes(text)) return;                       // 连标点逐字相同
    const want = SOURCES[id].trad ? strip(text) : strip(text);
    if (t.folded.includes(want)) { if (!SOURCES[id].trad) loose.push(`${SOURCES[id].book}「${text}」`); return; }
    let n = want.length; while (n > 0 && !t.folded.includes(want.slice(0, n))) n--;   // 对得上的最长开头，方便找出是哪个字不对
    const at = t.folded.indexOf(want.slice(0, n));
    problems.push(`${SOURCES[id].book}里找不到「${text}」。从头对到「${want.slice(Math.max(0, n - 8), n)}」为止相同，原文接下去是「${n ? t.folded.slice(at + n, at + n + 12) : ''}」`);
  });

  Object.keys(SOURCES).forEach(id => console.log(`  ${SOURCES[id].book}：${count[id] || 0} 句` + (SOURCES[id].trad ? '（原文繁体，按转换表比对）' : '')));
  if (loose.length) console.log(`  说明  有 ${loose.length} 句和原文只差标点的全角半角：\n        ` + loose.join('\n        '));
  if (problems.length) { console.log('\n没有通过：\n  ' + problems.join('\n  ')); process.exit(1); }

  let hash = 2166136261;
  for (const ch of JSON.stringify(list.map(x => x.join('\u0001')).sort())) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  const now = new Date(), day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const out = { checked: day, total: list.length, hash, sources: Object.fromEntries(Object.keys(SOURCES).map(id => [id, { book: SOURCES[id].book, quotes: count[id] || 0, pages: pages[id] }])) };
  if (!offline) fs.writeFileSync(path.join(ROOT, 'data', 'quotes_check.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`\n全部通过：${list.length} 句引文都在出处里逐字找到了。` + (offline ? '（离线模式，没有改写 data/quotes_check.json）' : '结果写进了 data/quotes_check.json。'));
})().catch(e => { console.log('出错：' + e.message); process.exit(1); });
