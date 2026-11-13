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
   这一页查下面 55 个，名单和查法照排盘软件问真八字的《神煞大全》，出处和各书的异文见 docs/取法约定.md。
   口诀和 tools/shensha.py 逐条对应，两份实现的结果由 tests/check_page.js 对照 data/shensha_check.json：
   原局四柱在全部 518400 种组合上逐柱对照；外来的一柱（大运、流年、流月、流日）在年柱、月支、日柱和它自己的 2592000 种组合上对照。
   名字在这个列表里的下标，就是它在对照掩码里的二进制位，也是一柱里几个神煞的显示顺序。不要调整顺序。 */
const SS_NAMES=['天乙贵人','天德贵人','月德贵人','天德合','月德合','天赦日','禄神','驿马','太极贵人','将星','学堂','词馆','国印贵人','三奇贵人','文昌贵人','华盖','天医','金舆','空亡',
  '灾煞','劫煞','亡神','羊刃','飞刃','血刃','流霞','四废日','天罗地网','桃花','孤辰','寡宿','阴差阳错','魁罡','孤鸾煞','红鸾','天喜','勾绞煞','红艳煞','十恶大败','元辰','金神','天转','地转',
  '丧门','吊客','披麻','十灵日','六秀日','八专','九丑','童子煞','天厨贵人','福星贵人','德秀贵人','拱禄'];
const SS_TIANYI={甲:'丑未',戊:'丑未',庚:'丑未',乙:'子申',己:'子申',丙:'亥酉',丁:'亥酉',壬:'卯巳',癸:'卯巳',辛:'午寅'};
const SS_TAIJI={甲:'子午',乙:'子午',丙:'卯酉',丁:'卯酉',戊:'辰戌丑未',己:'辰戌丑未',庚:'寅亥',辛:'寅亥',壬:'巳申',癸:'巳申'};
const SS_FUXING={甲:'寅子',丙:'寅子',乙:'丑卯',癸:'丑卯',丁:'亥',戊:'申',己:'未',庚:'午',辛:'巳',壬:'辰'};
// 下面几行的下标是天干的序号
const SS_WENCHANG='巳午申酉申酉亥子寅卯';       // 辛见子是现在通行的；《星学大成》作辛见戌
const SS_GUOYIN='戌亥丑寅丑寅辰巳未申';         // 禄前九位
const SS_TIANCHU='巳午巳午申酉亥子寅卯';        // 食神的禄
const SS_LU='寅卯巳午巳午申酉亥子';             // 禄，就是临官那一支
const SS_JINYU='辰巳未申未申戌亥丑寅';          // 禄前二辰
const SS_YANGREN='卯寅午巳午巳酉申子亥';        // 阴干的取法各派不同
const SS_LIUXIA='酉戌未申巳午辰卯亥寅';
const SS_HONGYAN='午午寅未辰辰戌酉子申';
const SS_GRP=['申子辰','亥卯未','寅午戌','巳酉丑']; // 四个三合局；下面几行的下标是局的序号
const SS_YIMA='寅巳申亥', SS_HUAGAI='辰未戌丑', SS_JIESHA='巳申亥寅', SS_WANGSHEN='亥寅巳申';
const SS_JIANGXING='子卯午酉', SS_TAOHUA='酉子卯午', SS_ZAISHA='午酉子卯';
const SS_DEXIU=['壬癸戊己丙辛甲','甲乙丁壬','丙丁戊癸','庚辛乙'];
const SS_YUEDEHE='丁己辛乙';
const SS_TIANDEHE={寅:'壬',卯:'巳',辰:'丁',巳:'丙',午:'寅',未:'己',申:'戊',酉:'亥',戌:'辛',亥:'庚',子:'申',丑:'乙'};
const SS_XUEREN={寅:'丑',卯:'未',辰:'寅',巳:'申',午:'卯',未:'酉',申:'辰',酉:'戌',戌:'巳',亥:'亥',子:'午',丑:'子'};
const SS_FANG=['亥子丑','寅卯辰','巳午未','申酉戌'];  // 四个三会方；下面一行的下标是方的序号
const SS_GUCHEN='寅巳申亥', SS_GUASU='戌丑辰未';
// 只看日柱（或日柱、时柱）自己的
const SS_GULUAN=['甲寅','乙巳','丙午','丁巳','戊午','戊申','辛亥','壬子'];
const SS_KUIGANG=['壬辰','庚戌','戊戌','庚辰'];
const SS_SHIE=['甲辰','乙巳','庚辰','辛巳','丙申','戊戌','丁亥','己丑','壬申','癸亥'];
const SS_CHACUO=['丙子','丁丑','戊寅','辛卯','壬辰','癸巳','丙午','丁未','戊申','辛酉','壬戌','癸亥'];
const SS_JINSHEN=['乙丑','己巳','癸酉'];
const SS_SHILING=['甲辰','乙亥','丙辰','丁酉','戊午','庚戌','庚寅','辛亥','壬寅','癸未'];
const SS_LIUXIU=['丙午','丁未','戊子','戊午','己丑','己未'];
const SS_BAZHUAN=['甲寅','乙卯','丁未','戊戌','己未','庚申','辛酉','癸丑'];
const SS_JIUCHOU=['丁酉','戊子','戊午','己卯','己酉','辛卯','辛酉','壬子','壬午'];
// 按季节：下标 0 到 3 是春夏秋冬，对应寅卯辰、巳午未、申酉戌、亥子丑月
const SS_SEASON=['寅卯辰','巳午未','申酉戌','亥子丑'];
const SS_SIFEI=[['庚申','辛酉'],['壬子','癸亥'],['甲寅','乙卯'],['丙午','丁巳']];
const SS_TIANSHE=['戊寅','甲午','戊申','甲子'], SS_TIANZHUAN=['乙卯','丙午','辛酉','壬子'], SS_DIZHUAN=['辛卯','戊午','癸酉','丙子'];
const SS_SANQI=['甲戊庚','乙丙丁','壬癸辛'];                   // 年月日或月日时三个天干，照这个顺序紧挨着
const SS_GONGLU=['癸亥癸丑','癸丑癸亥','丁巳丁未','己未己巳','戊辰戊午'];   // 日柱加时柱
// 按年柱纳音的五行。学堂是长生位，词馆是临官位，土跟着水
const SS_XUETANG={金:'巳',木:'亥',水:'申',土:'申',火:'寅'}, SS_CIGUAN={金:'申',木:'寅',水:'亥',土:'亥',火:'巳'};
const SS_TONGZI={金:'午卯',木:'午卯',水:'酉戌',火:'酉戌',土:'辰巳'};
const ssGrp=z=>SS_GRP.findIndex(s=>s.includes(z));
const ssFang=z=>SS_FANG.findIndex(s=>s.includes(z));
const ssSeason=mz=>SS_SEASON.findIndex(s=>s.includes(mz));
const tianDe=mz=>{const h=SS_TIANDEHE[mz];return G.includes(h)?gHe(h):zHe(h);};   // 天德 = 和天德合相合的那个字
const yueDe=mz=>gHe(SS_YUEDEHE[ssGrp(mz)]);
const hongLuan=yz=>Z[(15-Z.indexOf(yz))%12];                                       // 子年在卯，往回数

/* 一柱上的神煞。p 是原局 [年柱, 月柱, 日柱, 时柱]，nayin 是 {干支: 纳音名}，male 为真是男命（只有元辰用到）。
   i 是这一柱的位置：0 到 3 是年、月、日、时。i 为 -1 表示外来的一柱（大运、流年、流月、流日），gz 是它的干支，lab 是它的名字；
   外来的一柱拿去对原局的年柱、月支、日柱查，只看日柱或时柱自己的那几条不适用。
   返回 [{n: 名字, why: 它为什么落在这一柱}, …]，按 SS_NAMES 的顺序排。 */
function ssOne(p,nayin,male,i,gz,lab){
  const K='年月日时', ext=i<0, out=[];
  const gs=p.map(x=>x[0]), zs=p.map(x=>x[1]);
  const yg=gs[0], yz=zs[0], mz=zs[1], dg=gs[2], dz=zs[2];
  const g=ext?gz[0]:gs[i], z=ext?gz[1]:zs[i];
  const atZ=ext?lab+'的地支':K[i]+'支', atG=ext?lab+'的天干':K[i]+'干', pan=ext?'原局里':'盘里';
  const add=(n,why)=>{const it=out.find(o=>o.n===n); if(it){ if(!it.why.includes(why)) it.why+=why; } else out.push({n,why});};
  const kong=(l,q)=>{const xk=xunkong(q[0],q[1]);return `${l}柱${q}在甲${Z[xunHead(q[0],q[1])]}旬，剩下${xk[0]}、${xk[1]}。${atZ}是${z}。`;};
  const mg=ssGrp(mz), td=tianDe(mz), yd=yueDe(mz), tdh=SS_TIANDEHE[mz], ydh=SS_YUEDEHE[mg], si=ssSeason(mz), S='春夏秋冬'[si];
  const ny=nayin[p[0]], nel=ny[ny.length-1];
  // 用年干、日干查地支
  [['年',yg,0],['日',dg,2]].forEach(([l,s,j])=>{
    const k=G.indexOf(s), say=`${l}干${s}见${z}，落在${atZ}${j===i?'，就是它自己坐着的那一支':''}。`;
    if(SS_TIANYI[s].includes(z)) add('天乙贵人',say);
    if(SS_TAIJI[s].includes(z)) add('太极贵人',say);
    if(SS_WENCHANG[k]===z) add('文昌贵人',say);
    if(SS_GUOYIN[k]===z) add('国印贵人',say);
    if(SS_FUXING[s].includes(z)) add('福星贵人',say);
    if(SS_TIANCHU[k]===z) add('天厨贵人',say);
    if(SS_JINYU[k]===z) add('金舆',say);
  });
  // 只用日干查地支
  const di=G.indexOf(dg), yr=SS_YANGREN[di], fr=Z[(Z.indexOf(yr)+6)%12];
  if(z===SS_LU[di]) add('禄神',`日干${dg}的禄在${z}，落在${atZ}。它和星运一行的临官是同一件事。`);
  if(z===yr) add('羊刃',`日干${dg}见${z}，落在${atZ}。它和星运一行的帝旺是同一件事。`);
  if(z===fr) add('飞刃',`日干${dg}的羊刃在${yr}，${yr}的对面是${fr}，落在${atZ}。`+(!ext&&zs.includes(yr)?`它其实就是原局的${Z_CHONG[yr+fr][0]}相冲换了个名字。`:''));
  if(z===SS_LIUXIA[di]) add('流霞',`日干${dg}见${z}，落在${atZ}。`);
  if(z===SS_HONGYAN[di]) add('红艳煞',`日干${dg}见${z}，落在${atZ}。`);
  // 用年支、日支查别的地支
  [['年',yz,0],['日',dz,2]].forEach(([l,s,j])=>{
    if(i===j) return;
    const gi=ssGrp(s), say=`${l}支${s}见${z}，落在${atZ}。`;
    if(z===SS_YIMA[gi]) add('驿马',say);
    if(z===SS_HUAGAI[gi]) add('华盖',say);
    if(z===SS_JIANGXING[gi]) add('将星',say);
    if(z===SS_TAOHUA[gi]) add('桃花',say);
    if(z===SS_JIESHA[gi]) add('劫煞',say);
    if(z===SS_WANGSHEN[gi]) add('亡神',say);
    if(s+z==='戌亥'||s+z==='亥戌') add('天罗地网',`${l}支${s}见${z}，戌和亥凑在一起叫天罗，落在${atZ}。`);
    if(s+z==='辰巳'||s+z==='巳辰') add('天罗地网',`${l}支${s}见${z}，辰和巳凑在一起叫地网，落在${atZ}。`);
  });
  // 只用年支查别的地支
  if(i!==0){
    const yi=Z.indexOf(yz), f=ssFang(yz), hl=hongLuan(yz), yang=yi%2===0;
    if(z===SS_ZAISHA[ssGrp(yz)]) add('灾煞',`年支${yz}见${z}，落在${atZ}。`);
    if(z===SS_GUCHEN[f]) add('孤辰',`年支${yz}在${SS_FANG[f]}这一方，往前出了这一方的头一位是${z}，落在${atZ}。`);
    if(z===SS_GUASU[f]) add('寡宿',`年支${yz}在${SS_FANG[f]}这一方，往后退出这一方的头一位是${z}，落在${atZ}。`);
    if(z===hl) add('红鸾',`年支${yz}的红鸾在${z}，落在${atZ}。`);
    if(z===Z[(Z.indexOf(hl)+6)%12]) add('天喜',`年支${yz}的红鸾在${hl}，对面的${z}是天喜，落在${atZ}。`);
    if(z===Z[(yi+3)%12]) add('勾绞煞',`年支${yz}往下数三位是${z}，落在${atZ}。`);
    if(z===Z[(yi+(male===yang?7:5))%12]) add('元辰',`${yang?'阳':'阴'}年出生的${male?'男':'女'}性，取年支${yz}对冲的${Z[(yi+6)%12]}${male===yang?'往前':'往后'}一位，是${z}，落在${atZ}。`);
    if(z===Z[(yi+2)%12]) add('丧门',`年支${yz}往下数：${Z[(yi+1)%12]}、${z}。${atZ}是${z}。`);
    if(z===Z[(yi+10)%12]) add('吊客',`年支${yz}往回数：${Z[(yi+11)%12]}、${z}。${atZ}是${z}。`);
    if(z===Z[(yi+9)%12]) add('披麻',`年支${yz}往回数：${Z[(yi+11)%12]}、${Z[(yi+10)%12]}、${z}。${atZ}是${z}。`);
    if(z===SS_XUETANG[nel]) add('学堂',`年柱纳音${ny}属${nel}，${nel==='土'?'土跟着水取，长生':nel+'的长生'}在${z}，落在${atZ}。`);
    if(z===SS_CIGUAN[nel]) add('词馆',`年柱纳音${ny}属${nel}，${nel==='土'?'土跟着水取，临官':nel+'的临官'}在${z}，落在${atZ}。`);
  }
  // 用月支查
  if(SS_DEXIU[mg].includes(g)) add('德秀贵人',`生在${mz}月，${atG}${g}在${SS_GRP[mg]}月的德秀表里。`);
  if(g===td||z===td) add('天德贵人',`${mz}月的天德是${td}，${g===td?atG:atZ}正是${td}。`);
  if(g===yd) add('月德贵人',`${SS_GRP[mg]}月的月德是${yd}，${atG}正是${yd}。`);
  if(g===tdh||z===tdh){
    const has=gs.includes(td)||zs.includes(td);
    add('天德合',`${mz}月的天德是${td}，和${td}相合的是${tdh}。${g===tdh?atG:atZ}是${tdh}。${pan}${has?'也有'+td+'，天德本身也在':'没有'+td+'，所以没有天德本身'}。`);
  }
  if(g===ydh) add('月德合',`${SS_GRP[mg]}月的月德是${yd}，和${yd}相合的是${ydh}。${atG}是${ydh}。`);
  if(i!==1&&z===Z[(Z.indexOf(mz)+11)%12]) add('天医',`生在${mz}月，从${mz}往回数一位是${z}，落在${atZ}。`);
  if(i!==1&&z===SS_XUEREN[mz]) add('血刃',`生在${mz}月，口诀要看${z}，落在${atZ}。`);
  // 空亡
  if(i!==2&&xunkong(dg,dz).includes(z)) add('空亡',kong('日',p[2]));
  if(i!==0&&xunkong(yg,yz).includes(z)) add('空亡',kong('年',p[0]));
  // 只看日柱自己的
  if(i===2){
    const d=p[2], day=`日柱是${d}。`, sea=`生在${mz}月，算${S}天，日柱是${d}。`;
    if(SS_KUIGANG.includes(d)) add('魁罡',day);
    if(SS_GULUAN.includes(d)) add('孤鸾煞',day);
    if(SS_CHACUO.includes(d)) add('阴差阳错',day);
    if(SS_SHILING.includes(d)) add('十灵日',day);
    if(SS_LIUXIU.includes(d)) add('六秀日',day);
    if(SS_BAZHUAN.includes(d)) add('八专',day);
    if(SS_JIUCHOU.includes(d)) add('九丑',day);
    if(SS_SHIE.includes(d)){const xk=xunkong(dg,dz);add('十恶大败',`日柱是${d}。${dg}的禄在${SS_LU[di]}，${d}所在的甲${Z[xunHead(dg,dz)]}旬里，${xk[0]}、${xk[1]}是空亡，禄正好落在里面。`);}
    if(d===SS_TIANSHE[si]) add('天赦日',sea);
    if(d===SS_TIANZHUAN[si]) add('天转',sea+'天干、地支都是当令的五行。');
    if(d===SS_DIZHUAN[si]) add('地转',sea+'地支和它的纳音都是当令的五行。');
    if(SS_SIFEI[si].includes(d)){
      const SE=EL[[0,1,3,4][si]], E=EL[gEl(dg)];
      add('四废日',`这条口诀按季节算，${mz}月算${S}天。日柱${d}干支都属${E}，`+(si<2?`${E}本该克${SE}，可是${S}天${SE}正当令，克不动，反而受困。`:`${S}天${SE}当令，正克着${E}。`)+'它说的就是日柱的五行不得月令。');
    }
  }
  // 日柱和时柱
  if(i===2||i===3){
    if(SS_JINSHEN.includes(p[i])) add('金神',`${K[i]}柱是${p[i]}。`);
    if(SS_GONGLU.includes(p[2]+p[3])) add('拱禄',`日柱${p[2]}、时柱${p[3]}，两个地支中间隔着的那一支是日干${dg}的禄${SS_LU[di]}，叫拱禄。`);
    const want=si%2===0?'寅子':'卯未辰';      // 童子煞：春天和秋天看寅、子，夏天和冬天看卯、未、辰
    if(want.includes(z)) add('童子煞',`生在${mz}月，算${S}天，口诀要看${want.split('').join('、')}。${atZ}是${z}。`);
    if(SS_TONGZI[nel].includes(z)) add('童子煞',`年柱纳音${ny}属${nel}，口诀要看${SS_TONGZI[nel].split('').join('、')}。${atZ}是${z}。`);
  }
  // 三奇：年月日或月日时三个天干照顺序紧挨着
  if(!ext) [0,1].forEach(a=>{const three=gs[a]+gs[a+1]+gs[a+2]; if(i>=a&&i<=a+2&&SS_SANQI.includes(three)) add('三奇贵人',`${K[a]}、${K[a+1]}、${K[a+2]}三柱的天干依次是${three.split('').join('、')}，紧挨着排在一起。`);});
  return out.sort((a,b)=>SS_NAMES.indexOf(a.n)-SS_NAMES.indexOf(b.n));
}
/* 原局四柱的神煞：四个数组，四柱各一个。male 为真是男命。 */
function shenshaOf(p,nayin,male){
  const out=[0,1,2,3].map(i=>ssOne(p,nayin,male,i));
  // 两条顺带的说明：同一个字兼着两个名目；年支和日支互为驿马
  const tdh=SS_TIANDEHE[p[1][1]];
  out.forEach((row,i)=>{const a=row.find(o=>o.n==='天德合'), b=row.find(o=>o.n==='月德合'); if(a&&b&&p[i][0]===tdh) b.why+='它同时是天德合和月德合。';});
  const m0=out[0].find(o=>o.n==='驿马'), m2=out[2].find(o=>o.n==='驿马');
  if(m0&&m2&&m0.why.includes('日支')&&m2.why.includes('年支')) m2.why+=`年支和日支互为驿马，这也是${Z_CHONG[p[0][1]+p[2][1]][0]}相冲的另一种说法。`;
  return out;
}
/* 外来的一柱（大运、流年、流月、流日）的神煞。gz 是它的干支，lab 是它的名字。 */
function shenshaFor(p,nayin,male,gz,lab){return ssOne(p,nayin,male,-1,gz,lab);}
/* 把一柱的神煞压成两个 32 位的数，每个神煞占一位：[前 32 个, 其余]。只用于和 Python 那份实现对照。 */
function shenshaMask(row){let lo=0,hi=0;row.forEach(o=>{const k=SS_NAMES.indexOf(o.n);if(k<32) lo|=1<<k; else hi|=1<<(k-32);});return [lo>>>0,hi>>>0];}
