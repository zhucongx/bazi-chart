#!/usr/bin/env python3
"""把模板、脚本和数据合成一个自包含的页面。只用标准库。

  python3 tools/build.py             data/people.json → index.html（仓库根目录，GitHub Pages 发布的就是它）
  python3 tools/build.py --private   private/data/people.json → private/index.html

模板 src/page.tpl.html 里有八个占位符，每个必须恰好出现一次：
  /*DATA*/     换成人物数据（people.json 去掉节的日期表之后的内容）
  /*TABLES*/   换成 data/tables.json：节的时刻表和农历表，页面内排盘要用
  /*ENGINE*/   换成 src/engine.js
  /*CHART*/    换成 src/chart.js
  /*CLASSICS*/ 换成 src/classics.js：从典籍里摘出来的引文
  /*TEXT*/     换成 src/text.js
  /*UI*/       换成 src/ui.js
  {{TITLE}}    换成数据里的 title，做 HTML 转义

people.json 里的 jie（每年十二个节的日期）不放进页面：页面从 tables.json 的时刻表自己推。
它留在 people.json 里，是给检查脚本对照用的。

生成的 index.html 是单个文件，也是发布出去的那一页。不要手改它，改 src/ 里的文件再构建。
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = {'/*ENGINE*/': 'engine.js', '/*CHART*/': 'chart.js', '/*CLASSICS*/': 'classics.js', '/*TEXT*/': 'text.js', '/*UI*/': 'ui.js'}


def render(tpl, fill):
    """把模板里的占位符换成 fill 里对应的内容。

    先按占位符把模板切开再拼起来，所以换进去的内容里即使恰好有占位符的字样，也不会被再换一次。
    """
    pieces = re.split('(' + '|'.join(re.escape(mark) for mark in fill) + ')', tpl)
    found = pieces[1::2]                # 切出来的奇数位就是占位符
    wrong = [f'{mark} 有 {found.count(mark)} 个' for mark in fill if found.count(mark) != 1]
    if wrong:
        raise SystemExit('模板里每个占位符应当恰好出现一次，现在：' + '，'.join(wrong))
    pieces[1::2] = [fill[mark] for mark in found]
    return ''.join(pieces)


def json_for_script(text):
    """让一段 JSON 可以放进 <script>。

    浏览器在脚本里遇到 </script 就认为脚本结束，遇到 <!-- 也会改变解析方式。
    这两种字样只可能出现在 JSON 的字符串里，换成等价的转义写法，数据本身不变。
    """
    return text.replace('</', '<\\/').replace('<!--', '\\u003c!--')


def make_page(data):
    """由人物数据（people.json 的内容）拼出整个页面的 HTML。"""
    rel = lambda p: str(p.relative_to(ROOT))
    title = data.get('title') if isinstance(data, dict) else None
    if not isinstance(title, str) or not title:
        raise SystemExit('人物数据里没有 title。重新运行 tools/gen_data.py。')
    tables_file = ROOT / 'data' / 'tables.json'
    if not tables_file.exists():
        raise SystemExit('找不到 data/tables.json。先运行 .venv/bin/python tools/gen_tables.py。')
    tpl_file = ROOT / 'src' / 'page.tpl.html'
    sources = {mark: ROOT / 'src' / name for mark, name in SCRIPTS.items()}
    missing = [rel(p) for p in [tpl_file, *sources.values()] if not p.exists()]
    if missing:
        raise SystemExit('找不到页面的源文件：' + '、'.join(missing))

    shipped = {k: v for k, v in data.items() if k != 'jie'}
    fill = {
        '/*DATA*/': json_for_script(json.dumps(shipped, ensure_ascii=False, separators=(',', ':'))),
        '/*TABLES*/': json_for_script(tables_file.read_text(encoding='utf-8').strip()),
        '{{TITLE}}': html.escape(title),
    }
    for mark, path in sources.items():
        text = path.read_text(encoding='utf-8')
        for bad in ('</script', '<!--'):
            if bad in text.lower():
                raise SystemExit(f'{rel(path)} 里出现了 {bad}，放进页面的 <script> 以后会让浏览器解析出错。把它拆开写，比如 "<" + "{bad[1:]}"。')
        fill[mark] = text
    return render(tpl_file.read_text(encoding='utf-8'), fill)


def main():
    unknown = [a for a in sys.argv[1:] if a != '--private']
    if unknown:
        raise SystemExit(f'不认识的参数：{unknown}。用法见文件开头的说明。')
    private = '--private' in sys.argv
    base = ROOT / 'private' if private else ROOT
    rel = lambda p: str(p.relative_to(ROOT))

    data_file = base / 'data' / 'people.json'
    if not data_file.exists():
        raise SystemExit(f'找不到 {rel(data_file)}。先运行 .venv/bin/python tools/gen_data.py' + (' --private' if private else '') + '。')
    try:
        data = json.loads(data_file.read_text(encoding='utf-8'))
    except ValueError as e:
        raise SystemExit(f'{rel(data_file)} 不是合法的 JSON：{e}')

    out = make_page(data)
    target = base / 'index.html'
    target.write_text(out, encoding='utf-8', newline='\n')
    print(f'已生成 {rel(target)}，{len(out.encode("utf-8"))} 字节')


if __name__ == '__main__':
    main()
