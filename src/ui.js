/* 状态、渲染和事件。 */
const $=id=>document.getElementById(id);
const now=new Date();
const md=(y,s)=>{const [m,d]=s.split('/').map(Number);return new Date(y,m-1,d);};
const TODAY=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
/* 今天所在的干支年：过了立春才算新的一年 */
const REAL_Y=(()=>{const y=now.getFullYear(), lc=jieMD(y)?md(y,jieMD(y)[0]):new Date(y,1,4);return now<lc?y-1:y;})();
/* NOW_DY、NOW_M：今天落在这个人的哪一步大运、哪个月；今天不在他的大运范围里时是 -1 */
let NOW_DY=-1, NOW_M=-1;
/* 选中的人、大运、流年、流月、流日，以及打开的解释 */
const sel={p:0,dy:0,y:0,m:0,d:TODAY,x:null,xn:0};     // x 是打开的解释，xn 是点的第几个同名的字

/* ---------- 人物：页面自带的，加上保存在这个浏览器里的 ---------- */
const PEOPLE=DATA.people.slice();
let LOCAL=[];                      // 保存在浏览器里的出生信息，格式见 chart.js
let STORE_OK=true;                 // 这个环境能不能用 localStorage
function readLocal(){
  try{const v=JSON.parse(localStorage.getItem('bz-people')||'[]');LOCAL=Array.isArray(v)?v.filter(x=>x&&typeof x==='object'&&!checkInfo(x)):[];}
  catch(e){LOCAL=[];STORE_OK=false;}
}
function writeLocal(){
  try{localStorage.setItem('bz-people',JSON.stringify(LOCAL));STORE_OK=true;}catch(e){STORE_OK=false;}
  return STORE_OK;
}
function rebuildPeople(){
  PEOPLE.length=DATA.people.length;
  LOCAL.forEach(info=>{try{const p=chartOf(info);p.local=true;PEOPLE.push(p);}catch(e){}});
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
function usePerson(i){
  sel.p=i; P=PEOPLE[i]; MEMO={};
  DM=P.pillars[2][0]; DMN=gN(DM);
  NATAL='年月日时'.split('').map((k,j)=>({k,g:P.pillars[j][0],z:P.pillars[j][1],day:j===2}));
  SHENSHA=shenshaOf(P.pillars,DATA.nayin,!!P.gender);
  Y_MIN=P.dayun[0].y0; Y_MAX=P.dayun[P.dayun.length-1].y1;
  const inRange=REAL_Y>=Y_MIN&&REAL_Y<=Y_MAX;
  NOW_DY=inRange?P.dayun.findIndex(d=>REAL_Y>=d.y0&&REAL_Y<=d.y1):-1;
  NOW_M=inRange?currentMonth(REAL_Y):-1;
  sel.dy=inRange?NOW_DY:0;          // 今天不在这个人的大运范围里（古人，或者还没起运），就从第一步大运看起
  sel.y=inRange?REAL_Y:Y_MIN;
  sel.m=NOW_M<0?0:NOW_M; sel.d=TODAY; sel.x=null;
  $('sheet').hidden=true;
  try{localStorage.setItem('bz-person',P.id);}catch(e){}
  renderPerson();
}

/* ---------- 解释卡片：贴在所点的字旁边 ---------- */
function markOn(){document.querySelectorAll('[data-x]').forEach(n=>n.classList.toggle('on',n.dataset.x===sel.x));}
function closeSheet(){sel.x=null;$('sheet').hidden=true;markOn();}
/* 同一个解释可能挂在两个字上（主星和天干指的是同一个字），所以记下点的是第几个 */
function anchorOf(key,n){const all=[...document.querySelectorAll('[data-x]')].filter(x=>x.dataset.x===key);return all[n]||all[0]||null;}
/* 把卡片摆到 el 的下面；下面放不下而上面更宽裕时摆到上面。左右不出屏幕，小三角对准 el。 */
function placeSheet(el){
  const s=$('sheet'), inn=s.firstElementChild;
  if(!el||!el.getBoundingClientRect) return;
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
  if(el) sel.xn=Math.max(0,[...document.querySelectorAll('[data-x]')].filter(x=>x.dataset.x===key).indexOf(el));
  $('sheet-t').textContent=r.t;
  $('sheet-b').innerHTML=r.p.filter(Boolean).map(([l,t])=>`<p><span class="lb">${l}</span><span class="tx">${t}</span></p>`).join('');
  $('sheet').hidden=false;markOn();
  $('sheet').firstElementChild.scrollTop=0;
  placeSheet(el||anchorOf(key,sel.xn));
}
function refreshSheet(){
  if(!sel.x) return;
  if(anchorOf(sel.x,sel.xn)) openSheet(sel.x,null); else closeSheet();
}
function setRead(on){
  document.documentElement.dataset.read=on?'on':'off';
  $('rd').setAttribute('aria-pressed',String(on));
  try{localStorage.setItem('bz-read',on?'1':'0');}catch(e){}
}

/* ---------- 渲染 ---------- */
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
/* 日主一栏里各家的那几行：从其中的第一行起算后一组，前面加小标题 */
const KV_SCHOOLS=['强弱参考','格局参考','调候参考','三行对照'];
/* 顶部信息分两处放：起运和交运跟着大运那一行；其余的都在标题下面，出生的基本信息排在前面 */
const META_MAIN=['公历','真太阳时','时辰','农历','出生地','节气'], META_YUN=['起运','交运'];
/* 只跟人有关、不随大运流年变的部分 */
function renderPerson(){
  $('people').innerHTML=PEOPLE.map((p,i)=>`<button type="button" class="pp" aria-pressed="${i===sel.p}" data-p="${i}">${esc(p.name)}</button>`).join('')
    +'<button type="button" class="pp add" id="pp-add">＋ 添加</button>'
    +(P.local?'<button type="button" class="pp add" id="pp-edit">编辑这一位</button>':'');
  $('eyebrow').innerHTML=`${P.gender?'男命':'女命'} · ${xb('x','term|造',P.gender?'乾造':'坤造')}`;
  $('title').setAttribute('aria-label',P.pillars.join(' '));
  // 每一柱带上「年柱」这样的标注，日柱的天干带上「日主」。标注由样式显示，标题的文字内容仍然只有八个字
  $('title').innerHTML=NATAL.map(p=>`<span class="pl" data-k="${p.k}柱"><span><span class="${gCls(p.g)}${p.day?' dm':''}">${p.g}</span><span class="${zCls(p.z)}">${p.z}</span></span></span>`).join('');
  const meta=metaRows(), mrow=r=>`<div><dt>${xb('x','meta|'+r.k,r.k)}</dt><dd>${r.dd}</dd></div>`;
  const top=meta.filter(r=>!META_YUN.includes(r.k));
  $('meta').innerHTML=top.filter(r=>META_MAIN.includes(r.k)).concat(top.filter(r=>!META_MAIN.includes(r.k))).map(mrow).join('');
  $('meta-yun').innerHTML=meta.filter(r=>META_YUN.includes(r.k)).map(mrow).join('');
  ['key','pan','yun','rel','rel2','wx','tk','gods'].forEach(s=>{$('rd-'+s).innerHTML=readHTML(s);});
  $('note-yun').textContent=noteYun();
  $('note-wx').textContent=noteWx();
  $('h-wx-s').textContent=`四个天干加${cn(natalHidden().length)}个藏干`;
  const kv=kvRows(), cut=kv.findIndex(r=>KV_SCHOOLS.includes(r.k));
  const dl=rows=>`<dl class="kv">${rows.map(r=>`<dt>${xb('x','kv|'+r.k,r.k)}</dt><dd>${r.dd}</dd>`).join('')}</dl>`;
  $('kv').innerHTML=cut<0?dl(kv):(cut?dl(kv.slice(0,cut)):'')+'<h3 class="kv-h"><span class="tag">进阶</span>各家从哪里入手找用神<small>用神是一张盘里拿来作主的字。下面几行各照一本书走一遍，不合成结论。</small></h3>'+dl(kv.slice(cut));
  $('h-gods-s').textContent=`以${DMN}为原点；加粗的是原局里出现的字`;
  $('foot').innerHTML=footItems().map(x=>`<li>${x}</li>`).join('');
  renderBars();renderGods();renderSK();renderDynamic();
}
function renderPan(){
  const cs=cols(), cc=(c,i)=>`${c.dyn?'dyn':''}${i===DYN-1?' last':''}${c.day?' day':''}`;
  const row=(label,fn,cls)=>`<tr${cls?` class="${cls}"`:''}><th scope="row">${xb('x','row|'+label,label)}</th>${cs.map((c,i)=>`<td class="${cc(c,i)}">${fn(c,i)}</td>`).join('')}</tr>`;
  $('pan').innerHTML=
    row('十神',c=>xb('x sm',`g|${c.k}|${c.g}`,c.day?'日主':god(c.g)))+
    row('天干',c=>glyph('g',c),'big')+
    row('地支',c=>glyph('z',c),'big')+
    row('藏干',c=>HID[c.z].split('').map(h=>xb('hs '+gCls(h),`h|${c.k}|${h}`,`${h}<small>${god(h)}</small>`)).join(''),'multi')+
    row('星运',c=>xb('x sm','st|'+c.k,stage(DM,c.z)))+
    row('自坐',c=>xb('x sm','zz|'+c.k,stage(c.g,c.z)))+
    row('空亡',c=>xb('x sm','xk|'+c.k,xunkong(c.g,c.z)))+
    row('纳音',c=>xb('x sm','ny|'+c.k,DATA.nayin[c.g+c.z]))+
    row('神煞',(c,i)=>{       // 前四列拿自己的干支去对原局查；四个字的名字在手机上折成两行
      const list=c.dyn?shenshaFor(P.pillars,DATA.nayin,!!P.gender,c.g+c.z,c.k):SHENSHA[i-DYN];
      return `<span class="ss">${list.length?list.map(s=>xb(s.n.length===4?'x w4':'x',`ss|${s.n}|${c.dyn?c.k:i-DYN}`,s.n)).join(''):'<span class="no">—</span>'}</span>`;},'multi');
  const dy=P.dayun[sel.dy];
  $('hd-lr').textContent=mdText(sel.d);
  $('hd-ly').textContent=jieMD(sel.y)[sel.m]+' 起';
  $('hd-ln').innerHTML=sel.y+'<span class="wide"> 年</span>';
  $('hd-dy').textContent=dy.y0+'–'+dy.y1;
}
function renderDayun(){
  $('dayun').innerHTML=P.dayun.map((d,i)=>`<button class="pk${i===NOW_DY?' now':''}" aria-pressed="${i===sel.dy}" data-dy="${i}"><span class="yr">${d.y0}–${d.y1}</span><span class="gz">${gzSpan(d.gz)}</span><span class="gd">${god(d.gz[0])}·${godZ(d.gz[1])}</span><span class="ag">${d.a0}–${d.a1} 岁</span></button>`).join('');
}
function renderLiunian(){
  const d=P.dayun[sel.dy]; let h='';
  for(let y=d.y0;y<=d.y1;y++){const gz=yearGZ(y);
    h+=`<button class="pk${y===REAL_Y?' now':''}" aria-pressed="${y===sel.y}" data-y="${y}"><span class="yr">${y}</span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])}·${godZ(gz[1])}</span><span class="ag">${y-P.clock[0]+1} 岁</span></button>`;}
  $('liunian').innerHTML=h;
  $('h-ln').innerHTML=`流年<small>${d.gz}运</small>`;
}
function renderLiuyue(){
  const y=sel.y, j=jieMD(y), cur=y===REAL_Y?NOW_M:-1; let h='';
  for(let m=0;m<12;m++){const gz=monthGZ(y,m);
    h+=`<button class="pk${m===cur?' now':''}" aria-pressed="${m===sel.m}" data-m="${m}"><span class="yr">${JIE[m]} ${j[m]}</span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])}·${godZ(gz[1])}</span></button>`;}
  $('liuyue').innerHTML=h;
  $('h-ly').innerHTML=`流月<small>${y} ${yearGZ(y)}年</small>`;
}
function renderLiuri(){
  const days=monthDays(sel.y,sel.m), W='日一二三四五六'; let h='';
  days.forEach(t=>{const gz=dayGZ(t);
    h+=`<button class="pk${t===TODAY?' now':''}" aria-pressed="${t===sel.d}" data-d="${t}"><span class="yr">${mdText(t)}</span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])}·${godZ(gz[1])}</span><span class="ag">周${W[new Date(t).getUTCDay()]}</span></button>`;});
  $('liuri').innerHTML=h;
  $('h-lr').innerHTML=`流日<small>${monthGZ(sel.y,sel.m)}月</small>`;
}
function renderYunRead(){
  const d=P.dayun[sel.dy];
  const rows=[
    ['大运',d.gz,`${d.y0}–${d.y1} 年 · ${d.a0}–${d.a1} 岁`],
    ['流年',yearGZ(sel.y),`${sel.y} 年 · ${sel.y-P.clock[0]+1} 岁`],
    ['流月',monthGZ(sel.y,sel.m),`${JIE[sel.m]} ${jieMD(sel.y)[sel.m]} 起`],
    ['流日',dayGZ(sel.d),`${new Date(sel.d).getUTCFullYear()} 年 ${mdText(sel.d)}`]];
  const say=gz=>{
    const g=gz[0], h=HID[gz[1]][0], a=god(g), b=god(h);
    return `天干${g}是${a}，${eff(rel(g))}。地支${gz[1]}的本气${h}是${b}，${eff(rel(h))}。`+(a===b?`${a}的传统读法是${KW[a]}。`:`${a}的传统读法是${KW[a]}；${b}是${KW[b]}。`);
  };
  $('layers').innerHTML=rows.map(r=>`<div><dt>${r[0]}<b>${gzSpan(r[1])}</b><small>${r[2]}</small></dt><dd>${say(r[1])}</dd></div>`).join('');
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
/* 关系图：八柱横排，和细盘的列对齐。天干的关系画在上面，地支的画在下面。
   每一组有关系的字是一条横线，各圈一个圈；线上面是关系的名字，同一组字有几种关系的（比如巳申同时是六合、相刑、相破）并排写在同一条线上。
   互不重叠的几条排在同一行，原局的靠近干支，各层带来的往外排。
   每个名字和下面对应的小签是同一个解释（data-x 相同）。电脑上显示这张图，窄屏上显示小签。 */
const LK_COL={流日:0,流月:1,流年:2,大运:3,年:4,月:5,日:6,时:7};
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
  const g=pack('g'), z=pack('z'), head=g.n+1;
  const link=(it,row,isG)=>{
    const k=it.b-it.a+1, he=it.rels.map(o=>HE_TYPES.includes(o.r.t));
    const tone=he.every(Boolean)?'':he.some(Boolean)?' mix':' bad';       // 线的颜色：都是相合一类用蓝，都是冲刑害破克用棕，两样都有用灰
    return `<span class="lk${tone}" style="grid-column:${it.a+2}/${it.b+3};grid-row:${row};--k:${k}"><span class="lk-ts">`
      +it.rels.map((o,j)=>`<button type="button" class="lk-t${he[j]?'':' bad'}" data-x="${esc(o.key)}">${esc(o.r.t)}${o.r.n?`<small>${esc(o.r.n)}</small>`:''}</button>`).join('')
      +'</span><span class="lk-l"></span>'
      +it.ix.map(i=>`<i class="${isG?gCls(cs[i].g):zCls(cs[i].z)}" style="left:${((i-it.a+.5)/k*100).toFixed(3)}%">${isG?cs[i].g:cs[i].z}</i>`).join('')+'</span>';
  };
  $('lkmap').innerHTML=
    `<span class="lk-bg" style="grid-row:1/${g.n+z.n+4}"></span>`
    +g.groups.map(it=>link(it,g.n-it.row,true)).join('')
    +cs.map((c,i)=>`<span class="lk-h" style="grid-column:${i+2};grid-row:${head}">${c.dyn?c.k:c.k+'柱'}</span>`).join('')
    +`<span class="lk-n" style="grid-row:${head+1}">天干</span>`+cs.map((c,i)=>`<b class="lk-c ${gCls(c.g)}" style="grid-column:${i+2};grid-row:${head+1}">${c.g}</b>`).join('')
    +`<span class="lk-n" style="grid-row:${head+2}">地支</span>`+cs.map((c,i)=>`<b class="lk-c ${zCls(c.z)}" style="grid-column:${i+2};grid-row:${head+2}">${c.z}</b>`).join('')
    +z.groups.map(it=>link(it,head+3+it.row,false)).join('');
}
/* 生克图：原局四柱，相邻的两个字之间标出谁生谁克。每一柱上面是宫位，干支旁边是十神 */
const SK_GW=['祖辈','父母','自己 · 配偶','子女'];
function renderSK(){
  const badge=(a,b,v)=>{const [k,dir]=skOf(a,b), arrow=v?(dir>0?'↓':'↑'):(dir>0?'→':'←');
    return `<span class="sk-b ${k==='生'?'sheng':k==='克'?'ke':'tong'}">${dir<0?`<i>${arrow}</i>`:''}${k==='同'?'同类':k}${dir>0?`<i>${arrow}</i>`:''}</span>`;};
  let h='';
  NATAL.forEach((p,i)=>{
    const col=i*2+1, at=r=>`style="grid-column:${col};grid-row:${r}"`;
    h+=`<span class="sk-h" ${at(1)}>${p.k}柱<small>${SK_GW[i]}</small></span><span class="sk-g" ${at(2)}>${p.day?'日主':god(p.g)}</span>`
      +`<span ${at(3)}>${glyph('g',p)}</span><span ${at(4)}>${badge(gEl(p.g),zEl(p.z),true)}</span><span ${at(5)}>${glyph('z',p)}</span><span class="sk-g" ${at(6)}>${godZ(p.z)}</span>`;
    if(i<3){const q=NATAL[i+1];
      h+=`<span style="grid-column:${col+1};grid-row:3">${badge(gEl(p.g),gEl(q.g),false)}</span><span style="grid-column:${col+1};grid-row:5">${badge(zEl(p.z),zEl(q.z),false)}</span>`;}
  });
  $('skmap').innerHTML=h;
  $('note-sk').textContent=noteSK();
}
function renderBars(){
  const {cnt,face}=wxCounts(), max=Math.max(...cnt);
  $('bars').innerHTML=cnt.map((n,i)=>`${xb('x el '+ELC[i],'wx|'+i,ic(i)+EL[i])}<span class="track ${ELC[i]}"><span class="fill" style="width:${Math.round(n/max*100)}%"></span></span><span class="n">${n} 个（${face[i]}）</span><span class="st">${wxState(i)}</span>`).join('');
}
const GOD_MEAN=['和我一样的人：自我、同辈、朋友和竞争者','我产出的东西：表达、才艺、作品','我能支配的东西：财物、资源','约束我的东西：规则、职位、压力','滋养我的东西：学问、庇护、长辈'];
function renderGods(){
  const all=natalStems().concat(natalHidden()), de=gEl(DM), yin=isYin(DM)?1:0;
  // 每个十神在原局里出现几次：三个天干加地支里藏的天干。个数后面跟一小段同样长短的条
  const cell=g=>{const n=all.filter(x=>x===g).length;
    return `<td class="${n?'have':''}">${xb('x','tg|'+god(g),god(g))}（<span class="${gCls(g)}">${g}</span>）<span class="gn">${n?`${n} 处<i style="--n:${n}"></i>`:'没有'}</span></td>`;};
  $('gods').innerHTML=CAT.map((r,i)=>{const e=(de+i)%5;
    return `<tr><td>${r[1]}</td><td class="${ELC[e]}"><span class="eli">${ic(e)}${EL[e]}</span></td>${cell(G[e*2+yin])}${cell(G[e*2+1-yin])}<td>${GOD_MEAN[i]}</td></tr>`;}).join('');
  $('liuqin').innerHTML=liuqinRows().map(r=>`<tr><td>${r.who}</td><td>${xb('x','tg|'+r.god,r.god)}</td><td>${r.at}</td><td>${r.gong}</td></tr>`).join('');
  $('note-lq').textContent=noteLq();
}
/* 横条里选中的那一格不在看得见的范围里时，把它挪到中间 */
function reveal(){
  ['dayun','liunian','liuyue','liuri'].forEach(id=>{
    const box=$(id), b=box.querySelector('[aria-pressed="true"]');
    if(!b||!box.clientWidth) return;
    const l=b.offsetLeft, r=l+b.offsetWidth;
    if(l<box.scrollLeft||r>box.scrollLeft+box.clientWidth) box.scrollLeft=l-(box.clientWidth-b.offsetWidth)/2;
  });
}
function renderDynamic(){fixDay();renderPan();renderDayun();renderLiunian();renderLiuyue();renderLiuri();renderRelations();renderYunRead();reveal();refreshSheet();}

/* ---------- 添加、编辑、导入、导出 ---------- */
let editing=null;                  // 正在编辑的那个人的 id；新添加时是 null
const F=id=>$('pf-'+id);
function say(s){$('pp-hint').textContent=s||'';$('pp-hint').hidden=!s;}
function formMsg(s){F('msg').textContent=s||'';F('msg').hidden=!s;}
const NO_STORE='这个环境不能保存数据，关掉页面以后刚才添加的人会消失。可以先点「导出」把他们存成文件。';
function openForm(info){
  editing=info?info.id:null;
  const b=info&&(info.shichen?parseDay(info.birth):parseBirth(info.birth)), p2=n=>String(n).padStart(2,'0');
  F('name').value=info?info.name:'';
  F('gender').value=info?info.gender:'男';
  F('date').value=b?`${b[0]}-${p2(b[1])}-${p2(b[2])}`:'';
  F('time').value=b&&b.length>3?`${p2(b[3])}:${p2(b[4])}`:'';
  F('shichen').value=info&&info.shichen||'';
  F('place').value=info&&info.place||'';
  F('lon').value=info&&typeof info.lon==='number'?info.lon:120;
  F('dst').checked=!!(info&&info.dst);
  F('del').hidden=!info;F('del').textContent='删除这一位';F('del').dataset.sure='';
  formMsg('');say('');
  $('pf-lonhint').hidden=true;
  $('pform').hidden=false;
}
function closeForm(){$('pform').hidden=true;editing=null;}
/* 城市经度表 CITIES 是 [名字, 省份, 经度] 的列表（data/cities.json）。出生地填的是表里的城市时，把经度填上 */
function cityOf(s){s=String(s||'').trim();return s?CITIES.find(c=>c[0]===s)||CITIES.find(c=>c[0]===s+'市')||null:null;}
function onPlace(){
  const c=cityOf(F('place').value), h=$('pf-lonhint');
  if(c){F('lon').value=c[2];h.textContent=`经度按${c[0]}${c[1]?'（'+c[1]+'）':''}取东经 ${c[2]} 度。出生的地方离市区很远的话，可以自己改。`;}
  else h.textContent='';
  h.hidden=!c;
}
function newId(){let id;do{id='u'+Date.now().toString(36)+Math.floor(Math.random()*46656).toString(36);}while(PEOPLE.some(p=>p.id===id)||LOCAL.some(x=>x.id===id));return id;}
function saveForm(){
  const old=LOCAL.find(x=>x.id===editing);
  const info=Object.assign({},old,{id:old?old.id:newId(),name:F('name').value.trim().slice(0,20)||'未命名',gender:F('gender').value,
    birth:`${F('date').value} ${F('time').value}`,place:F('place').value.trim().slice(0,30),lon:F('lon').value.trim()===''?NaN:Number(F('lon').value)});
  if(F('dst').checked) info.dst=true; else delete info.dst;
  if(F('shichen').value){info.shichen=F('shichen').value;info.birth=F('date').value;delete info.lon;delete info.dst;}   // 只知道时辰：时间和经度都不用
  else delete info.shichen;
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
  LOCAL=LOCAL.filter(x=>x.id!==editing);
  writeLocal();rebuildPeople();closeForm();
  usePerson(Math.min(sel.p,PEOPLE.length-1));
}
/* 手写解读是 HTML。导入的文件不一定可信，所以只留排版用的标签，属性只留 class 和 id，脚本一类的整个去掉。 */
function cleanHTML(s){
  const t=document.createElement('template');t.innerHTML=String(s);
  t.content.querySelectorAll('*').forEach(n=>{
    if(/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META)$/.test(n.tagName)){n.remove();return;}
    if(!/^(P|UL|OL|LI|B|I|EM|STRONG|SMALL|SPAN|BR|DL|DT|DD|DIV)$/.test(n.tagName)){n.replaceWith(document.createTextNode(n.textContent));return;}
    [...n.attributes].forEach(a=>{if(a.name!=='class'&&a.name!=='id') n.removeAttribute(a.name);});
  });
  return t.innerHTML;
}
function cleanNotes(v){return typeof v==='string'?cleanHTML(v):Array.isArray(v)?v.map(cleanNotes):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,cleanNotes(x)])):v;}
/* 导入一段 JSON：可以是一个人或几个人的出生信息（people/*.json 的格式），也可以是 gen_data.py 生成的 people.json。
   返回一句结果说明。 */
function importText(text){
  let v;
  try{v=JSON.parse(text);}catch(e){return '导入失败：这个文件不是 JSON。';}
  const list=Array.isArray(v)?v:v&&Array.isArray(v.people)?v.people:[v], errs=[];
  let n=0,last=null;
  list.forEach(x=>{
    if(!x||typeof x!=='object'){errs.push('有一项不是人物数据');return;}
    const src=Array.isArray(x.clock)?infoFrom(x):x;      // 排好的人，取回出生信息；本来就是出生信息的照用
    const info={id:typeof src.id==='string'&&src.id?src.id:newId(),name:String(src.name||'未命名').slice(0,20),gender:src.gender,
      birth:src.birth,place:String(src.place||'').slice(0,30)};
    if(src.shichen) info.shichen=src.shichen; else info.lon=typeof src.lon==='number'?src.lon:Number(src.lon);
    if(src.dst===true&&!src.shichen) info.dst=true;
    if(typeof src.source==='string'&&src.source) info.source=src.source.slice(0,120);
    if(src.notes&&typeof src.notes==='object') info.notes=cleanNotes(src.notes);
    const bad=checkInfo(info);
    if(bad){errs.push(`${info.name}：${bad}`);return;}
    if(DATA.people.some(p=>p.id===info.id)) info.id=newId();      // 和页面自带的人重名的，另起一个编号
    const i=LOCAL.findIndex(o=>o.id===info.id);
    if(i>=0) LOCAL[i]=info; else LOCAL.push(info);                // 以前导入过的，这次顶替掉
    n++;last=info.id;
  });
  if(n){writeLocal();rebuildPeople();closeForm();usePerson(PEOPLE.findIndex(p=>p.id===last));}
  return (n?`导入了 ${n} 个人。`:'没有导入任何人。')+(errs.length?'没导入的：'+errs.join('；'):'')+(n&&!STORE_OK?NO_STORE:'');
}
function exportLocal(){
  if(!LOCAL.length){formMsg('浏览器里还没有保存的人，没有可以导出的。');return;}
  try{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(LOCAL,null,1)],{type:'application/json'}));
    a.download='bazi-people.json';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    formMsg('已经生成 bazi-people.json。如果浏览器没有开始下载，说明这个环境不允许下载文件。');
  }catch(e){formMsg('这个环境不能下载文件。');}
}

/* ---------- 事件 ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b){if(sel.x&&!e.target.closest('#sheet')) closeSheet();return;}     // 点空白处收起解释
  if(b.id==='rd'){setRead(b.getAttribute('aria-pressed')!=='true');return;}
  if(b.id==='sheet-x'){closeSheet();return;}
  if(b.id==='pp-add'){openForm(null);return;}
  if(b.id==='pp-edit'){openForm(LOCAL.find(x=>x.id===P.id));return;}
  if(b.id==='pf-cancel'){closeForm();return;}
  if(b.id==='pf-del'){deleteEditing();return;}
  if(b.id==='pf-import'){F('file').click();return;}
  if(b.id==='pf-export'){exportLocal();return;}
  if(b.dataset.x){
    if(sel.x===b.dataset.x&&!$('sheet').hidden) closeSheet(); else openSheet(b.dataset.x,b);
    return;
  }
  if(b.dataset.p!==undefined){
    if(Number(b.dataset.p)!==sel.p) usePerson(Number(b.dataset.p));
  }else if(b.dataset.dy!==undefined){
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
    fixDay();renderPan();renderLiuyue();renderLiuri();renderRelations();renderYunRead();reveal();refreshSheet();
  }else if(b.dataset.d!==undefined){
    sel.d=Number(b.dataset.d);
    renderPan();renderLiuri();renderRelations();renderYunRead();refreshSheet();
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sel.x) closeSheet();});
window.addEventListener('resize',()=>{if(sel.x) placeSheet(anchorOf(sel.x,sel.xn));});

let readOn=true; try{readOn=localStorage.getItem('bz-read')!=='0';}catch(e){}
setRead(readOn);
$('pf-cities').innerHTML=CITIES.map(c=>`<option value="${esc(c[0])}"${c[1]?` label="${esc(c[1])}"`:''}></option>`).join('');
F('place').addEventListener('input',onPlace);
F('place').addEventListener('change',onPlace);
$('pform').addEventListener('submit',e=>{e.preventDefault();saveForm();});
F('file').addEventListener('change',e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{say(importText(String(r.result)));e.target.value='';};
  r.readAsText(f);
});
readLocal();rebuildPeople();
let startAt=0; try{const i=PEOPLE.findIndex(p=>p.id===localStorage.getItem('bz-person'));if(i>=0) startAt=i;}catch(e){}
usePerson(startAt);
