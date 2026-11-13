#!/usr/bin/env python3
"""检查个人数据有没有漏到 private/ 之外。只用标准库。

  python3 tools/check_private.py

个人的出生信息、排出来的盘、个人页面的链接都只应该出现在 private/ 里，那个目录不入库。
这个脚本从 private/ 里取出这些内容，再到项目的其他文件里找。找到了就列出「文件:行号:列号」
和内容的类别，退出码为 1；没找到就打印一行通过。没有 private/people 目录时无需检查。

找的内容：
- 出生日期的各种写法，包括公历（2000-01-01、2000/1/1、2000 年 1 月 1 日、2000, 1, 1、20000101、
  月份从 0 起的 2000, 0, 1 等）和农历；
- 起运日期，写法同上；精确到秒的真太阳时；
- 四柱连着写的各种形式（中间没有分隔，或者隔着空格、引号、逗号、竖线、标签等），
  以及四个天干连着写、四个地支连着写；
- 出生地的全称；长度不小于 2、而且不是「我」的姓名；
- private/ 下 .md 文件里出现的 claude.ai 页面链接。

出生信息取自 private/people/*.json；有 private/data/people.json 的话也从它取。
不扫描的目录：private/、node_modules/、.venv/、.git/、shots/、tmp/、__pycache__/。二进制文件跳过。
tmp/ 里是 tools/fuzz.py 随机生成的虚构人物，不入库。随机的日期偶尔会和真实的日期撞上，所以不扫描。
输出里只写类别，不把内容本身打印出来。
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = ROOT / 'private'
SKIP_DIRS = {'node_modules', '.venv', '.git', 'shots', 'tmp', '__pycache__'}
NOT_HANZI = '[^' + chr(0x4E00) + '-' + chr(0x9FFF) + ']'      # 汉字以外的任何字符，包括空白和换行


def date_patterns(y, m, d):
    """一个日期的各种写法。月和日前面可以补 0，分隔符两边可以有空白。"""
    yy, mm, dd = str(y), f'0?{m}', f'0?{d}'
    sep = r'\s*[-/.]\s*'
    return [
        rf'(?<!\d){yy}{sep}{mm}{sep}{dd}(?!\d)',                    # 年-月-日，分隔符是 - / .
        rf'(?<!\d){yy}\s*年\s*{mm}\s*月\s*{dd}(?!\d)',               # 年 月 日
        rf'(?<!\d){yy}\s*,\s*{mm}\s*,\s*{dd}(?!\d)',                 # 年, 月, 日
        rf'(?<!\d){yy}\s*,\s*0?{m - 1}\s*,\s*{dd}(?!\d)',            # 年, 月, 日，月份从 0 起（JS 的写法）
        rf'(?<!\d){y:04d}{m:02d}{d:02d}(?!\d)',                      # 八位数字
        rf'(?<!\d){mm}{sep}{dd}{sep}{yy}(?!\d)',                    # 月/日/年
        rf'(?<!\d){dd}{sep}{mm}{sep}{yy}(?!\d)',                    # 日/月/年
    ]


def in_a_row(items, gap):
    """几个词按顺序出现，中间最多隔 gap 个不是汉字的字符。"""
    return (NOT_HANZI + f'{{0,{gap}}}').join(re.escape(x) for x in items)


def collect():
    """从 private/ 里取出要找的内容。返回 [(类别, 正则), …]，去掉重复的。"""
    found = {}

    def add(label, pattern):
        found.setdefault(pattern, label)

    def add_date(label, ymd):
        if len(ymd) >= 3 and all(isinstance(v, int) for v in ymd[:3]):
            for p in date_patterns(*ymd[:3]):
                add(label, p)

    def add_pillars(pillars):
        if isinstance(pillars, list) and len(pillars) == 4 and all(isinstance(p, str) and len(p) == 2 for p in pillars):
            add('四柱', in_a_row(pillars, 40))
            add('四柱的天干', in_a_row([p[0] for p in pillars], 12))
            add('四柱的地支', in_a_row([p[1] for p in pillars], 12))

    def add_person(p):
        if isinstance(p.get('place'), str) and len(p['place']) >= 2:
            add('出生地', re.escape(p['place']))
        if isinstance(p.get('name'), str) and len(p['name']) >= 2 and p['name'] != '我':
            add('姓名', re.escape(p['name']))

    # 出生信息文件
    for f in sorted((PRIVATE / 'people').glob('*.json')):
        if f.name.endswith('.notes.json'):
            continue
        p = json.loads(f.read_text(encoding='utf-8'))
        add_person(p)
        for key, label in (('birth', '出生日期'), ('expectYunStart', '起运日期'), ('expectTst', '出生日期')):
            m = re.match(r'\s*(\d{4})-(\d{1,2})-(\d{1,2})', str(p.get(key, '')))
            if m:
                add_date(label, [int(v) for v in m.groups()])
        add_pillars(p.get('expect'))

    # 排好的数据
    data_file = PRIVATE / 'data' / 'people.json'
    if data_file.exists():
        for p in json.loads(data_file.read_text(encoding='utf-8')).get('people', []):
            add_person(p)
            add_date('出生日期', p.get('clock', []))
            add_date('出生日期', p.get('tst', []))
            add_date('起运日期', p.get('yun', {}).get('start', []))
            add_pillars(p.get('pillars'))
            add_pillars(p.get('pillarsClock'))
            tst = p.get('tst', [])
            if len(tst) == 6 and (tst[4] or tst[5]):        # 整点太常见，不找
                add('真太阳时', rf'(?<!\d){tst[3]:02d}\s*[:：]\s*{tst[4]:02d}\s*[:：]\s*{tst[5]:02d}(?!\d)')
            lunar = p.get('lunar', {})
            if all(isinstance(lunar.get(k), str) and lunar[k] for k in ('year', 'month', 'day')):
                add('农历生日', r'\s*'.join(re.escape(x) for x in (lunar['year'], '年', lunar['month'], '月', lunar['day'])))

    # 个人页面的链接
    for f in sorted(PRIVATE.rglob('*.md')):
        for m in re.finditer(r'claude\.ai/(?:code/)?artifact/([A-Za-z0-9_-]+)', f.read_text(encoding='utf-8', errors='replace')):
            add('个人页面的链接', re.escape(m.group(1) if len(m.group(1)) >= 8 else m.group(0)))

    return [(label, re.compile(pattern)) for pattern, label in found.items()]


def public_files():
    """项目里 private/ 之外、要扫描的文件。"""
    for folder, dirs, files in os.walk(ROOT):
        here = Path(folder)
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not (here == ROOT and d == 'private'))
        for name in sorted(files):
            yield here / name


def main():
    if not (PRIVATE / 'people').is_dir():
        print('没有 private/people，无需检查。')
        return
    wanted = collect()
    if not wanted:
        print('private/ 里没有取到可以检查的内容，无需检查。')
        return

    hits = set()
    scanned = 0
    for f in public_files():
        rel = str(f.relative_to(ROOT))
        for label, pattern in wanted:               # 文件名里也不该有
            if pattern.search(rel):
                hits.add((rel, 0, 0, label + '（在文件名里）'))
        if not f.is_file():
            continue
        try:
            raw = f.read_bytes()
        except OSError:
            continue
        if b'\0' in raw:                            # 二进制文件
            continue
        scanned += 1
        text = raw.decode('utf-8', errors='replace')
        for label, pattern in wanted:
            for m in pattern.finditer(text):
                line_start = text.rfind('\n', 0, m.start()) + 1
                hits.add((rel, text.count('\n', 0, m.start()) + 1, m.start() - line_start + 1, label))

    if not hits:
        print(f'通过：private/ 之外没有发现个人数据（扫描了 {scanned} 个文本文件，对照 {len(wanted)} 种写法）。')
        return
    print('个人数据出现在 private/ 之外：')
    for rel, line, col, label in sorted(hits):
        print(f'  {rel}:{line}:{col}  {label}')
    files = sorted({h[0] for h in hits})
    print(f'共 {len(hits)} 处，涉及 {len(files)} 个文件：' + '、'.join(files))
    sys.exit(1)


if __name__ == '__main__':
    main()
