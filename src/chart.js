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
/* 出生信息是 {id, name, gender: '男'或'女', birth: 'YYYY-MM-DD HH:MM', place, lon, dst, source, notes}，
   和 people/*.json 的格式相同。birth 是北京时间的钟表时间。 */
function parseBirth(text){
  const m=/^\s*(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(String(text||''));
  if(!m) return null;
  const a=m.slice(1).map(x=>x===undefined?0:Number(x)), b=fromSec(toSec(...a));
  return a.every((v,i)=>v===b[i])?a:null;            // 2 月 30 日、25 点这类不存在的时刻会对不上
}
/* 出生信息有没有问题。没有问题返回空字符串，有问题返回一句说明。 */
function checkInfo(info){
  const a=parseBirth(info&&info.birth);
  if(!a) return '出生日期和时间没有填全，或者不是一个存在的时刻。';
  if(a[0]<BIRTH_MIN||a[0]>BIRTH_MAX) return `只支持 ${BIRTH_MIN} 到 ${BIRTH_MAX} 年出生。`;
  if(info.gender!=='男'&&info.gender!=='女') return '性别要填男或女。';
  if(typeof info.lon!=='number'||!isFinite(info.lon)||info.lon<-180||info.lon>180) return '经度要填一个数，东经为正。';
  return '';
}
/* 排盘。返回的对象和 tools/gen_data.py 写进 people.json 的每个人字段相同。 */
function chartOf(info){
  const bad=checkInfo(info); if(bad) throw new Error(bad);
  const c=toSec(...parseBirth(info.birth))-(info.dst?3600:0), clock=fromSec(c);
  const dlonSec=roundHalfUp((info.lon-120)*240);
  const eotSec=roundHalfUp(equationOfTime(2451545.0+(c-8*3600-toSec(2000,1,1,12))/86400));   // 钟表时间减 8 小时，当作世界时
  const ts=c+dlonSec+eotSec, tst=fromSec(ts);
  const A=pillarsAt(tst), B=pillarsAt(clock);            // 四柱按真太阳时；另按钟表时间排一遍
  const [yp,mp,dp,hp]=A.p, yg=G.indexOf(yp[0]);
  const jieAt=i=>({name:JIE[i%12],at:fromSec(JIE_T[i])});
  // 胎元、命宫、身宫、胎息。月支和时支都换成「寅是 1、丑是 12」的序号来算
  const mzi=(Z.indexOf(mp[1])+10)%12+1, tzi=(Z.indexOf(hp[1])+10)%12+1;
  const pick=off=>{let g=(yg+1)*2+off;while(g>10) g-=10;return G[g-1]+Z[(off+1)%12];};
  const ming=mzi+tzi>=14?26-mzi-tzi:14-mzi-tzi, shen=mzi+Z.indexOf(hp[1])+1;
  // 大运按钟表时间：阳年男、阴年女顺排，数到下一个节；阴年男、阳年女逆排，数到上一个节
  const man=info.gender==='男', forward=(G.indexOf(B.p[0][0])%2===0)===man, yj=forward?B.i+1:B.i;
  const gapMin=forward?Math.floor(JIE_T[yj]/60)-Math.floor(c/60):Math.floor(c/60)-Math.floor(JIE_T[yj]/60);
  let rest=gapMin; const y=Math.floor(rest/4320); rest-=y*4320;
  const m=Math.floor(rest/360); rest-=m*360;
  const d=Math.floor(rest/12); rest-=d*12;
  const h=rest*2, start=addHours(addDays(addMonths(addYears(clock,y),m),d),h);
  const mi=gz60(B.p[1][0],B.p[1][1]), dayun=[];
  for(let k=1;k<=8;k++){const y0=start[0]+(k-1)*10, a0=y0-clock[0]+1;dayun.push({gz:JZ(((mi+(forward?k:-k))%60+60)%60),y0,y1:y0+9,a0,a1:a0+9});}
  const p={id:info.id,name:info.name,gender:man?1:0,clock};
  if(info.dst) p.dst=true;
  if(info.source) p.source=info.source;
  Object.assign(p,{place:info.place||'',lon:info.lon,dlonSec,eotSec,tst,
    lunar:lunarOf(tst[0],tst[1],tst[2]),xingzuo:xingzuoOf(tst[1],tst[2]),
    pillars:A.p,pillarsClock:B.p,
    prevJie:Object.assign(jieAt(A.i),{min:Math.floor((ts-JIE_T[A.i])/60)}),
    nextJie:Object.assign(jieAt(A.i+1),{min:Math.floor((JIE_T[A.i+1]-ts)/60)}),
    taiyuan:G[(G.indexOf(mp[0])+1)%10]+Z[(Z.indexOf(mp[1])+3)%12],
    minggong:pick(ming),shengong:pick(shen>12?shen-12:shen),
    taixi:gHe(dp[0])+Z[(13-Z.indexOf(dp[1]))%12],
    yun:{forward,y,m,d,h,start:start.slice(0,3),jie:JIE[yj%12],gapMin},
    dayun});
  if(info.notes) p.notes=info.notes;
  return p;
}
/* 反过来：从一个排好的人取回出生信息。clock 已经扣过夏令时，所以这里不再标 dst。 */
function infoFrom(p){
  const c=p.clock, pad=n=>String(n).padStart(2,'0');
  const info={id:p.id,name:p.name,gender:p.gender?'男':'女',birth:`${c[0]}-${pad(c[1])}-${pad(c[2])} ${pad(c[3])}:${pad(c[4])}:${pad(c[5])}`,place:p.place||'',lon:p.lon};
  if(p.source) info.source=p.source;
  if(p.notes) info.notes=p.notes;
  return info;
}
