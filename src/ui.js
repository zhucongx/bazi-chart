/* 状态、渲染和事件。 */
const $=id=>document.getElementById(id);
const now=new Date();
const md=(y,s)=>{const [m,d]=s.split('/').map(Number);return new Date(y,m-1,d);};
const TODAY=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
/* 今天所在的干支年：过了立春才算新的一年 */
const REAL_Y=(()=>{const y=now.getFullYear(), lc=DATA.jie[y]?md(y,DATA.jie[y][0]):new Date(y,1,4);return now<lc?y-1:y;})();
/* NOW_DY、NOW_M：今天落在这个人的哪一步大运、哪个月；今天不在他的大运范围里时是 -1 */
let NOW_DY=-1, NOW_M=-1;
/* 选中的人、大运、流年、流月、流日，以及打开的解释 */
const sel={p:0,dy:0,y:0,m:0,d:TODAY,x:null};

function jieUTC(y,m){const [mm,dd]=DATA.jie[y][m].split('/').map(Number);return Date.UTC(m===11?y+1:y,mm-1,dd);}
function monthDays(y,m){
  const start=jieUTC(y,m), end=m<11?jieUTC(y,m+1):(DATA.jie[y+1]?jieUTC(y+1,0):Date.UTC(y+1,1,4)), out=[];
  for(let t=start;t<end;t+=DAY) out.push(t);
  return out;
}
const mdText=t=>{const d=new Date(t);return (d.getUTCMonth()+1)+'/'+d.getUTCDate();};
function currentMonth(y){
  const j=DATA.jie[y]; let idx=-1;
  for(let i=0;i<12;i++){ if(now>=md(i===11?y+1:y,j[i])) idx=i; }
  return idx;
}
function fixDay(){const days=monthDays(sel.y,sel.m);if(!days.includes(sel.d)) sel.d=days.includes(TODAY)?TODAY:days[0];}
function cols(){
  const ln=yearGZ(sel.y), dy=P.dayun[sel.dy].gz;
  return [{k:'流年',g:ln[0],z:ln[1],dyn:true},{k:'大运',g:dy[0],z:dy[1],dyn:true}].concat(NATAL);
}

/* ---------- 换人 ---------- */
function usePerson(i){
  sel.p=i; P=DATA.people[i]; MEMO={};
  DM=P.pillars[2][0]; DMN=gN(DM);
  NATAL='年月日时'.split('').map((k,j)=>({k,g:P.pillars[j][0],z:P.pillars[j][1],day:j===2}));
  SHENSHA=shenshaOf(P.pillars,DATA.nayin);
  Y_MIN=P.dayun[0].y0; Y_MAX=P.dayun[P.dayun.length-1].y1;
  const inRange=REAL_Y>=Y_MIN&&REAL_Y<=Y_MAX;
  NOW_DY=inRange?P.dayun.findIndex(d=>REAL_Y>=d.y0&&REAL_Y<=d.y1):-1;
  NOW_M=inRange?currentMonth(REAL_Y):-1;
  sel.dy=inRange?NOW_DY:(REAL_Y<Y_MIN?0:P.dayun.length-1);
  sel.y=inRange?REAL_Y:(REAL_Y<Y_MIN?Y_MIN:Y_MAX);
  sel.m=NOW_M<0?0:NOW_M; sel.d=TODAY; sel.x=null;
  $('sheet').hidden=true;document.body.classList.remove('has-sheet');
  try{localStorage.setItem('bz-person',P.id);}catch(e){}
  renderPerson();
}

/* ---------- 解释面板 ---------- */
function markOn(){document.querySelectorAll('[data-x]').forEach(n=>n.classList.toggle('on',n.dataset.x===sel.x));}
function closeSheet(){sel.x=null;$('sheet').hidden=true;document.body.classList.remove('has-sheet');markOn();}
function openSheet(key,el){
  const r=X(key); if(!r){closeSheet();return;}
  sel.x=key;
  $('sheet-t').textContent=r.t;
  $('sheet-b').innerHTML=r.p.filter(Boolean).map(([l,t])=>`<p><span class="lb">${l}</span>${t}</p>`).join('');
  $('sheet').hidden=false;document.body.classList.add('has-sheet');markOn();
  if(el&&el.getBoundingClientRect){
    const over=el.getBoundingClientRect().bottom-(window.innerHeight-$('sheet').offsetHeight-28);
    if(over>0) window.scrollBy({top:over,behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
  }
}
function refreshSheet(){
  if(!sel.x) return;
  const el=[...document.querySelectorAll('[data-x]')].find(n=>n.dataset.x===sel.x);
  if(el) openSheet(sel.x,null); else closeSheet();
}
function setRead(on){
  document.documentElement.dataset.read=on?'on':'off';
  $('rd').setAttribute('aria-pressed',String(on));
  try{localStorage.setItem('bz-read',on?'1':'0');}catch(e){}
}

/* ---------- 渲染 ---------- */
const xb=(cls,key,html)=>`<button type="button" class="${cls}" data-x="${esc(key)}">${html}</button>`;
function gzSpan(gz){return `<span class="${gCls(gz[0])}">${gz[0]}</span><span class="${zCls(gz[1])}">${gz[1]}</span>`;}
function relChips(list){
  if(!list.length) return '<span class="none">没有</span>';
  return list.map(r=>{const w=(r.top?'对':'')+r.where.join('、');
    const key=['rel',r.t,r.c,r.n,r.where.join('、'),r.top,r.grp].join('|');
    return `<button type="button" class="rel${HE_TYPES.includes(r.t)?'':' bad'}" data-x="${esc(key)}">${esc(r.t)}<b>${esc(r.c)}</b>${r.n?`<small>${esc(r.n)}</small>`:''}<small>${esc(w)}</small></button>`;}).join('');
}
/* 只跟人有关、不随大运流年变的部分 */
function renderPerson(){
  const pe=$('people');
  pe.hidden=DATA.people.length<2;
  pe.innerHTML=DATA.people.map((p,i)=>`<button type="button" class="pp" aria-pressed="${i===sel.p}" data-p="${i}">${esc(p.name)}</button>`).join('');
  $('eyebrow').textContent=P.gender?'乾造 · 男命':'坤造 · 女命';
  $('title').setAttribute('aria-label',P.pillars.join(' '));
  $('title').innerHTML=NATAL.map(p=>`<span>${gzSpan(p.g+p.z)}</span>`).join('');
  $('meta').innerHTML=metaRows().map(r=>`<div><dt>${xb('x','meta|'+r.k,r.k)}</dt><dd>${r.dd}</dd></div>`).join('');
  ['pan','yun','rel','rel2','wx','tk','gods'].forEach(s=>{$('rd-'+s).innerHTML=readHTML(s);});
  $('note-yun').textContent=noteYun();
  $('note-wx').textContent=noteWx();
  $('h-wx-s').textContent=`四个天干加${cn(natalHidden().length)}个藏干`;
  const kv=kvRows();
  $('h-tk').textContent=kv.some(r=>r.k==='调候参考')?'日主与调候':'日主';
  $('kv').innerHTML=kv.map(r=>`<dt>${xb('x','kv|'+r.k,r.k)}</dt><dd>${r.dd}</dd>`).join('');
  $('h-gods-s').textContent=`以${DMN}为原点；加粗的是原局里出现的字`;
  $('foot').innerHTML=footItems().map(x=>`<li>${x}</li>`).join('');
  renderBars();renderGods();renderDynamic();
}
function renderPan(){
  const cs=cols(), cc=(c,i)=>`${c.dyn?'dyn':''}${i===1?' last':''}${c.day?' day':''}`;
  const row=(label,fn)=>`<tr><th scope="row">${xb('x','row|'+label,label)}</th>${cs.map((c,i)=>`<td class="${cc(c,i)}">${fn(c,i)}</td>`).join('')}</tr>`;
  $('pan').innerHTML=
    row('主星',c=>xb('x sm',`g|${c.k}|${c.g}`,c.day?'日主':god(c.g)))+
    row('天干',c=>xb('glyph '+gCls(c.g),`g|${c.k}|${c.g}`,c.g))+
    row('地支',c=>xb('glyph '+zCls(c.z),`z|${c.k}|${c.z}`,c.z))+
    row('藏干',c=>HID[c.z].split('').map(h=>xb('hs '+gCls(h),`h|${c.k}|${h}`,`${h}<small>${god(h)}</small>`)).join(''))+
    row('星运',c=>xb('x sm','st|'+c.k,stage(DM,c.z)))+
    row('自坐',c=>xb('x sm','zz|'+c.k,stage(c.g,c.z)))+
    row('空亡',c=>xb('x sm','xk|'+c.k,xunkong(c.g,c.z)))+
    row('纳音',c=>xb('x sm','ny|'+c.k,DATA.nayin[c.g+c.z]))+
    row('神煞',(c,i)=>`<span class="ss">${c.dyn||!SHENSHA[i-2].length?'—':SHENSHA[i-2].map(s=>xb('x',`ss|${s.n}|${i-2}`,s.n)).join('')}</span>`);
  const dy=P.dayun[sel.dy];
  $('hd-ln').textContent=sel.y+' 年';
  $('hd-dy').textContent=dy.y0+'–'+dy.y1;
}
function renderDayun(){
  $('dayun').innerHTML=P.dayun.map((d,i)=>`<button class="pk${i===NOW_DY?' now':''}" aria-pressed="${i===sel.dy}" data-dy="${i}"><span class="yr">${d.y0}–${d.y1}</span><span class="gz">${gzSpan(d.gz)}</span><span class="gd">${god(d.gz[0])} · ${godZ(d.gz[1])}</span><span class="ag">${d.a0}–${d.a1} 岁</span></button>`).join('');
}
function renderLiunian(){
  const d=P.dayun[sel.dy]; let h='';
  for(let y=d.y0;y<=d.y1;y++){const gz=yearGZ(y);
    h+=`<button class="pk${y===REAL_Y?' now':''}" aria-pressed="${y===sel.y}" data-y="${y}"><span class="yr">${y}</span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])} · ${godZ(gz[1])}</span><span class="ag">${y-P.clock[0]+1} 岁</span></button>`;}
  $('liunian').innerHTML=h;
  $('h-ln').textContent=`流年（${d.gz}运，${d.y0}–${d.y1}）`;
}
function renderLiuyue(){
  const y=sel.y, j=DATA.jie[y], cur=y===REAL_Y?NOW_M:-1; let h='';
  for(let m=0;m<12;m++){const gz=monthGZ(y,m);
    h+=`<button class="pk${m===cur?' now':''}" aria-pressed="${m===sel.m}" data-m="${m}"><span class="yr">${JIE[m]} ${j[m]}</span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])} · ${godZ(gz[1])}</span></button>`;}
  $('liuyue').innerHTML=h;
  $('h-ly').textContent=`流月（${y} ${yearGZ(y)}年）`;
}
function renderLiuri(){
  const days=monthDays(sel.y,sel.m), W='日一二三四五六'; let h='';
  days.forEach(t=>{const gz=dayGZ(t);
    h+=`<button class="pk${t===TODAY?' now':''}" aria-pressed="${t===sel.d}" data-d="${t}"><span class="yr">${mdText(t)} 周${W[new Date(t).getUTCDay()]}</span><span class="gz">${gzSpan(gz)}</span><span class="gd">${god(gz[0])} · ${godZ(gz[1])}</span></button>`;});
  $('liuri').innerHTML=h;
  $('h-lr').textContent=`流日（${monthGZ(sel.y,sel.m)}月，${mdText(days[0])}–${mdText(days[days.length-1])}）`;
}
function renderYunRead(){
  const d=P.dayun[sel.dy];
  const rows=[
    ['大运',d.gz,`${d.y0}–${d.y1} 年 · ${d.a0}–${d.a1} 岁`],
    ['流年',yearGZ(sel.y),`${sel.y} 年 · ${sel.y-P.clock[0]+1} 岁`],
    ['流月',monthGZ(sel.y,sel.m),`${JIE[sel.m]} ${DATA.jie[sel.y][sel.m]} 起`],
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
  $('rel-ng').innerHTML=relChips(base.filter(r=>r.grp==='g'));
  $('rel-nz').innerHTML=relChips(base.filter(r=>r.grp==='z'));
  $('h-rdy').textContent=`大运 ${d.gz} 带来的`;
  $('rel-dy').innerHTML=relChips(brought(NATAL.concat(DY),1));
  $('h-rln').textContent=`流年 ${sel.y} ${ln} 带来的`;
  $('rel-ln').innerHTML=relChips(brought(NATAL.concat(DY,LN),2));
  $('h-rly').textContent=`流月 ${ly}（${JIE[sel.m]} ${DATA.jie[sel.y][sel.m]} 起）带来的`;
  $('rel-ly').innerHTML=relChips(brought(NATAL.concat(DY,LN,LY),3));
  $('h-rlr').textContent=`流日 ${lr}（${mdText(sel.d)}）带来的`;
  $('rel-lr').innerHTML=relChips(brought(NATAL.concat(DY,LN,LY,LR),4));
}
function renderBars(){
  const {cnt,face}=wxCounts(), max=Math.max(...cnt);
  $('bars').innerHTML=cnt.map((n,i)=>`${xb('x el '+ELC[i],'wx|'+i,EL[i])}<span class="track ${ELC[i]}"><span class="fill" style="width:${Math.round(n/max*100)}%"></span></span><span class="n">${n} 个（${face[i]}）</span><span class="st">${wxState(i)}</span>`).join('');
}
const GOD_MEAN=['和我一样的人：自我、同辈、朋友和竞争者','我产出的东西：表达、才艺、作品','我能支配的东西：财物、资源','约束我的东西：规则、职位、压力','滋养我的东西：学问、庇护、长辈'];
function renderGods(){
  const present=new Set(natalStems().concat(natalHidden())), de=gEl(DM), yin=isYin(DM)?1:0;
  const cell=g=>`<td class="${present.has(g)?'have':''}">${xb('x','tg|'+god(g),god(g))}（<span class="${gCls(g)}">${g}</span>）</td>`;
  $('gods').innerHTML=CAT.map((r,i)=>{const e=(de+i)%5;
    return `<tr><td>${r[1]}</td><td class="${ELC[e]}">${EL[e]}</td>${cell(G[e*2+yin])}${cell(G[e*2+1-yin])}<td>${GOD_MEAN[i]}</td></tr>`;}).join('');
}
function renderDynamic(){fixDay();renderPan();renderDayun();renderLiunian();renderLiuyue();renderLiuri();renderRelations();renderYunRead();refreshSheet();}

/* ---------- 事件 ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.id==='rd'){setRead(b.getAttribute('aria-pressed')!=='true');return;}
  if(b.id==='sheet-x'){closeSheet();return;}
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
    fixDay();renderLiuyue();renderLiuri();renderRelations();renderYunRead();refreshSheet();
  }else if(b.dataset.d!==undefined){
    sel.d=Number(b.dataset.d);
    renderLiuri();renderRelations();renderYunRead();refreshSheet();
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sel.x) closeSheet();});

let readOn=true; try{readOn=localStorage.getItem('bz-read')!=='0';}catch(e){}
setRead(readOn);
let startAt=0; try{const i=DATA.people.findIndex(p=>p.id===localStorage.getItem('bz-person'));if(i>=0) startAt=i;}catch(e){}
usePerson(startAt);
