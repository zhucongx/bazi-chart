#!/usr/bin/env python3
"""从维基数据取城市的经度，写成 data/cities.json。添加表单里选城市用的就是这张表。

  python3 tools/gen_cities.py          联网取一遍，重写 data/cities.json，大约一分钟
  python3 tools/gen_cities.py --check  不联网，只把现有的 data/cities.json 再核对一遍

取的范围：
  大陆的地级行政区（地级市、自治州、地区、盟）和四个直辖市，香港、澳门，台湾的六个直辖市。
  每一条取维基数据里这个条目的坐标（P625），只留经度，四舍五入到小数点后两位。
  经度只用来把钟表时间换算成真太阳时：差 1 度相当于 4 分钟。

怎么取：
  1. 用维基数据网站的搜索接口，按「属于某一类」（P31）列出条目的编号。
  2. 用 wbgetentities 接口分批取这些条目的名字、坐标、上一级行政区、撤销日期。
  3. 已经撤销的（有 P576），或者「属于这一类」那一条带着结束时间（P582）的，不要。
  4. 维基数据里有些旧条目没有标撤销，再按三条规矩筛一遍：
     直辖市只认北京、天津、上海、重庆（别的城市历史上当过直辖市，条目里还留着这一类）；
     某某地区和某某市同时在表里的，地区已经改成了市，只留市；
     名字重复的，留编号小的那一条（先建的主条目）。
  维基数据另有一个查询服务（SPARQL），2026-11-14 试了几次都超时，所以没有用它。

核对：
  1. 经度都落在东经 73 到 136 度之间，名字没有重复。
  2. 拿这台机器上时区数据库（tz database）里记的几个城市坐标另外对一遍，相差不超过 0.3 度。
     时区数据库是另一个来源，和维基数据无关。

只用标准库，不需要另外安装东西。请求一个一个慢慢发，不给对方添负担。
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'cities.json'
API = 'https://www.wikidata.org/w/api.php'
UA = 'bazi-chart-build/1.0 (static site build script)'

# 维基数据里的类别。键是条目编号，值是写进表里的类别名。排在前面的优先。
TYPES = {
    'Q1208802': '直辖市',
    'Q748149': '地级市',
    'Q788104': '自治州',
    'Q1045608': '地区',
    'Q288653': '盟',
    'Q2225003': '台湾的直辖市',
}
# 不属于上面几类、单独点名要的条目
EXTRA = {'Q8646': '香港', 'Q14773': '澳门'}

# 维基数据里个别条目没有简体的名字，只有繁体的。这里列出来改成简体，免得为这几个字去装转换库。
TO_SIMPLIFIED = {'臺北市': '台北市', '臺中市': '台中市', '臺南市': '台南市', '桃園市': '桃园市', '澳門': '澳门'}
# 省一级的名字：地级行政区的上一级。别的上级（比如国家）不要。
PROVINCE = re.compile(r'(省|自治区|特别行政区)$')
MUNICIPALITIES = {'北京市', '天津市', '上海市', '重庆市'}

# 时区数据库里有坐标的几个城市，拿来另外对一遍
TZ_CHECK = {'Asia/Shanghai': '上海市', 'Asia/Urumqi': '乌鲁木齐市', 'Asia/Hong_Kong': '香港', 'Asia/Macau': '澳门', 'Asia/Taipei': '台北市'}
TZ_FILES = ['/usr/share/zoneinfo/zone1970.tab', '/usr/share/zoneinfo/zone.tab']


def api(params):
    """调一次维基数据网站的接口。取不到就等一等再试，间隔一次比一次长。"""
    url = API + '?' + urllib.parse.urlencode({**params, 'format': 'json'})
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode('utf-8'))
            if 'error' in data:
                raise RuntimeError(str(data['error'])[:120])
            time.sleep(1.5)
            return data
        except Exception as e:
            wait = 10 * (attempt + 1)
            print(f'  这一次没有取到（{type(e).__name__} {str(e)[:70]}），{wait} 秒以后再试', flush=True)
            time.sleep(wait)
    raise SystemExit('维基数据的接口一直取不到。过一会儿再试。')


def ids_of(type_q):
    """属于某一类的条目的编号。搜索接口一次最多给 50 条，翻页取完。"""
    out, offset = [], 0
    while True:
        d = api({'action': 'query', 'list': 'search', 'srsearch': f'haswbstatement:P31={type_q}', 'srnamespace': 0,
                 'srlimit': 50, 'sroffset': offset, 'srprop': '', 'srinfo': ''})
        out += [x['title'] for x in d['query']['search']]
        if 'continue' not in d:
            return out
        offset = d['continue']['sroffset']


def entities(ids, props):
    out = {}
    for i in range(0, len(ids), 50):
        d = api({'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 50]), 'props': props, 'languages': 'zh-cn|zh-hans|zh'})
        out.update(d.get('entities', {}))
    return out


def live(st):
    """这一条陈述没有被标成废弃，而且有值。"""
    return st.get('rank') != 'deprecated' and st.get('mainsnak', {}).get('snaktype') == 'value'


def best(sts):
    """标了「首选」的优先，没有就用全部没废弃的。"""
    sts = [s for s in sts if live(s)]
    return [s for s in sts if s.get('rank') == 'preferred'] or sts


def label(ent):
    """简体的名字，和它是从哪一种语言标记里取的。"""
    labels = ent.get('labels', {})
    for lang in ('zh-cn', 'zh-hans', 'zh'):
        if lang in labels:
            return labels[lang]['value'], lang
    return None, None


def fetch():
    ids = []
    for q, kind in TYPES.items():
        got = ids_of(q)
        print(f'  {kind}：搜到 {len(got)} 条', flush=True)
        ids += got
    ids = list(dict.fromkeys(ids + list(EXTRA)))
    ents = entities(ids, 'labels|claims')
    out, notes, parents = [], [], set()
    for q in ids:
        e = ents.get(q)
        if not e or 'claims' not in e:
            notes.append(f'{q} 没有取到')
            continue
        claims = e['claims']
        name_raw, lang = label(e)
        types = [s['mainsnak']['datavalue']['value']['id'] for s in claims.get('P31', [])
                 if live(s) and 'P582' not in s.get('qualifiers', {})]
        if any(live(s) for s in claims.get('P576', [])):
            continue                    # 已经撤销
        lons = sorted(s['mainsnak']['datavalue']['value']['longitude'] for s in best(claims.get('P625', []))
                      if s['mainsnak']['datavalue']['value'].get('globe', '').endswith('/Q2'))
        if not name_raw or not lons:
            notes.append(f'{q} {name_raw or ""}：没有中文名或者没有坐标，没有收进来')
            continue
        name = EXTRA.get(q) or TO_SIMPLIFIED.get(name_raw, name_raw)
        # 直辖市只认四个；别的城市历史上当过直辖市的，按它现在的类别算
        kind = '特别行政区' if q in EXTRA else next((TYPES[t] for t in TYPES if t in types and (TYPES[t] != '直辖市' or name in MUNICIPALITIES)), None)
        if not kind:
            continue                    # 现在不属于这几类了
        if lang == 'zh' and name == name_raw and q not in EXTRA:
            notes.append(f'{q} {name_raw}：只有没标明简繁的名字，照原样用了')
        if lons[-1] - lons[0] > 0.3:
            notes.append(f'{q} {name}：维基数据里有 {len(lons)} 个坐标，经度从 {lons[0]:.2f} 到 {lons[-1]:.2f}，取了中间的一个')
        ups = [s['mainsnak']['datavalue']['value']['id'] for s in best(claims.get('P131', []))]
        parents.update(ups)
        out.append({'q': q, 'n': name, 'k': kind, 'lon': round(lons[len(lons) // 2], 2), 'ups': ups})
    up_names = {q: TO_SIMPLIFIED.get(label(e)[0], label(e)[0]) for q, e in entities(sorted(parents), 'labels').items()}
    for c in out:
        c['ups'] = [up_names.get(u) or '' for u in c['ups']]
        c['p'] = '' if c['n'] in MUNICIPALITIES or c['q'] in EXTRA else '台湾' if c['k'] == '台湾的直辖市' else next((u for u in sorted(c['ups']) if PROVINCE.search(u)), '')
    # 名字重复的，留编号小的那一条
    out.sort(key=lambda c: int(c['q'][1:]))
    seen, keep = {}, []
    for c in out:
        if c['n'] in seen:
            notes.append(f"{c['q']} {c['n']}：和 {seen[c['n']]} 重名，留了编号小的那一条")
            continue
        seen[c['n']] = c['q']
        keep.append(c)
    # 某某地区和某某市都在的，地区已经改成了市，只留市
    out = []
    for c in keep:
        if c['k'] == '地区' and c['n'].endswith('地区') and c['n'][:-2] + '市' in seen:
            notes.append(f"{c['q']} {c['n']}：表里已经有{c['n'][:-2]}市，这个地区没有收")
            continue
        out.append(c)
    # 上一级不是省的（新疆有两个地区归自治州管），省份跟着上一级走
    by_name = {c['n']: c for c in out}
    for c in out:
        if not c['p'] and c['k'] in ('地级市', '自治州', '地区', '盟'):
            c['p'] = next((by_name[u]['p'] for u in c['ups'] if u in by_name and by_name[u]['p']), '')
            if not c['p']:
                notes.append(f"{c['q']} {c['n']}：没有找到所属的省份")
    out = [{'q': c['q'], 'n': c['n'], 'p': c['p'], 'k': c['k'], 'lon': c['lon']} for c in out]
    out.sort(key=lambda c: (c['p'], c['n']))
    return out, notes


def tz_coords():
    """时区数据库里的坐标：{时区名: 经度}。坐标写成 +DDMM+DDDMM 或 +DDMMSS+DDDMMSS。"""
    for f in TZ_FILES:
        p = Path(f)
        if not p.exists():
            continue
        got = {}
        for line in p.read_text(encoding='utf-8').splitlines():
            if line.startswith('#'):
                continue
            cols = line.split('\t')
            if len(cols) < 3 or cols[2] not in TZ_CHECK:
                continue
            m = re.match(r'([+-]\d{4,6})([+-]\d{5,7})$', cols[1])
            if not m:
                continue
            s = m.group(2)
            sign, digits = (-1 if s[0] == '-' else 1), s[1:]
            deg, minute, sec = int(digits[:3]), int(digits[3:5]), int(digits[5:7] or 0)
            got[cols[2]] = sign * (deg + minute / 60 + sec / 3600)
        return f, got
    return None, {}


def check(cities):
    """返回 (问题的列表, 写进文件的核对记录)。"""
    bad = []
    names = [c['n'] for c in cities]
    dup = sorted({n for n in names if names.count(n) > 1})
    if dup:
        bad.append('名字重复：' + '、'.join(dup))
    off = [f"{c['n']} {c['lon']}" for c in cities if not 73 <= c['lon'] <= 136]
    if off:
        bad.append('经度不在东经 73 到 136 度之间：' + '、'.join(off))
    by_name = {c['n']: c['lon'] for c in cities}
    src, tz = tz_coords()
    pairs = []
    for zone, name in TZ_CHECK.items():
        if zone in tz and name in by_name:
            diff = round(abs(tz[zone] - by_name[name]), 2)
            pairs.append({'city': name, 'tz': zone, 'tz_lon': round(tz[zone], 2), 'lon': by_name[name], 'diff': diff})
            if diff > 0.3:
                bad.append(f'{name}：这张表是 {by_name[name]}，时区数据库是 {tz[zone]:.2f}，差 {diff} 度')
    record = {'bounds': '东经 73 到 136 度', 'tz_file': src or '这台机器上没有找到时区数据库', 'tz_pairs': pairs}
    return bad, record


def main():
    only_check = '--check' in sys.argv
    if only_check:
        if not OUT.exists():
            raise SystemExit('还没有 data/cities.json。先不带 --check 跑一次。')
        cities, notes = json.loads(OUT.read_text(encoding='utf-8'))['cities'], []
    else:
        print('向维基数据取数据……', flush=True)
        cities, notes = fetch()
    bad, record = check(cities)
    kinds = {}
    for c in cities:
        kinds[c['k']] = kinds.get(c['k'], 0) + 1
    print(f'一共 {len(cities)} 个：' + '，'.join(f'{k} {n}' for k, n in sorted(kinds.items(), key=lambda x: -x[1])))
    for n in notes:
        print('  注意：' + n)
    for p in record['tz_pairs']:
        print(f"  和时区数据库对照：{p['city']} 这张表 {p['lon']}，时区数据库 {p['tz_lon']}，差 {p['diff']} 度")
    if not record['tz_pairs']:
        print('  ' + record['tz_file'] + '，没有做这一项对照')
    if bad:
        for b in bad:
            print('  没通过：' + b)
        raise SystemExit(1)
    if not only_check:
        data = {
            'source': '维基数据（Wikidata，CC0）。每个条目的坐标 P625，由 tools/gen_cities.py 通过 www.wikidata.org 的接口取得',
            'fetched': date.today().isoformat(),
            'types': {**TYPES, **{q: '特别行政区' for q in EXTRA}},
            'count': len(cities),
            'kinds': kinds,
            'check': record,
            'notes': notes,
            'cities': cities,
        }
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print(f'已写入 {OUT.relative_to(ROOT)}')
    print('核对通过')


if __name__ == '__main__':
    main()
