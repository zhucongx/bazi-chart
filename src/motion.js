/* 小动画。2026-11-22 用户说「做点小动画」。
   动的只是变化本身：打开页面、换人、换页、换选择、换数法、换主题、打开一块、指着生克图的圈，各动一下，大多在半秒以内；平时不动，没有循环的动画。
   都是先照常画好，再从旧的样子过渡到新的样子，所以动画做不做，最后的页面完全一样；动的时候内容最迟一秒以内全部露出来。
   系统里设了「减弱动态效果」的人，一样也不动；浏览器不支持的、页面在后台的、检查脚本用的 jsdom，也都不动（calm）。
   样式里另有几类：顶部弦纹打开页面时画一道，指着圈时线淡下去；2026-11-26 用户要的装饰动画，2026-11-27 用户要的「能帮助理解的动画」（一直循环），
   都写在模板 prefers-reduced-motion:no-preference 那一段。 */
const EASE='cubic-bezier(.22,.75,.25,1)';
const byKey=el=>{try{return el.matches(':focus-visible');}catch(e){return false;}};      // 焦点是键盘来的：鼠标、手指点出来的焦点不算
function calm(){return !Element.prototype.animate||document.hidden||!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
function anim(el,frames,o){
  if(!el||calm()) return null;
  try{return el.animate(frames,Object.assign({duration:240,easing:EASE,fill:'backwards'},o));}catch(e){return null;}
}
const fadeIn=(el,o)=>anim(el,[{opacity:0},{opacity:1}],o);
const riseIn=(el,o)=>anim(el,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],o);
/* 看得见的马上做；还在屏幕外面的，滚到的时候再做。f 收到的是「是不是马上就看得见」 */
function onSight(el,f){
  if(!el||!el.getClientRects().length) return;      // 没有显示出来的（手机上的关系图、藏着的那一页）不用管
  const r=el.getBoundingClientRect();
  if(!window.IntersectionObserver||(r.bottom>0&&r.top<window.innerHeight)){f(true);return;}
  const o=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){o.disconnect();if(document.contains(el)&&!calm()) f(false);}});
  o.observe(el);
}

let SHOWN=null;                    // 上一次画的是谁（whoNow）和四柱
let SWITCH=false;                  // 正在换人：整页都换了，细盘不逐列、关系图不逐条地动
const SEEN=new Set();              // 这一位看过的页。画图的动画一页只做一次，换了人重来

/* ---------- 换人 ---------- */
/* 画的是谁：性别和四柱，不看编号。来自链接的人编号都一样；存下来只是换了编号，同一副八字换一个日子，都还是同一张盘。
   时辰不详的人换一个时辰看，还是同一位，所以看出生的日子 */
const whoNow=()=>P.gender+'|'+(P.nohour?P.clock.slice(0,3).join('-'):P.pillars.join(''));
/* renderPerson 画完以后：四柱一柱一柱出来，太极转一圈，两张卡片显示着的那一页淡入，图重新画一遍。
   同一个人只是换了时辰的，只动变了的那几柱 */
function showPerson(){
  const was=SHOWN, all=!was||was.who!==whoNow();
  SHOWN={who:whoNow(),p:P.pillars.slice()};
  if(all) SEEN.clear();
  if(calm()) return;
  document.querySelectorAll('#title .pl').forEach((el,i)=>{
    if(all||was.p[i]!==P.pillars[i]) anim(el,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:440,delay:all?i*75:0});
  });
  if(!all) return;
  // 只转中间的太极，转整整一圈：外面的八卦照先天的方位排，不能停在歪的位置上；叠加在常驻缓转之上，结束无缝衔接
  anim(document.querySelector('.gua .tj'),[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:1200,easing:'cubic-bezier(.45,0,.2,1)',fill:'none',composite:'add'});
  if(was) Object.keys(TABS).forEach(card=>fadeIn($('p-'+sel.tab[card]),{duration:280}));
  queueMicrotask(()=>Object.keys(TABS).forEach(card=>drawPanel(sel.tab[card])));      // 等手上这一段跑完：刚打开页面时，上次翻到的那一页要在后面才换出来
  document.querySelectorAll('.pk.now').forEach(b=>onSight(b,()=>anim(b,[{transform:'none'},{transform:'scale(1.4) rotate(-5deg)',offset:.35},{transform:'none'}],{duration:380,delay:160,fill:'none',pseudoElement:'::after'})));      // 「当前」「今天」的小印按一下
}

/* ---------- 换页 ---------- */
/* 标签下面那道线从旧的标签滑到新的标签，新的一页升上来；这一位第一次翻到这一页，图画一遍 */
function turnPage(was,id){
  const a=$('h-'+was), b=$('h-'+id), bar=b&&b.parentElement;
  if(!a||!b||was===id||calm()) return;
  riseIn($('p-'+id));
  drawPanel(id);
  bar.querySelectorAll('.tab-ink').forEach(x=>x.remove());bar.querySelectorAll('.sliding').forEach(x=>x.classList.remove('sliding'));
  const at=e=>({left:e.offsetLeft+'px',width:e.offsetWidth+'px',top:(e.offsetTop+e.offsetHeight-2)+'px'});
  glide(bar,[b,a],'tab-ink',at(a),at(b),true);
}
/* 一个临时的块从一处滑到另一处，滑到以后去掉。滑的时候 hide 里的元素自己的边和底先藏起来（.sliding）。
   last：放在最后（标签下面的线要压在灰线上）；不写就放在最前面，垫在字下面 */
function glide(box,hide,cls,from,end,last){
  const g=document.createElement('span'); g.className=cls; g.setAttribute('aria-hidden','true');
  Object.assign(g.style,end);
  box.insertBefore(g,last?null:box.firstChild); hide.forEach(x=>x.classList.add('sliding'));
  const k=anim(g,[from,end],{duration:280}), done=()=>{
    if(!g.isConnected) return;      // 滑到一半又换了一次，这一块已经被清掉，新的一次正用着 .sliding
    hide.forEach(x=>x.classList.remove('sliding'));setTimeout(()=>g.remove(),160);      // 边和底有一百多毫秒的过渡，等它显出来再去掉临时的块
  };
  if(k){k.onfinish=done;k.oncancel=done;}else done();
}
/* 这一页里的图第一次看到时画一遍 */
function drawPanel(id){
  if(calm()||SEEN.has(id)) return;
  SEEN.add(id);
  const p=$('p-'+id), all=s=>[...p.querySelectorAll(s)];
  if(id==='wx'){widths(all('.wxt .fill'),[]);drawMap($('wxmap').querySelector('svg'));}
  if(id==='gods'){widths(all('.gn i'),[]);drawMap($('godmap').querySelector('svg'));}
  if(id==='ys') drawMap($('ysmap').querySelector('svg'));
  if(id==='qr') all('.qg').forEach(q=>onSight(q,()=>{      // 强弱计分的条从 0 涂到这张盘的分数，分数跟着走
    const f=q.querySelector('.qg-fill'), v=q.querySelector('.qg-v');
    anim(f,[{width:'0%'},{width:f.style.width}],{duration:700,delay:100});
    anim(v,[{left:'0%',opacity:0},{left:v.style.left,opacity:1}],{duration:700,delay:100});
  }));
  if(id==='rel') drawLinks(all('.lk'));
  all('.stkw,.gjz-bar').forEach(s=>onSight(s,()=>anim(s,[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:520,delay:80})));
}

/* ---------- 条和图 ---------- */
/* 一组条从旧的长短变到新的。was 是旧的长短（按先后，百分数或者像素，和新的同一种），没有的从 0 起。
   用缩放，不改宽度：改宽度会让表格的列跟着挪 */
const sizeOf=el=>parseFloat(el.style.width)||el.offsetWidth;
function widths(els,was){
  els.forEach((el,i)=>{
    const to=sizeOf(el), from=was[i]||0;
    if(to&&Math.abs(from-to)>.05) anim(el,[{transform:`scaleX(${from/to})`,transformOrigin:'left'},{transform:'none',transformOrigin:'left'}],{duration:460,delay:was.length?0:i*40});
  });
}
/* 生克图第一次看到：相生的五条线顺着相生的次序一条条出来，相克的随后出来，圈从下往上填 */
function drawMap(svg){
  onSight(svg,()=>{
    svg.querySelectorAll('line.sh').forEach((l,i)=>fadeIn(l,{duration:240,delay:80+i*80}));
    svg.querySelectorAll('line.ke').forEach((l,i)=>fadeIn(l,{duration:240,delay:440+i*30}));
    moveLevels(svg,{});
  });
}
const levelsOf=svg=>{const o={};if(svg) svg.querySelectorAll('.lvl').forEach(r=>{o[r.getAttribute('clip-path')]=+r.getAttribute('height');});return o;};
/* 圈里填的那一截从旧的高低变到新的。用逐帧改高度：样式里给矩形的高度做动画，有的浏览器不认 */
function moveLevels(svg,was){
  if(!svg||calm()) return;
  svg.querySelectorAll('.lvl').forEach(r=>{
    const H=r.getAttribute('height'), Y=r.getAttribute('y'), h=+H, base=+Y+h, h0=was[r.getAttribute('clip-path')]||0;
    if(Math.abs(h-h0)<.1) return;
    const set=v=>{r.setAttribute('height',v.toFixed(2));r.setAttribute('y',(base-v).toFixed(2));};
    const t0=performance.now(), step=t=>{
      if(!r.isConnected) return;
      const k=Math.min(1,Math.max(0,(t-t0)/560));
      if(k<1){set(h0+(h-h0)*(1-Math.pow(1-k,3)));requestAnimationFrame(step);}else{r.setAttribute('height',H);r.setAttribute('y',Y);}
    };
    set(h0);requestAnimationFrame(step);
  });
}
/* 换数法（五行、十神两页表上面的按钮）：f 重画，条和圈从旧的变到新的 */
function recount(k,f){
  if(calm()){f();return;}
  // 十神表里没有的那一格不画条，所以按格子（.gn、.track）对，不按条的先后对
  const svg=()=>$(k==='wx'?'wxmap':'godmap').querySelector('svg'), cells=()=>[...document.querySelectorAll(k==='wx'?'#wxt .track':'#gods .gn')].map(c=>c.firstElementChild);
  const was=cells().map(i=>i?sizeOf(i):0), lv=levelsOf(svg());
  f();
  cells().forEach((i,j)=>{if(i) widths([i],[was[j]]);});
  moveLevels(svg(),lv);
}
/* 生克图：指着哪个圈（鼠标移上去，或者键盘选中），只留和它有关的线：生它的、它生的、克它的、它克的，别的淡下去。
   六亲图也一样：指着一位亲属的框，只留它是怎么推出来的那一条路（样式里照 data-hl 和 data-i 淡掉别的） */
let HOVER=null, FOCUS=null;        // 鼠标指着的圈、键盘选中的圈，两样分开记：一样没有了，另一样还算
const nodeOf=el=>el&&el.closest?el.closest('.wxmap .nd[data-n],.lqmap .lq-nd[data-n]'):null;
function hlMap(){
  const n=[HOVER,FOCUS].find(x=>x&&x.isConnected)||null, svg=n?n.ownerSVGElement:null;
  document.querySelectorAll('svg[data-hl]').forEach(s=>{if(s!==svg) s.removeAttribute('data-hl');});
  if(svg) svg.setAttribute('data-hl',n.getAttribute('data-n'));
}
/* 细盘和八字表：指着一个天干，它在地支里的根（同一五行的藏干）亮起来；指着一个地支或者一个藏干，它托着的天干（和它里面的藏干同一五行的）亮起来。
   亮的字带 data-lit，怎么亮写在样式里。只在同一张表里找。2026-11-27 用户要「能帮助理解的动画」 */
let LIT_H=null, LIT_F=null;        // 鼠标指着的字、键盘选中的字，和上面一样分开记
const cellOf=el=>{const b=el&&el.closest?el.closest('table.pan [data-x]'):null;return b&&/^[gzh]\|/.test(b.dataset.x)?b:null;};
function litUp(){
  const b=[LIT_H,LIT_F].find(x=>x&&x.isConnected)||null, on=new Set();
  if(b){
    const a=b.dataset.x.split('|'), ch=a[2], tb=b.closest('table'), last=x=>x.dataset.x.split('|')[2];
    if(a[0]==='g') tb.querySelectorAll('[data-x^="h|"]').forEach(x=>{if(gEl(last(x))===gEl(ch)) on.add(x);});
    else{const els=new Set((a[0]==='z'?HID[ch].split(''):[ch]).map(gEl));tb.querySelectorAll('.glyph[data-x^="g|"]').forEach(x=>{if(els.has(gEl(last(x)))) on.add(x);});}
  }
  document.querySelectorAll('.pan [data-lit]').forEach(x=>{if(!on.has(x)) x.removeAttribute('data-lit');});
  on.forEach(x=>x.setAttribute('data-lit',''));
}
document.addEventListener('pointerover',e=>{const t=e.pointerType==='touch';HOVER=t?null:nodeOf(e.target);hlMap();LIT_H=t?null:cellOf(e.target);litUp();});
document.addEventListener('focusin',e=>{const k=byKey(e.target);FOCUS=k?nodeOf(e.target):null;hlMap();LIT_F=k?cellOf(e.target):null;litUp();});
document.addEventListener('focusout',()=>{FOCUS=null;hlMap();LIT_F=null;litUp();});
document.documentElement.addEventListener('pointerleave',()=>{HOVER=null;hlMap();LIT_H=null;litUp();});

/* ---------- 换大运、流年、流月、流日 ---------- */
/* 把 f（重画）包起来：选中的那一格滑到新的位置；换成别的一排，小卡淡入；条从旧的长短变到新的；
   细盘变了的那几列、关系图新出现的几条淡入 */
const PICK=['dayun','liunian','liuyue','liuri'];
const pickKey=box=>[...box.querySelectorAll('.mb')].map(m=>m.dataset.x).join();
const panKey=()=>{const r=$('pan').rows;return r.length>2?[1,2,3,4].map(i=>r[1].cells[i].textContent+r[2].cells[i].textContent):[];};
const linkKeys=()=>new Set([...$('lkmap').querySelectorAll('.lk')].map(e=>e.dataset.k));
function moving(f){
  if(calm()){f();return;}
  const was={pan:panKey(),lk:linkKeys(),pick:PICK.map(id=>{
    const box=$(id), on=box.querySelector('.pk[aria-pressed="true"]');
    return {key:pickKey(box),at:on?{left:on.offsetLeft+'px',top:on.offsetTop+'px',width:on.offsetWidth+'px',height:on.offsetHeight+'px'}:null,
      bars:new Map([...box.querySelectorAll('.mb')].map(m=>[m.dataset.x,sizeOf(m.querySelector('.mb-fill'))]))};})};
  f();
  PICK.forEach((id,j)=>{
    const box=$(id), w=was.pick[j], on=box.querySelector('.pk[aria-pressed="true"]');
    if(pickKey(box)!==w.key){box.querySelectorAll('.pk').forEach((b,i)=>riseIn(b,{duration:200,delay:i*4}));return;}
    if(on&&w.at){const to={left:on.offsetLeft+'px',top:on.offsetTop+'px',width:on.offsetWidth+'px',height:on.offsetHeight+'px'};
      if(to.left!==w.at.left||to.top!==w.at.top) glide(box,[on],'pk-ghost',w.at,to);}
    box.querySelectorAll('.mb').forEach(m=>{if(w.bars.has(m.dataset.x)) widths([m.querySelector('.mb-fill')],[w.bars.get(m.dataset.x)]);});
  });
  if(SWITCH) return;
  if(!$('p-pan').hidden){const k=panKey(), rows=[...$('pan').rows];k.forEach((v,i)=>{if(was.pan[i]!==v) rows.forEach(r=>[...r.cells[i+1].children].forEach(x=>fadeIn(x,{duration:320})));});}
  if(!$('p-rel').hidden) drawLinks([...$('lkmap').querySelectorAll('.lk')].filter(e=>!was.lk.has(e.dataset.k)));
}
/* 关系图的几条：线从中间往两头伸开，名字和圈随后出来 */
function drawLinks(els){
  if(calm()) return;
  els.forEach((el,i)=>onSight(el,now=>{
    const d=now?Math.min(i*22,440):0;
    anim(el.querySelector('.lk-l'),[{transform:'scaleX(0)'},{transform:'none'}],{duration:380,delay:d});
    fadeIn(el.querySelector('.lk-ts'),{delay:d+90});
    el.querySelectorAll('i').forEach(x=>fadeIn(x,{delay:d+60}));
  }));
}

/* ---------- 零碎的几处 ---------- */
/* 打开一块（添加表单、分享框） */
function openBox(el){anim(el,[{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'none'}],{duration:220});}
/* 显示解读：看得见的几块从左边出来 */
function showReads(){if(!calm()) document.querySelectorAll('.read').forEach(r=>{if(r.offsetParent) anim(r,[{opacity:0,transform:'translateX(-8px)'},{opacity:1,transform:'none'}],{duration:280});});}
/* 换浅色、深色：换完以后内容淡入。不用 startViewTransition：它在三百毫秒里把整页的点击都吃掉（2026-11-22 审阅） */
function fadeTheme(f){f();anim(document.body,[{opacity:.4},{opacity:1}],{duration:240,fill:'none'});}
/* 摆解释卡片以前：所指的字和它外面几层要是正在移动，先让它们到位，不然照半路上的位置摆 */
function settle(el){for(let n=el;n&&n.getAnimations;n=n.parentElement) n.getAnimations().forEach(a=>{try{a.finish();}catch(e){}});}
