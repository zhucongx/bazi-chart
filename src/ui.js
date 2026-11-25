/* 状态、渲染和事件。 */
const $=id=>document.getElementById(id);
const now=new Date();
const md=(y,s)=>{const [m,d]=s.split('/').map(Number);return new Date(y,m-1,d);};
const TODAY=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
/* 今天所在的干支年：过了立春才算新的一年 */
const REAL_Y=(()=>{const y=now.getFullYear(), lc=jieMD(y)?md(y,jieMD(y)[0]):new Date(y,1,4);return now<lc?y-1:y;})();
/* NOW_DY、NOW_M：今天落在这个人的哪一步大运、哪个月；今天不在他的大运范围里时是 -1。NOW_DY 照交运的那一天算（dyAt），不照整年 */
let NOW_DY=-1, NOW_M=-1;
/* 交运的那一天：第 i 步大运从起运日（P.yun.start）往后推 10i 年开始。选择器里的大运和流年按整年排（一步十个流年，从交运那一年排起），
   交运那一年里交运以前的日子其实还在上一步，或者还没起运。dyAt(t) 给出某一天实际在哪一步：-1 是还没起运，P.dayun.length 是过了页面排的八步。
   「当前」那枚印和选中日期的说明（text.js 的 dyNote）都照它。2026-11-17 内容审阅 C2：原来「当前」只按年份认大运，选到交运以前的日子也没有说明 */
const dyStart=i=>Date.UTC(P.yun.start[0]+10*i,P.yun.start[1]-1,P.yun.start[2]);
function dyAt(t){let k=-1;for(let i=0;i<=P.dayun.length;i++){if(t>=dyStart(i)) k=i;}return k;}
/* 选中的人、大运、流年、流月、流日，打开的解释，以及两张卡片各自翻到哪一页 */
const sel={p:0,dy:0,y:0,m:0,d:TODAY,x:null,xn:0,tab:{natal:'bz',pan:'pan'}};     // x 是打开的解释，xn 是点的第几个同名的字

/* ---------- 人物：页面自带的，加上保存在这个浏览器里的 ---------- */
const PEOPLE=DATA.people.slice();
let LOCAL=[];                      // 能排盘的出生信息，格式见 chart.js
let REJECTED=[];                   // 不能读取的旧记录：保留原值和原因，写入时一并保留
let RAW_LOCAL=null;                // 整份 JSON 损坏或不是数组时保留原文，暂停写入，供导出恢复
let STORE_OK=true;
/* 上一次读、写浏览器的时候，每个编号的记录是什么样（JSON 文本）。写的时候拿它看这一页自己改了哪几个人（writeLocal）。 */
let SYNCED=new Map();
const snapshot=()=>{SYNCED=new Map(LOCAL.map(x=>[x.id,JSON.stringify(x)]));};
/* 把浏览器里存的那个数组分成能排盘的（LOCAL）和读不了的（REJECTED）；缺编号、编号重复、和页面自带的人同名的另起编号。返回有没有改过编号 */
function loadRecords(v){
  LOCAL=[];REJECTED=[];
    v.forEach(x=>{
      try{
        const bad=!x||typeof x!=='object'||Array.isArray(x)?'这一项不是人物资料。'
          :typeof x.birth!=='string'||['name','place','source'].some(k=>x[k]!==undefined&&typeof x[k]!=='string')?'日期、称呼、地点和出处需要用文字填写。'
          :x.tz!==undefined&&x.tz!==null?'出生时间带有时区，页面只认北京时间。':checkInfo(x);
        if(bad){REJECTED.push({value:x,reason:bad});return;}
        LOCAL.push(x.notes?Object.assign({},x,{notes:cleanNotes(x.notes)}):x);
      }catch(e){REJECTED.push({value:x,reason:'这一项的格式无法读取，原值已保留。'});}
    });
    const seen=new Set(DATA.people.map(p=>p.id));
    let fixed=false;
    LOCAL=LOCAL.map(x=>{const good=typeof x.id==='string'&&x.id&&!seen.has(x.id), o=good?x:Object.assign({},x,{id:newId()});if(!good) fixed=true;seen.add(o.id);return o;});
  return fixed;
}
function readLocal(){
  LOCAL=[];REJECTED=[];RAW_LOCAL=null;BROKEN=[];SYNCED=new Map();
  try{
    const raw=localStorage.getItem('bz-people');
    let v;
    try{v=raw===null?[]:JSON.parse(raw);}catch(e){RAW_LOCAL=raw;STORE_OK=false;return;}
    if(!Array.isArray(v)){RAW_LOCAL=raw;STORE_OK=false;return;}
    STORE_OK=true;
    if(loadRecords(v)) forceWrite();      // 刚读出来就改了编号：这一份就是浏览器里现在的，直接写回去
    snapshot();
  }catch(e){STORE_OK=false;}
  finally{renderRecovery();}
}
const localRecords=()=>LOCAL.concat(REJECTED.map(r=>r.value));
function forceWrite(){try{localStorage.setItem('bz-people',JSON.stringify(localRecords()));STORE_OK=true;}catch(e){STORE_OK=false;}}
/* 把这一页的改动存进浏览器。同一个浏览器里可能开着几个标签页，各自在打开的时候读过一遍：不能把这一页记着的整个名单写回去，
   那样会盖掉别的标签页后来存的人（2026-11-21 复核报告第 1 条：两页各导入一人，都提示成功，刷新以后先存的那一位没了）。
   做法：先读回浏览器里现在的名单，只把这一页自己动过的并进去。新加的、改过的（和 SYNCED 记的不一样）用这一页的；
   这一页删掉的（SYNCED 里有、LOCAL 里没有了）从名单里去掉；这一页没动过的照浏览器里现在的，别的标签页加的人留着、删的人不写回去。
   两页改同一个人，后存的算数。写完照并好的名单重新认一遍，别的标签页加的人这一页也就有了。读不了的旧记录原样留着 */
function writeLocal(){
  // 不能解析的原文件不覆盖。新加的人本次仍能看，也能单独导出。
  if(RAW_LOCAL!==null){STORE_OK=false;return false;}
  try{
    const raw=localStorage.getItem('bz-people'); let cur;
    try{cur=raw===null?[]:JSON.parse(raw);}catch(e){cur=null;}
    if(!Array.isArray(cur)){RAW_LOCAL=raw;STORE_OK=false;renderRecovery();return false;}      // 别的标签页留下了读不了的东西：不覆盖
    const idOf=x=>x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.id==='string'&&x.id?x.id:null;
    const mine=new Map(LOCAL.map(x=>[x.id,x])), touched=id=>!SYNCED.has(id)||SYNCED.get(id)!==JSON.stringify(mine.get(id));
    const gone=new Set([...SYNCED.keys()].filter(id=>!mine.has(id))), out=[], seen=new Set();
    cur.forEach(x=>{
      const id=idOf(x);
      if(id===null||seen.has(id)){out.push(x);return;}      // 没有编号、编号重复的旧记录原样留着
      if(gone.has(id)) return;
      seen.add(id);out.push(mine.has(id)&&touched(id)?mine.get(id):x);
    });
    LOCAL.forEach(x=>{if(!seen.has(x.id)&&touched(x.id)){seen.add(x.id);out.push(x);}});
    localStorage.setItem('bz-people',JSON.stringify(out));STORE_OK=true;
    if(loadRecords(out)) forceWrite();
    snapshot();
  }catch(e){STORE_OK=false;}
  return STORE_OK;
}
function renderRecovery(){
  const box=$('pp-recovery');
  box.hidden=RAW_LOCAL===null&&!REJECTED.length&&!BROKEN.length;
  if(box.hidden){box.innerHTML='';return;}
  const why=REJECTED.map((r,i)=>`${(r.value&&typeof r.value.name==='string'?r.value.name:'第 '+(i+1)+' 项').slice(0,30)}：${r.reason}`);
  box.innerHTML='<p>'+esc(RAW_LOCAL!==null?'浏览器里的旧资料无法完整读取，原文已保留，暂不覆盖。新加的资料只在本次打开时有效，请用添加表单里的「导出」保存。':`有 ${REJECTED.length+BROKEN.length} 项旧资料暂未显示，原数据仍保留。添加或导入其他人不会删掉这些资料。`)
    +'</p>'+(why.length?'<p>'+why.map(esc).join('；')+'</p>':'')
    +(BROKEN.length?'<p>'+esc('排不出盘：'+BROKEN.join('、'))+'</p>':'')
    +'<p>可以先导出备份，修正后再导入。同一编号的有效资料会替换对应的异常记录。</p><div class="row"><button type="button" class="pp" id="pp-recovery-export">导出保留的原数据</button></div><p id="pp-recovery-msg" aria-live="polite"></p>';
}
function downloadJSON(text,name){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function exportRecovery(){
  try{downloadJSON(RAW_LOCAL!==null?RAW_LOCAL:JSON.stringify(localRecords(),null,1),'bazi-people-recovery.json');$('pp-recovery-msg').textContent='已生成备份文件。请确认下载成功后再整理原数据。';}
  catch(e){$('pp-recovery-msg').textContent='这个环境不能下载文件，原数据仍保留在浏览器里。';}
}
/* 时辰不详的人现在看的是哪个时辰，按人的 id 记，默认午时。只记在这一次打开的页面里 */
const HOUR_PICK=Object.create(null);      // 没有原型：编号叫 constructor、toString 的人不会读到继承来的东西（审阅报告 R4）
/* 从链接打开、还没保存的人：{info, dates}。只有一个，排在最后，不写进 localStorage；点「保存」才存 */
let TEMP=null;
/* 人物那一排的先后：拖动调整过的，按 id 记在 localStorage 的 bz-order 里（2026-11-17 用户要的「允许拖动这些标签调整顺序」）。
   不在里面的人（新加的、没排过的）跟在后面，彼此保持原来的先后；来自链接的那一位总在最后 */
let ORDER=[];
let BROKEN=[];                     // 存在浏览器里、却排不出盘的人（rebuildPeople 记下），打开页面时提示
function readOrder(){try{const v=JSON.parse(localStorage.getItem('bz-order')||'[]');ORDER=Array.isArray(v)?v.filter(x=>typeof x==='string'):[];}catch(e){ORDER=[];}}
function saveOrder(){ORDER=PEOPLE.filter(p=>!p.temp).map(p=>p.id);try{localStorage.setItem('bz-order',JSON.stringify(ORDER));}catch(e){}}
function rebuildPeople(){
  PEOPLE.length=0;PEOPLE.push(...DATA.people);
  const one=info=>chartOf(info.nohour?Object.assign({},info,{shichen:HOUR_PICK[info.id]||'午'}):info);
  BROKEN=[];
  LOCAL.forEach(info=>{try{const p=one(info);p.local=true;PEOPLE.push(p);}catch(e){BROKEN.push(info.name||info.id);}});      // 排不出盘的不显示，记下来提示
  const at=p=>{const k=ORDER.indexOf(p.id);return k<0?Infinity:k;}, sorted=PEOPLE.map((p,i)=>[p,i]).sort((a,b)=>at(a[0])-at(b[0])||a[1]-b[1]).map(x=>x[0]);
  PEOPLE.length=0;PEOPLE.push(...sorted);
  if(TEMP){try{const p=one(TEMP.info);p.temp=true;PEOPLE.push(p);}catch(e){TEMP=null;}}
  renderRecovery();
}
/* 照 order 重排 PEOPLE：order 是新的先后，每一项是原来的下标。选中的还是原来那一位，只重画人物那一排 */
function applyOrder(order){
  if(order.length!==PEOPLE.length||new Set(order).size!==order.length) return false;
  const cur=PEOPLE[sel.p], next=order.map(i=>PEOPLE[i]);
  if(next.some(p=>!p)||next.slice(0,-1).some(p=>p.temp)) return false;     // 来自链接的那一位只能在最后
  PEOPLE.length=0;PEOPLE.push(...next);sel.p=PEOPLE.indexOf(cur);
  saveOrder();renderPeopleRow();return true;
}
/* 把第 from 位挪到第 to 位（键盘用，也给检查脚本用） */
function movePerson(from,to){
  const n=PEOPLE.filter(p=>!p.temp).length; if(from===to||from<0||to<0||from>=n||to>=n) return false;
  const order=PEOPLE.map((p,i)=>i), [x]=order.splice(from,1); order.splice(to,0,x);
  return applyOrder(order);
}
/* 任何一个人的出生信息：从链接来的、存在浏览器里的、页面自带的（由排好的结果取回） */
function infoOf(p){
  if(p.temp) return TEMP&&TEMP.info;
  if(p.local) return LOCAL.find(x=>x.id===p.id)||null;
  try{return infoFrom(p);}catch(e){return null;}
}

function jieUTC(y,m){const [mm,dd]=jieMD(y)[m].split('/').map(Number);return Date.UTC(m===11?y+1:y,mm-1,dd);}
function monthDays(y,m){
  const start=jieUTC(y,m), end=m<11?jieUTC(y,m+1):(jieMD(y+1)?jieUTC(y+1,0):Date.UTC(y+1,1,4)), out=[];
  for(let t=start;t<end;t+=DAY) out.push(t);
  return out;
}
const mdText=t=>{const d=new Date(t);return (d.getUTCMonth()+1)+'/'+d.getUTCDate();};
function currentMonth(y){
  const j=jieMD(y); let idx=-1;
  for(let i=0;i<12;i++){ if(now>=md(i===11?y+1:y,j[i])) idx=i; }
  return idx;
}
function fixDay(){const days=monthDays(sel.y,sel.m);if(!days.includes(sel.d)) sel.d=days.includes(TODAY)?TODAY:days[0];}
/* 细盘的八列：前四列是选中的流日、流月、流年、大运，后四列是原局 */
const DYN=4;
function cols(){
  const lr=dayGZ(sel.d), ly=monthGZ(sel.y,sel.m), ln=yearGZ(sel.y), dy=P.dayun[sel.dy].gz;
  return [['流日',lr],['流月',ly],['流年',ln],['大运',dy]].map(([k,gz])=>({k,g:gz[0],z:gz[1],dyn:true})).concat(NATAL);
}

/* ---------- 换人 ---------- */
/* place：停在哪里，只改 sel、不画，默认的位置定好以后、画之前调用。换时辰、打开链接、存下来自链接的人都走这里，只画一遍：
   原来先照默认的画、再照要停的地方画一遍，没有变的也跟着动，横条的平滑滚动还会停在默认的那一格（2026-11-22 审阅） */
function usePerson(i,place){
  sel.p=i; P=PEOPLE[i]; MEMO={};
  DM=P.pillars[2][0]; DMN=gN(DM);
  NATAL='年月日时'.split('').map((k,j)=>({k,g:P.pillars[j][0],z:P.pillars[j][1],day:j===2}));
  SHENSHA=shenshaOf(P.pillars,DATA.nayin,!!P.gender);
  Y_MIN=P.dayun[0].y0; Y_MAX=P.dayun[P.dayun.length-1].y1;
  const inRange=REAL_Y>=Y_MIN&&REAL_Y<=Y_MAX, at=dyAt(TODAY);
  NOW_DY=at>=0&&at<P.dayun.length?at:-1;
  NOW_M=inRange?currentMonth(REAL_Y):-1;
  // 默认选今年所在的那一组（流年那一排里要有今年）。它和「当前」的那一步可能差一步，这时选择器下面有一句说明（dyNote）。
  // 今天不在这个人的大运范围里（古人，或者还没起运），就从第一步大运看起
  sel.dy=inRange?P.dayun.findIndex(d=>REAL_Y>=d.y0&&REAL_Y<=d.y1):0;
  sel.y=inRange?REAL_Y:Y_MIN;
  sel.m=NOW_M<0?0:NOW_M; sel.d=TODAY; sel.x=null;
  // 今天不在大运范围里的人，从起运的那一天看起：起运日落在第一年的哪个流月，就停在那个月的那一天。起运日在那一年立春以前的，照旧停在第一个月
  if(!inRange){const s0=dyStart(0);for(let m=0;m<12;m++){if(monthDays(Y_MIN,m).includes(s0)){sel.m=m;sel.d=s0;}}}
  if(place) place();
  $('sheet').hidden=true;
  renderPerson();markOn();      // 模板里写死的表头不随换人重画，「解释正开着」的标记要另外消掉
  if(!P.temp){try{localStorage.setItem('bz-person',P.id);}catch(e){}}      // 画完再记；来自链接、还没保存的人不记
}

/* ---------- 解释卡片：贴在所点的字旁边 ---------- */
function markOn(){document.querySelectorAll('[data-x]').forEach(n=>n.classList.toggle('on',n.dataset.x===sel.x));}
function closeSheet(){sel.x=null;$('sheet').hidden=true;markOn();}
/* 同一个解释可能挂在几个字上（主星和天干指的是同一个字，同一个字也可能在好几页里），所以记下点的那一个在哪一页（home，标签页的 id，
   不在标签页里的是空）、是这一页里第几个同名的字。只在这一页里数：原来在整个页面里数，换了大运、流年以后同名的字个数一变，
   就认到别的字上，有时是没显示的那一页里的，卡片跳到屏幕左上角（2026-11-18 审阅）。这一页里已经没有这个字了，返回 null，卡片收起 */
const homeOf=el=>{const h=el&&el.closest?el.closest('[role="tabpanel"]'):null;return h?h.id:'';};
function sameKey(key,home){return [...(home&&$(home)?$(home):document).querySelectorAll('[data-x]')].filter(x=>x.dataset.x===key&&homeOf(x)===(home||''));}
function anchorOf(key,n,home){const all=sameKey(key,home);return all[n]||all[0]||null;}
/* 把卡片摆到 el 的下面；下面放不下而上面更宽裕时摆到上面。左右不出屏幕，小三角对准 el。 */
function placeSheet(el){
  const s=$('sheet'), inn=s.firstElementChild;
  if(!el||!el.getBoundingClientRect) return;
  settle(el);      // 所指的字正在移动的，先让它到位
  const r=el.getBoundingClientRect(), vw=document.documentElement.clientWidth, vh=window.innerHeight;
  const below=vh-r.bottom, above=r.top, up=below<300&&above>below;
  inn.style.maxHeight=Math.max(170,Math.min(460,(up?above:below)-24))+'px';
  s.classList.toggle('up',up);
  const w=s.offsetWidth, h=s.offsetHeight, mid=r.left+r.width/2;
  const left=Math.max(12,Math.min(mid-w/2,vw-w-12));
  s.style.left=(left+window.scrollX)+'px';
  s.style.top=((up?r.top-h-10:r.bottom+10)+window.scrollY)+'px';
  s.style.setProperty('--ax',Math.max(20,Math.min(mid-left,w-20))+'px');
  const over=up?-(r.top-h-18):r.bottom+h+18-vh;            // 屏幕太矮、两头都放不下时，滚动一点让卡片露全
  if(over>0) window.scrollBy({top:up?-over:over,behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
}
function openSheet(key,el){
  const r=X(key); if(!r){closeSheet();return;}
  sel.x=key;
  if(el){sel.xh=homeOf(el);sel.xn=Math.max(0,sameKey(key,sel.xh).indexOf(el));}
  $('sheet-t').textContent=r.t;
  $('sheet-b').innerHTML=r.p.filter(Boolean).map(([l,t])=>`<p><span class="lb">${l}</span><span class="tx">${t}</span></p>`).join('');
  $('sheet').hidden=false;markOn();
  $('sheet').firstElementChild.scrollTop=0;
  placeSheet(el||anchorOf(key,sel.xn,sel.xh));
}
function refreshSheet(){
  refreshShare();
  if(!sel.x) return;
  const el=anchorOf(sel.x,sel.xn,sel.xh);
  if(el&&!el.closest('[role="tabpanel"][hidden]')) openSheet(sel.x,null); else closeSheet();
}
/* ---------- 标签栏 ----------
   两张卡片各有一排标签，一次显示一页：原局是八字、日主、五行、强弱、十神、格局、喜忌、六亲，大运流年是四柱细盘、干支关系、根和透、计分。
   标签是 #h-名字，对应的那一页是 #p-名字。翻到哪一页记在 sel.tab 里，也存进浏览器，下次打开还在那一页 */
const TABS={natal:['bz','tk','wx','qr','gods','gj','ys','lq'],pan:['pan','rel','gt','sy']};      // 六亲宫位（lq）是原局的最后一页：它不在强弱、格局、喜忌那条读盘的线上，所以排在喜忌后面。原来是页面最下面单独的一张卡片，2026-11-18 用户问能不能放到上面，挪进了标签栏
function setTab(card,id,focus,save){
  if(!TABS[card]||!TABS[card].includes(id)) return;
  const was=sel.tab[card];
  sel.tab[card]=id;
  TABS[card].forEach(t=>{
    const on=t===id, b=$('h-'+t);
    b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;
    $('p-'+t).hidden=!on;
  });
  if(focus) $('h-'+id).focus();
  if(save!==false){try{localStorage.setItem('bz-tabs',sel.tab.natal+','+sel.tab.pan);}catch(e){}}
  refreshShare();
  if(sel.x){                                   // 打开的解释所指的字要是在换下去的那一页里，就收起来；还在的话重新摆位置
    const el=anchorOf(sel.x,sel.xn,sel.xh);
    if(!el||el.closest('[role="tabpanel"][hidden]')) closeSheet(); else placeSheet(el);
  }
  reveal();
  turnPage(was,id);
}
/* 浅色、深色：默认跟着系统；点了右上角的按钮就换成另一种，记在 localStorage 的 bz-theme 里，读写包在 try/catch 里 */
const darkNow=()=>{const t=document.documentElement.dataset.theme;return t?t==='dark':!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);};
function setTheme(t){
  if(t) document.documentElement.dataset.theme=t;
  const next=darkNow()?'浅色':'深色', b=$('theme'); b.setAttribute('aria-label','换成'+next); b.title='换成'+next;
}
function setRead(on){
  document.documentElement.dataset.read=on?'on':'off';
  $('rd').setAttribute('aria-pressed',String(on));
  try{localStorage.setItem('bz-read',on?'1':'0');}catch(e){}
}

/* ---------- 渲染 ---------- */
const paras=t=>t.split('\n').map(s=>`<span class="pa">${esc(s)}</span>`).join('');      // 长说明（.note.long）：文字里的换行是分段，一段一块，分两栏时不拆开
const parasHTML=h=>h.split('<br>').map(s=>`<span class="pa">${s}</span>`).join('');      // 带网页代码的（gjbSay）按 <br> 分段
const xb=(cls,key,html)=>`<button type="button" class="${cls}" data-x="${esc(key)}">${html}</button>`;
const ic=i=>`<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-${ELC[i]}"/></svg>`;      // 五行的小图标
/* 细盘里的干支大字。kind 是 'g'（天干）或 'z'（地支）；地支带上生肖，由样式显示在右下角 */
function glyph(kind,c){
  const ch=kind==='g'?c.g:c.z, e=kind==='g'?gEl(ch):zEl(ch);
  return `<button type="button" class="glyph ${ELC[e]}" data-x="${esc(kind+'|'+c.k+'|'+ch)}"${kind==='z'?` data-z="${ANIMALS[Z.indexOf(ch)]}"`:''}>${ch}${ic(e)}</button>`;
}
function gzSpan(gz){return `<span class="${gCls(gz[0])}">${gz[0]}</span><span class="${zCls(gz[1])}">${gz[1]}</span>`;}
function relChips(list){
  if(!list.length) return '<span class="none">没有</span>';
  return list.map(r=>{const w=(r.top?'对':'')+r.where.join('、');
    const key=['rel',r.t,r.c,r.n,r.where.join('、'),r.top,r.grp].join('|');
    return `<button type="button" class="rel${HE_TYPES.includes(r.t)?'':' bad'}" data-x="${esc(key)}">${esc(r.t)}<b>${esc(r.c)}</b>${r.n?`<small>${esc(r.n)}</small>`:''}<small>${esc(w)}</small></button>`;}).join('');
}
/* kvRows 的几行按先后分段放到各页：「强弱参考」以前的月令透干在「强弱」一页强弱分析卡片的下面（月令、根、印三行并进了四张卡片，不单独显示），
   从「强弱参考」起在「强弱」一页四张卡片的下面，从「格局参考」起在「格局」一页，从「调候参考」起在「喜忌」。
   手写解读另加的行插在哪一行后面，就跟着那一行进哪一页；没写插在哪里的排在最后，在「喜忌」。
   日主、阴阳不在这里列，在「日主」一页的四项里；强弱计分画成「强弱」一页的卡片。 */
const KV_FROM={'强弱参考':'kv-qr','格局参考':'kv-gj','调候参考':'kv2'}, KV_ELSEWHERE=['日主','阴阳','强弱计分','月令','根','印'];      // 月令、根、印三行并进了「强弱」一页最上面的四张卡片
/* 顶部信息分两处放：起运和交运跟着大运那一行；其余的都在标题下面，出生的基本信息排在前面 */
const META_MAIN=['公历','真太阳时','时辰','农历','出生地','节气'], META_YUN=['起运','交运'];
/* 只跟人有关、不随大运流年变的部分 */
/* 人物那一排：一个人一个按钮，按住拖动调整先后（见文件后面拖动的那一段），后面是添加、编辑、分享 */
function renderPeopleRow(){
  $('people').innerHTML=PEOPLE.map((p,i)=>`<button type="button" class="pp" aria-pressed="${i===sel.p}" data-p="${i}"${p.temp?'':' title="点一下换到这一位；按住拖动可以调整先后，键盘上是 Alt 加左右方向键"'}>${esc(p.name)}${p.temp?'<small class="from">来自链接</small>':''}</button>`).join('')
    +'<button type="button" class="pp add" id="pp-add">＋ 添加</button>'
    +(P.local?'<button type="button" class="pp add" id="pp-edit">编辑这一位</button>':'')
    +'<button type="button" class="pp add" id="pp-share">分享</button>';
}
function renderPerson(){
  SWITCH=!SHOWN||SHOWN.who!==whoNow();
  renderPeopleRow();
  renderLinkBar();
  $('eyebrow').innerHTML=`${P.gender?'男命':'女命'} · ${xb('x','term|造',P.gender?'乾造':'坤造')}`;
  $('title').setAttribute('aria-label',P.pillars.join(' '));
  // 每一柱带上「年柱」这样的标注，日柱的天干带上「日主」。标注由样式显示，标题的文字内容仍然只有八个字
  $('title').innerHTML=NATAL.map(p=>`<span class="pl${P.nohour&&p.k==='时'?' guess':''}" data-k="${p.k}柱${P.nohour&&p.k==='时'?'（不详）':''}"><span class="cx" data-x="gz|${p.k}" role="button" tabindex="0"><span class="${gCls(p.g)}${p.day?' dm':' gd'}"${p.day?'':` data-g="${p.k}干"`}>${p.g}</span><span class="${zCls(p.z)} gd" data-g="${p.k}支">${p.z}</span></span></span>`).join('');      // 每个字上面一个小字，写它的位置：年干、年支……日干那里是「日主」。都由样式生成，不占文字内容。2026-11-18 用户说「只标记了日主，别的也写一下吧」；我先标成了十神，用户说「不是标记十神吧，表日干日支之类的」
  const meta=metaRows(), mrow=r=>`<div><dt>${xb('x','meta|'+r.k,r.k)}</dt><dd>${r.dd}</dd></div>`;
  const top=meta.filter(r=>!META_YUN.includes(r.k));
  $('meta').innerHTML=top.filter(r=>META_MAIN.includes(r.k)).concat(top.filter(r=>!META_MAIN.includes(r.k))).map(mrow).join('');
  $('meta-yun').innerHTML=meta.filter(r=>META_YUN.includes(r.k)).map(mrow).join('');
  ['bz','pan','yun','rel','rel2','wx','tk','qr','gods','gj','ys','lq','gt','gw'].forEach(s=>{$('rd-'+s).innerHTML=readHTML(s);});
  $('note-yun').innerHTML=paras(noteYun());
  $('note-wx').textContent=noteWx();
  // 日主一页最上面是四项（quadItems）：日主属性、阴阳参考就是「日主」「阴阳」两行，旺衰参考、格局参考是「强弱」「格局」两页的结论
  const kv=kvRows(), quad=quadItems(), part={kv:[],'kv-qr':[],'kv-gj':[],kv2:[]};
  let at='kv';
  kv.forEach(r=>{at=KV_FROM[r.k]||at;if(!KV_ELSEWHERE.includes(r.k)) part[at].push(r);});
  const dl=rows=>rows.length?`<dl class="kv">${rows.map(r=>`<dt>${xb('x',r.x||'kv|'+r.k,r.k)}</dt><dd>${r.dd}</dd>`).join('')}</dl>`:'';
  $('quad').innerHTML=quad.map((r,i)=>`<div class="qd"><span class="qd-k"><svg class="ic" aria-hidden="true" focusable="false"><use href="#i-${['t-tk','q-yy','q-ga','q-ge'][i]}"/></svg>${xb('x',r.x,r.k)}</span>${r.lines?`<b>${r.big}</b>`:`<b class="cx" data-x="${r.x}" role="button" tabindex="0">${r.big}</b>`}<small>${r.sub}</small></div>`).join('');      // 大字也能点（2026-11-18 用户说「这俩也不能点啊」）；旺衰参考是两行，各点各的
  Object.keys(part).forEach(id=>{$(id).innerHTML=dl(part[id]);});
  $('note-qr').textContent=noteQr();
  $('foot').innerHTML=footItems().map(x=>`<li>${x}</li>`).join('');
  $('note-sk').innerHTML=paras(noteSK());
  $('note-gt').innerHTML=paras(noteGT());
  $('note-gw').textContent=noteGw();
  renderHours();renderBz();renderBars();renderWxMap();renderGodMap();renderGods();renderGjb();renderGjz();renderGjSeg();renderThc();renderGw();renderQs();renderSd();renderXi();renderDynamic();
  showPerson();SWITCH=false;
}
/* 时辰不详的人：标题下面一排十二个时辰，点哪个就按哪个排（HOUR_PICK）。下面一段说十二个时辰里哪些跟着变（text.js 的 hoursSay） */
function renderHours(){
  const box=$('hours'), info=P.nohour?infoOf(P):null;
  box.hidden=!info; if(!info){box.innerHTML='';return;}
  const rows=Z.split('').map(h=>{const c=chartOf(Object.assign({},info,{shichen:h}));
    const ps=c.pillars.map((gz,j)=>({k:'年月日时'[j],g:gz[0],z:gz[1],day:j===2})), q=qsOf(c.pillars[2][0],ps,true), x=xiOf(c.pillars[2][0],ps,true);
    return {h,p:c.pillars,help:q.help,tier:q.tier,xi:x.xi,dy:c.dayun.map(d=>d.gz).join(),fw:c.yun.forward,st:c.yun.start};});
  // 这一天晚上十点以后才交节的：十二个时辰照中点排（最晚是亥时的 22 点）都在交节之前，交节以后出生的那一种排法一个也没有排到。
  // 找出来交给 hoursSay 说明（2026-11-21 复核报告第 3 条：原来照十二个中点一比，说年柱、月柱和大运都不变）
  const d0=toSec(...parseDay(info.birth)); let late=null;
  for(let k=Math.max(0,pillarsAt(fromSec(d0)).i);k<JIE_T.length&&JIE_T[k]<d0+86400;k++){
    if(JIE_T[k]>d0+22*3600){const B=pillarsAt(fromSec(JIE_T[k])).p;late={name:JIE[k%12],at:fromSec(JIE_T[k]),yp:B[0],mp:B[1],fw:(G.indexOf(B[0][0])%2===0)===(info.gender==='男')};}
  }
  box.innerHTML=`<p class="hours-h"><b>时辰不详</b>现在按${P.shichen}时排，点别的时辰换着看</p>`
    +`<div class="hours-b" role="group" aria-label="选一个时辰">${rows.map(r=>`<button type="button" class="hr" data-hour="${r.h}" aria-pressed="${r.h===P.shichen}"><b>${r.h}时</b><span class="gz">${gzSpan(r.p[3])}</span></button>`).join('')}</div>`
    +`<p class="note long">${paras(hoursSay(rows,late))}</p>`;
}
/* 五行一页的生克图：五行排成一圈，火在最上面，顺时针是土、金、水、木，正好是相生的次序。相邻的相生（实线），隔一个的相克（虚线），
   箭头指向被生、被克的一方。每个圈旁边是这一类十神对日主的合称，日主所属的那一行圈加粗 */
/* 生克图共用的几样。pent(cx,cy,R,top)：五个位置排成一圈，第 top 个在最上面。
   ringLines：第 k 个生第 k+1 个（实线），克第 k+2 个（虚线），线照每个位置占的横竖半宽 A、B 截短，箭头指向被生、被克的一方。
   fillCircle：一个从下往上填了 frac（0 到 1）的圈，id 给裁剪用，一页里要唯一。arrowDef：箭头，一页里有两张图，id 不能重复 */
const f1=v=>v.toFixed(1);
function pent(cx,cy,R,top){return [0,1,2,3,4].map(k=>{const a=(k-top)*72*Math.PI/180;return [cx+R*Math.sin(a),cy-R*Math.cos(a)];});}
function ringLines(pos,mk,A,B){
  const cut=(ux,uy)=>1/Math.sqrt((ux/A)**2+(uy/B)**2);
  const seg=(a,b,cls)=>{const [x1,y1]=pos[a],[x2,y2]=pos[b],d=Math.hypot(x2-x1,y2-y1),ux=(x2-x1)/d,uy=(y2-y1)/d,t=cut(ux,uy);
    return `<line class="${cls}" data-l="${a}${b}" x1="${f1(x1+ux*(t+2))}" y1="${f1(y1+uy*(t+2))}" x2="${f1(x2-ux*(t+5))}" y2="${f1(y2-uy*(t+5))}" marker-end="url(#${mk})"/>`;};
  const ks=[0,1,2,3,4];
  return ks.map(k=>seg(k,(k+1)%5,'sh')).join('')+ks.map(k=>seg(k,(k+2)%5,'ke')).join('');
}
const arrowDef=mk=>`<marker id="${mk}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z"/></marker>`;
function fillCircle(id,x,y,r,frac){
  const h=2*r*Math.max(0,Math.min(1,frac||0)), hh=h>0.05?h:0;
  return `<clipPath id="${id}"><circle cx="${f1(x)}" cy="${f1(y)}" r="${r}"/></clipPath><circle class="bg" cx="${f1(x)}" cy="${f1(y)}" r="${r}"/>`
    +`<rect class="lvl" x="${f1(x-r)}" y="${f1(y+r-hh)}" width="${2*r}" height="${f1(hh)}" clip-path="url(#${id})"/>`
    +`<circle class="ring" cx="${f1(x)}" cy="${f1(y)}" r="${r}"/><circle class="halo" cx="${f1(x)}" cy="${f1(y)}" r="${r+4.5}"/>`;      // halo：点开或键盘选中时外面的一圈
}
/* 两张生克图的圈照什么数：图上方三个按钮，记在 MAPBY 里，也存进浏览器（bz-map），读写都包在 try/catch 里。
   五行图默认五行能量；十神图默认含藏干数，和十神表的个数一样。2026-11-15 用户要的：照五行一页三种数法的样子，给图加几个按钮换着看 */
const MAP_OPTS={wx:[['face','五行个数'],['cnt','含藏干数'],['nl','五行能量']],gods:[['face','十神个数'],['cnt','含藏干数'],['nl','能量']],yun:[['fy','扶抑的喜用'],['ys','用神和喜神'],['sum','两种相加']],gj:[['gjb','成败救应'],['gjz','格局组合']]};
const MAPBY={wx:'nl',gods:'cnt',yun:'fy',gj:'gjb'};      // yun：选择器小卡底下的条照哪一种看法（text.js 的 yunBasis）
try{const m=JSON.parse(localStorage.getItem('bz-map')||'{}');Object.keys(MAPBY).forEach(k=>{if(MAP_OPTS[k].some(o=>o[0]===m[k])) MAPBY[k]=m[k];});}catch(e){}
const mapSeg=(k,sub,label)=>`<div class="seg" role="group" aria-label="${label||'圈照什么数'}">${MAP_OPTS[k].map(([v,l])=>`<button type="button" data-map="${k}:${v}" aria-pressed="${MAPBY[k]===v}">${l}</button>`).join('')}</div><p class="seg-s">${sub}</p>`;
/* 五行一页的生克图：只画五行。火在最上面，顺时针是相生的次序。圈填多少照选中的数法（五行个数、含藏干数、五行能量），最多的一行填满；圈旁边写数。
   上半圈三个圈的字写在圈的上方，下面两个写在圈的下方，免得压在线上。日主所属的一行圈加粗。点圈打开的解释跟着数法：五行能量是 nl|，含藏干数是 wx|，五行个数是 wxf| */
function renderWxMap(){
  const de=gEl(DM), by=MAPBY.wx, wc=wxCounts(), s=by==='nl'?nlNow().sum:by==='cnt'?wc.cnt:wc.face, u=by==='nl'?'分':'个', mx=Math.max(1,...s), r=25, cy=136, pos=pent(150,cy,86,1);
  const key=e=>(by==='nl'?'nl|':by==='cnt'?'wx|':'wxf|')+e, open=by==='nl'?'点开看是怎么加出来的':'点开看在哪里';
  const say=[0,1,2,3,4].map(e=>`${EL[e]}生${EL[(e+1)%5]}`).join('，')+'；'+[0,1,2,3,4].map(e=>`${EL[e]}克${EL[(e+2)%5]}`).join('，')+'。'+[0,1,2,3,4].map(e=>`${EL[e]} ${s[e]} ${u}`).join('，');
  $('wxmap').innerHTML=`<svg viewBox="0 0 300 258" role="group" aria-label="五行生克图：${say}"><defs>${arrowDef('wxm-a')}</defs>${ringLines(pos,'wxm-a',r+3,r+3)}`
    +pos.map(([x,y],e)=>`<g class="nd ${ELC[e]}${e===de?' me':''}" data-n="${e}" data-x="${key(e)}" tabindex="0" role="button" aria-label="${EL[e]} ${s[e]} ${u}，${open}">${fillCircle('wxc'+e,x,y,r,s[e]/mx)}<text class="ch" x="${f1(x)}" y="${f1(y+1)}">${EL[e]}</text><text class="gp" x="${f1(x)}" y="${f1(y<cy?y-r-8:y+r+16)}">${s[e]} ${u}${e===de?'（日主）':''}</text></g>`).join('')
    +`</svg>`;
  $('note-wxmap').textContent=`圈填多少照表上面选的数法，最多的一行填满，其余照比例。实线是相生，虚线是相克，箭头指向被生、被克的一方。加粗的一圈是日主所属的一行。点圈看这一行${by==='nl'?'的分数是怎么加出来的':'的字在哪里'}。`;
}
/* 十神一页的生克图：中间是日主；里面一圈是五类十神，官杀在最上面，顺时针是相生的次序（官杀生印，印生比劫，比劫生食伤……），
   相邻的相生是实线，隔一个的相克是虚线，圈里写合称和它对日主的关系。外面一圈是十个十神，每一类两个，顺时针看前一个阴阳和日主不同（异性），
   后一个相同（同性）。圈填多少照它在盘里出现几处（连地支里藏的天干，不算日主自己），十个里最多的填满；五类的圈照两个加起来的数 */
function renderGodMap(){
  const de=gEl(DM), yin=isYin(DM)?1:0, by=MAPBY.gods, u=by==='nl'?'分':'处', pts=godVals(by);      // 数法和上面的十神表相同，按钮在表上面
  const cnt=g=>pts[g]||0;
  const C=195, R1=90, R2=152, r1=24, r2=19, top=3, ks=[0,1,2,3,4], pos=pent(C,C,R1,top), REL=['同我','我生','我克','克我','生我'];
  const pairs=ks.map(k=>{const e=(de+k)%5;return [G[e*2+1-yin],G[e*2+yin]].map((g,j)=>({n:god(g),c:cnt(g),same:j===1}));});
  const mxG=Math.max(1,...pairs.flat().map(o=>o.c)), sums=pairs.map(p=>p[0].c+p[1].c), mxC=Math.max(1,...sums);
  let gods='';
  pairs.forEach((p,k)=>{const base=(k-top)*72, e=(de+k)%5, [x0,y0]=pos[k];
    p.forEach((o,j)=>{const a=(base+(j?17:-17))*Math.PI/180, x=C+R2*Math.sin(a), y=C-R2*Math.cos(a), dx=x-x0, dy=y-y0, d=Math.hypot(dx,dy);
      const lx=C+(R2+r2+11)*Math.sin(a), ly=C-(R2+r2+11)*Math.cos(a);
      gods+=`<line class="br" x1="${f1(x0+dx/d*(r1+2))}" y1="${f1(y0+dy/d*(r1+2))}" x2="${f1(x-dx/d*(r2+2))}" y2="${f1(y-dy/d*(r2+2))}"/>`
        +`<g class="nd sm ${ELC[e]}" data-n="${k}" data-x="tg|${o.n}" tabindex="0" role="button" aria-label="${o.n} ${o.c} ${u}，点开看解释">${fillCircle(`gdg${k}${j}`,x,y,r2,o.c/mxG)}<text class="nm" x="${f1(x)}" y="${f1(y-4)}">${o.n}</text><text class="ct" x="${f1(x)}" y="${f1(y+8)}">${o.c} ${u}</text>`
        +`<text class="sx" x="${f1(lx)}" y="${f1(ly)}">${o.same?'同性':'异性'}</text></g>`;});
  });
  const cats=pos.map(([x,y],k)=>`<g class="nd ${ELC[(de+k)%5]}" data-n="${k}" data-x="grp|${k}" tabindex="0" role="button" aria-label="${GRP[k]}，${REL[k]}，点开看解释">${fillCircle('gdc'+k,x,y,r1,sums[k]/mxC)}<text class="ch2" x="${f1(x)}" y="${f1(y-5)}">${GRP[k]}</text><text class="ct" x="${f1(x)}" y="${f1(y+11)}">${REL[k]}</text></g>`).join('');
  const dm=`<g class="nd me ${ELC[de]}" data-x="kv|日主" tabindex="0" role="button" aria-label="日主${DM}，点开看解释"><circle class="bg" cx="${C}" cy="${C}" r="22"/><circle class="ring" cx="${C}" cy="${C}" r="22"/><circle class="halo" cx="${C}" cy="${C}" r="26.5"/><text class="ch" x="${C}" y="${C-3}">${DM}</text><text class="ct" x="${C}" y="${C+12}">日主</text></g>`;
  const say=ks.map(k=>`${GRP[k]}生${GRP[(k+1)%5]}`).join('，')+'；'+ks.map(k=>`${GRP[k]}克${GRP[(k+2)%5]}`).join('，')+'。'+pairs.flat().map(o=>`${o.n} ${o.c} ${u}`).join('，');
  $('note-godmap').textContent='中间是日主，里面一圈是五类十神，圈里写着它和日主的关系；外面一圈是十个十神，每一类两个，异性是阴阳和日主不同，同性是相同。'
    +`圈填多少照十神表上面选的数法，${by==='nl'?'这里是每个十神分到的五行能量':by==='cnt'?'这里是它在盘里出现几处，连地支里藏的天干一起数':'这里是它在盘面上出现几处，地支只算本气'}，最多的填满；里面一圈照两个加起来的数。实线是相生，虚线是相克，箭头指向被生、被克的一方。每个圈都可以点开看解释。`;
  $('godmap').innerHTML=`<svg viewBox="0 0 390 390" role="group" aria-label="十神生克图：${say}"><defs>${arrowDef('gdm-a')}</defs>${gods}${ringLines(pos,'gdm-a',r1+3,r1+3)}${cats}${dm}</svg>`;      // 怎么看这张图写在模板里图右边的一栏，和解读放在一起
}
/* 细盘的各行。cs 是要排的列：四柱细盘一页是 cols() 的八列，八字一页只有原局四列（NATAL）。
   原局的列就是 NATAL 里的对象，神煞照它在 NATAL 里的位置取 */
function panRows(cs){
  const cc=(c,i)=>`${c.dyn?'dyn':''}${c.dyn&&i===DYN-1?' last':''}${c.day?' day':''}`;
  const row=(label,fn,cls)=>`<tr${cls?` class="${cls}"`:''}><th scope="row">${xb('x','row|'+label,label)}</th>${cs.map((c,i)=>`<td class="${cc(c,i)}">${fn(c,i)}</td>`).join('')}</tr>`;
  return row('十神',c=>xb('x sm',`g|${c.k}|${c.g}`,c.day?'日主':god(c.g)))+
    row('天干',c=>glyph('g',c),'big')+
    row('地支',c=>glyph('z',c),'big')+
    row('藏干',c=>HID[c.z].split('').map(h=>xb('hs '+gCls(h),`h|${c.k}|${h}`,`${h}<small>${god(h)}</small>`)).join(''),'multi')+
    row('星运',c=>xb('x sm','st|'+c.k,stage(DM,c.z)))+
    row('自坐',c=>xb('x sm','zz|'+c.k,stage(c.g,c.z)))+
    row('空亡',c=>xb('x sm','xk|'+c.k,xunkong(c.g,c.z)))+
    row('纳音',c=>xb('x sm','ny|'+c.k,DATA.nayin[c.g+c.z]))+
    row('神煞',(c,i)=>{       // 前四列拿自己的干支去对原局查；四个字的名字在手机上折成两行
      const n=NATAL.indexOf(c), list=c.dyn?shenshaFor(P.pillars,DATA.nayin,!!P.gender,c.g+c.z,c.k):SHENSHA[n];
      return `<span class="ss">${list.length?list.map(s=>xb(s.n.length===4?'x w4':'x',`ss|${s.n}|${c.dyn?c.k:n}`,s.n)).join(''):'<span class="no">—</span>'}</span>`;},'multi');
}
/* 八字一页：只有原局四列，换人时画一次 */
/* 八字一页：左边是原局四列（行和四柱细盘相同），右边解读下面是四柱之间的合冲刑害，小签和干支关系一页的原局小签相同（data-x 一样） */
function renderBz(){
  $('bz').innerHTML=panRows(NATAL);
  const base=relations(NATAL);
  $('bz-rel-g').innerHTML=relChips(base.filter(r=>r.grp==='g'));
  $('bz-rel-z').innerHTML=relChips(base.filter(r=>r.grp==='z'));
}
function renderPan(){
  $('pan').innerHTML=panRows(cols());
  const dy=P.dayun[sel.dy];
  $('hd-lr').textContent=mdText(sel.d);
  $('hd-ly').textContent=jieMD(sel.y)[sel.m]+' 起';
  $('hd-ln').innerHTML=sel.y+'<span class="wide"> 年</span>';
  $('hd-dy').textContent=dy.y0+'–'+dy.y1;
}
/* 选择器小卡底下的条：这一柱带来的 13 分里喜用占几分（xiPillar），一段一种五行，后面是分数。
   照哪一种看法见 text.js 的 yunBasis：两种相加时满分 26，前一段扶抑、后一段用神和喜神，后一段的第一格带 cut，前面空一道缝。
   条带 data-x（key 见 text.js 的 xPk），点它打开这一柱的明细，不换选择；点小卡别的地方才是换选择 */
function mbar(gz,key){
  const v=xiPillar(gz), segs=v.basis.parts.map(p=>p.want.filter(e=>v.sum[e])).filter(a=>a.length)
    .map((a,j)=>a.map((e,i)=>`<i class="${ELC[e]}${j&&!i?' cut':''}" style="flex:${v.sum[e]}"></i>`).join('')).join('');
  return `<span class="mb" data-x="${key}"><span class="mb-bar"><span class="mb-fill" style="width:${(v.score/v.basis.max*100).toFixed(1)}%">${segs}</span></span><b>${v.score}</b></span>`;
}
function renderDayun(){
  $('dayun').innerHTML=P.dayun.map((d,i)=>`<button class="pk${i===NOW_DY?' now':''}" aria-pressed="${i===sel.dy}" data-dy="${i}"><span class="yr">${d.y0}–${d.y1}</span><span class="gz">${gzSpan(d.gz)}</span><span class="gd">${god(d.gz[0])}·${godZ(d.gz[1])}</span><span class="ag">${d.a0}–${d.a1} 岁</span>${mbar(d.gz,`pk|大运|${d.gz}|${d.y0}`)}</button>`).join('');
}
function renderLiunian(){
  const d=P.dayun[sel.dy]; let h='';
  for(let y=d.y0;y<=d.y1;y++){const gz=yearGZ(y);
    h+=`<button class="pk${y===REAL_Y?' now':''}" aria-pressed="${y===sel.y}" data-y="${y}"><span class="yr">${y}</span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])}·${godZ(gz[1])}</span><span class="ag">${y-P.clock[0]+1} 岁</span>${mbar(gz,`pk|流年|${gz}|${y}`)}</button>`;}
  $('liunian').innerHTML=h;
  $('h-ln').innerHTML=`流年<small>${d.gz}运</small>`;
}
function renderLiuyue(){
  const y=sel.y, j=jieMD(y), cur=y===REAL_Y?NOW_M:-1; let h='';
  for(let m=0;m<12;m++){const gz=monthGZ(y,m);
    h+=`<button class="pk${m===cur?' now':''}" aria-pressed="${m===sel.m}" data-m="${m}"><span class="yr">${JIE[m]} ${j[m]}</span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])}·${godZ(gz[1])}</span>${mbar(gz,`pk|流月|${gz}|${y}-${m}`)}</button>`;}
  $('liuyue').innerHTML=h;
  $('h-ly').innerHTML=`流月<small>${y} ${yearGZ(y)}年</small>`;
}
function renderLiuri(){
  const days=monthDays(sel.y,sel.m), W='日一二三四五六'; let h='';
  days.forEach(t=>{const gz=dayGZ(t);
    h+=`<button class="pk${t===TODAY?' now':''}" aria-pressed="${t===sel.d}" data-d="${t}"><span class="yr">${mdText(t)}<span class="ag"><i>周</i>${W[new Date(t).getUTCDay()]}</span></span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])}·${godZ(gz[1])}</span>${mbar(gz,`pk|流日|${gz}|${t}`)}</button>`;});
  $('liuri').innerHTML=h;
  $('h-lr').innerHTML=`流日<small>${monthGZ(sel.y,sel.m)}月</small>`;
}
function renderYunRead(){
  if(!$('layers')) return;      // 手写的解读顶替了这一段、里面又没有 #layers 时不画，免得整页报错
  const d=P.dayun[sel.dy];
  const rows=[
    ['大运',d.gz,`${d.y0}–${d.y1} 年 · ${d.a0}–${d.a1} 岁`],
    ['流年',yearGZ(sel.y),`${sel.y} 年 · ${sel.y-P.clock[0]+1} 岁`],
    ['流月',monthGZ(sel.y,sel.m),`${JIE[sel.m]} ${jieMD(sel.y)[sel.m]} 起`],
    ['流日',dayGZ(sel.d),`${new Date(sel.d).getUTCFullYear()} 年 ${mdText(sel.d)}`]];
  const x=xiNow(), say=gz=>{
    const g=gz[0], h=HID[gz[1]][0], a=god(g), b=god(h), xp=xiPillar(gz), v=xp.score, B=xp.basis;
    return `天干${g}是${a}，${eff(rel(g))}。地支${gz[1]}的本气${h}是${b}，${eff(rel(h))}。`+(a===b?`${a}的传统读法是${KW[a]}。`:`${a}的传统读法是${KW[a]}；${b}是${KW[b]}。`)
      +(B.mode==='sum'?`这一柱的 13 分里喜用占 ${xp.parts[0]} 分，${B.parts[1].name}占 ${xp.parts[1]} 分，两种相加 ${v} 分。`
        :B.mode==='ys'?`这一柱的 13 分里${B.short}占 ${v} 分。`:x.xi?`这一柱的 13 分里喜用占 ${v} 分。`:`这一柱的 13 分里帮日主的${HELP}占 ${v} 分。`);
  };
  $('layers').innerHTML=rows.map(r=>`<div><dt>${r[0]}<b class="cx" data-x="gz|${r[0]}" role="button" tabindex="0">${gzSpan(r[1])}</b><small>${r[2]}</small></dt><dd>${say(r[1])}</dd></div>`).join('');
}
function renderRelations(){
  const d=P.dayun[sel.dy], ln=yearGZ(sel.y), ly=monthGZ(sel.y,sel.m), lr=dayGZ(sel.d);
  const DY={k:'大运',g:d.gz[0],z:d.gz[1],layer:1}, LN={k:'流年',g:ln[0],z:ln[1],layer:2}, LY={k:'流月',g:ly[0],z:ly[1],layer:3}, LR={k:'流日',g:lr[0],z:lr[1],layer:4};
  const stemsFirst=(a,b)=>(a.grp==='g'?0:1)-(b.grp==='g'?0:1);
  const brought=(set,top)=>relations(set).filter(r=>r.top===top).sort(stemsFirst);
  const base=relations(NATAL);
  const byLayer=[base,brought(NATAL.concat(DY),1),brought(NATAL.concat(DY,LN),2),brought(NATAL.concat(DY,LN,LY),3),brought(NATAL.concat(DY,LN,LY,LR),4)];
  $('rel-ng').innerHTML=relChips(base.filter(r=>r.grp==='g'));
  $('rel-nz').innerHTML=relChips(base.filter(r=>r.grp==='z'));
  $('h-rdy').textContent=`大运 ${d.gz} 带来的`;
  $('rel-dy').innerHTML=relChips(byLayer[1]);
  $('h-rln').textContent=`流年 ${sel.y} ${ln} 带来的`;
  $('rel-ln').innerHTML=relChips(byLayer[2]);
  $('h-rly').textContent=`流月 ${ly}（${JIE[sel.m]} ${jieMD(sel.y)[sel.m]} 起）带来的`;
  $('rel-ly').innerHTML=relChips(byLayer[3]);
  $('h-rlr').textContent=`流日 ${lr}（${mdText(sel.d)}）带来的`;
  $('rel-lr').innerHTML=relChips(byLayer[4]);
  renderLinks(byLayer.flat());
}
/* 干支关系图：八柱横排，和细盘的列对齐。一张图里画两样东西。
   中间是八柱的干支。相邻的两个字之间一条细线、一个小圈，圈里写生、克或者同，箭头从生或克的一方指向另一方（按五行，地支用它自己的五行）。
   前四列（流日到大运）连成一串，原局四柱连成一串，两串之间不连；每一柱的干和支之间也标。
   上面是天干之间的合、冲、克，下面是地支之间的合、冲、刑、害：每一组有关系的字是一条横线，各圈一个圈，关系的名字压在线上（放不下的在线的上面）；
   同一组字有几种关系的（比如巳申同时是六合、相刑、相破）并排写在同一条线上。互不重叠的几条排在同一行，原局的靠近干支，各层带来的往外排。
   每个名字和下面对应的小签是同一个解释（data-x 相同）。电脑上显示这张图，窄屏上显示小签。 */
const LK_COL={流日:0,流月:1,流年:2,大运:3,年:4,月:5,日:6,时:7};
const LK_GW=['祖辈','父母','自己 · 配偶','子女'];
function renderLinks(all){
  const cs=cols();
  const pack=grp=>{
    const groups=[];
    all.filter(r=>r.grp===grp).forEach(r=>{
      const key=['rel',r.t,r.c,r.n,r.where.join('、'),r.top,r.grp].join('|');
      r.inst.forEach(ks=>{
        const ix=[...new Set(ks.map(k=>LK_COL[k]))].sort((a,b)=>a-b), id=ix.join(',');
        let it=groups.find(o=>o.id===id);
        if(!it){it={id,ix,a:ix[0],b:ix[ix.length-1],top:r.top,rels:[]};groups.push(it);}
        it.rels.push({r,key});
      });
    });
    groups.sort((x,y)=>x.top-y.top||(x.b-x.a)-(y.b-y.a)||x.a-y.a);
    const rows=[];
    groups.forEach(it=>{
      let i=rows.findIndex(row=>row.every(o=>it.a>o.b||it.b<o.a));
      if(i<0) i=rows.push([])-1;
      rows[i].push(it);it.row=i;
    });
    return {groups,n:rows.length};
  };
  const g=pack('g'), z=pack('z'), R=g.n;      // 中间那一块占六行，从第 R+1 行起：列名、天干的十神、天干、干支之间、地支、地支的十神
  const link=(it,row,isG)=>{
    const k=it.b-it.a+1, he=it.rels.map(o=>HE_TYPES.includes(o.r.t));
    const tone=he.some(Boolean)?'':' bad';       // 线型：全是冲刑害破克的用虚线，只要有相合一类的就用实线
    // 名字压在线上放不放得下：两个圈之间空着的长度是 (k−1) 列减一个圈（30），两头各留 4；名字的宽度照字数估（字 13、附注 12，每个小签另加边和内距 20、附注前的空 5）。
    // 列宽：九百宽的窗口 85，一千一百宽 110，一千二百八十宽 133（都扣了滚动条）。三个圈的中间有一个圈挡着，放在线上面
    const need=it.rels.reduce((s,o)=>s+o.r.t.length*13+20+(o.r.n?o.r.n.length*12+5:0),5*(it.rels.length-1)), room=w=>(k-1)*w-38;
    const inl=it.ix.length!==2?'':need<=room(85)?' in':need<=room(110)?' wide':need<=room(133)?' max':'';
    return `<span class="lk${tone}${inl}" data-k="${esc(it.id+'#'+it.rels.map(o=>o.key).join())}" style="grid-column:${it.a+2}/${it.b+3};grid-row:${row};--k:${k}"><span class="lk-ts">`
      +it.rels.map((o,j)=>`<button type="button" class="lk-t${he[j]?'':' bad'}" data-x="${esc(o.key)}">${esc(o.r.t)}${o.r.n?`<small>${esc(o.r.n)}</small>`:''}</button>`).join('')
      +'</span><span class="lk-l"></span>'
      +it.ix.map(i=>`<i class="${isG?gCls(cs[i].g):zCls(cs[i].z)} cx" data-x="${isG?'g':'z'}|${cs[i].k}|${isG?cs[i].g:cs[i].z}" role="button" tabindex="0" style="left:${((i-it.a+.5)/k*100).toFixed(3)}%">${isG?cs[i].g:cs[i].z}</i>`).join('')+'</span>';      // 线两头圈出来的字和中间那两行的字是同一条解释
  };
  // 相邻两个字之间的生克：a、b 是五行的序号。横的跨两列，竖的在一列里
  // 小圈能点：左右相邻的两个字是 sk|（生、克或者同类），一柱里上下的干和支是这一柱合起来的解释 gz|。2026-11-18 用户说这些「还是不能点」
  const sk=(a,b,cls,style,key)=>{const [k,dir]=skOf(a,b);return `<span class="${cls} ${k==='生'?'sheng':k==='克'?'ke':'tong'}${dir<0?' rev':''}" style="${style}"><b class="cx" data-x="${key}" role="button" tabindex="0">${k}</b></span>`;};
  const dy=P.dayun[sel.dy], sub=[mdText(sel.d),jieMD(sel.y)[sel.m]+' 起',sel.y+' 年',dy.y0+'–'+dy.y1].concat(LK_GW);
  let mid='';
  cs.forEach((c,i)=>{
    const col=`grid-column:${i+2}`;
    mid+=`<span class="lk-h" style="${col};grid-row:${R+1}">${c.dyn?c.k:c.k+'柱'}<small>${sub[i]}</small></span>`
      +`<span class="lk-g" style="${col};grid-row:${R+2}">${c.day?'日主':god(c.g)}</span>`
      +`<span class="lk-cell" style="${col};grid-row:${R+3}">${xb('x lk-c '+gCls(c.g),`g|${c.k}|${c.g}`,c.g)}</span>`
      +sk(gEl(c.g),zEl(c.z),'sk-y',`${col};grid-row:${R+4}`,`gz|${c.k}`)
      +`<span class="lk-cell" style="${col};grid-row:${R+5}">${xb('x lk-c '+zCls(c.z),`z|${c.k}|${c.z}`,c.z)}</span>`
      +`<span class="lk-g z" style="${col};grid-row:${R+6}">${godZ(c.z)}</span>`;
    if(i!==DYN-1&&i<cs.length-1){            // 大运和年柱之间不连：前四列是一串，原局是一串
      const n=cs[i+1], span=`grid-column:${i+2}/${i+4}`;
      mid+=sk(gEl(c.g),gEl(n.g),'sk-x',`${span};grid-row:${R+3}`,`sk|${c.k}|g|${n.k}|g`)+sk(zEl(c.z),zEl(n.z),'sk-x',`${span};grid-row:${R+5}`,`sk|${c.k}|z|${n.k}|z`);
    }
  });
  $('lkmap').innerHTML=
    `<span class="lk-bg" style="grid-row:1/${g.n+z.n+7}"></span>`
    +g.groups.map(it=>link(it,g.n-it.row,true)).join('')
    +`<span class="lk-n" style="grid-row:${R+3}">天干</span><span class="lk-n" style="grid-row:${R+5}">地支</span>`
    +mid
    +z.groups.map(it=>link(it,R+7+it.row,false)).join('');
}
/* 根和透：天干和地支上下之间的关系，一张表。一列一个地支，和细盘的八列对齐；一行一个天干，原局的四个在上面，下面是大运、流年、流月、流日的。
   格子里是这个地支里和这个天干同一五行的藏干（gtOf），有它就是这个天干在这里有根；是本气的标「本气」，和天干同一个字的标「透」。
   表头的第二行是八个地支和它们的藏干 */
function gtRows(){const cs=cols();return cs.slice(DYN).concat(cs.slice(0,DYN).reverse());}
function renderGT(){
  // 表头的小字和细盘的表头相同；.wide 的部分手机上不显示
  const cs=cols(), dy=P.dayun[sel.dy], sub=[mdText(sel.d),jieMD(sel.y)[sel.m]+' 起',sel.y+'<span class="wide"> 年</span>',dy.y0+'–'+dy.y1,'祖辈','父母','<span class="nb">自己</span><span class="wide"> · </span><wbr><span class="nb">配偶</span>','子女'];
  const cc=(c,i)=>`${c.dyn?'dyn':''}${i===DYN-1?' last':''}`;
  const head=`<tr><th></th>${cs.map((c,i)=>`<th class="${cc(c,i)}" scope="col">${c.dyn?c.k:c.k+'柱'}<small>${sub[i]}</small></th>`).join('')}</tr>`
    +`<tr class="zrow"><th scope="row"><span class="gt-k">地支</span><span class="gt-k">藏干</span></th>${cs.map((c,i)=>`<th class="${cc(c,i)}" scope="col">${xb('x gt-z '+zCls(c.z),`z|${c.k}|${c.z}`,c.z)}<small>${HID[c.z].split('').map(h=>`<span class="${gCls(h)}">${h}</span>`).join('')}</small></th>`).join('')}</tr>`;
  const body=gtRows().map(r=>`<tr${r.dyn?' class="drow"':''}><th scope="row"><span class="gt-k">${r.dyn?r.k:r.k+'干'}</span><span class="gt-l">${xb('x gt-s '+gCls(r.g),`g|${r.k}|${r.g}`,r.g)}<span class="gt-g">${r.day?'日主':god(r.g)}</span></span></th>`
    +cs.map((c,i)=>{const t=gtOf(r.g,c.z);
      return `<td class="${cc(c,i)}">${t?xb(`gt-c${t.ben?' ben':''}${t.tou?' tou':''}`,`gt|${r.k}|${c.k}`,`<i class="${gCls(t.h)}">${t.h}</i>${t.ben||t.tou?`<small>${[t.ben?'本气':'',t.tou?'透':''].filter(Boolean).join('<br>')}</small>`:''}`):''}</td>`;}).join('')+'</tr>').join('');
  $('gtmap').innerHTML=`<table class="gt"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
/* 宫位表（原局最后一页「六亲」的下半）：一列一柱（gwCols），八行：配谁、干支、十神、配的亲属、和别的柱、十二长生、空亡、五行能量。只列事实 */
function renderGw(){
  const cs=gwCols(), row=(label,fn)=>`<tr><th scope="row">${label}</th>${cs.map(c=>`<td>${fn(c)}</td>`).join('')}</tr>`;
  const tg=gd=>gd==='日主'?gd:xb('x','tg|'+gd,gd), five=s=>[0,1,2,3,4].filter(e=>s[e]).map(e=>`${EL[e]} ${s[e]} 分`).join('、');
  $('gwmap').innerHTML=`<table class="gods gw"><thead><tr><th></th>${cs.map(c=>`<th scope="col">${xb('x','col|'+c.k,c.k+'柱')}</th>`).join('')}</tr></thead><tbody>`
    +row('配谁',c=>c.who)
    +row('干支',c=>`<span class="gz">${xb('x','gz|'+c.k,gzSpan(c.g+c.z))}</span>`)      // 干支成对出现的地方，点开是这一柱合起来的解释（gz|），不拆成天干、地支两条。2026-11-18 用户要的
    +row('十神',c=>`天干${c.g}：${tg(c.god)}<br>地支${c.z}里：${c.hid.map(([h,gd],j,a)=>`<span class="nb">${h} ${tg(gd)}${j<a.length-1?'、':''}</span>`).join('')}`)
    +row('配的亲属',c=>c.kin.length?c.kin.map(r=>`${r.who}看${tg(r.god)}：${r.at.length?'在这一柱，'+r.at.join('、'):'不在这一柱'}`).join('<br>'):'六亲表里没有配祖上的十神')
    +row('和别的柱',c=>c.rel.length?c.rel.map(r=>`和${r.others.join('、')}${xb('x',r.key,r.t)}${r.n?`（${r.n}）`:''}`).join('<br>'):'和另外三柱之间没有合、冲、刑、害')
    +row('十二长生',c=>`${c.g}坐${c.z}是${xb('x','zz|'+c.k,c.zz)}`+(c.day?'':`<br>日主到${c.z}是${xb('x','st|'+c.k,c.st)}`))
    +row('空亡',c=>c.xk)
    +row('五行能量',c=>`<span class="stkw top" style="width:${Math.round(c.nl.total/21*100)}%">${stk(c.nl.sum)}</span>${xb('x','nlp|'+c.k,c.nl.total+' 分')}：${five(c.nl.sum)}<br>帮日主的 ${c.nl.help} 分，其余 ${c.nl.rest} 分`)      // 条在文字上面：文字有长有短，条放在下面四柱对不齐（2026-11-18 排版审阅）
    +'</tbody></table>';
}
/* 计分一页：一行一层的表（nlLayers），表下面的说明和解读；选择器上方的图例。小卡底下的条由 mbar() 画在选择器里，跟着选择器一起重画 */
function renderSy(){
  const L=nlLayers(), x=xiNow(), de=gEl(DM), se=(de+4)%5, n=(v,plus)=>(plus?'+':'')+v;
  const mark=g=>x.xi&&g.every(e=>x.xi.includes(e))?' · 喜用':'';
  $('sy-h').innerHTML=`<tr><th scope="col">层</th>${[...EL].map((e,i)=>`<th scope="col" class="${ELC[i]}">${e}</th>`).join('')}<th scope="col">帮日主<small>${EL[de]}、${EL[se]}${mark([se,de])}</small></th><th scope="col">另外三类<small>${[1,2,3].map(k=>EL[(de+k)%5]).join('、')}${mark([(de+1)%5,(de+2)%5,(de+3)%5])}</small></th><th scope="col">加到这一层<small>帮日主的占</small></th></tr>`;
  const tr=(r,plus,cls)=>`<tr${cls?` class="${cls}"`:''}><th scope="row">${xb('x','nly|'+r.k,r.k)}${r.gz?`<span class="gz">${gzSpan(r.gz)}</span>`:''}</th>${r.sum.map(v=>`<td>${v?n(v,plus):''}</td>`).join('')}<td>${n(r.help,plus)}</td><td>${n(r.rest,plus)}</td><td>${r.acc}</td></tr>`;
  $('sy').innerHTML=L.rows.map((r,i)=>tr(r,i>0)).join('')+tr(L.tot,false,'sum');
  // 图例：选择器小卡底下的条照哪一种看法（三个按钮：用神不定的盘不能照用神，两种相加要扶抑的喜用和用神都定了），算进去的几种五行；两种相加时两种各列一遍
  const off={fy:'',ys:yb0=>yb0.canYs?'':'这张盘的用神不定',sum:yb0=>yb0.canSum?'':x.xi?'这张盘的用神不定':'这张盘扶抑取不了喜用'};
  const yb=yunBasis(), seg=`<span class="seg inl" role="group" aria-label="小卡底下的条照哪一种看法">${MAP_OPTS.yun.map(([v,l])=>{const t=off[v]&&off[v](yb);return `<button type="button" data-map="yun:${v}" aria-pressed="${yb.mode===v}"${t?` disabled title="${t}"`:''}>${l}</button>`;}).join('')}</span>`;
  const chips=w=>w.map(e=>`<span class="${ELC[e]}"><i></i>${EL[e]}</span>`).join(''), lyXi=xb('x','xi','喜用（扶抑）'), lyYs=xb('x','ys|用神',yb.mode==='ys'?yb.name:yb.mode==='sum'?yb.parts[1].name:'用神和喜神');
  const grp=h=>`<span class="lg-g">${h}</span>`;      // 名字和它的色块排在一起，窄屏换行时不拆开
  const what=yb.mode==='sum'?grp(lyXi+chips(yb.parts[0].want))+grp('<span>加上</span>'+lyYs+chips(yb.parts[1].want))
    :grp((yb.mode==='ys'?lyYs:x.xi?lyXi:'<span>不定喜用，画帮日主的</span>')+chips(yb.want));
  $('sy-lg').innerHTML='<span>小卡底下的条</span>'+seg+what+`<span class="rest"><i></i>其余</span><span>满分 ${yb.max}</span>`;
  $('note-syfig').innerHTML=paras(noteSyFig()); $('note-sy').innerHTML=paras(noteSy());      // 两句都跟着小卡的按钮变
  $('rd-tr').innerHTML=readHTML('tr');      // 小卡底下那些条的解读跟着选中的大运和年份变
}
/* 格局一页的格局组合（text.js 的 gjzNow）：成格、败格两组。盘里有的组合一行一个：名字和全称的一句、透出还是藏着、谁在哪里、
   两边的分数和一条分段的条、《子平真诠》在哪几格下面讲（这张盘的格加粗）；没有的并成一行，名字照样能点开。最后一行指向强弱一页的从格 */
/* 喜忌一页「调候的情形」：《穷通宝鉴》这个月开头一句后面分的各种情形，一种一枚可以点的小签，合的排在前面；点开是解释 */
function renderThc(){
  const t=thNow();
  const tag=o=>`<button type="button" class="tg${o.ok?' yes':''}" data-x="thc|${o.i}">「${o.q}」<small>${thState(o.ok)}</small></button>`;
  const row=(title,xs)=>xs.length?`<div class="tgrow"><h4>${title}</h4><div class="rels">${xs.map(tag).join('')}</div></div>`:'';
  $('thc').innerHTML=row('这张盘合的',t.cases.filter(o=>o.ok===true))+row('待核对的',t.cases.filter(o=>o.ok===null))+row('没有合的',t.cases.filter(o=>o.ok===false));
  $('thc-say').innerHTML=thcSay();
  $('note-thc').innerHTML=paras(noteThc());
}
/* 格局一页的两张表一次只显示一张：上面两个小标签「成败救应」「格局组合」，点哪个看哪个。
   2026-11-18 用户说两张表连着排太长，「做成可以点的小标签」，意思是标签页：「一个写这个一个写那个」。
   我先做成了一枚枚可以点的小签，用户说理解错了，改回表格加标签。选的是哪一张记在 MAPBY.gj 里，和别的几组按钮一样存进浏览器 */
function renderGjSeg(){
  const by=MAPBY.gj;
  $('gj-seg').innerHTML=mapSeg('gj',by==='gjb'?'照这张盘归的格，逐条核对《子平真诠》「论用神成败救应」':'常说的十几个组合，不分格，照书里的原文逐条核对','格局一页看哪一张表');
  $('gjb-block').hidden=by!=='gjb'; $('gjz-block').hidden=by!=='gjz';
}
function renderGjz(){
  const r=gjzNow(), ge=gjzGe();
  const bar=o=>o.sides?`<span class="gjz-sc"><span class="gjz-bar">${o.sides.map(x=>`<i class="${ELC[x.e]}" style="flex:${x.n}"></i>`).join('')}</span><span class="gjz-n">${o.sides.map(x=>`${x.say} ${x.n}`).join(' · ')}</span></span>`:'<span class="gjz-n">不比分数</span>';
  const row=o=>`<tr><th scope="row">${xb('x','gjz|'+o.n,o.n)}<small>${o.hua}</small></th><td>${xb('gjz-st'+(o.st==='透'?' t':''),'gjz|'+o.n,o.n==='合财合官'?'合':o.st==='透'?'透出':'藏着')}<span class="gjz-w">${gjzBrief(o)}</span></td><td>${bar(o)}</td>`
    +`<td class="gjz-ge">${o.ge.length?o.ge.map(g=>ge.includes(g)?`<b>${g}</b>`:g).join('、'):'不分格局'}</td></tr>`;
  const grp=(c,title)=>{const yes=r.list.filter(o=>o.c===c&&o.st!=='无'), no=r.list.filter(o=>o.c===c&&o.st==='无');
    return `<tr class="gjz-h"><th colspan="4" scope="colgroup">${title}</th></tr>`+yes.map(row).join('')+(no.length?`<tr class="gjz-no"><td colspan="4">这张盘没有：${no.map(o=>xb('x','gjz|'+o.n,o.n)).join('、')}</td></tr>`:'');};
  $('gjz').innerHTML=grp('成','书里算成格的')+grp('败','书里算败格的')
    +`<tr class="gjz-no"><td colspan="4">${xb('x','kv|从格','从格')}在「强弱」一页另有一行，这张盘${congNow().ok?'合':'不合'}那一行核对的条件。</td></tr>`;
  $('note-gjz').innerHTML=paras(noteGjz());
}
/* 格局一页的成败救应表（标签「成败救应」下面）：照这张盘归的格（一个或两个），把「论用神成败救应」的各条按成、败、带忌、救应分四段列出来。
   每一行：书里的话（点开是解释）和一句白话；合、不合或者定不了；几项条件，没有合的那一项后面标出来。表上面一句话是四类各合几条和归纳 */
function renderGjb(){
  const r=gjbNow();
  const row=o=>`<tr${o.ok===true?'':' class="gjb-off"'}><th scope="row">${xb('x','gjb|'+o.id,'「'+o.t+'」')}<small>${GJB_HW[o.id]}</small></th>`
    +`<td>${xb('gjz-st'+(o.ok===true?' t':''),'gjb|'+o.id,o.ok===null?'定不了':o.ok?'合':'不合')}<span class="gjz-w">${o.need.map(([l,v])=>l+(v===null?'（定不了）':v?'':'（不合）')).join('；')}${o.ok===true&&gjbCaveat(o)?'<br>'+gjbCaveat(o):''}</span></td></tr>`;
  $('gjb').innerHTML=r.groups.map(g=>(r.groups.length>1?`<tr class="gjz-h"><th colspan="2" scope="colgroup">${g.ge}</th></tr>`:'')
    +GJB_K.map(([k,title])=>{const rs=g.rows.filter(o=>o.k===k);return rs.length?`<tr class="gjz-h"><th colspan="2" scope="colgroup">${title}</th></tr>`+rs.map(row).join(''):'';}).join('')).join('');
  $('gjb-say').innerHTML=parasHTML(gjbSay());
  $('note-gjb').innerHTML=paras(noteGjb());
}
/* 强弱一页中间的强弱分析：日主，强弱计分归的类和分数，一条标着 25 分、30 分两道线和这张盘分数的条，分数从哪里来，扶抑取的喜用和忌 */
function renderQs(){
  const r=qsNow(), pt=qsParts(DM,NATAL,true), x=xiNow(), de=gEl(DM), se=(de+4)%5, W=r.total, pos=v=>(v/W*100).toFixed(2)+'%';
  const fill=[se,de].filter(e=>r.sum[e]).map(e=>`<i class="${ELC[e]}" style="flex:${r.sum[e]}"></i>`).join('');
  const gauge=`<div class="qg" role="img" aria-label="${HELP} ${r.help} 分，满分 ${W} 分；25 分以下身弱，30 分以上身强">`
    +`<span class="qg-v" style="left:${pos(r.help)}">${r.help} 分</span>`
    +`<div class="qg-bar"><span class="qg-fill" style="width:${pos(r.help)}">${fill}</span><i class="qg-tk" style="left:${pos(25)}"></i><i class="qg-tk" style="left:${pos(30)}"></i></div>`
    +`<div class="qg-ax"><span style="left:0">0</span><span style="left:${pos(25)}">25</span><span style="left:${pos(30)}">30</span><span style="left:100%">${W}</span></div>`
    +`<div class="qg-zone" style="grid-template-columns:25fr 5fr ${W-30}fr"><span>身弱</span><span></span><span>身强</span></div></div>`;
  const tile=(k,v,sub,key)=>`<div class="qt cx" data-x="qsp|${key}" role="button" tabindex="0"><span>${k}</span><b>${v} 分</b><small>${sub}</small></div>`;      // 四块都能点，打开这一块的分数是哪几笔
  $('qs').innerHTML=`<div class="qs-dm"><span>日主</span><b class="${gCls(DM)} cx" data-x="kv|日主" role="button" tabindex="0">${DM}</b><small>${yy(DM)}${EL[de]}</small></div>`
    +`<div class="qs-main">`
    +`<div class="qs-h"><h3>${xb('x','kv|强弱计分','强弱计分')}</h3><b class="qs-t">${({强:'身强',弱:'身弱',间:'强弱居中'})[r.tier]}</b><span>${HELP} ${r.help} 分，满分 ${W} 分</span></div>`
    +gauge
    +`<div class="qt-row">${tile('日主自己',pt.self,`日干${DM}`+(pt.meFrom!==undefined?`，合化改记${EL[(nlNow().items.find(x=>x.i===2&&x.j===0)||{}).e]}`:''),'self')}${tile('月支',pt.yue,`${NATAL[1].z}，分数加倍`,'yue')}${tile('另外三个地支',pt.zhi,'年支、日支、时支','zhi')}${tile('三个天干',pt.gan,'年干、月干、时干','gan')}</div>`
    +`<ul class="qs-li">${pt.items.length?pt.items.map(it=>`<li><span class="cx" data-x="${it.pos==='干'?'g':'h'}|${it.k}|${it.ch}" role="button" tabindex="0">${qsSay(it)}</span></li>`).join(''):`<li>除了日主自己，八个字里没有${EL[de]}和${EL[se]}</li>`}</ul>`
    +`</div>`;
}
/* 喜忌一页最上面：扶抑取的喜用和忌，照「强弱」一页的强弱计分 */
function renderXi(){
  // 两套取法各一块，各有标题、结果和一句说明：左边（手机上在上面）是扶抑的喜用和忌，右边是用神和喜神、忌神、仇神、闲神。
  // 左边两个小标题是「喜用」和「忌」：原来是「喜用（扶抑）」和「忌」，用户问「这俩标签的词并列吗」，括号里的说明挪到了这一块的标题上
  // 原来两排放在一个框里、中间一道虚线，排版审阅说容易读成同一套判断（2026-11-18）
  const x=xiNow(), y=yongNow(), de=gEl(DM), els=a=>a.map(e=>`<span class="${ELC[e]} cx" data-x="xe|${e}" role="button" tabindex="0">${ic(e)}${EL[e]}</span>`).join('');      // 字块能点：这一行五行在两套取法里各是什么（xe|）
  const fy=x.xi?`<div class="qx"><span>${xb('x','xi','喜用')}</span><b>${els(x.xi)}</b></div><div class="qx"><span>${xb('x','ji','忌')}</span><b>${els(x.ji)}</b></div>`
    :`<div class="qx"><span>${xb('x','xi','喜用')}</span><b class="no">不定</b></div>`;
  const fySub=`<p class="sub">${x.lean?`「强弱」一页的强弱计分 ${x.help} 分，在 25 分和 30 分之间，强弱居中，分不出该扶还是该抑。喜用照「用神」那一块${yongNow().pair?'取，其余三行算忌':'的用神和喜神取，忌照忌神和仇神取'}。`:x.xi?`照「强弱」一页的强弱计分，这张盘身${x.tier}（${HELP} ${x.help} 分）。扶抑一家说身弱扶它、身强抑它，喜用就是这样取的。`:`「强弱」一页的强弱计分在 25 分和 30 分之间，这种算法没有说这一段算强还是算弱，扶抑取不了喜用。`}${congNow().ok?'这张盘合「强弱」一页「从格」一行核对的条件，照从格的书，喜忌和这里正好相反。':''}${huaNow().gan.ok?'这张盘合「强弱」一页「合化」一行核对的化气格条件，照《千里命稿》化气格喜生助化神，和这里的扶抑不同；「用神」那一块照任铁樵以化神为体。':''}点「喜用」看依据和别家的取法。</p>`;
  // 用神那一块：用神、喜神、忌神、仇神、闲神各一格，字块是五行，底下写是哪两个十神。
  // 强弱未定、用神取了印和比劫两类的盘（y.pair）：一格里两种五行，分不出喜神、忌神，那几格不画
  const blk=(nm,k)=>`<div class="qx"><span>${xb('x','ys|'+nm,nm)}</span><b>${els([(de+k)%5])}</b><small>${CAT[k][0]}</small></div>`;
  const ys=y.yong!==null?YONG_SHEN.map(([nm,f],j)=>blk(nm,j?y.shen[f]:y.yong)).join('')
    :y.pair?`<div class="qx"><span>${xb('x','ys|用神','用神')}</span><b>${els(y.pair.map(k=>(de+k)%5))}</b><small>${y.pair.map(k=>CAT[k][0]).join('、')}</small></div>`
    :`<div class="qx"><span>${xb('x','ys|用神','用神')}</span><b class="no">不定</b></div>`;
  $('xi').innerHTML=`<div class="xi-g"><h4>扶抑的喜用和忌<small>照强弱计分：身弱扶它，身强抑它</small></h4><div class="xi-r">${fy}</div>${fySub}</div>`
    +`<div class="xi-g"><h4>用神<small>照任铁樵《滴天髓阐微》的注，再分出喜神、忌神、仇神、闲神</small></h4><div class="xi-r">${ys}</div><p class="sub">${yongSay()}</p></div>`;
}
/* 「强弱」一页最上面的四张卡片：得令、得地、得势、得气（数据在 text.js 的 sideFour）。每张是标题（点开看解释）、判语、一排小格子、一句话。
   小格子帮日主的（有根、帮扶、气盛）垫日主那一行五行的淡底，得令一张是旺相休囚死五格，日主落在哪一格就垫哪一格 */
function renderSd(){
  const f=sideFour(), r=f.r, de=gEl(DM), me=ELC[de], ST=['旺','相','休','囚','死'];
  // 小格子都能点：得令的五格是月令状态（zt|），得地是那个地支（z|），得势是那个天干（g|），得气是日主在那一支上的十二长生（st|）。
  // 2026-11-18 用户问「这些为什么不能点」。帮日主的格子垫淡底，样式名叫 hit；on 留给「解释正开着」的标记
  const tile=(top,ch,cls,sub,on,key)=>`<span class="sd-t${on?' hit '+me:''}" data-x="${key}" role="button" tabindex="0"><small>${top}</small><b class="${cls}">${ch}</b><em>${sub}</em></span>`;
  const card=(nm,o,body)=>`<div class="sd-c${o.ok?' ok':''}"><div class="sd-h">${xb('x','sd|'+nm,nm)}<span class="sd-v">${o.v}</span></div><div class="sd-b">${body}</div><p class="sd-s">${sdSay(nm)}</p></div>`;
  $('sd').innerHTML=card('得令',f.ling,`<span class="sd-st">${ST.map(s=>`<i class="${s===r.st?'hit '+me:''}" data-x="zt|${s}" role="button" tabindex="0">${s}</i>`).join('')}</span>`)
    +card('得地',f.di,f.di.zhi.map(x=>tile(x.k+'支',x.z,zCls(x.z),x.root?'根 '+x.root:x.seal?'印 '+x.seal:'·',!!x.root,`z|${x.k}|${x.z}`)).join(''))
    +card('得势',f.shi,r.gan.map(x=>tile(x.k+'干',x.g,gCls(x.g),god(x.g),x.r===0||x.r===4,`g|${x.k}|${x.g}`)).join(''))
    +card('得气',f.qi,r.zhi.map(x=>tile(x.k+'支',x.z,zCls(x.z),x.s,STAGES.indexOf(x.s)<5,`st|${x.k}`)).join(''));
}
function renderBars(){
  // 五行一页的表：一行一种五行，数法照表上面的按钮（MAPBY.wx），和下面的五行生克图相同。名字点开的解释跟着数法：五行能量是 nl|，含藏干数是 wx|，五行个数是 wxf|
  const by=MAPBY.wx, wc=wxCounts(), v=by==='nl'?nlNow().sum:by==='cnt'?wc.cnt:wc.face, u=by==='nl'?'分':'个', tot=v.reduce((a,b)=>a+b,0), mx=Math.max(1,...v), de=gEl(DM);
  const key=e=>(by==='nl'?'nl|':by==='cnt'?'wx|':'wxf|')+e;
  $('wx-seg').innerHTML=mapSeg('wx',(by==='nl'?'五行能量：藏干分主次，月支加倍，一共 60 分':by==='cnt'?`含藏干数：四个天干加${cn(natalHidden().length)}个藏干`:'五行个数：只数盘面的八个字')+'。下面的表和五行生克图都照它');
  $('wxt-h').textContent=by==='nl'?'分数':'个数';
  $('wxt').innerHTML=[0,1,2,3,4].map(i=>{const k=(i-de+5)%5;
    return `<tr><td class="${ELC[i]}">${xb('x',key(i),`<span class="el">${ic(i)}${EL[i]}</span>`)}</td><td>${CAT[k][1]}<span class="gp">${xb('x','grp|'+k,GRP[k])}</span><small class="mn">${GOD_MEAN[k]}</small></td>`
      +`<td class="${ELC[i]}"><span class="wn"><b>${v[i]} ${u}</b><span class="track${by==='nl'?' avg':''}"${by==='nl'?` style="--avg:${(tot/5/mx*100).toFixed(2)}%"`:''}><span class="fill" style="width:${Math.round(v[i]/mx*100)}%"></span></span></span></td>`
      +`<td>${pct(v[i],tot)}</td><td>${xb('st','wst|'+i,wxState(i))}</td><td class="wh">${wxWhere(i,by)}</td></tr>`;}).join('');
  $('note-nl').innerHTML=paras(by==='nl'?noteNl():by==='cnt'?'含藏干数：四个天干，加上地支里藏的每一个天干各算一个，不分主次，月支也不加倍。':'五行个数：四个天干，加上四个地支各按自己的五行算一个，不看地支里藏的天干。');
  $('note-wx').textContent=noteWx();
}
const GOD_MEAN=['和我一样的人：自我、同辈、朋友和竞争者','我产出的东西：表达、才艺、作品','我能支配的东西：财物、资源','约束我的东西：规则、职位、压力','滋养我的东西：学问、庇护、长辈'];
function renderGods(){
  const by=MAPBY.gods, v=godVals(by), u=by==='nl'?'分':'处', de=gEl(DM), yin=isYin(DM)?1:0;
  // 每个十神的数照表上面按钮选的数法（godVals），和下面的十神生克图相同。数后面跟一小段条：个数一处 9 像素，能量 5 分算一处
  $('gods-seg').innerHTML=mapSeg('gods',GOD_BY[by]+'。下面的表和十神生克图都照它');
  $('h-gods-s').textContent=`以${DMN}为原点；不算日主自己`;
  const cell=g=>{const n=v[g]||0;
    return `<td>${xb('x','tg|'+god(g),god(g))}（<span class="${gCls(g)}">${g}</span>）<span class="gn">${n?`${n} ${u}<i style="--n:${by==='nl'?+(n/5).toFixed(2):n}"></i>`:'没有'}</span></td>`;};
  $('gods').innerHTML=CAT.map((r,i)=>{const e=(de+i)%5;
    return `<tr><td>${r[1]}<span class="gp">${xb('x','grp|'+i,GRP[i])}</span></td><td class="${ELC[e]}"><span class="eli">${ic(e)}${EL[e]}</span></td>${cell(G[e*2+yin])}${cell(G[e*2+1-yin])}<td>${GOD_MEAN[i]}</td></tr>`;}).join('');
  $('liuqin').innerHTML=liuqinRows().map(r=>`<tr><td>${r.who}</td><td>${xb('x','tg|'+r.god,r.god)}</td><td>${r.at}</td><td>${r.gong}</td></tr>`).join('');
  $('note-lq').textContent=noteLq();
}
/* 横条里选中的那一格不在看得见的范围里时，把它挪到中间。34：两头淡出的一截也算看不见。ids：只管哪几条，不写就是四条。
   平常是滑过去；换人、解释正开在这一条里（卡片要跟着字摆）的时候直接到位。
   不用挪的也要说一声停在原处：上一次的平滑滚动可能还没走完，会把选中的带出去（2026-11-22 审阅） */
const midOf=(box,b)=>b.offsetLeft-(box.clientWidth-b.offsetWidth)/2, outOf=(box,b)=>b.offsetLeft<box.scrollLeft+34||b.offsetLeft+b.offsetWidth>box.scrollLeft+box.clientWidth-34;
function rollTo(box,left,smooth){if(smooth&&!calm()&&box.scrollTo) box.scrollTo({left,behavior:'smooth'});else box.scrollLeft=left;}
function reveal(ids){
  const own=sel.x?anchorOf(sel.x,sel.xn,sel.xh):null;
  (ids||PICK).forEach(id=>{
    const box=$(id), b=box.querySelector('[aria-pressed="true"]');
    if(!b||!box.clientWidth) return;
    if(outOf(box,b)) rollTo(box,midOf(box,b),!SWITCH&&!(own&&box.contains(own))); else rollTo(box,box.scrollLeft);
  });
  edges();
}
/* 横条滚得动的时候，哪一头还有没露出来的卡片，那一头淡出（样式里的 .sl、.sr） */
function edges(){document.querySelectorAll('.picker').forEach(p=>{const m=p.scrollWidth-p.clientWidth, can=m>3&&getComputedStyle(p).overflowX!=='visible';p.classList.toggle('sl',can&&p.scrollLeft>3);p.classList.toggle('sr',can&&p.scrollLeft<m-3);});}      // 电脑上的流日是一格一格排的，不滚，不淡出
function renderDyNote(){const t=dyNote(), n=$('note-dy'); n.textContent=t; n.hidden=!t;}      // 选中的日子不在选中的那一步大运里时，选择器下面说一句
function renderDynamic(){moving(()=>{fixDay();renderPan();renderDayun();renderLiunian();renderLiuyue();renderLiuri();renderDyNote();renderRelations();renderGT();renderSy();renderYunRead();reveal();refreshSheet();});}

/* ---------- 添加、编辑、导入、导出 ---------- */
let editing=null;                  // 正在编辑的那个人的 id；新添加时是 null
const F=id=>$('pf-'+id);
/* ---------- 分享链接 ----------
   链接一律指向公开的页面：本地打开的文件、artifact 里的地址，别人打不开。参数的写法见 chart.js 的 linkOf。
   打开链接时先当作临时的人（TEMP）显示，标「来自链接」，不自动存；和已有的人是同一份出生信息的，直接换到那一位。 */
const SHARE_BASE='https://zhucongx.github.io/bazi-chart/';
const isoDay=t=>new Date(t).toISOString().slice(0,10);
/* 现在这一位、现在看的位置写成的链接。页面里排不了的古人（1900 年以前）只写编号，链接只在页面自带这一位时打得开 */
function shareNow(){
  const info=infoOf(P), ok=info&&!checkInfo(info);
  const q=new URLSearchParams(ok?linkOf(Object.assign({},info,{name:P.name})):'p='+encodeURIComponent(P.id));
  if(ok&&info.nohour) q.set('h',P.shichen);          // 时辰不详的，带上正在看的时辰，对方打开看到的是同一张盘
  q.set('tab',sel.tab.natal+','+sel.tab.pan);q.set('dy',String(sel.dy));q.set('y',String(sel.y));q.set('m',String(sel.m));q.set('d',isoDay(sel.d));
  q.set('by',[MAPBY.wx,MAPBY.gods,MAPBY.yun,MAPBY.gj].join(','));      // 五行、十神两页的数法和选择器小卡的计分模式，对方打开看到的分数和图一样（审阅报告 R3）
  return {url:SHARE_BASE+'#'+q.toString(),what:!ok?'这一位在页面里的编号，不含出生信息；只在页面自带这一位时打得开':info.nohour?'出生日期和正在看的时辰':info.shichen?'出生日期和时辰':'出生日期、时间和出生地的经度'};
}
function refreshShare(){
  if(!$('share')||$('share').hidden||!P) return;
  const s=shareNow();
  $('share-url').value=s.url;
  $('share-t').textContent=`分享${P.name}：链接里有${s.what}，发给谁，谁打开就能看到这张盘，也会停在现在看的这一页和这一年。链接里的内容不经过任何服务器，但收到链接的人都能看到。`;
}
function openShare(){
  if($('share').hidden) openBox($('share'));
  $('share').hidden=false;$('share-msg').textContent='';
  refreshShare();copyShare();
}
function copyShare(){
  const box=$('share-url'), url=box.value, fail=()=>{box.focus();box.select();$('share-msg').textContent='没能自动复制，链接已经选中，请手动复制。';};
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(()=>{$('share-msg').textContent='链接已经复制。';},fail);
    else fail();
  }catch(e){fail();}
}
/* 打开链接：hash 是 location.hash，fallback 是链接不对时先显示的人（启动时是上次看的那一位）。不是分享链接的返回 false */
function openLink(hash,fallback){
  const s=String(hash||'').replace(/^#/,''); if(!s) return false;
  const q=new URLSearchParams(s), keys=[...q.keys()];
  if(!keys.some(k=>['p','b','bz','n','g','sh','nh','lon'].includes(k))){
    if(!keys.some(k=>['tab','dy','y','m','d','h','by'].includes(k))) return false;
    const at=P?sel.p:fallback||0;
    if(pickHour(q,at)||!P){setBy(q);usePerson(at,()=>goView(q));setTabs(q);}else applyView(q);
    return true;
  }
  let i=-1;
  if(q.has('p')&&!q.has('b')&&!q.has('bz')){
    i=PEOPLE.findIndex(p=>!p.local&&!p.temp&&p.id===q.get('p'));
    if(i<0){if(!P) usePerson(fallback||0);say('链接里的这一位不在这个页面上。');return true;}
  }else{
    const r=linkInfo(q);
    if(r.err){if(!P) usePerson(fallback||0);say('链接里的出生信息不对，没有打开：'+r.err);return true;}
    TEMP=null;delete HOUR_PICK.link;rebuildPeople();       // 上一个来自链接的人看的时辰不带过来
    const k=infoKey(r.info);
    i=PEOPLE.findIndex(p=>{const x=infoOf(p);return x&&!checkInfo(x)&&infoKey(x)===k;});
    if(i<0){TEMP={info:r.info,dates:r.dates};rebuildPeople();i=PEOPLE.length-1;}
  }
  setBy(q);pickHour(q,i);usePerson(i,()=>goView(q));setTabs(q);
  say(P.temp?'':'链接里的这一位已经在页面上了，换到了这一位。');
  return true;
}
/* 时辰不详的人：链接里的 h 是分享时正在看的时辰，照它排。改了时辰的返回 true，这时要重新 usePerson */
function pickHour(q,i){
  const h=q.get('h'), p=PEOPLE[i];
  if(!p||!p.nohour||!h||h.length!==1||!Z.includes(h)||(HOUR_PICK[p.id]||'午')===h) return false;
  HOUR_PICK[p.id]=h;rebuildPeople();return true;
}
/* 链接里带着的位置：tab 是一个或几个标签的名字（逗号隔开），dy 是第几步大运（从 0 数），y 年，m 第几个月（从立春那个月数，从 0 数），d 日期。
   链接里的标签和数法只对这一次打开生效，不覆盖用户自己存在浏览器里的偏好（bz-tabs、bz-map） */
function setTabs(q){(q.get('tab')||'').split(',').forEach(t=>{if(TABS.natal.includes(t)) setTab('natal',t,false,false);else if(TABS.pan.includes(t)) setTab('pan',t,false,false);});}
/* by：五行、十神数法、小卡计分、格局子标签，前三项的旧链接保留当前格局子标签；照 MAP_OPTS 核对，认不出的那一项不动；没带 by 的旧链接保持对方原来的设置。
   只改 MAPBY，不画、不写进浏览器；改了的返回 true */
function setBy(q){
  const by=(q.get('by')||'').split(','); let mapped=false;
  ['wx','gods','yun','gj'].forEach((k,i)=>{const v=by[i];if(v&&MAP_OPTS[k].some(o=>o[0]===v)&&MAPBY[k]!==v){MAPBY[k]=v;mapped=true;}});
  return mapped;
}
/* 同一位，只换位置和数法 */
function applyView(q){
  setTabs(q);
  const mapped=setBy(q);
  if(mapped){if(sel.x&&/^gj[bz]\|/.test(sel.x)) closeSheet();renderGjSeg();renderBars();renderWxMap();renderGods();renderGodMap();$('rd-gods').innerHTML=readHTML('gods');}
  if(goView(q)||mapped) renderDynamic();
}
/* 停在链接里的大运、年、月、日：只改 sel，不画；链接里一样也没带的返回 false */
function goView(q){
  const int=k=>q.has(k)&&/^\d+$/.test(q.get(k))?Number(q.get(k)):null;
  const dy=int('dy'), y=int('y'), m=int('m'), d=q.get('d');
  if(dy===null&&y===null&&m===null&&!d) return false;
  if(dy!==null&&dy<P.dayun.length){sel.dy=dy;const r=P.dayun[dy];sel.y=REAL_Y>=r.y0&&REAL_Y<=r.y1?REAL_Y:r.y0;}
  if(y!==null){const k=P.dayun.findIndex(r=>y>=r.y0&&y<=r.y1);if(k>=0){sel.dy=k;sel.y=y;}}
  if(m!==null&&m<12) sel.m=m;
  if(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)){const t=Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10));if(monthDays(sel.y,sel.m).includes(t)) sel.d=t;}
  return true;
}
/* 从链接来的人上面那一条：没有保存；直接给八字的，可以在对得上的几个日子里换一个 */
function renderLinkBar(){
  const bar=$('pp-link'); bar.hidden=!P.temp; if(!P.temp){bar.innerHTML='';return;}
  const ds=TEMP.dates&&TEMP.dates.length>1?TEMP.dates:null;
  bar.innerHTML=`<p>这一位来自链接，只在这一次打开的页面里，没有存进这个浏览器。</p><div class="row">`
    +(ds?`<label>这副八字对得上的日子 <select id="pp-dates">${ds.map((x,i)=>`<option value="${i}"${x.birth===TEMP.info.birth&&(x.jie||'')===(TEMP.info.jie||'')?' selected':''}>${x.birth} ${x.shichen}时${jieSay(x)}</option>`).join('')}</select></label>`:'')
    +'<button type="button" class="pp" id="pp-save">保存到这个浏览器</button></div>';
}
function pickTempDate(i){
  if(!TEMP||!TEMP.dates||!TEMP.dates[i]) return;
  TEMP.info.birth=TEMP.dates[i].birth;TEMP.info.shichen=TEMP.dates[i].shichen;
  if(TEMP.dates[i].jie) TEMP.info.jie=TEMP.dates[i].jie; else delete TEMP.info.jie;
  rebuildPeople();usePerson(PEOPLE.length-1);
}
function saveTemp(){
  if(!TEMP) return;
  const info=Object.assign({},TEMP.info,{id:newId()}), keep={dy:sel.dy,y:sel.y,m:sel.m,d:sel.d};
  if(HOUR_PICK.link) HOUR_PICK[info.id]=HOUR_PICK.link;
  delete HOUR_PICK.link;                 // 来自链接的人都用 link 这个编号，记的时辰不能留给下一个链接
  LOCAL.push(info);TEMP=null;writeLocal();rebuildPeople();
  usePerson(PEOPLE.findIndex(p=>p.id===info.id),()=>stayAt(keep));
  if(location.hash){try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}}      // 存下来以后清掉网址里的 #，刷新不再重走一遍链接
  say(STORE_OK?'已经存进这个浏览器。':NO_STORE);
}
function say(s){$('pp-hint').textContent=s||'';$('pp-hint').hidden=!s;}
function formMsg(s){F('msg').textContent=s||'';F('msg').hidden=!s;}
const NO_STORE='这个环境不能保存数据，关掉页面以后刚才添加的人会消失。可以先点「导出」把他们存成文件。';
function openForm(info){
  editing=info?info.id:null;
  const b=info&&(info.shichen||info.nohour?parseDay(info.birth):parseBirth(info.birth)), p2=n=>String(n).padStart(2,'0');
  F('name').value=info?info.name:'';
  F('gender').value=info?info.gender:'男';
  F('date').value=b?`${b[0]}-${p2(b[1])}-${p2(b[2])}`:'';
  F('time').value=b&&b.length>3?`${p2(b[3])}:${p2(b[4])}`:'';
  // 时间框只到分钟。原来记到秒的（链接里可以写秒），时间没改就把秒留着，免得只改个称呼时柱就变了
  F('time').dataset.orig=F('time').value;F('time').dataset.sec=b&&b.length>5&&b[5]?p2(b[5]):'';
  F('shichen').value=info&&info.nohour?'none':info&&info.shichen||'';
  const pl=placeSel(info&&info.place);
  F('prov').value=pl.p;fillCity(pl.p,pl.c);F('place').value=pl.t||'';
  F('lon').value=info&&typeof info.lon==='number'?info.lon:120;
  F('dst').checked=!!(info&&info.dst);
  F('bazi').value='';F('dates').innerHTML='';baziFound=[];
  F('del').hidden=!info;F('del').textContent='删除这一位';F('del').dataset.sure='';
  say('');
  $('pf-lonhint').textContent='';
  setMode('time');
  if($('pform').hidden) openBox($('pform'));
  $('pform').hidden=false;
}
function closeForm(){$('pform').hidden=true;editing=null;}
/* 出生地：先选省份，再选城市。城市经度表 CITIES 是 [名字, 省份, 经度] 的列表（data/cities.json）。
   省份的先后照行政区划代码；直辖市、香港、澳门在表里没有省份，它们自己就是一项，城市只有它自己。
   表里没有的地方选「其他地方」，自己写地名、填经度。选了城市就把经度填上 */
const PROV=['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省','重庆市','四川省','贵州省','云南省','西藏自治区','陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区','台湾','香港','澳门'];
const provOf=c=>c[1]||c[0];
const citiesIn=p=>CITIES.filter(c=>provOf(c)===p).sort((a,b)=>a[0].localeCompare(b[0],'zh-Hans-CN'));
function fillCity(p,city){
  const list=citiesIn(p);
  F('city').innerHTML=list.length?list.map(c=>`<option value="${esc(c[0])}"${c[0]===city?' selected':''}>${esc(c[0])}</option>`).join(''):'<option value="">—</option>';
  F('city').disabled=!list.length;
  $('pf-place-l').hidden=F('mode').value!=='time'||p!=='其他';
}
function onProv(){fillCity(F('prov').value,'');onCity();}
function onCity(){
  const c=CITIES.find(x=>x[0]===F('city').value&&provOf(x)===F('prov').value), h=$('pf-lonhint');
  if(c){F('lon').value=c[2];h.textContent=`经度按${c[0]}${c[1]?'（'+c[1]+'）':''}取东经 ${c[2]} 度。出生的地方离市区很远的话，可以自己改。`;}
  else h.textContent='';
  h.hidden=!c||F('mode').value!=='time';
}
/* 存下来的出生地是一段字：省份加城市（直辖市、香港、澳门只写自己），或者「其他地方」里写的地名。编辑时从这段字认回省份和城市 */
function placeOf(){
  const p=F('prov').value; if(!p) return '';
  if(p==='其他') return F('place').value.trim().slice(0,30);
  const c=CITIES.find(x=>x[0]===F('city').value&&provOf(x)===p);
  return c?(c[1]||'')+c[0]:'';
}
function placeSel(s){
  s=String(s||'').trim(); if(!s) return {p:'',c:''};
  const bare=n=>n.replace(/市$/,'');
  const c=CITIES.find(x=>[x[0],(x[1]||'')+x[0],bare(x[0]),(x[1]||'')+bare(x[0])].includes(s))
    ||CITIES.filter(x=>x[1]&&s.startsWith(x[1].slice(0,2))&&s.slice(2).includes(bare(x[0]))).sort((a,b)=>b[0].length-a[0].length)[0];      // 省名后面的部分里有市名才算；原来「吉林长春」认成了吉林市
  return c?{p:provOf(c),c:c[0]}:{p:'其他',c:'',t:s};
}
/* 两种填法：按出生时间，或者直接输入八字。换着显示各自的那几项 */
let baziFound=[];
function setMode(m){
  F('mode').value=m;
  document.querySelectorAll('#pform .m-time').forEach(el=>{el.hidden=m!=='time';});
  document.querySelectorAll('#pform .m-bazi').forEach(el=>{el.hidden=m!=='bazi';});
  $('pf-place-l').hidden=m!=='time'||F('prov').value!=='其他';
  $('pf-lonhint').hidden=m!=='time'||!$('pf-lonhint').textContent;
  formMsg('');
  if(m==='bazi') onBazi();
}
/* 反查出来的日子带着 jie 的：交节正落在这个时辰里，四柱对得上的是交节的那一边。列出来的时候写明是哪个节的之前还是之后 */
function jieSay(d){
  if(!d.jie) return '';
  const k=jieInHour(toSec(...parseDay(d.birth),2*Z.indexOf(d.shichen)));
  return k<0?'':`，${JIE[k%12]}${d.jie==='after'?'之后':'之前'}`;
}
/* 直接输入八字：认出四柱，查出 1900 到 2100 年里四柱都对得上的日子（chart.js 的 datesOf），列出来选一个，默认选第一个 */
function onBazi(){
  const r=baziCheck(F('bazi').value), box=F('dates');
  baziFound=r.p?datesOf(r.p):[];
  if(!r.p){box.innerHTML=r.msg?`<p class="msg">${esc(r.msg)}</p>`:'';return;}
  if(!baziFound.length){box.innerHTML='<p class="msg">1900 到 2100 年里没有四柱都对得上的日子。</p>';return;}
  box.innerHTML=`<p class="hint">找到 ${baziFound.length} 个四柱都对得上的日子，选一个：</p>`+baziFound.map((d,i)=>{
    const [y,m,dd]=d.birth.split('-').map(Number), L=lunarOf(y,m,dd);
    return `<label class="check"><input type="radio" name="pf-pick" value="${i}"${i===0?' checked':''}>${y} 年 ${m} 月 ${dd} 日，${d.shichen}时${jieSay(d)}${L?`<small>农历${L.year}年${L.month}月${L.day}</small>`:''}</label>`;}).join('');
}
function newId(){let id;do{id='u'+Date.now().toString(36)+Math.floor(Math.random()*46656).toString(36);}while(PEOPLE.some(p=>p.id===id)||LOCAL.some(x=>x.id===id));return id;}
function saveForm(){
  const old=LOCAL.find(x=>x.id===editing), base={id:old?old.id:newId(),name:F('name').value.trim().slice(0,20)||'未命名',gender:F('gender').value};
  let info;
  if(F('mode').value==='bazi'){        // 直接输入八字：存下选中的那一天和时辰，和「只知道时辰」一样
    const r=baziCheck(F('bazi').value), pick=document.querySelector('#pf-dates input[name="pf-pick"]:checked'), d=pick?baziFound[+pick.value]:null;
    if(!r.p){formMsg(r.msg||'先输入八字：年、月、日、时四柱一共八个字。');return;}
    if(!d){formMsg(baziFound.length?'从找到的日子里选一个。':'1900 到 2100 年里没有四柱都对得上的日子，排不了大运。');return;}
    info=Object.assign({},old,base,{birth:d.birth,shichen:d.shichen,place:''});
    delete info.lon;delete info.dst;delete info.nohour;
    if(d.jie) info.jie=d.jie; else delete info.jie;      // 交节落在这个时辰里、四柱对得上的是交节的那一边：记下来，排盘照那一边
  }else{
    const t=F('time').value, ts=F('time').dataset, hms=t&&ts.sec&&t===ts.orig?`${t}:${ts.sec}`:t;
    info=Object.assign({},old,base,{birth:`${F('date').value} ${hms}`,place:placeOf(),lon:F('lon').value.trim()===''?NaN:Number(F('lon').value)});
    if(F('dst').checked) info.dst=true; else delete info.dst;
    if(F('shichen').value==='none'){info.nohour=true;info.birth=F('date').value;delete info.shichen;delete info.lon;delete info.dst;}   // 不知道时辰：只存日期
    else if(F('shichen').value){info.shichen=F('shichen').value;info.birth=F('date').value;delete info.lon;delete info.dst;delete info.nohour;}   // 只知道时辰：时间和经度都不用
    else{delete info.shichen;delete info.nohour;}
    if(!(old&&old.jie&&info.shichen&&old.shichen===info.shichen&&old.birth===info.birth)) delete info.jie;      // 日子和时辰没有改的，交节那一边照旧；改了就不留
  }
  const bad=checkInfo(info);
  if(bad){formMsg(bad);return;}
  if(old) LOCAL[LOCAL.indexOf(old)]=info; else LOCAL.push(info);
  writeLocal();rebuildPeople();closeForm();
  usePerson(PEOPLE.findIndex(p=>p.id===info.id));
  say(STORE_OK?'':NO_STORE);
}
function deleteEditing(){
  const b=F('del');
  if(!b.dataset.sure){b.dataset.sure='1';b.textContent='再点一次，确认删除';return;}
  // 表单开着时可能换过人：正在看的不是删掉的这一位，删完还看这一位；看的就是它，删完看排在它位置上的那一位
  const cur=P&&P.id!==editing?P.id:null, at=sel.p;
  LOCAL=LOCAL.filter(x=>x.id!==editing);
  writeLocal();rebuildPeople();closeForm();
  const i=cur?PEOPLE.findIndex(p=>p.id===cur):-1;
  usePerson(i>=0?i:Math.min(at,PEOPLE.length-1));
}
/* 手写解读是 HTML。导入的文件不一定可信，所以只留排版用的标签，属性只留 class，脚本一类的整个去掉。
   id 会顶掉页面上同名的元素，一律去掉；只有顶替「选中的四层」（read.yun）的那一段留 id="layers"，四层要画进去（layers 为真时）。 */
function cleanHTML(s,layers){
  const t=document.createElement('template');t.innerHTML=String(s);
  t.content.querySelectorAll('*').forEach(n=>{
    if(/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META)$/.test(n.tagName)){n.remove();return;}
    if(!/^(P|UL|OL|LI|B|I|EM|STRONG|SMALL|SPAN|BR|DL|DT|DD|DIV)$/.test(n.tagName)){n.replaceWith(document.createTextNode(n.textContent));return;}
    [...n.attributes].forEach(a=>{if(a.name!=='class'&&!(layers&&a.name==='id'&&a.value==='layers')) n.removeAttribute(a.name);});
  });
  return t.innerHTML;
}
/* 导入的手写解读：先照 docs/数据格式.md 的格式核对形状，不对的项丢掉，bad.n 记丢了几项；留下的每一段字都过一遍 cleanHTML。
   形状不对的留着，页面换到这一位时会出错，所以宁可丢掉 */
const hasLayers=h=>{const t=document.createElement('template');t.innerHTML=h;return !!t.content.querySelector('#layers');};
function cleanNotes(v,bad){
  bad=bad||{n:0};
  const str=x=>typeof x==='string', obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x), ok=t=>{if(!t) bad.n++;return !!t;}, out={};
  const paras=a=>a.filter(p=>ok(Array.isArray(p)&&(p.length===2||p.length===3)&&p.every(str))).map(p=>p.map(s=>cleanHTML(s)));   // [标题, 文字] 或 [标题, 文字, 要顶替的标题]
  const row=r=>obj(r)&&str(r.k)&&r.k!==''&&str(r.dd)&&['after','t'].every(k=>r[k]===undefined||str(r[k]))&&(r.p===undefined||Array.isArray(r.p));
  if(!ok(obj(v))) return out;
  if(v.read!==undefined&&ok(obj(v.read))){
    out.read={};
    Object.entries(v.read).forEach(([k,x])=>{
      if(!ok(Object.prototype.hasOwnProperty.call(READS,k)&&str(x))) return;      // 只认 READS 自己的名字，constructor、toString 这类不算
      const h=cleanHTML(x,k==='yun');
      if(ok(k!=='yun'||hasLayers(h))) out.read[k]=h;      // 顶替 yun 的那一段里要有 #layers 这个元素：只在文字里写着 id="layers" 不算
    });
  }
  if(v.x!==undefined&&ok(obj(v.x))){out.x={};Object.entries(v.x).forEach(([k,a])=>{if(ok(k!=='__proto__'&&Array.isArray(a))) out.x[k]=paras(a);});}
  if(v.rel!==undefined&&ok(obj(v.rel))){out.rel={};Object.entries(v.rel).forEach(([k,x])=>{if(ok(k!=='__proto__'&&str(x))) out.rel[k]=cleanHTML(x);});}
  ['meta','kv'].forEach(key=>{
    if(v[key]===undefined||!ok(Array.isArray(v[key]))) return;
    out[key]=v[key].filter(r=>ok(row(r))).map(r=>{
      const o={k:cleanHTML(r.k),dd:cleanHTML(r.dd)};
      if(r.after!==undefined) o.after=cleanHTML(r.after);
      o.t=r.t!==undefined?cleanHTML(r.t):o.k;      // 没写标题的拿行名当标题，没写段落的是空的：原来留着 undefined，点开这一行就报错
      o.p=r.p!==undefined?paras(r.p):[];
      return o;});
  });
  return out;
}
/* 导入一段 JSON：可以是一个人或几个人的出生信息（people/*.json 的格式），也可以是 gen_data.py 生成的 people.json。
   返回一句结果说明。 */
function importText(text){
  let v;
  try{v=JSON.parse(text);}catch(e){return '导入失败：这个文件不是 JSON。';}
  const list=Array.isArray(v)?v:v&&Array.isArray(v.people)?v.people:[v], errs=[];
  let n=0,last=null;
  list.forEach(x=>{
    if(!x||typeof x!=='object'){errs.push('有一项不是人物数据');return;}
    if(!Array.isArray(x.clock)&&x.tz!==undefined&&x.tz!==null){errs.push(`${String(x.name||'未命名').slice(0,20)}：文件里写着 tz，出生时间是当地时间，页面只认北京时间；先换成北京时间、去掉 tz 再导入`);return;}      // 原来照北京时间排了，时柱甚至日柱都是错的，也不提示（2026-11-18 审阅）
    const src=Array.isArray(x.clock)?infoFrom(x):x;      // 排好的人，取回出生信息；本来就是出生信息的照用
    const info={id:typeof src.id==='string'&&src.id?src.id:newId(),name:String(src.name||'未命名').slice(0,20),gender:src.gender,
      birth:src.birth,place:String(src.place||'').slice(0,30)};
    if(src.nohour===true) info.nohour=true;                       // 时辰不详的：只有日期，不要经度
    else if(src.shichen){info.shichen=src.shichen;if(src.jie!==undefined) info.jie=src.jie;}
    else info.lon=typeof src.lon==='number'?src.lon:typeof src.lon==='string'&&src.lon.trim()!==''?Number(src.lon):NaN;      // 没写、空着、写成 null 或 false 的经度不是 0 度：原来 Number() 一转都成了 0，照本初子午线排，日柱时柱都会错（2026-11-21 复核报告第 2 条）
    if(src.dst===true&&!src.shichen&&!src.nohour) info.dst=true;
    if(typeof src.source==='string'&&src.source) info.source=src.source.slice(0,120);
    const nb={n:0};
    if(src.notes&&typeof src.notes==='object') info.notes=cleanNotes(src.notes,nb);
    const bad=checkInfo(info);
    if(bad){errs.push(`${info.name}：${bad}`);return;}
    try{chartOf(info.nohour?Object.assign({},info,{shichen:'午'}):info);}catch(e){errs.push(`${info.name}：排不出盘（${e.message}）`);return;}   // 写入以前先试排一遍
    if(nb.n) errs.push(`${info.name}的手写解读里有 ${nb.n} 项格式不对，这几项没有导入`);
    REJECTED=REJECTED.filter(r=>!(r.value&&typeof r.value.id==='string'&&r.value.id===info.id)); // 只有试排成功的同编号记录才能修复旧记录
    if(DATA.people.some(p=>p.id===info.id)) info.id=newId();      // 和页面自带的人重名的，另起一个编号
    const i=LOCAL.findIndex(o=>o.id===info.id);
    if(i>=0) LOCAL[i]=info; else LOCAL.push(info);                // 以前导入过的，这次顶替掉
    n++;last=info.id;
  });
  if(n){writeLocal();rebuildPeople();closeForm();const k=PEOPLE.findIndex(p=>p.id===last);if(k>=0) usePerson(k);}
  return (n?`导入了 ${n} 个人。`:'没有导入任何人。')+(errs.length?'没导入的：'+errs.join('；'):'')+(n&&!STORE_OK?NO_STORE:'');
}
function exportLocal(){
  if(!localRecords().length){formMsg('浏览器里还没有保存的人，没有可以导出的。');return;}
  try{
    downloadJSON(JSON.stringify(localRecords(),null,1),'bazi-people.json');
    formMsg('已经生成 bazi-people.json。'+(REJECTED.length?'文件里也保留了暂未显示的旧记录。':'')+'如果浏览器没有开始下载，说明这个环境不允许下载文件。');
  }catch(e){formMsg('这个环境不能下载文件。');}
}

/* ---------- 事件 ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('button,[data-x]');      // 生克图里的圈是 SVG 的 g，带着 data-x，也算可点的
  if(!b){if(sel.x&&!e.target.closest('#sheet')) closeSheet();return;}     // 点空白处收起解释
  if(b.id==='rd'){const on=b.getAttribute('aria-pressed')!=='true';setRead(on);if(on) showReads();return;}
  const hadFocus=document.activeElement===b, boxId=b.parentElement&&b.parentElement.closest('[id]')?b.parentElement.closest('[id]').id:'';
  if(b.dataset.hour){        // 时辰不详的人换一个时辰看。选中的大运、年、月、日留着（换了时辰起运可能变，留不住的照常换）
    const keep={dy:sel.dy,y:sel.y,m:sel.m,d:sel.d}, i=sel.p;
    HOUR_PICK[P.id]=b.dataset.hour;rebuildPeople();usePerson(i,()=>stayAt(keep));
    if(hadFocus) refocus(b,boxId);
    return;
  }
  if(b.id==='theme'){const t=darkNow()?'light':'dark';fadeTheme(()=>setTheme(t));try{localStorage.setItem('bz-theme',t);}catch(e){}return;}
  if(b.dataset.tab){const [card,id]=b.dataset.tab.split(':');setTab(card,id);return;}
  if(b.dataset.map){        // 生克图、选择器图例里的按钮：换数法或者看法，重画，焦点放回同一个按钮
    if(b.disabled) return;
    const [k,v]=b.dataset.map.split(':');
    if(MAPBY[k]!==v){MAPBY[k]=v;try{localStorage.setItem('bz-map',JSON.stringify(MAPBY));}catch(e){}
      if(k==='wx') recount(k,()=>{renderBars();renderWxMap();}); else if(k==='yun') renderDynamic(); else if(k==='gj'){if(sel.x&&/^gj[bz]\|/.test(sel.x)) closeSheet();renderGjSeg();fadeIn($(v+'-block'));} else recount(k,()=>{renderGods();renderGodMap();$('rd-gods').innerHTML=readHTML('gods');});      // 表、图（十神一页还有解读）一起换；yun 是选择器小卡底下的条
      refreshSheet();refreshShare();}
    const n=document.querySelector(`[data-map="${b.dataset.map}"]`);if(hadFocus&&n) n.focus({preventScroll:true});
    return;
  }
  if(b.id==='sheet-x'){closeSheet();return;}
  if(b.id==='pp-recovery-export'){exportRecovery();return;}
  if(b.id==='pp-add'){openForm(null);return;}
  if(b.id==='pp-edit'){openForm(LOCAL.find(x=>x.id===P.id));return;}
  if(b.id==='pp-share'){openShare();return;}
  if(b.id==='share-copy'){copyShare();return;}
  if(b.id==='share-x'){$('share').hidden=true;return;}
  if(b.id==='pp-save'){saveTemp();return;}
  if(b.id==='pf-cancel'){closeForm();return;}
  if(b.id==='pf-del'){deleteEditing();return;}
  if(b.id==='pf-import'){F('file').click();return;}
  if(b.id==='pf-export'){exportLocal();return;}
  if(b.dataset.x){
    // 再点一次同一个字收起；同一条解释挂在别的字上（比如主星和天干是同一个字），点那个字是把卡片挪过去
    if(sel.x===b.dataset.x&&!$('sheet').hidden&&anchorOf(sel.x,sel.xn,sel.xh)===b) closeSheet(); else openSheet(b.dataset.x,b);
    return;
  }
  if(b.dataset.p!==undefined){
    if(NOCLICK) return;                    // 刚拖完松手，紧跟着的这一下点击不算换人
    if(Number(b.dataset.p)!==sel.p){say('');usePerson(Number(b.dataset.p));}      // 换了人，上一位的提示就不留了
  }else pickLayer(b);
  if(hadFocus) refocus(b,boxId);
});
/* 选择器、人物、时辰这几排按钮点了以后整排重画，按钮换成了新的，焦点会掉到 body 上。在原来那一排里按同一个 data-* 找回新按钮，把焦点放回去 */
function refocus(b,boxId){
  if(document.contains(b)) return;
  const box=boxId&&$(boxId), k=['dy','y','m','d','p','hour'].find(k=>b.dataset[k]!==undefined);
  if(!box||!k) return;
  const n=[...box.querySelectorAll('button')].find(x=>x.dataset[k]===b.dataset[k]);
  if(n) n.focus({preventScroll:true});
}
/* 换了排法（换时辰、存下来自链接的人）以后，停在原来选中的大运、年、月、日。年份不在新的大运范围里的，就照换人时的默认。只改 sel，不画（usePerson 的 place） */
function stayAt(v){
  const k=P.dayun.findIndex(r=>v.y>=r.y0&&v.y<=r.y1);
  if(k<0) return;
  sel.dy=k;sel.y=v.y;sel.m=v.m;
  if(monthDays(sel.y,sel.m).includes(v.d)) sel.d=v.d;
}
/* 换大运、流年、流月、流日。选择器的卡片走这里；不是这四样的按钮返回 false */
function pickLayer(b){
  if(b.dataset.dy!==undefined){
    sel.dy=Number(b.dataset.dy); const d=P.dayun[sel.dy];
    sel.y=(REAL_Y>=d.y0&&REAL_Y<=d.y1)?REAL_Y:d.y0;
    if(sel.y===REAL_Y&&NOW_M>=0) sel.m=NOW_M;
    renderDynamic();
  }else if(b.dataset.y!==undefined){
    sel.y=Number(b.dataset.y);
    if(sel.y===REAL_Y&&NOW_M>=0) sel.m=NOW_M;
    renderDynamic();
  }else if(b.dataset.m!==undefined){
    sel.m=Number(b.dataset.m);
    moving(()=>{fixDay();renderPan();renderLiuyue();renderLiuri();renderDyNote();renderRelations();renderGT();renderSy();renderYunRead();reveal();refreshSheet();});
  }else if(b.dataset.d!==undefined){
    sel.d=Number(b.dataset.d);
    moving(()=>{renderPan();renderLiuri();renderDyNote();renderRelations();renderGT();renderSy();renderYunRead();reveal(['liuri']);refreshSheet();});      // 只挪流日这一条，别的三条停在用户划到的地方。选中的日子在不在选中的那一步大运里，跟着流月、流日变
  }else return false;
  return true;
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&sel.x){closeSheet();return;}
  // 生克图里的圈：焦点在上面时按回车或空格，和点一下一样
  const nx=e.target&&e.target.closest?e.target.closest('[data-x]'):null;
  if(nx&&nx.tagName.toLowerCase()!=='button'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();nx.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}
  // 焦点在人物那一排的名字上时，Alt 加左右方向键把这一位往前、往后挪一位，焦点跟着走
  const pb=e.target&&e.target.closest?e.target.closest('#people .pp[data-p]'):null;
  if(pb&&e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    const i=+pb.dataset.p, to=i+(e.key==='ArrowRight'?1:-1);
    e.preventDefault();
    if(movePerson(i,to)) $('people').querySelector(`.pp[data-p="${to}"]`).focus();
    return;
  }
  // 焦点在标签上时，左右方向键换页，Home、End 到头尾
  const b=e.target&&e.target.closest?e.target.closest('[data-tab]'):null;
  if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
  const [card,id]=b.dataset.tab.split(':'), list=TABS[card], i=list.indexOf(id);
  e.preventDefault();
  setTab(card,e.key==='Home'?list[0]:e.key==='End'?list[list.length-1]:list[(i+(e.key==='ArrowRight'?1:list.length-1))%list.length],true);
});
window.addEventListener('resize',()=>{edges();if(sel.x) placeSheet(anchorOf(sel.x,sel.xn,sel.xh));});
document.querySelectorAll('.picker').forEach(p=>{
  p.addEventListener('scroll',edges,{passive:true});
  // 按 Tab 走到的小卡要是落在两头淡出的一截里，也挪到中间。只认键盘：鼠标按下去时横条滚动，这一下就点不中了
  p.addEventListener('focusin',e=>{const b=e.target.closest('.pk');if(b&&byKey(e.target)&&outOf(p,b)) rollTo(p,midOf(p,b),true);});
});
/* 拖动人物那一排的名字调整先后。鼠标按住拖动超过 5 像素就开始拖；手指要按住 0.35 秒再拖，在这之前挪动超过 8 像素就当是滚动页面，不拖。
   拖的时候把这个按钮在那一排里挪到指针最近的那个名字前面或后面，松手时照按钮的新先后排 PEOPLE（applyOrder），记进 bz-order。
   来自链接的那一位排在最后，不能拖，别的名字也挪不到它后面 */
let DRAG=null, NOCLICK=false;
function dragOn(){
  DRAG.on=true;DRAG.b.classList.add('dragging');$('people').classList.add('sorting');
  try{DRAG.b.setPointerCapture(DRAG.id);}catch(e){}
}
function dragDone(keep){
  const d=DRAG; DRAG=null; if(!d) return;
  clearTimeout(d.timer); if(!d.on) return;
  d.b.classList.remove('dragging');$('people').classList.remove('sorting');
  const order=[...$('people').querySelectorAll('.pp[data-p]')].map(c=>+c.dataset.p), movedAt=order.some((v,i)=>v!==i);
  if(movedAt||!d.touch){NOCLICK=true;setTimeout(()=>{NOCLICK=false;},0);}      // 手指按住没有挪动就松手的，这一下照样算点击（原来不算，换不了人）
  if(!keep||!applyOrder(order)) renderPeopleRow();
}
$('people').addEventListener('pointerdown',e=>{
  if(DRAG) dragDone(false);      // 上一次没有收尾的（鼠标松开在这一排外面），先收掉
  const b=e.target.closest('.pp[data-p]'); if(!b||e.button>0||!PEOPLE[+b.dataset.p]||PEOPLE[+b.dataset.p].temp) return;
  DRAG={b,id:e.pointerId,x:e.clientX,y:e.clientY,on:false,touch:e.pointerType!=='mouse',timer:0};
  if(DRAG.touch) DRAG.timer=setTimeout(()=>{if(DRAG&&!DRAG.on) dragOn();},350);
});
$('people').addEventListener('pointermove',e=>{
  if(!DRAG||e.pointerId!==DRAG.id) return;
  if(!DRAG.touch&&e.buttons===0){dragDone(DRAG.on);return;}      // 鼠标键已经松开了：在这一排外面松的手，这里收尾
  const far=Math.hypot(e.clientX-DRAG.x,e.clientY-DRAG.y);
  if(!DRAG.on){ if(DRAG.touch){if(far>8){clearTimeout(DRAG.timer);DRAG=null;}return;} if(far<5) return; dragOn(); }
  e.preventDefault();
  const row=$('people'), chips=[...row.querySelectorAll('.pp[data-p]')].filter(c=>c!==DRAG.b&&!PEOPLE[+c.dataset.p].temp);
  let best=null, bd=Infinity;
  chips.forEach(c=>{const r=c.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2, dd=Math.hypot(e.clientX-cx,(e.clientY-cy)*2);if(dd<bd){bd=dd;best={c,cx};}});
  if(best){const ref=e.clientX>best.cx?best.c.nextSibling:best.c; if(ref!==DRAG.b&&ref!==DRAG.b.nextSibling) row.insertBefore(DRAG.b,ref);}
});
$('people').addEventListener('pointerup',e=>{if(DRAG&&e.pointerId===DRAG.id) dragDone(true);});
$('people').addEventListener('pointercancel',e=>{if(DRAG&&e.pointerId===DRAG.id) dragDone(false);});
$('people').addEventListener('touchmove',e=>{if(DRAG&&DRAG.on) e.preventDefault();},{passive:false});      // 拖的时候页面不跟着滚
$('people').addEventListener('contextmenu',e=>{if(DRAG) e.preventDefault();});                              // 手指按住时不弹出菜单

let themeSaved=''; try{themeSaved=localStorage.getItem('bz-theme')||'';}catch(e){}
setTheme(themeSaved==='light'||themeSaved==='dark'?themeSaved:'');
let readOn=true; try{readOn=localStorage.getItem('bz-read')!=='0';}catch(e){}
setRead(readOn);
try{const t=(localStorage.getItem('bz-tabs')||'').split(',');if(TABS.natal.includes(t[0])) sel.tab.natal=t[0];if(TABS.pan.includes(t[1])) sel.tab.pan=t[1];}catch(e){}
F('prov').innerHTML='<option value="">不填</option>'+PROV.map(p=>`<option value="${p}">${p}</option>`).join('')+'<option value="其他">其他地方</option>';
F('prov').addEventListener('change',onProv);
F('city').addEventListener('change',onCity);
F('mode').addEventListener('change',()=>setMode(F('mode').value));
F('bazi').addEventListener('input',onBazi);
$('pform').addEventListener('submit',e=>{e.preventDefault();saveForm();});
F('file').addEventListener('change',e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{say(importText(String(r.result)));e.target.value='';};
  r.readAsText(f);
});
readLocal();readOrder();rebuildPeople();
if(BROKEN.length) say(`浏览器里存的 ${BROKEN.length} 个人排不出盘，没有显示：${BROKEN.join('、')}。`);      // say() 写进 textContent，不用再转义
let startAt=0; try{const i=PEOPLE.findIndex(p=>p.id===localStorage.getItem('bz-person'));if(i>=0) startAt=i;}catch(e){}
if(!openLink(location.hash,startAt)) usePerson(startAt);
setTab('natal',sel.tab.natal,false,false);setTab('pan',sel.tab.pan,false,false);
window.addEventListener('hashchange',()=>{openLink(location.hash);setTab('natal',sel.tab.natal,false,false);setTab('pan',sel.tab.pan,false,false);});
// 别的标签页存了人、删了人：这一页的名单跟着更新。正在看的人没有变就只重画人物那一排，选中的大运、年、月、日都不动；
// 正在看的人被改了就照新的重排，被删了就换到第一位。来自链接、还没保存的那一位不受影响
window.addEventListener('storage',e=>{
  if(e.key!==null&&e.key!=='bz-people') return;
  const was=P, before=JSON.stringify(P);
  readLocal();rebuildPeople();
  const i=PEOPLE.findIndex(p=>p.id===was.id&&!!p.temp===!!was.temp);
  if(i<0){usePerson(0);return;}
  if(JSON.stringify(PEOPLE[i])!==before){usePerson(i);return;}
  sel.p=i;P=PEOPLE[i];renderPeopleRow();
});
document.addEventListener('change',e=>{
  if(!e.target||e.target.id!=='pp-dates') return;
  pickTempDate(Number(e.target.value));
  if($('pp-dates')) $('pp-dates').focus({preventScroll:true});      // 下拉框跟着整条重画了，焦点放回新的那一个
});
