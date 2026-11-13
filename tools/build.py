#!/usr/bin/env python3
"""把模板、脚本和数据合成一个自包含的页面。只用标准库。

  python3 tools/build.py             data/people.json → dist/index.html
  python3 tools/build.py --private   private/data/people.json → private/dist/index.html

模板 src/page.tpl.html 里有五个占位符，每个必须恰好出现一次：
  /*DATA*/     换成数据文件的内容（一段 JSON）
  /*ENGINE*/   换成 src/engine.js 的内容
  /*TEXT*/     换成 src/text.js 的内容
  /*UI*/       换成 src/ui.js 的内容
  {{TITLE}}    换成数据里的 title，做 HTML 转义

生成的 index.html 是单个文件，也是发布出去的那一页。不要手改它，改 src/ 里的文件再构建。
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = {'/*ENGINE*/': 'engine.js', '/*TEXT*/': 'text.js', '/*UI*/': 'ui.js'}


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
    sources = {mark: ROOT / 'src' / name for mark, name in SCRIPTS.items()}
    tpl_file = ROOT / 'src' / 'page.tpl.html'
    missing = [rel(p) for p in [tpl_file, *sources.values()] if not p.exists()]
    if missing:
        raise SystemExit('找不到页面的源文件：' + '、'.join(missing))

    data_text = data_file.read_text(encoding='utf-8').strip()
    try:
        data = json.loads(data_text)
    except ValueError as e:
        raise SystemExit(f'{rel(data_file)} 不是合法的 JSON：{e}')
    title = data.get('title') if isinstance(data, dict) else None
    if not isinstance(title, str) or not title:
        raise SystemExit(f'{rel(data_file)} 里没有 title。重新运行 tools/gen_data.py。')

    fill = {'/*DATA*/': json_for_script(data_text)}
    for mark, path in sources.items():
        text = path.read_text(encoding='utf-8')
        for bad in ('</script', '<!--'):
            if bad in text.lower():
                raise SystemExit(f'{rel(path)} 里出现了 {bad}，放进页面的 <script> 以后会让浏览器解析出错。把它拆开写，比如 "<" + "{bad[1:]}"。')
        fill[mark] = text
    fill['{{TITLE}}'] = html.escape(title)

    out = render(tpl_file.read_text(encoding='utf-8'), fill)
    dist = base / 'dist'
    dist.mkdir(parents=True, exist_ok=True)
    (dist / 'index.html').write_text(out, encoding='utf-8', newline='\n')
    print(f'已生成 {rel(dist / "index.html")}，{len(out.encode("utf-8"))} 字节')


if __name__ == '__main__':
    main()
