/* 干支换算、干支关系、神煞口诀。
   这个文件只做计算：不碰页面，也不含任何一个人的数据。构建时原样拼进页面。 */
const G='甲乙丙丁戊己庚辛壬癸', Z='子丑寅卯辰巳午未申酉戌亥', EL='木火土金水';
const ELC=['wood','fire','earth','metal','water'];
const Z_EL=[4,2,0,0,2,1,1,2,3,3,2,4];
const HID={子:'癸',丑:'己癸辛',寅:'甲丙戊',卯:'乙',辰:'戊乙癸',巳:'丙庚戊',午:'丁己',未:'己丁乙',申:'庚壬戊',酉:'辛',戌:'戊辛丁',亥:'壬甲'};
const GOD_SAME=['比肩','食神','偏财','七杀','偏印'], GOD_DIFF=['劫财','伤官','正财','正官','正印'];
const STAGES=['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'];
const CS_START={甲:11,丙:2,戊:2,庚:5,壬:8,乙:6,丁:9,己:9,辛:0,癸:3};
const JIE=['立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪','小寒'];
const ANIMALS='鼠牛虎兔龙蛇马羊猴鸡狗猪';

const gEl=g=>G.indexOf(g)>>1, zEl=z=>Z_EL[Z.indexOf(z)];
const gCls=g=>ELC[gEl(g)], zCls=z=>ELC[zEl(z)];
const isYin=g=>G.indexOf(g)%2===1;
const yy=g=>isYin(g)?'阴':'阳';
/* 天干 g 相对于日主 dm 的五行关系：0 同我，1 我生，2 我克，3 克我，4 生我 */
function relOf(dm,g){return (gEl(g)-gEl(dm)+5)%5;}
function godOf(dm,g){return (isYin(g)===isYin(dm)?GOD_SAME:GOD_DIFF)[relOf(dm,g)];}
/* 十二长生：阳干顺行，阴干逆行，土跟着火走 */
function stage(g,z){const zi=Z.indexOf(z),s=CS_START[g];return STAGES[isYin(g)?(s-zi+12)%12:(zi-s+12)%12];}
function xunHead(g,z){return (Z.indexOf(z)-G.indexOf(g)+12)%12;}
function xunkong(g,z){const head=xunHead(g,z);return Z[(head+10)%12]+Z[(head+11)%12];}
function yearGZ(y){const i=((y-4)%60+60)%60;return G[i%10]+Z[i%12];}
/* m 从 0 起，0 是立春开始的寅月，11 是次年一月小寒开始的丑月 */
function monthGZ(y,m){const ys=G.indexOf(yearGZ(y)[0]);return G[((ys%5)*2+2+m)%10]+Z[(2+m)%12];}
const DAY=864e5;
function dayGZ(t){const i=((54+Math.round((t-Date.UTC(2000,0,1))/DAY))%60+60)%60;return G[i%10]+Z[i%12];}
function gz60(g,z){for(let i=0;i<60;i++) if(G[i%10]===g&&Z[i%12]===z) return i; return -1;}

/* ---------- 干支关系 ---------- */
function mk(list){const m={};list.forEach(([p,n])=>{m[p]=[p,n];m[p[1]+p[0]]=[p,n];});return m;}
const G_HE=mk([['甲己','化土'],['乙庚','化金'],['丙辛','化水'],['丁壬','化木'],['戊癸','化火']]);
const G_CHONG=mk([['甲庚'],['乙辛'],['丙壬'],['丁癸']]);
const G_KE=mk([['甲戊'],['乙己'],['丙庚'],['丁辛'],['戊壬'],['己癸']]);
const Z_HE=mk([['子丑','化土'],['寅亥','化木'],['卯戌','化火'],['辰酉','化金'],['巳申','化水'],['午未','化土']]);
const Z_AN=mk([['寅丑'],['午亥'],['卯申'],['子巳']]);
const Z_CHONG=mk([['子午'],['丑未'],['寅申'],['卯酉'],['辰戌'],['巳亥']]);
const Z_XING=mk([['寅巳'],['巳申'],['寅申'],['丑戌'],['戌未'],['丑未'],['子卯']]);
const Z_HAI=mk([['子未'],['丑午'],['寅巳'],['卯辰'],['申亥'],['酉戌']]);
const Z_PO=mk([['子酉'],['丑辰'],['寅亥'],['卯午'],['巳申'],['未戌']]);
const SANHE=[['申','子','辰','水局'],['亥','卯','未','木局'],['寅','午','戌','火局'],['巳','酉','丑','金局']];
const SANHUI=[['寅','卯','辰','东方木'],['巳','午','未','南方火'],['申','酉','戌','西方金'],['亥','子','丑','北方水']];
const SANXING=[['寅','巳','申'],['丑','戌','未']];
const HE_TYPES=['五合','六合','三合','半合','拱合','三会','拱会','暗合'];
const REL_TYPES=['五合','相冲','相克','六合','三合','半合','拱合','三会','拱会','暗合','相刑','三刑','自刑','相害','相破'];
const gHe=g=>G[(G.indexOf(g)+5)%10];                                   // 天干五合的另一半
const zHe=z=>Object.values(Z_HE).find(v=>v[0].includes(z))[0].replace(z,'');   // 地支六合的另一半

/* cols 是若干柱：{k: 名称, g: 天干, z: 地支, layer: 来源}。layer：原局 0（可省略），大运 1，流年 2，流月 3，流日 4。
   返回每一条关系：类型 t、涉及的字 c、附注 n、最高的层 top、它落在哪些柱上 where。 */
function relations(cols){
  const out=[];
  const add=(grp,kind,t,c,n,ps)=>{
    const top=Math.max(...ps.map(p=>p.layer||0)), key=[grp,top,t,c].join('|');
    let it=out.find(o=>o.key===key);
    if(!it){it={key,grp,top,t,c,n:n||'',where:[]};out.push(it);}
    const lab=p=>p.layer?p.k:p.k+kind;
    const ws=top===0?[ps.map(lab).join('–')]:ps.filter(p=>(p.layer||0)<top).map(lab);
    ws.forEach(w=>{if(!it.where.includes(w)) it.where.push(w);});
  };
  const zs=cols.map(c=>c.z), has=z=>zs.includes(z);
  const full=tri=>tri.slice(0,3).every(has);
  SANHE.forEach(t=>{if(full(t)) add('z','支','三合',t.slice(0,3).join(''),t[3],cols.filter(c=>t.slice(0,3).includes(c.z)));});
  SANHUI.forEach(t=>{if(full(t)) add('z','支','三会',t.slice(0,3).join(''),t[3],cols.filter(c=>t.slice(0,3).includes(c.z)));});
  SANXING.forEach(t=>{if(full(t)) add('z','支','三刑',t.join(''),'',cols.filter(c=>t.includes(c.z)));});
  for(let i=0;i<cols.length;i++) for(let j=i+1;j<cols.length;j++){
    const A=cols[i],B=cols[j],ps=[A,B];
    const gk=A.g+B.g;
    if(G_HE[gk]) add('g','干','五合',G_HE[gk][0],G_HE[gk][1],ps);
    if(G_CHONG[gk]) add('g','干','相冲',G_CHONG[gk][0],'',ps);
    if(G_KE[gk]) add('g','干','相克',G_KE[gk][0],'',ps);
    const a=A.z,b=B.z,zk=a+b;
    if(a===b){ if('辰午酉亥'.includes(a)) add('z','支','自刑',a+a,'',ps); continue; }
    if(Z_HE[zk]) add('z','支','六合',Z_HE[zk][0],Z_HE[zk][1],ps);
    SANHE.forEach(t=>{
      const tri=t.slice(0,3);
      if(tri.includes(a)&&tri.includes(b)&&!full(t)){
        const o=tri.filter(x=>x===a||x===b).join('');
        if(a===t[1]||b===t[1]) add('z','支','半合',o,t[3],ps);
        else add('z','支','拱合',o,`缺${t[1]}的${t[3]}`,ps);
      }
    });
    SANHUI.forEach(t=>{
      if(((a===t[0]&&b===t[2])||(a===t[2]&&b===t[0]))&&!has(t[1])) add('z','支','拱会',t[0]+t[2],`缺${t[1]}的${t[3]}`,ps);
    });
    if(Z_AN[zk]) add('z','支','暗合',Z_AN[zk][0],'',ps);
    if(Z_CHONG[zk]) add('z','支','相冲',Z_CHONG[zk][0],'',ps);
    if(Z_XING[zk]&&!SANXING.some(t=>t.includes(a)&&t.includes(b)&&t.every(has))) add('z','支','相刑',Z_XING[zk][0],'',ps);
    if(Z_HAI[zk]) add('z','支','相害',Z_HAI[zk][0],'',ps);
    if(Z_PO[zk]) add('z','支','相破',Z_PO[zk][0],'',ps);
  }
  return out;
}

/* ---------- 神煞 ----------
   这一页只查下面 20 个。口诀和 tools/shensha.py 逐条对应，
   两份实现在全部 518400 种四柱组合上的结果由 tests/check_page.js 对照 data/shensha_check.json。 */
const SS_NAMES=['天乙贵人','国印贵人','福星贵人','德秀贵人','天德合','月德合','金舆','词馆','驿马','华盖','羊刃','飞刃','空亡','孤鸾煞','四废日','流霞','劫煞','亡神','丧门','披麻'];
const SS_TIANYI={甲:'丑未',戊:'丑未',庚:'丑未',乙:'子申',己:'子申',丙:'亥酉',丁:'亥酉',壬:'卯巳',癸:'卯巳',辛:'午寅'};
const SS_GUOYIN='戌亥丑寅丑寅辰巳未申';          // 下标是天干的序号，下同
const SS_FUXING={甲:'寅子',丙:'寅子',乙:'丑卯',癸:'丑卯',丁:'亥',戊:'申',己:'未',庚:'午',辛:'巳',壬:'辰'};
const SS_JINYU='辰巳未申未申戌亥丑寅';
const SS_YANGREN='卯寅午巳午巳酉申子亥';         // 阴干的取法各派不同
const SS_LIUXIA='酉戌未申巳午辰卯亥寅';
const SS_GRP=['申子辰','亥卯未','寅午戌','巳酉丑']; // 四个三合局；下面四行的下标是局的序号
const SS_YIMA='寅巳申亥', SS_HUAGAI='辰未戌丑', SS_JIESHA='巳申亥寅', SS_WANGSHEN='亥寅巳申';
const SS_DEXIU=['壬癸戊己丙辛甲','甲乙丁壬','丙丁戊癸','庚辛乙'];
const SS_YUEDEHE='丁己辛乙';
const SS_TIANDEHE={寅:'壬',卯:'巳',辰:'丁',巳:'丙',午:'寅',未:'己',申:'戊',酉:'亥',戌:'辛',亥:'庚',子:'申',丑:'乙'};
const SS_GULUAN=['乙巳','丁巳','辛亥','戊申','甲寅','壬子'];
const SS_SIFEI=[['寅卯辰','庚申','辛酉'],['巳午未','壬子','癸亥'],['申酉戌','甲寅','乙卯'],['亥子丑','丙午','丁巳']];
const SS_CIGUAN={火:'巳',金:'申',木:'寅',水:'亥',土:'巳'};   // 年柱纳音五行的临官位，土跟着火
const ssGrp=z=>SS_GRP.findIndex(s=>s.includes(z));
const tianDe=mz=>{const h=SS_TIANDEHE[mz];return G.includes(h)?gHe(h):zHe(h);};   // 天德 = 和天德合相合的那个字
const yueDe=mz=>gHe(SS_YUEDEHE[ssGrp(mz)]);

/* p 是 [年柱, 月柱, 日柱, 时柱]，nayin 是 {干支: 纳音名}。
   返回四个数组（四柱各一个），每项是 {n: 名字, why: 它为什么落在这一柱}，按 SS_NAMES 的顺序排。 */
function shenshaOf(p,nayin){
  const K='年月日时', out=[[],[],[],[]];
  const gs=p.map(x=>x[0]), zs=p.map(x=>x[1]);
  const yg=gs[0], yz=zs[0], mz=zs[1], dg=gs[2], dz=zs[2];
  const add=(i,n,why)=>{const it=out[i].find(o=>o.n===n); if(it){ if(!it.why.includes(why)) it.why+=why; } else out[i].push({n,why});};
  const kong=(lab,gz,k,z)=>{const xk=xunkong(gz[0],gz[1]);return `${lab}柱${gz}在甲${Z[xunHead(gz[0],gz[1])]}旬，剩下${xk[0]}、${xk[1]}。${k}支是${z}。`;};
  const mg=ssGrp(mz), tdh=SS_TIANDEHE[mz], ydh=SS_YUEDEHE[mg];
  const yr=SS_YANGREN[G.indexOf(dg)], fr=Z[(Z.indexOf(yr)+6)%12];
  const ny=nayin[p[0]], nel=ny[ny.length-1];
  for(let i=0;i<4;i++){
    const z=zs[i], g=gs[i], k=K[i];
    [['年',yg,0],['日',dg,2]].forEach(([lab,s,j])=>{
      const say=`${lab}干${s}见${z}，落在${k}支${j===i?'，就是它自己坐着的那一支':''}。`;
      if(SS_TIANYI[s].includes(z)) add(i,'天乙贵人',say);
      if(SS_GUOYIN[G.indexOf(s)]===z) add(i,'国印贵人',say);
      if(SS_FUXING[s].includes(z)) add(i,'福星贵人',say);
      if(SS_JINYU[G.indexOf(s)]===z) add(i,'金舆',say);
    });
    [['年',yz,0],['日',dz,2]].forEach(([lab,s,j])=>{
      if(i===j) return;
      const gi=ssGrp(s), say=`${lab}支${s}见${z}，落在${k}支。`;
      if(z===SS_YIMA[gi]) add(i,'驿马',say);
      if(z===SS_HUAGAI[gi]) add(i,'华盖',say);
      if(z===SS_JIESHA[gi]) add(i,'劫煞',say);
      if(z===SS_WANGSHEN[gi]) add(i,'亡神',say);
    });
    if(SS_DEXIU[mg].includes(g)) add(i,'德秀贵人',`生在${mz}月，${k}干${g}在${SS_GRP[mg]}月的德秀表里。`);
    if(g===tdh||z===tdh){
      const td=tianDe(mz), has=gs.includes(td)||zs.includes(td);
      add(i,'天德合',`${mz}月的天德是${td}，和${td}相合的是${tdh}。${k}${g===tdh?'干':'支'}是${tdh}。盘里${has?'也有'+td+'，天德本身也在':'没有'+td+'，所以没有天德本身'}。`);
    }
    if(g===ydh) add(i,'月德合',`${SS_GRP[mg]}月的月德是${yueDe(mz)}，和${yueDe(mz)}相合的是${ydh}。${k}干是${ydh}。`);
    if(z===yr) add(i,'羊刃',`日干${dg}见${z}，落在${k}支。它和星运一行的帝旺是同一件事。`);
    if(z===fr) add(i,'飞刃',`日干${dg}的羊刃在${yr}，${yr}的对面是${fr}，落在${k}支。`+(zs.includes(yr)?`它其实就是原局的${Z_CHONG[yr+fr][0]}相冲换了个名字。`:''));
    if(z===SS_LIUXIA[G.indexOf(dg)]) add(i,'流霞',`日干${dg}见${z}，落在${k}支。`);
    if(i!==2&&xunkong(dg,dz).includes(z)) add(i,'空亡',kong('日',p[2],k,z));
    if(i!==0&&xunkong(yg,yz).includes(z)) add(i,'空亡',kong('年',p[0],k,z));
    if(i!==0&&z===Z[(Z.indexOf(yz)+2)%12]) add(i,'丧门',`年支${yz}往下数：${Z[(Z.indexOf(yz)+1)%12]}、${z}。${k}支是${z}。`);
    if(i!==0&&z===Z[(Z.indexOf(yz)+9)%12]) add(i,'披麻',`年支${yz}往回数：${Z[(Z.indexOf(yz)+11)%12]}、${Z[(Z.indexOf(yz)+10)%12]}、${z}。${k}支是${z}。`);
    if(i!==0&&z===SS_CIGUAN[nel]) add(i,'词馆',`年柱纳音${ny}属${nel}，${nel==='土'?'土跟着火取，临官':nel+'的临官'}在${z}，落在${k}支。`);
  }
  if(SS_GULUAN.includes(p[2])) add(2,'孤鸾煞',`日柱是${p[2]}。`);
  const sf=SS_SIFEI.find(r=>r[0].includes(mz)), si=SS_SIFEI.indexOf(sf);
  if(sf.slice(1).includes(p[2])){
    const S='春夏秋冬'[si], SE=EL[[0,1,3,4][si]], E=EL[gEl(dg)];
    add(2,'四废日',`这条口诀按季节算，${mz}月算${S}天。日柱${p[2]}干支都属${E}，`+(si<2?`${E}本该克${SE}，可是${S}天${SE}正当令，克不动，反而受困。`:`${S}天${SE}当令，正克着${E}。`)+'它说的就是日柱的五行不得月令。');
  }
  // 两条顺带的说明：同一个字兼着两个名目；年支和日支互为驿马
  out.forEach(row=>{const a=row.find(o=>o.n==='天德合'), b=row.find(o=>o.n==='月德合'); if(a&&b&&gs[out.indexOf(row)]===tdh) b.why+='它同时是天德合和月德合。';});
  const m0=out[0].find(o=>o.n==='驿马'), m2=out[2].find(o=>o.n==='驿马');
  if(m0&&m2&&m0.why.includes('日支')&&m2.why.includes('年支')) m2.why+=`年支和日支互为驿马，这也是${Z_CHONG[yz+dz][0]}相冲的另一种说法。`;
  out.forEach(row=>row.sort((a,b)=>SS_NAMES.indexOf(a.n)-SS_NAMES.indexOf(b.n)));
  return out;
}
/* 把一柱的神煞压成一个数，每个神煞占一位。只用于和 Python 那份实现对照。 */
function shenshaMask(row){return row.reduce((m,o)=>m|(1<<SS_NAMES.indexOf(o.n)),0);}
