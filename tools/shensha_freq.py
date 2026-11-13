#!/usr/bin/env python3
"""用 tools/shensha.py 的口诀生成两份对照数据。

1. data/shensha_check.json（全空间对照）
   把 60 个年柱 × 12 个月 × 60 个日柱 × 12 个时辰，共 518400 张盘都排一遍，
   记下每个神煞落在每一柱上的次数，再算一个校验值。页面里的口诀照同样的顺序算一遍，
   次数和校验值都相同，就说明两份口诀逐位一致。

   枚举顺序（校验值和顺序有关，不能改）：
     for yi in 0..59   年柱是六十甲子的第 yi 个，甲子是 0
     for m  in 0..11   m=0 是寅月。月支 = 地支[(m+2)%12]，月干序号 = ((年干序号 % 5) * 2 + 2 + m) % 10
     for di in 0..59   日柱是六十甲子的第 di 个
     for h  in 0..11   时支 = 地支[h]，时干序号 = ((日干序号 % 5) * 2 + h) % 10
   每张盘按年、月、日、时的顺序各算一个掩码：这一柱带的神煞，各占 NAMES 里下标对应的那一位。
   校验值 hash 的初值是 7，每个掩码做一次 hash = (hash * 31 + 掩码) & 0xFFFFFFFF。

2. data/shensha_freq.json（出现频率）
   把 1924-02-05 到 2044-02-03 的每一天、每个时辰都排一遍，共 525948 张盘，
   统计每个神煞出现在百分之多少的盘里。页面上显示的频率来自这个文件。
   重算的结果必须和已有的文件完全相同，不同就报错，不覆盖。

用法（需要 lunar_python，用虚拟环境里的 Python 跑）：
  .venv/bin/python tools/shensha_freq.py                两步都做，约半分钟
  .venv/bin/python tools/shensha_freq.py --check-only   只做第 1 步，几秒钟

口诀改了以后两步都要重跑，页面里的口诀也要同步改。
"""
import datetime
import json
import sys
from pathlib import Path

from lunar_python import Solar
from lunar_python.util import LunarUtil

from shensha import G, Z, NAMES, shensha

ROOT = Path(__file__).resolve().parent.parent
CHECK_FILE = ROOT / 'data' / 'shensha_check.json'
FREQ_FILE = ROOT / 'data' / 'shensha_freq.json'

JIA_ZI = [G[i % 10] + Z[i % 12] for i in range(60)]


def nayin_elements():
    """{干支: 纳音五行}。纳音五行是纳音名的最后一个字，比如「山头火」是火。"""
    table = {gz: LunarUtil.NAYIN[gz][-1] for gz in JIA_ZI}
    assert set(table.values()) == set('金木水火土'), table
    return table


def full_space(nayin_el):
    """全空间对照。返回 {'names', 'total', 'hash', 'counts'}。"""
    bit = {n: i for i, n in enumerate(NAMES)}
    counts = {n: [0, 0, 0, 0] for n in NAMES}
    h = 7
    total = 0
    for yi in range(60):
        yp = JIA_ZI[yi]
        for m in range(12):
            mp = G[((yi % 10) % 5 * 2 + 2 + m) % 10] + Z[(m + 2) % 12]      # 五虎遁：由年干推月干
            for di in range(60):
                dp = JIA_ZI[di]
                for hh in range(12):
                    hp = G[((di % 10) % 5 * 2 + hh) % 10] + Z[hh]           # 五鼠遁：由日干推时干
                    for k, names in enumerate(shensha([yp, mp, dp, hp], nayin_el)):
                        mask = 0
                        for n in names:
                            mask |= 1 << bit[n]
                            counts[n][k] += 1
                        h = (h * 31 + mask) & 0xFFFFFFFF
                    total += 1
    return {'names': NAMES, 'total': total, 'hash': h, 'counts': counts}


def dump_check(res):
    """写成每个神煞占一行的 JSON，方便人看，也方便比较改动。"""
    one = lambda v: json.dumps(v, ensure_ascii=False)
    rows = ',\n'.join(f'  {one(n)}: {one(res["counts"][n])}' for n in res['names'])
    return (f'{{\n "names": {one(res["names"])},\n "total": {res["total"]},\n "hash": {res["hash"]},\n'
            f' "counts": {{\n{rows}\n }}\n}}\n')


def do_check(nayin_el):
    res = full_space(nayin_el)
    assert res['total'] == 60 * 12 * 60 * 12 == 518400, res['total']
    never = [n for n in NAMES if not sum(res['counts'][n])]
    if never:
        raise SystemExit(f'这些神煞在全部 {res["total"]} 张盘里一次都没出现，口诀或名单有问题：{never}')
    text = dump_check(res)
    assert json.loads(text) == res
    old = CHECK_FILE.read_text(encoding='utf-8') if CHECK_FILE.exists() else None
    CHECK_FILE.parent.mkdir(exist_ok=True)
    CHECK_FILE.write_text(text, encoding='utf-8', newline='\n')
    state = '新建' if old is None else '和原来的文件相同' if old == text else '和原来的文件不同，已更新；页面里的口诀要同步核对'
    print(f'全空间对照：{res["total"]} 张盘，校验值 {res["hash"]}。已写入 data/shensha_check.json（{state}）')


def frequency(nayin_el):
    """1924-02-05 到 2044-02-03 每天每个时辰各排一张盘，返回 ({神煞: 百分比}, 盘数)。"""
    names = sorted(NAMES)
    cnt = dict.fromkeys(names, 0)
    total = 0
    d = datetime.date(1924, 2, 5)
    end = datetime.date(2044, 2, 4)
    while d < end:
        ec = Solar.fromYmdHms(d.year, d.month, d.day, 12, 0, 0).getLunar().getEightChar()
        y, m, dd = ec.getYear(), ec.getMonth(), ec.getDay()
        for h in range(12):
            hg = G[(G.index(dd[0]) % 5 * 2 + h) % 10]      # 五鼠遁：由日干推时干
            have = set().union(*shensha([y, m, dd, hg + Z[h]], nayin_el))
            for n in have:
                cnt[n] += 1
            total += 1
        d += datetime.timedelta(days=1)
    return {n: round(cnt[n] / total * 100, 1) for n in names}, total


def do_frequency(nayin_el):
    res, total = frequency(nayin_el)
    print('命盘总数', total)
    for n, v in sorted(res.items(), key=lambda kv: -kv[1]):
        print(f'{n}\t{v}%')
    if FREQ_FILE.exists():
        old = json.loads(FREQ_FILE.read_text(encoding='utf-8'))
        if old != res:
            diff = [f'{n}: 文件里 {old.get(n)}，重算 {res.get(n)}' for n in sorted(set(old) | set(res)) if old.get(n) != res.get(n)]
            raise SystemExit('重算的频率和 data/shensha_freq.json 不一致，没有覆盖：\n  ' + '\n  '.join(diff)
                             + '\n如果是有意改了口诀，先删掉 data/shensha_freq.json 再运行，并同步页面。')
        print('重算的频率和 data/shensha_freq.json 完全相同，文件没有改动')
    else:
        FREQ_FILE.parent.mkdir(exist_ok=True)
        FREQ_FILE.write_text(json.dumps(res, ensure_ascii=False), encoding='utf-8', newline='\n')
        print('已写入 data/shensha_freq.json')


def main():
    unknown = [a for a in sys.argv[1:] if a != '--check-only']
    if unknown:
        raise SystemExit(f'不认识的参数：{unknown}。用法见文件开头的说明。')
    nayin_el = nayin_elements()
    do_check(nayin_el)
    if '--check-only' not in sys.argv:
        do_frequency(nayin_el)


if __name__ == '__main__':
    main()
