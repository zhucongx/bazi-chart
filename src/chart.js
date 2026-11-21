/* 页面内排盘：由出生信息算出一个人的全部数据。
   算法照搬 tools/gen_data.py 用到的 lunar_python，结果必须逐项相同：检查脚本拿页面自带的每个人、
   以及 tools/fuzz.py 随机生成的出生时间来对照。
   节的时刻和农历来自 TABLES（tools/gen_tables.py 从 lunar_python 导出），所以只支持 1900 到 2100 年出生。
   这里的时刻都是「把北京时间当作 UTC」得到的秒数，可以直接做加减，不受浏览器所在时区影响。 */
const BIRTH_MIN=1900, BIRTH_MAX=2100;
const toSec=(y,m,d,h,mi,s)=>Date.UTC(y,m-1,d,h||0,mi||0,s||0)/1000;
const fromSec=t=>{const d=new Date(t*1000);return [d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()];};
const JZ=i=>G[i%10]+Z[i%12];                       // 六十甲子的第 i 个，甲子是 0

/* ---------- 两张表的解码（编码见 tools/gen_tables.py 开头） ---------- */
/* 节的时刻：JIE_T[(年 − TABLES.jieFrom) × 12 + k]，k 从 0 到 11 依次是立春……大雪，和次年一月的小寒 */
const JIE_T=(()=>{const s=TABLES.jie,out=[];let t=TABLES.jieBase;for(let i=0;i<s.length;i+=4){t+=2400000+parseInt(s.slice(i,i+4),36);out.push(t);}return out;})();
/* 农历年：正月初一的时刻、闰几月（没有是 0）、各月的天数（闰月排在它本月后面） */
const LUNAR_Y=(()=>{const s=TABLES.lunar,out={};
  for(let i=0;i<s.length;i+=5){const v=parseInt(s.slice(i,i+5),36),y=TABLES.lunarFrom+i/5,leap=(v>>13)&15,lens=[];
    for(let j=0;j<(leap?13:12);j++) lens.push(v>>j&1?30:29);
    out[y]={t0:toSec(y,1,1)+(v>>17)*86400,leap,lens};}
  return out;})();
/* y 年十二个月各自开始的那个节的公历日期，从立春到次年一月的小寒，写成「月/日」 */
const JIE_MD={};
function jieMD(y){
  if(JIE_MD[y]) return JIE_MD[y];
  const i=(y-TABLES.jieFrom)*12; if(i<0||i+11>=JIE_T.length) return undefined;
  const out=[];for(let k=0;k<12;k++){const d=new Date(JIE_T[i+k]*1000);out.push((d.getUTCMonth()+1)+'/'+d.getUTCDate());}
  return JIE_MD[y]=out;
}
/* 不晚于时刻 t 的最后一个节，返回它在 JIE_T 里的下标 */
function lastJie(t){let lo=0,hi=JIE_T.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(JIE_T[mid]<=t) lo=mid;else hi=mid-1;}return lo;}

/* ---------- 公历日期的加减，照 lunar_python 的 Solar ---------- */
const leapY=y=>(y%4===0&&y%100!==0)||y%400===0;
const mdays=(y,m)=>m===2?(leapY(y)?29:28):[31,28,31,30,31,30,31,31,30,31,30,31][m-1];
function addYears(a,n){const y=a[0]+n;return [y,a[1],a[1]===2&&a[2]>28&&!leapY(y)?28:a[2],a[3],a[4],a[5]];}
function addMonths(a,n){const k=a[0]*12+a[1]-1+n,y=Math.floor(k/12),m=k%12+1;return [y,m,Math.min(a[2],mdays(y,m)),a[3],a[4],a[5]];}
function addDays(a,n){const t=fromSec(toSec(a[0],a[1],a[2])+n*86400);return [t[0],t[1],t[2],a[3],a[4],a[5]];}
function addHours(a,n){const h=a[3]+n,b=addDays(a,Math.floor(h/24));return [b[0],b[1],b[2],h%24,a[4],a[5]];}

/* ---------- 真太阳时 ---------- */
/* 均时差，单位秒。Meeus《Astronomical Algorithms》第 28 章的式 (28.3)，写法和 tools/gen_data.py 逐项对应 */
function equationOfTime(jd){
  const rad=x=>x*(Math.PI/180);
  const t=(jd-2451545.0)/36525;
  const l0=rad(280.46646+36000.76983*t+0.0003032*t*t);
  const m=rad(357.52911+35999.05029*t-0.0001537*t*t);
  const e=0.016708634-0.000042037*t-0.0000001267*t*t;
  const eps=rad(23+26/60+(21.448-46.8150*t-0.00059*t*t+0.001813*t**3)/3600);
  const y=Math.tan(eps/2)**2;
  const r=y*Math.sin(2*l0)-2*e*Math.sin(m)+4*e*y*Math.sin(m)*Math.cos(2*l0)-0.5*y*y*Math.sin(4*l0)-1.25*e*e*Math.sin(2*m);
  return r*(180/Math.PI)*240;
}
const roundHalfUp=x=>{const v=Math.sign(x)*Math.floor(Math.abs(x)+0.5);return v===0?0:v;};   // 负数按绝对值算，−2.5 得 −3

/* ---------- 四柱 ---------- */
function dayIndex(y,m,d){return ((54+Math.round((Date.UTC(y,m-1,d)-Date.UTC(2000,0,1))/DAY))%60+60)%60;}
/* a 是 [年,月,日,时,分,秒]。年以立春的时刻为界，月以节的时刻为界，日以零点为界；
   晚上 11 点以后日柱算当天，时干按第二天的日干推。返回四柱，和它所在的那个节的下标。 */
function pillarsAt(a){
  const i=lastJie(toSec(...a)), gy=TABLES.jieFrom+Math.floor(i/12), di=dayIndex(a[0],a[1],a[2]);
  const tz=Math.floor((a[3]+1)/2)%12, dg=(di%10+(a[3]===23?1:0))%10;
  return {i,p:[yearGZ(gy),monthGZ(gy,i%12),JZ(di),G[(dg%5*2+tz)%10]+Z[tz]]};
}

/* ---------- 农历、星座 ---------- */
const L_MONTH=' 正二三四五六七八九十冬腊', L_NUM=' 一二三四五六七八九十';
const lunarDay=n=>n<=10?'初'+L_NUM[n]:n<20?'十'+L_NUM[n-10]:n===20?'二十':n<30?'廿'+L_NUM[n-20]:'三十';
function lunarOf(y,m,d){
  const t=toSec(y,m,d); let ly=y; if(t<LUNAR_Y[ly].t0) ly--;
  const L=LUNAR_Y[ly]; let rest=Math.round((t-L.t0)/86400);
  for(let j=0;j<L.lens.length;j++){
    if(rest<L.lens[j]){
      const leap=L.leap>0&&j===L.leap, mon=!L.leap||j<L.leap?j+1:j;
      return {year:JZ(((ly-4)%60+60)%60),month:(leap?'闰':'')+L_MONTH[mon],day:lunarDay(rest+1),leap};
    }
    rest-=L.lens[j];
  }
  return null;
}
function xingzuoOf(m,d){
  const y=m*100+d, X=['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
  return X[y>=321&&y<=419?0:y>=420&&y<=520?1:y>=521&&y<=621?2:y>=622&&y<=722?3:y>=723&&y<=822?4:y>=823&&y<=922?5:y>=923&&y<=1023?6:y>=1024&&y<=1122?7:y>=1123&&y<=1221?8:y>=1222||y<=119?9:y<=218?10:11];
}

/* ---------- 出生信息 ---------- */
/* 出生信息是 {id, name, gender: '男'或'女', birth: 'YYYY-MM-DD HH:MM', place, lon, dst, shichen, source, notes}，
   和 people/*.json 的格式相同。birth 是北京时间的钟表时间。 */
function parseBirth(text){
  const m=/^\s*(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(String(text||''));
  if(!m) return null;
  const a=m.slice(1).map(x=>x===undefined?0:Number(x)), b=fromSec(toSec(...a));
  return a.every((v,i)=>v===b[i])?a:null;            // 2 月 30 日、25 点这类不存在的时刻会对不上
}
/* 只记到时辰的，birth 只写日期 'YYYY-MM-DD'，另有 shichen（十二地支之一）。
   这时取这个时辰的中点直接当作真太阳时，不做经度和均时差的换算，也不需要 lon；子时取零点。 */
function parseDay(text){
  const m=/^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(String(text||''));
  if(!m) return null;
  const a=m.slice(1).map(Number), b=fromSec(toSec(...a));
  return a.every((v,i)=>v===b[i])?a:null;
}
/* 出生信息有没有问题。没有问题返回空字符串，有问题返回一句说明。
   时辰不详的带 nohour: true，birth 只写日期；排盘时由页面另给一个时辰（shichen），当作「只知道时辰」来排 */
function checkInfo(info){
  const sh=info&&info.shichen, no=!!(info&&info.nohour);
  if(sh&&!(typeof sh==='string'&&sh.length===1&&Z.includes(sh))) return '时辰要选十二个时辰里的一个。';
  const a=sh||no?parseDay(info.birth):parseBirth(info&&info.birth);
  if(!a) return sh||no?'出生日期没有填，或者不是一个存在的日子。':'出生日期和时间没有填全，或者不是一个存在的时刻。';
  if(a[0]<BIRTH_MIN||a[0]>BIRTH_MAX) return `只支持 ${BIRTH_MIN} 到 ${BIRTH_MAX} 年出生。`;
  if(info.gender!=='男'&&info.gender!=='女') return '性别要填男或女。';
  if(!sh&&!no&&(typeof info.lon!=='number'||!isFinite(info.lon)||info.lon<-180||info.lon>180)) return '经度要填一个数，东经为正。';
  if(info.jie!==undefined&&!(sh&&!no&&(info.jie==='before'||info.jie==='after'))) return '交节的前后（jie）只能写 before 或 after，而且只和时辰一起用。';
  return '';
}
/* 只知道时辰的人：这个时辰的两小时里（中点前后各一小时）有没有交节。有就返回这个节在 JIE_T 里的序号，没有返回 -1。c 是时辰的中点（秒）。
   时辰本来是照当地太阳定的，页面把中点当钟表时间去比节气表（见 chartOf），这里也照这个近似。
   子时只看零点以后的一小时：页面的子时取零点、日柱算记载的那一天，前一晚 11 点以后的那一半日柱算法不同，不在这里 */
const hourFrom=c=>fromSec(c)[3]===0?c:c-3600;
function jieInHour(c){
  const lo=hourFrom(c);
  for(let k=Math.max(0,pillarsAt(fromSec(lo)).i);k<JIE_T.length&&JIE_T[k]<c+3600;k++){if(JIE_T[k]>=lo) return k;}
  return -1;
}
/* 只知道时辰、交节又落在这个时辰里的：出生在交节之前还是之后定不了，年柱、月柱和大运两边不一样。平常照时辰的中点排；
   出生信息里写了 jie（'before' 交节之前，'after' 交节之后）、中点又在另一边的，年柱、月柱和大运改照那一边排：
   取这个时辰里那一边的中点当出生的时刻。日柱、时柱不受影响。返回 {k, cj, side}；用不上时 k 是 -1、cj 就是 c。
   直接输入八字反查日期时要用它（datesOf）：正排在交节那一边的四柱，照中点排是找不回来的（2026-11-21 复核报告第 4 条） */
function jieSide(c,jie){
  const k=jie==='before'||jie==='after'?jieInHour(c):-1; if(k<0) return {k:-1,cj:c,side:''};
  const T=JIE_T[k], mid=c>=T?'after':'before'; if(mid===jie) return {k:-1,cj:c,side:''};      // 中点本来就在这一边
  return {k,side:jie,cj:jie==='after'?T+Math.floor((c+3600-T)/2):Math.min(T-1,T-Math.floor((T-hourFrom(c))/2))};
}
/* 排盘。返回的对象和 tools/gen_data.py 写进 people.json 的每个人字段相同（jie、jieClock 两项只有页面上有，见 jieSide）。 */
function chartOf(info){
  const bad=checkInfo(info); if(bad) throw new Error(bad);
  const sh=info.shichen||(info.nohour?'午':'');            // 时辰不详而没有另给时辰的，先按午时排
  const c=sh?toSec(...parseDay(info.birth),2*Z.indexOf(sh)):toSec(...parseBirth(info.birth))-(info.dst?3600:0), clock=fromSec(c);
  const dlonSec=sh?0:roundHalfUp((info.lon-120)*240);
  const eotSec=sh?0:roundHalfUp(equationOfTime(2451545.0+(c-8*3600-toSec(2000,1,1,12))/86400));   // 钟表时间减 8 小时，当作世界时
  const ts=c+dlonSec+eotSec, tst=fromSec(ts);
  // 年柱、月柱看出生的那一刻在交节之前还是之后。交节是一个确定的时刻，节气表存的是北京时间，所以拿钟表时间（也是北京时间）去比；
  // 日柱、时柱照当地的真太阳时。原来四柱都照真太阳时，交节前后同一个时刻换个经度就换了年柱、月柱，而且和按钟表时间排的大运接不上
  // （2026-11-17 内容审阅 C1，用户说改）。pillarsClock 是整个按钟表时间排的，留着对照日柱、时柱
  const js=sh&&!info.nohour?jieSide(c,info.jie):{k:-1,cj:c,side:''}, cj=js.cj, jclock=fromSec(cj);      // 年柱、月柱和大运用的时刻：平常就是 c
  const A=pillarsAt(tst), B=pillarsAt(jclock);
  const [yp,mp]=B.p, dp=A.p[2], hp=A.p[3], yg=G.indexOf(yp[0]);
  const jieAt=i=>({name:JIE[i%12],at:fromSec(JIE_T[i])});
  // 胎元、命宫、身宫、胎息。月支和时支都换成「寅是 1、丑是 12」的序号来算
  const mzi=(Z.indexOf(mp[1])+10)%12+1, tzi=(Z.indexOf(hp[1])+10)%12+1;
  const pick=off=>{let g=(yg+1)*2+off;while(g>10) g-=10;return G[g-1]+Z[(off+1)%12];};
  const ming=mzi+tzi>=14?26-mzi-tzi:14-mzi-tzi, shen=mzi+Z.indexOf(hp[1])+1;
  // 大运也按钟表时间，和年柱、月柱是同一个基准：阳年男、阴年女顺排，数到下一个节；阴年男、阳年女逆排，数到上一个节
  const man=info.gender==='男', forward=(yg%2===0)===man, yj=forward?B.i+1:B.i;
  const gapMin=forward?Math.floor(JIE_T[yj]/60)-Math.floor(cj/60):Math.floor(cj/60)-Math.floor(JIE_T[yj]/60);
  let rest=gapMin; const y=Math.floor(rest/4320); rest-=y*4320;
  const m=Math.floor(rest/360); rest-=m*360;
  const d=Math.floor(rest/12); rest-=d*12;
  const h=rest*2, start=addHours(addDays(addMonths(addYears(jclock,y),m),d),h);
  const mi=gz60(mp[0],mp[1]), dayun=[];
  for(let k=1;k<=8;k++){const y0=start[0]+(k-1)*10, a0=y0-clock[0]+1;dayun.push({gz:JZ(((mi+(forward?k:-k))%60+60)%60),y0,y1:y0+9,a0,a1:a0+9});}
  const p={id:info.id,name:info.name,gender:man?1:0,clock};
  if(sh) p.shichen=sh;
  if(js.side){p.jie=js.side;p.jieClock=jclock;}
  if(info.nohour) p.nohour=true;
  if(info.dst&&!sh) p.dst=true;
  if(info.source) p.source=info.source;
  p.place=info.place||'';
  if(!sh) p.lon=info.lon;
  Object.assign(p,{dlonSec,eotSec,tst,
    lunar:lunarOf(tst[0],tst[1],tst[2]),xingzuo:xingzuoOf(tst[1],tst[2]),
    pillars:[yp,mp,dp,hp],pillarsClock:js.side?[yp,mp,dp,hp]:B.p,
    prevJie:Object.assign(jieAt(B.i),{min:Math.floor((cj-JIE_T[B.i])/60)}),
    nextJie:Object.assign(jieAt(B.i+1),{min:Math.floor((JIE_T[B.i+1]-cj)/60)}),
    taiyuan:G[(G.indexOf(mp[0])+1)%10]+Z[(Z.indexOf(mp[1])+3)%12],
    minggong:pick(ming),shengong:pick(shen>12?shen-12:shen),
    taixi:gHe(dp[0])+Z[(13-Z.indexOf(dp[1]))%12],
    yun:{forward,y,m,d,h,start:start.slice(0,3),jie:JIE[yj%12],gapMin},
    dayun});
  if(info.notes) p.notes=info.notes;
  return p;
}
/* ---------- 直接输入八字：反查出生日期 ---------- */
/* 从一段字里取出八个干支字，看能不能成一副八字：每一柱阳干配阳支、阴干配阴支，月干由年干推出（年上起月），时干由日干推出（日上起时）。
   返回 {msg, p}：p 是四柱，有问题时 p 是 null，msg 说明错在哪里；字还没写够时 msg 说还差几个字 */
function baziCheck(text){
  const t=String(text||'').replace(/[^甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]/g,''), K='年月日时';
  if(t.length<8) return {msg:t.length?`还差 ${8-t.length} 个字：年、月、日、时四柱一共八个字。`:'',p:null};
  if(t.length>8) return {msg:'多了字：年、月、日、时四柱一共八个字。',p:null};
  const ps=[0,2,4,6].map(i=>t.slice(i,i+2));
  for(let i=0;i<4;i++){
    const g=ps[i][0], z=ps[i][1];
    if(!G.includes(g)||!Z.includes(z)) return {msg:`${K[i]}柱「${ps[i]}」要先写天干、再写地支。`,p:null};
    if(G.indexOf(g)%2!==Z.indexOf(z)%2) return {msg:`${K[i]}柱「${ps[i]}」不成一柱：阳干只配阳支，阴干只配阴支。`,p:null};
  }
  const mi=(Z.indexOf(ps[1][1])+10)%12, mg=G[((G.indexOf(ps[0][0])%5)*2+2+mi)%10];
  if(ps[1][0]!==mg) return {msg:`${ps[0][0]}年的${ps[1][1]}月是${mg}${ps[1][1]}，不是${ps[1]}：月干由年干推出。`,p:null};
  const hz=Z.indexOf(ps[3][1]), hg=G[(G.indexOf(ps[2][0])%5*2+hz)%10];
  if(ps[3][0]!==hg) return {msg:`${ps[2][0]}日的${ps[3][1]}时是${hg}${ps[3][1]}，不是${ps[3]}：时干由日干推出。`+(hz===0?'晚上 11 点以后出生、时干按第二天推的，请改用「按出生时间」填。':''),p:null};
  return {msg:'',p:ps};
}
/* 四柱都对得上的日子，年份在 BIRTH_MIN 到 BIRTH_MAX 之间。先按年柱、月柱找出那个月的几天，再看日柱；
   时辰取中点（子时取零点），和「只知道时辰」排盘的办法相同，每一个都拿 pillarsAt 再排一遍核对。
   交节正落在这个时辰里的那一天，中点对不上就再试交节的另一边（jieSide）：对得上的带着 jie，存下来以后照那一边排。
   返回 [{birth:'YYYY-MM-DD', shichen, jie?}]，按日期先后 */
function datesOf(ps){
  const out=[], hi=Z.indexOf(ps[3][1]), mi=(Z.indexOf(ps[1][1])+10)%12, pad=n=>String(n).padStart(2,'0');
  for(let y=BIRTH_MIN-1;y<=BIRTH_MAX;y++){
    if(yearGZ(y)!==ps[0]||monthGZ(y,mi)!==ps[1]) continue;
    const i=(y-TABLES.jieFrom)*12+mi; if(i<0||i+1>=JIE_T.length) continue;
    for(let t=Math.floor(JIE_T[i]/86400)*86400;t<=JIE_T[i+1];t+=86400){
      const a=fromSec(t);
      if(a[0]<BIRTH_MIN||a[0]>BIRTH_MAX||JZ(dayIndex(a[0],a[1],a[2]))!==ps[2]) continue;
      const birth=`${a[0]}-${pad(a[1])}-${pad(a[2])}`, c=toSec(a[0],a[1],a[2],2*hi), mid=pillarsAt(fromSec(c)).p;
      if(mid.join()===ps.join()){out.push({birth,shichen:Z[hi]});continue;}
      const k=jieInHour(c); if(k<0) continue;
      const jie=c>=JIE_T[k]?'before':'after', B=pillarsAt(fromSec(jieSide(c,jie).cj)).p;
      if([B[0],B[1],mid[2],mid[3]].join()===ps.join()) out.push({birth,shichen:Z[hi],jie});
    }
  }
  return out;
}
/* 分享链接：出生信息放在网址 # 后面，浏览器不会把这一段发给服务器。参数：
   n 称呼，g 性别（m 或 f），b 出生日期；按出生时间排的人 b 带时刻（YYYY-MM-DDTHH:MM），另有 lon 经度、dst=1 夏令时；
   只知道时辰的有 sh（十二地支之一）；时辰不详的有 nh=1；直接给八字的有 bz（四柱八个字），打开时从 datesOf 查出的日子里选，
   b 可以指定是其中哪一天，没指定就取最早的一天。
   linkOf(出生信息) 写成参数串。linkInfo(URLSearchParams) 反过来，返回 {info, dates} 或 {err}：每一项都过 checkInfo。 */
function linkOf(info){
  const q=new URLSearchParams(), pad=n=>String(n).padStart(2,'0');
  q.set('n',String(info.name||'')); q.set('g',info.gender==='女'?'f':'m');
  if(info.nohour){q.set('b',info.birth);q.set('nh','1');}
  else if(info.shichen){q.set('b',info.birth);q.set('sh',info.shichen);if(info.jie) q.set('jq',info.jie==='after'?'a':'b');}
  else{
    const a=parseBirth(info.birth);
    q.set('b',`${a[0]}-${pad(a[1])}-${pad(a[2])}T${pad(a[3])}:${pad(a[4])}`+(a[5]?':'+pad(a[5]):''));
    q.set('lon',String(info.lon)); if(info.dst) q.set('dst','1');
  }
  return q.toString();
}
function linkInfo(q){
  const g=q.get('g'), info={id:'link',name:String(q.get('n')||'').trim().slice(0,20)||'来自链接',gender:g==='m'||g==='男'?'男':g==='f'||g==='女'?'女':'',place:''};
  let dates=null;
  if(q.has('bz')){
    const r=baziCheck(q.get('bz')); if(!r.p) return {err:r.msg||'八字认不出来。'};
    dates=datesOf(r.p); if(!dates.length) return {err:'1900 到 2100 年里没有四柱都对得上的日子，排不了大运。'};
    const d=dates.find(x=>x.birth===q.get('b'))||dates[0];
    info.birth=d.birth; info.shichen=d.shichen; if(d.jie) info.jie=d.jie;
  }else if(q.get('nh')==='1'){info.birth=String(q.get('b')||''); info.nohour=true;}
  else if(q.has('sh')){info.birth=String(q.get('b')||''); info.shichen=String(q.get('sh')); if(q.get('jq')==='a'||q.get('jq')==='b') info.jie=q.get('jq')==='a'?'after':'before';}
  else{
    info.birth=String(q.get('b')||'').replace('T',' ');
    info.lon=(q.get('lon')||'').trim()===''?NaN:Number(q.get('lon'));
    if(q.get('dst')==='1') info.dst=true;
  }
  const err=checkInfo(info);
  return err?{err}:{info,dates};
}
/* 两份出生信息是不是同一个人：性别、出生的时刻或日期和时辰、经度、夏令时都相同。称呼不算 */
function infoKey(x){
  const a=(x.shichen||x.nohour?parseDay:parseBirth)(x.birth)||[];
  return [x.gender,a.join('-'),x.shichen||'',x.nohour?1:0,x.shichen||x.nohour?'':Number(x.lon),x.dst?1:0,x.jie||''].join('|');
}
/* 反过来：从一个排好的人取回出生信息。clock 是扣过夏令时的；标着 dst 的人把那一小时加回去、照样标 dst，取回的就是当初填的时间。
   原来不加回去也不标：排出来一样，可是同一个人和带 dst 的分享链接认不成同一位，chartOf 的夏令时分支也没有哪条检查走得到（2026-11-18 审阅） */
function infoFrom(p){
  const dst=!!p.dst&&!p.shichen&&!p.nohour, c=dst?addHours(p.clock,1):p.clock, pad=n=>String(n).padStart(2,'0');
  const day=`${c[0]}-${pad(c[1])}-${pad(c[2])}`;
  const info=p.nohour?{id:p.id,name:p.name,gender:p.gender?'男':'女',birth:day,nohour:true,place:p.place||''}
    :p.shichen?Object.assign({id:p.id,name:p.name,gender:p.gender?'男':'女',birth:day,shichen:p.shichen,place:p.place||''},p.jie?{jie:p.jie}:{})
    :{id:p.id,name:p.name,gender:p.gender?'男':'女',birth:`${day} ${pad(c[3])}:${pad(c[4])}:${pad(c[5])}`,place:p.place||'',lon:p.lon};
  if(dst) info.dst=true;
  if(p.source) info.source=p.source;
  if(p.notes) info.notes=p.notes;
  return info;
}
