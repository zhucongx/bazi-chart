#!/usr/bin/env python3
"""五十八个神煞的口诀。前五十五个的名单和查法照排盘软件问真八字的《神煞大全》；
最后三个（六厄、病符、隔角）问真没有，2026-11-16 用户要加，查法照典籍（《三命通会》卷三、《神峰通考》）。

页面的脚本里有一份同样的口诀（src/engine.js），这里是用来对照的 Python 版本：
- tools/gen_data.py 用它算出每个人四柱上的神煞，写进 expected.json；
- tools/shensha_freq.py 用它统计出现频率，并生成全空间对照文件 data/shensha_check.json。

两份是分开写的。页面那份大多直接写成表；这里能按规则推的就按规则推
（比如天厨是食神的禄、灾煞是将星的对冲、十恶大败是禄落在本旬空亡里的日子），
这样两份对得上，也就同时说明表没有抄错。

只用标准库。纳音表由调用的一方传进来。
各派的取法并不统一，这里是页面采用的那一种；出处和各书的异文见 docs/取法约定.md。
"""

G = '甲乙丙丁戊己庚辛壬癸'
Z = '子丑寅卯辰巳午未申酉戌亥'
JIA_ZI = [G[i % 10] + Z[i % 12] for i in range(60)]

# 名字在这个列表里的下标，就是它在 data/shensha_check.json 掩码里的二进制位。不要调整顺序。
NAMES = ['天乙贵人', '天德贵人', '月德贵人', '天德合', '月德合', '天赦日', '禄神', '驿马', '太极贵人', '将星', '学堂', '词馆',
         '国印贵人', '三奇贵人', '文昌贵人', '华盖', '天医', '金舆', '空亡', '灾煞', '劫煞', '亡神', '羊刃', '飞刃', '血刃', '流霞',
         '四废日', '天罗地网', '桃花', '孤辰', '寡宿', '阴差阳错', '魁罡', '孤鸾煞', '红鸾', '天喜', '勾绞煞', '红艳煞', '十恶大败',
         '元辰', '金神', '天转', '地转', '丧门', '吊客', '披麻', '十灵日', '六秀日', '八专', '九丑', '童子煞', '天厨贵人',
         '福星贵人', '德秀贵人', '拱禄', '六厄', '病符', '隔角']
assert len(NAMES) == len(set(NAMES)) == 58


def step(z, n):
    """地支 z 往前数 n 位（n 为负就是往回数）。"""
    return Z[(Z.index(z) + n) % 12]


def xunkong(gz):
    head = (Z.index(gz[1]) - G.index(gz[0])) % 12
    return Z[(head + 10) % 12] + Z[(head + 11) % 12]


# ---- 用天干查地支 ----
TIANYI = {'甲': '丑未', '戊': '丑未', '庚': '丑未', '乙': '子申', '己': '子申', '丙': '亥酉',
          '丁': '亥酉', '壬': '卯巳', '癸': '卯巳', '辛': '午寅'}
TAIJI = {'甲': '子午', '乙': '子午', '丙': '卯酉', '丁': '卯酉', '戊': '辰戌丑未', '己': '辰戌丑未',
         '庚': '寅亥', '辛': '寅亥', '壬': '巳申', '癸': '巳申'}
FUXING = {'甲': '寅子', '丙': '寅子', '乙': '丑卯', '癸': '丑卯', '丁': '亥', '戊': '申',
          '己': '未', '庚': '午', '辛': '巳', '壬': '辰'}
LU = dict(zip(G, '寅卯巳午巳午申酉亥子'))                    # 禄：临官那一支，土跟着火
WENCHANG = dict(zip(G, '巳午申酉申酉亥子寅卯'))              # 辛见子是现在通行的；《星学大成》作辛见戌
GUOYIN = {g: step(LU[g], 8) for g in G}                     # 国印：禄前九位，连禄自己算一位
TIANCHU = {g: LU[G[(G.index(g) + 2) % 10]] for g in G}      # 天厨：食神的禄。食神是日主所生、阴阳相同的那个天干
JINYU = {g: step(LU[g], 2) for g in G}                      # 金舆：禄前二辰
YANGREN = dict(zip(G, '卯寅午巳午巳酉申子亥'))               # 阳干是禄前一辰；阴干取法各派不同，这里取逆行的帝旺
LIUXIA = dict(zip(G, '酉戌未申巳午辰卯亥寅'))
HONGYAN = dict(zip(G, '午午寅未辰辰戌酉子申'))

# ---- 用地支查地支：按三合局 ----
SANHE = ['申子辰', '亥卯未', '寅午戌', '巳酉丑']
YIMA = dict(zip(SANHE, '寅巳申亥'))
HUAGAI = {s: s[2] for s in SANHE}                           # 华盖：三合局的最后一个字
JIANGXING = {s: s[1] for s in SANHE}                        # 将星：三合局中间的字
TAOHUA = dict(zip(SANHE, '酉子卯午'))                        # 桃花：三合局五行的沐浴位
JIESHA = dict(zip(SANHE, '巳申亥寅'))
WANGSHEN = dict(zip(SANHE, '亥寅巳申'))
ZAISHA = {s: step(JIANGXING[s], 6) for s in SANHE}          # 灾煞：将星的对冲
LIUE = {s: step(s[0], 7) for s in SANHE}                    # 六厄：三合局五行的死地。局的头一个字是长生，死在长生后面第七位
for s in SANHE:                                             # 《三命通会》「论六厄」：常居马前一辰，劫后二辰
    assert LIUE[s] == step(YIMA[s], 1) == step(JIESHA[s], -2), s
DEXIU = dict(zip(SANHE, ['壬癸戊己丙辛甲', '甲乙丁壬', '丙丁戊癸', '庚辛乙']))
YUEDE = dict(zip(SANHE, '壬甲丙庚'))
TIANDE = dict(zip('寅卯辰巳午未申酉戌亥子丑', ['丁', '申', '壬', '辛', '亥', '甲', '癸', '寅', '丙', '乙', '巳', '庚']))
GAN_HE = {G[i]: G[(i + 5) % 10] for i in range(10)}          # 天干五合
ZHI_HE = dict(zip('子丑寅卯辰巳午未申酉戌亥', '丑子亥戌酉申未午巳辰卯寅'))   # 地支六合


def he(x):
    """和 x 相合的那个字：天干按五合，地支按六合。"""
    return GAN_HE[x] if x in G else ZHI_HE[x]


# ---- 按三会方：孤辰、寡宿 ----
FANG = ['亥子丑', '寅卯辰', '巳午未', '申酉戌']

# ---- 用月支查地支：血刃。寅、辰、午、申、戌、子六个月从丑起顺数，卯、巳、未、酉、亥、丑六个月从未起顺数 ----
XUEREN = {}
for k, m in enumerate('寅辰午申戌子'):
    XUEREN[m] = step('丑', k)
for k, m in enumerate('卯巳未酉亥丑'):
    XUEREN[m] = step('未', k)

# ---- 只看日柱、时柱自己 ----
GULUAN = {'甲寅', '乙巳', '丙午', '丁巳', '戊午', '戊申', '辛亥', '壬子'}
KUIGANG = {'壬辰', '庚戌', '戊戌', '庚辰'}
CHACUO = {'丙子', '丁丑', '戊寅', '辛卯', '壬辰', '癸巳', '丙午', '丁未', '戊申', '辛酉', '壬戌', '癸亥'}
SHIE = {gz for gz in JIA_ZI if LU[gz[0]] in xunkong(gz)}     # 十恶大败：日干的禄落在本旬的空亡里
JINSHEN = {'癸酉', '己巳', '乙丑'}
SHILING = {'甲辰', '乙亥', '丙辰', '丁酉', '戊午', '庚戌', '庚寅', '辛亥', '壬寅', '癸未'}
LIUXIU = {'丙午', '丁未', '戊子', '戊午', '己丑', '己未'}
BAZHUAN = {'甲寅', '乙卯', '丁未', '戊戌', '己未', '庚申', '辛酉', '癸丑'}
JIUCHOU = {'丁酉', '戊子', '戊午', '己卯', '己酉', '辛卯', '辛酉', '壬子', '壬午'}
SEASONS = ['寅卯辰', '巳午未', '申酉戌', '亥子丑']             # 春夏秋冬
SIFEI = dict(zip(SEASONS, [{'庚申', '辛酉'}, {'壬子', '癸亥'}, {'甲寅', '乙卯'}, {'丙午', '丁巳'}]))
TIANSHE = dict(zip(SEASONS, ['戊寅', '甲午', '戊申', '甲子']))
TIANZHUAN = dict(zip(SEASONS, ['乙卯', '丙午', '辛酉', '壬子']))
DIZHUAN = dict(zip(SEASONS, ['辛卯', '戊午', '癸酉', '丙子']))
SANQI = {'甲戊庚', '乙丙丁', '壬癸辛'}                        # 年月日或月日时三个天干，照这个顺序紧挨着
# 拱禄：日柱和时柱同干，两个地支中间隔着的那一支正是日干的禄。照书上的五日五时列
GONGLU = {('癸亥', '癸丑'), ('癸丑', '癸亥'), ('丁巳', '丁未'), ('己未', '己巳'), ('戊辰', '戊午')}
for d, h in GONGLU:
    assert d[0] == h[0] and {step(d[1], 1), step(d[1], -1)} & {step(h[1], 1), step(h[1], -1)} == {LU[d[0]]}, (d, h)
# 隔角：日支和时支中间正好隔着寅、申、巳、亥四个角里的一个（《神峰通考》），反过来也算（《三命通会》「互换看之」）
GEJIAO = {(step(c, -1), step(c, 1)) for c in '寅巳申亥'}
GEJIAO |= {(b, a) for a, b in GEJIAO}
# 按年柱纳音的五行。学堂是长生位，词馆是临官位，土跟着水
XUETANG = {'金': '巳', '木': '亥', '水': '申', '土': '申', '火': '寅'}
CIGUAN = {e: step(z, 3) for e, z in XUETANG.items()}        # 临官在长生后面第三位
TONGZI = {'金': '午卯', '木': '午卯', '水': '酉戌', '火': '酉戌', '土': '辰巳'}   # 童子煞后半首

assert len(SHIE) == 10, SHIE


def grp(z):
    return next(s for s in SANHE if z in s)


def one(p, nayin_el, i, gz=None, male=True):
    """一柱上的神煞。i 是 0 到 3（年月日时）；i 为 -1 时算外来的一柱 gz（大运、流年、流月、流日）。
    male 为真是男命，只有元辰用到。返回一个集合。"""
    out = set()
    ext = i < 0
    yg, yz = p[0]
    mz = p[1][1]
    dg, dz = p[2]
    g, z = gz if ext else p[i]
    nel = nayin_el[p[0]]

    # 用年干、日干查地支，自己坐着的那一支也算
    for s in (yg, dg):
        if z in TIANYI[s]: out.add('天乙贵人')
        if z in TAIJI[s]: out.add('太极贵人')
        if z == WENCHANG[s]: out.add('文昌贵人')
        if z == GUOYIN[s]: out.add('国印贵人')
        if z in FUXING[s]: out.add('福星贵人')
        if z == TIANCHU[s]: out.add('天厨贵人')
        if z == JINYU[s]: out.add('金舆')
    # 只用日干
    if z == LU[dg]: out.add('禄神')
    if z == YANGREN[dg]: out.add('羊刃')
    if z == step(YANGREN[dg], 6): out.add('飞刃')
    if z == LIUXIA[dg]: out.add('流霞')
    if z == HONGYAN[dg]: out.add('红艳煞')
    # 用年支、日支查别的地支
    for j, s in ((0, yz), (2, dz)):
        if i == j: continue
        k = grp(s)
        if z == YIMA[k]: out.add('驿马')
        if z == HUAGAI[k]: out.add('华盖')
        if z == JIANGXING[k]: out.add('将星')
        if z == TAOHUA[k]: out.add('桃花')
        if z == JIESHA[k]: out.add('劫煞')
        if z == WANGSHEN[k]: out.add('亡神')
        if {s, z} in ({'戌', '亥'}, {'辰', '巳'}): out.add('天罗地网')
        if z == LIUE[k]: out.add('六厄')
    # 只用年支
    if i != 0:
        fang = next(f for f in FANG if yz in f)
        luan = step('卯', -Z.index(yz))                     # 红鸾：子年在卯，往回数
        yang = Z.index(yz) % 2 == 0                         # 年支是阳支，年干也就是阳干
        if z == ZAISHA[grp(yz)]: out.add('灾煞')
        if z == step(fang[2], 1): out.add('孤辰')            # 往前出了这一方的头一位
        if z == step(fang[0], -1): out.add('寡宿')           # 往后退出这一方的头一位
        if z == luan: out.add('红鸾')
        if z == step(luan, 6): out.add('天喜')
        if z == step(yz, 3): out.add('勾绞煞')
        if z == step(yz, 6 + (1 if male == yang else -1)): out.add('元辰')   # 阳男阴女取对冲的前一位，阴男阳女取后一位
        if z == step(yz, 2): out.add('丧门')
        if z == step(yz, -2): out.add('吊客')
        if z == step(yz, -3): out.add('披麻')
        if z == step(yz, -1): out.add('病符')                # 太岁后一辰
        if z == XUETANG[nel]: out.add('学堂')
        if z == CIGUAN[nel]: out.add('词馆')
    # 用月支
    td, yd = TIANDE[mz], YUEDE[grp(mz)]
    if g in DEXIU[grp(mz)]: out.add('德秀贵人')
    if td in (g, z): out.add('天德贵人')
    if g == yd: out.add('月德贵人')
    if he(td) in (g, z): out.add('天德合')
    if g == he(yd): out.add('月德合')
    if i != 1 and z == step(mz, -1): out.add('天医')
    if i != 1 and z == XUEREN[mz]: out.add('血刃')
    # 空亡
    if i != 2 and z in xunkong(p[2]): out.add('空亡')
    if i != 0 and z in xunkong(p[0]): out.add('空亡')
    # 只看日柱、时柱自己
    season = next(k for k in SEASONS if mz in k)
    if i == 2:
        d = p[2]
        if d in KUIGANG: out.add('魁罡')
        if d in GULUAN: out.add('孤鸾煞')
        if d in CHACUO: out.add('阴差阳错')
        if d in SHIE: out.add('十恶大败')
        if d in SHILING: out.add('十灵日')
        if d in LIUXIU: out.add('六秀日')
        if d in BAZHUAN: out.add('八专')
        if d in JIUCHOU: out.add('九丑')
        if d in SIFEI[season]: out.add('四废日')
        if d == TIANSHE[season]: out.add('天赦日')
        if d == TIANZHUAN[season]: out.add('天转')
        if d == DIZHUAN[season]: out.add('地转')
    if i in (2, 3):
        if p[i] in JINSHEN: out.add('金神')
        if (p[2], p[3]) in GONGLU: out.add('拱禄')
        if (p[2][1], p[3][1]) in GEJIAO: out.add('隔角')
        if z in ('寅子' if season in ('寅卯辰', '申酉戌') else '卯未辰'): out.add('童子煞')   # 春秋看寅、子，冬夏看卯、未、辰
        if z in TONGZI[nel]: out.add('童子煞')
    # 三奇：年月日或月日时三个天干照顺序紧挨着
    if not ext:
        for a in (0, 1):
            if a <= i <= a + 2 and p[a][0] + p[a + 1][0] + p[a + 2][0] in SANQI: out.add('三奇贵人')
    return out


def shensha(p, nayin_el, male=True):
    """p = [年柱, 月柱, 日柱, 时柱]；nayin_el = {干支: 纳音五行}，纳音五行是纳音名的最后一个字；male 为真是男命。

    返回四个集合，分别是落在各柱上的神煞。
    """
    return [one(p, nayin_el, i, None, male) for i in range(4)]


def shensha_extra(p, nayin_el, gz, male=True):
    """外来的一柱 gz（大运、流年、流月、流日）的神煞：拿它去对原局的年柱、月支、日柱查。返回一个集合。"""
    return one(p, nayin_el, -1, gz, male)
