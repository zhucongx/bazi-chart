#!/usr/bin/env python3
"""二十个神煞的口诀。

页面的脚本里有一份同样的口诀，这里是用来对照的 Python 版本：
- tools/gen_data.py 用它算出每个人四柱上的神煞，写进 expected.json；
- tools/shensha_freq.py 用它统计出现频率，并生成全空间对照文件 data/shensha_check.json。

只用标准库。纳音表由调用的一方传进来。
各派的取法并不统一（阴干有没有羊刃、词馆怎么取等），这里是页面采用的那一种。
"""

G = '甲乙丙丁戊己庚辛壬癸'
Z = '子丑寅卯辰巳午未申酉戌亥'

# 名字在这个列表里的下标，就是它在 data/shensha_check.json 掩码里的二进制位。不要调整顺序。
NAMES = ['天乙贵人', '国印贵人', '福星贵人', '德秀贵人', '天德合', '月德合', '金舆', '词馆', '驿马', '华盖',
         '羊刃', '飞刃', '空亡', '孤鸾煞', '四废日', '流霞', '劫煞', '亡神', '丧门', '披麻']

TIANYI = {'甲': '丑未', '戊': '丑未', '庚': '丑未', '乙': '子申', '己': '子申', '丙': '亥酉',
          '丁': '亥酉', '壬': '卯巳', '癸': '卯巳', '辛': '午寅'}
GUOYIN = dict(zip(G, '戌亥丑寅丑寅辰巳未申'))
FUXING = {'甲': '寅子', '丙': '寅子', '乙': '丑卯', '癸': '丑卯', '丁': '亥', '戊': '申',
          '己': '未', '庚': '午', '辛': '巳', '壬': '辰'}
JINYU = dict(zip(G, '辰巳未申未申戌亥丑寅'))
YANGREN = dict(zip(G, '卯寅午巳午巳酉申子亥'))      # 阴干取法各派不同，这里丁见巳
LIUXIA = dict(zip(G, '酉戌未申巳午辰卯亥寅'))
SANHE = ['申子辰', '亥卯未', '寅午戌', '巳酉丑']
YIMA = dict(zip(SANHE, '寅巳申亥'))
HUAGAI = dict(zip(SANHE, '辰未戌丑'))
JIESHA = dict(zip(SANHE, '巳申亥寅'))
WANGSHEN = dict(zip(SANHE, '亥寅巳申'))
DEXIU = dict(zip(SANHE, ['壬癸戊己丙辛甲', '甲乙丁壬', '丙丁戊癸', '庚辛乙']))
YUEDE_HE = dict(zip(SANHE, '丁己辛乙'))
TIANDE_HE = dict(zip('寅卯辰巳午未申酉戌亥子丑', ['壬', '巳', '丁', '丙', '寅', '己', '戊', '亥', '辛', '庚', '申', '乙']))
GULUAN = {'乙巳', '丁巳', '辛亥', '戊申', '甲寅', '壬子'}
SIFEI = {'寅卯辰': {'庚申', '辛酉'}, '巳午未': {'壬子', '癸亥'}, '申酉戌': {'甲寅', '乙卯'}, '亥子丑': {'丙午', '丁巳'}}
CIGUAN = {'火': '巳', '金': '申', '木': '寅', '水': '亥', '土': '巳'}   # 年柱纳音五行的临官位


def grp(z):
    return next(s for s in SANHE if z in s)


def xunkong(gz):
    head = (Z.index(gz[1]) - G.index(gz[0])) % 12
    return Z[(head + 10) % 12] + Z[(head + 11) % 12]


def shensha(p, nayin_el):
    """p = [年柱, 月柱, 日柱, 时柱]；nayin_el = {干支: 纳音五行}，纳音五行是纳音名的最后一个字。

    返回四个集合，分别是落在各柱上的神煞。
    """
    out = [set() for _ in range(4)]
    gs = [x[0] for x in p]
    zs = [x[1] for x in p]
    yg, yz, mz, dg, dz = gs[0], zs[0], zs[1], gs[2], zs[2]
    for i in range(4):
        z, g = zs[i], gs[i]
        for s in (yg, dg):
            if z in TIANYI[s]: out[i].add('天乙贵人')
            if z == GUOYIN[s]: out[i].add('国印贵人')
            if z in FUXING[s]: out[i].add('福星贵人')
            if z == JINYU[s]: out[i].add('金舆')
        for j, s in ((0, yz), (2, dz)):
            if i == j: continue
            if z == YIMA[grp(s)]: out[i].add('驿马')
            if z == HUAGAI[grp(s)]: out[i].add('华盖')
            if z == JIESHA[grp(s)]: out[i].add('劫煞')
            if z == WANGSHEN[grp(s)]: out[i].add('亡神')
        if g in DEXIU[grp(mz)]: out[i].add('德秀贵人')
        if g == TIANDE_HE[mz] or z == TIANDE_HE[mz]: out[i].add('天德合')
        if g == YUEDE_HE[grp(mz)]: out[i].add('月德合')
        if z == YANGREN[dg]: out[i].add('羊刃')
        if z == Z[(Z.index(YANGREN[dg]) + 6) % 12]: out[i].add('飞刃')
        if z == LIUXIA[dg]: out[i].add('流霞')
        if i != 2 and z in xunkong(p[2]): out[i].add('空亡')
        if i != 0 and z in xunkong(p[0]): out[i].add('空亡')
        if i != 0 and z == Z[(Z.index(yz) + 2) % 12]: out[i].add('丧门')
        if i != 0 and z == Z[(Z.index(yz) - 3) % 12]: out[i].add('披麻')
        if i != 0 and z == CIGUAN[nayin_el[p[0]]]: out[i].add('词馆')
    if p[2] in GULUAN: out[2].add('孤鸾煞')
    season = next(k for k in SIFEI if mz in k)
    if p[2] in SIFEI[season]: out[2].add('四废日')
    return out
