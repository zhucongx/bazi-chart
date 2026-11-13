#!/usr/bin/env python3
"""从 lunar_python 导出页面内排盘要用的两张对照表，写到 data/tables.json。

  .venv/bin/python tools/gen_tables.py

页面上可以直接输入出生时间，排盘在浏览器里做（src/chart.js）。浏览器里没有 lunar_python，
所以把它算出来的两样东西预先导成表：

1. 节的时刻：每年十二个节（立春、惊蛰……大雪，加上次年一月的小寒）交接的时刻，北京时间，精确到秒。
   年柱、月柱、起运、流月都靠它。
2. 农历：每个农历年正月初一的公历日期、闰几月、每个月是大月还是小月。只用来显示农历生日。

覆盖范围：页面内排盘支持出生在 1900 到 2100 年，农历表按这个范围导。
节的时刻从 1644 年导到 2192 年：往后是因为大运要排九十年，往前是因为页面自带的示例里有清代的人，
他们的流年、流月也要用到节的日期。1645 年起历书改用定气，再往前的节气算法不同，所以不再往前导。
这些时刻都是用现代的天文算法回推的，和当时历书上的时刻可能差几分钟到几十分钟。

编码（页面里的解码在 src/chart.js 开头，两边要一起改）：
- jie：每个时刻占 4 个字符，是 36 进制数，表示「和上一个时刻相隔的秒数减去 2400000」。
  从 jieBase 开始累加，jieBase 是把北京时间当作 UTC 得到的秒数。
- lunar：每个农历年占 5 个字符，36 进制数，等于 正月初一是公历那一年的第几天（从 0 数）× 131072
  + 闰月的月份（没有闰月是 0）× 8192 + 各月的大小（第 j 个月是大月就把第 j 位置 1，闰月排在它本月的后面）。

导出之后，脚本用同样的解码办法把两张表还原，再和 lunar_python 逐项核对：
每一个节的时刻，以及 1900 到 2100 年每一天的农历日期。
"""
import datetime
import json
from pathlib import Path

from lunar_python import LunarYear, Solar

ROOT = Path(__file__).resolve().parent.parent
JIE = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒']
JIE_FROM, JIE_TO = 1644, 2192        # 行的年份：每一行从这一年的立春到下一年一月的小寒
LUNAR_FROM, LUNAR_TO = 1899, 2101    # 农历年
STEP = 2400000
EPOCH = datetime.datetime(1970, 1, 1)
DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'


def b36(n, width):
    assert 0 <= n < 36 ** width, n
    s = ''
    for _ in range(width):
        n, r = divmod(n, 36)
        s = DIGITS[r] + s
    return s


def as_time(solar):
    return datetime.datetime(solar.getYear(), solar.getMonth(), solar.getDay(), solar.getHour(), solar.getMinute(), solar.getSecond())


def jie_times(y):
    """y 这一行的十二个时刻：y 年的立春到大雪，加上 y+1 年一月的小寒。"""
    table = Solar.fromYmd(y, 7, 1).getLunar().getJieQiTable()
    out = [as_time(table[name]) for name in JIE[:11]]
    assert all(t.year == y for t in out), y
    xiao_han = as_time(Solar.fromYmd(y + 1, 7, 1).getLunar().getJieQiTable()['小寒'])
    assert xiao_han.year == y + 1 and xiao_han.month == 1, xiao_han
    return out + [xiao_han]


def lunar_year(y):
    """农历 y 年：(正月初一的公历日期, 闰月, [(月份, 是不是闰月, 天数), …])。"""
    months = [m for m in LunarYear.fromYear(y).getMonths() if m.getYear() == y]
    assert abs(months[0].getMonth()) == 1 and len(months) in (12, 13), (y, [m.getMonth() for m in months])
    first = Solar.fromJulianDay(months[0].getFirstJulianDay())
    leap = [-m.getMonth() for m in months if m.getMonth() < 0]
    assert len(leap) <= 1 and (len(months) == 13) == bool(leap), (y, leap)
    return (datetime.date(first.getYear(), first.getMonth(), first.getDay()), leap[0] if leap else 0,
            [(abs(m.getMonth()), m.getMonth() < 0, m.getDayCount()) for m in months])


def encode():
    times = [t for y in range(JIE_FROM, JIE_TO + 1) for t in jie_times(y)]
    secs = [int((t - EPOCH).total_seconds()) for t in times]
    assert secs == sorted(secs)
    base = secs[0] - STEP
    jie, prev = '', base
    for s in secs:
        jie += b36(s - prev - STEP, 4)
        prev = s

    lunar = ''
    for y in range(LUNAR_FROM, LUNAR_TO + 1):
        first, leap, months = lunar_year(y)
        assert first.year == y
        # 月份的顺序必须是 正、二……，闰月紧跟在它本月后面
        want = []
        for m in range(1, 13):
            want.append((m, False))
            if m == leap:
                want.append((m, True))
        assert [(m, is_leap) for m, is_leap, _ in months] == want, (y, months)
        bits = 0
        for j, (_, _, days) in enumerate(months):
            assert days in (29, 30), (y, days)
            if days == 30:
                bits |= 1 << j
        lunar += b36((first - datetime.date(y, 1, 1)).days * 131072 + leap * 8192 + bits, 5)
    return {'jieFrom': JIE_FROM, 'jieBase': base, 'jie': jie, 'lunarFrom': LUNAR_FROM, 'lunar': lunar}


# ---- 下面是解码，写法和 src/chart.js 里的一样，用来核对 -------------------------------

def decode_jie(tables):
    out, t = [], tables['jieBase']
    for i in range(0, len(tables['jie']), 4):
        t += STEP + int(tables['jie'][i:i + 4], 36)
        out.append(t)
    return out


def decode_lunar(tables):
    out = {}
    for i in range(0, len(tables['lunar']), 5):
        v = int(tables['lunar'][i:i + 5], 36)
        y = tables['lunarFrom'] + i // 5
        leap = (v >> 13) & 15
        out[y] = (datetime.date(y, 1, 1) + datetime.timedelta(days=v >> 17), leap,
                  [30 if v >> j & 1 else 29 for j in range(13 if leap else 12)])
    return out


def lunar_of(table, day):
    """公历某一天的农历：(农历年, 月份, 是不是闰月, 日)。"""
    y = day.year if day >= table[day.year][0] else day.year - 1
    first, leap, lens = table[y]
    rest = (day - first).days
    for j, n in enumerate(lens):
        if rest < n:
            month, is_leap = (j + 1, False) if not leap or j < leap else (leap, True) if j == leap else (j, False)
            return y, month, is_leap, rest + 1
        rest -= n
    raise AssertionError(day)


def verify(tables):
    # 节的时刻：逐个还原，和 lunar_python 对照
    got = decode_jie(tables)
    want = [int((t - EPOCH).total_seconds()) for y in range(JIE_FROM, JIE_TO + 1) for t in jie_times(y)]
    assert got == want
    gaps = [b - a for a, b in zip(got, got[1:])]
    print(f'节的时刻 {len(got)} 个，{JIE_FROM} 到 {JIE_TO} 年，全部还原无误。相邻两个节相隔 {min(gaps) / 86400:.2f} 到 {max(gaps) / 86400:.2f} 天。')

    # 农历：1900 到 2100 年的每一天
    table = decode_lunar(tables)
    day, end, n = datetime.date(1900, 1, 1), datetime.date(2101, 1, 1), 0
    while day <= end:
        lunar = Solar.fromYmd(day.year, day.month, day.day).getLunar()
        mine = lunar_of(table, day)
        theirs = (lunar.getYear(), abs(lunar.getMonth()), lunar.getMonth() < 0, lunar.getDay())
        assert mine == theirs, (day, mine, theirs)
        day += datetime.timedelta(days=1)
        n += 1
    print(f'农历 {len(table)} 年，{LUNAR_FROM} 到 {LUNAR_TO} 年。1900-01-01 到 2101-01-01 的 {n} 天逐日对照 lunar_python，全部一致。')


def main():
    tables = encode()
    verify(tables)
    out = ROOT / 'data' / 'tables.json'
    text = json.dumps(tables, ensure_ascii=False, separators=(',', ':')) + '\n'
    out.write_text(text, encoding='utf-8', newline='\n')
    print(f'已写入 data/tables.json，{len(text.encode("utf-8"))} 字节')


if __name__ == '__main__':
    main()
