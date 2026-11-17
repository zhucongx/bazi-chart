#!/usr/bin/env python3
"""随机生成一批虚构的出生时间，排盘、构建、检查。用来确认页面对任意出生时间都能用。

  .venv/bin/python tools/fuzz.py          300 个随机的人，外加一批专挑边界的
  .venv/bin/python tools/fuzz.py 1000 7   人数和随机种子

做三件事：
1. 用 tools/gen_data.py 的排盘，给每个人生成数据和预期事实；
2. 把所有人拼进一个页面，放在 tmp/index.html；
3. 运行 node tests/check_page.js --base tmp --quick --quiet：
   每个人由出生信息在页面里重新排一遍，和 lunar_python 排出来的逐项对照；
   再逐个人拿页面的细盘对照 lunar_python 另算的结果，并检查每一条解释都有内容。

专挑的边界：出生在立春、清明交接前后几分钟到一个半小时；晚上 11 点前后和零点前后；
闰日、元旦、年末；经度很偏的地方；夏令时；1900 年初和 2100 年末，也就是页面支持的两头。
另外有一部分人只知道时辰，还有一部分出生在 1645 到 1899 年（页面自带的示例里有一位在这个范围）。
生成的东西都在 tmp/ 里，不入库。需要 lunar_python 和 node。
"""
import contextlib
import datetime
import io
import json
import random
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build      # noqa: E402
import gen_data   # noqa: E402
from lunar_python import Solar            # noqa: E402
from lunar_python.util import LunarUtil   # noqa: E402

ROOT = gen_data.ROOT
TMP = ROOT / 'tmp'
MIN = datetime.timedelta(minutes=1)


def jie_time(y, name):
    """y 年某个节气的时刻（北京时间）。"""
    return gen_data.time_of(Solar.fromYmd(y, 7, 1).getLunar().getJieQiTable()[name])


def make_people(n, seed):
    rnd = random.Random(seed)
    out = []

    def add(birth, lon, gender, dst=False):
        i = len(out)
        out.append({'id': f'r{i:04d}', 'name': f'随机{i}', 'gender': gender, 'birth': birth.strftime('%Y-%m-%d %H:%M:%S'),
                    'place': '虚构的地方', 'lon': lon, 'order': i, 'dst': dst})

    def add_shichen(day, shichen, gender):
        i = len(out)
        out.append({'id': f'r{i:04d}', 'name': f'随机{i}', 'gender': gender, 'birth': day.strftime('%Y-%m-%d'),
                    'shichen': shichen, 'place': '虚构的地方', 'order': i})

    # tests/check_page.js 里写死的两组对照，每次在这里重新和 lunar_python 对一遍
    add(datetime.datetime(2000, 1, 1, 12, 0), 116.4, '男')
    add(datetime.datetime(1993, 10, 10, 9, 30), 104.07, '女')
    add_shichen(datetime.datetime(1993, 10, 10), '辰', '女')

    # 节气交接前后
    for y in (1960, 1984, 2000, 2024):
        t = jie_time(y, '立春')
        for delta in (-90, -5, 5, 90):
            for lon in (90.0, 120.0):
                add(t + delta * MIN, lon, '男' if delta < 0 else '女')
    t = jie_time(1995, '清明')
    for delta in (-3, 3):
        add(t + delta * MIN, 116.4, '女')
    # 子时和换日
    for hm in ((23, 30), (23, 0), (0, 30), (0, 0), (12, 0)):
        add(datetime.datetime(1990, 12, 31, *hm), 120.0, '男')
        add(datetime.datetime(2001, 1, 1, *hm), 104.0, '女')
    # 闰日、很早、很晚、经度很偏、夏令时
    add(datetime.datetime(2000, 2, 29, 6, 6), 75.0, '男')
    add(datetime.datetime(1900, 1, 1, 0, 1), 135.0, '女')
    add(datetime.datetime(2100, 12, 31, 23, 59), 75.0, '女')
    add(datetime.datetime(2025, 12, 31, 23, 59), 121.5, '男')
    add(datetime.datetime(1988, 7, 1, 10, 0), 113.3, '女', dst=True)
    # 随机
    start = datetime.datetime(1900, 1, 1)
    days = (datetime.datetime(2101, 1, 1) - start).days
    for _ in range(n):
        when = start + datetime.timedelta(days=rnd.randrange(days), minutes=rnd.randrange(1440))
        if rnd.random() < 0.2:          # 五分之一只知道时辰
            add_shichen(when, rnd.choice(gen_data.Z), rnd.choice('男女'))
        else:
            add(when, round(rnd.uniform(75, 135), 2), rnd.choice('男女'))
    # 1900 年以前的人：页面内排盘不支持，但页面自带的示例里有，所以细盘和解释要照样检查
    old = datetime.datetime(1645, 3, 1)
    old_days = (datetime.datetime(1899, 12, 1) - old).days
    for _ in range(max(20, n // 10)):
        add_shichen(old + datetime.timedelta(days=rnd.randrange(old_days)), rnd.choice(gen_data.Z), rnd.choice('男女'))
    return out


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1

    gen_data.selfcheck()
    nayin = {gz: LunarUtil.NAYIN[gz] for gz in gen_data.JIA_ZI}
    nayin_el = {gz: v[-1] for gz, v in nayin.items()}
    people, expected = [], {}
    log = io.StringIO()
    with contextlib.redirect_stdout(log):        # 排盘时每个人打印的摘要这里不看
        for src in make_people(n, seed):
            person, facts = gen_data.chart(f'随机人物 {src["id"]}', src, None, nayin_el)
            people.append(person)
            expected[person['id']] = facts
    # 真太阳时落在交节另一边的：年柱、月柱照出生的那一刻排，整个照真太阳时排会不一样（2026-11-17 以前就是那样排的）
    near = sum(1 for p in people if p['tst'] < p['prevJie']['at'] or p['tst'] >= p['nextJie']['at'])
    assert all(p['pillars'][:2] == p['pillarsClock'][:2] for p in people)
    other_hour = sum(1 for p in people if p['pillars'][2:] != p['pillarsClock'][2:])

    y0 = min(d['y0'] for p in people for d in p['dayun'])
    y1 = max(d['y1'] for p in people for d in p['dayun']) + 1
    data = {
        'title': '八字命盘 · 随机检查',
        'nayin': nayin,
        'jie': {str(y): gen_data.jie_dates(y) for y in range(y0, y1 + 1)},
        'freq': json.loads((ROOT / 'data' / 'shensha_freq.json').read_text(encoding='utf-8')),
        'people': people,
    }
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    (TMP / 'data').mkdir(parents=True, exist_ok=True)
    (TMP / 'data' / 'people.json').write_text(text + '\n', encoding='utf-8', newline='\n')
    (TMP / 'data' / 'expected.json').write_text(gen_data.dump_expected(expected), encoding='utf-8', newline='\n')

    page = build.make_page(data)
    (TMP / 'index.html').write_text(page, encoding='utf-8', newline='\n')

    print(f'{len(people)} 个虚构的人（随机种子 {seed}），出生在 {min(p["clock"][0] for p in people)} 到 {max(p["clock"][0] for p in people)} 年。')
    print(f'其中 {sum(1 for p in people if "shichen" in p)} 个只知道时辰，{sum(1 for p in people if p["clock"][0] < 1900)} 个出生在 1900 年以前；'
          f'{near} 个真太阳时落在交节的另一边（年柱、月柱照出生的那一刻排），{other_hour} 个按真太阳时和按钟表时间排出的日柱或时柱不同。')
    print(f'页面 tmp/index.html，{len(page.encode("utf-8"))} 字节。开始检查：')
    r = subprocess.run(['node', str(ROOT / 'tests' / 'check_page.js'), '--base', str(TMP), '--quick', '--quiet'], cwd=ROOT)
    sys.exit(r.returncode)


if __name__ == '__main__':
    main()
