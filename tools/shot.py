#!/usr/bin/env python3
"""给构建好的页面截图，用来在发布前看一眼。

  .venv/bin/python tools/shot.py             截 dist/index.html，存到 shots/
  .venv/bin/python tools/shot.py --private   截 private/dist/index.html，存到 private/shots/

截五张：桌面整页、桌面打开一条解释、手机顶部、手机打开一条解释、深色。
页面上不止一个人时，再切到第二个人截一张桌面整页。
同时报告页面有没有横向溢出、有没有脚本报错。

需要：pip install playwright
浏览器：优先用本机的 Google Chrome；没有的话先运行 playwright install chromium。
也可以用环境变量 CHROME_PATH 指定浏览器的可执行文件。
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
NAMES = ['desktop.png', 'desktop_sheet.png', 'mobile_top.png', 'mobile_sheet.png', 'dark.png', 'desktop_p2.png']


def launch(p):
    exe = os.environ.get('CHROME_PATH')
    if exe:
        return p.chromium.launch(executable_path=exe, args=['--no-sandbox'])
    last = None
    for kw in ({'channel': 'chrome'}, {}):
        try:
            return p.chromium.launch(**kw)
        except Exception as e:      # 没装这个浏览器，试下一个
            last = e
    raise SystemExit(f'找不到可用的浏览器：{last}\n请安装 Google Chrome，或运行 playwright install chromium，或设置 CHROME_PATH。')


def main():
    unknown = [a for a in sys.argv[1:] if a != '--private']
    if unknown:
        raise SystemExit(f'不认识的参数：{unknown}。用法见文件开头的说明。')
    private = '--private' in sys.argv
    base = ROOT / 'private' if private else ROOT
    src = base / 'dist' / 'index.html'
    out = base / 'shots'
    if not src.exists():
        raise SystemExit(f'找不到 {src.relative_to(ROOT)}。先运行 python3 tools/build.py' + (' --private' if private else '') + '。')
    url = src.as_uri()
    out.mkdir(parents=True, exist_ok=True)
    for name in NAMES:              # 先清掉上一次的，免得这次跳过的那几张还留着旧图
        (out / name).unlink(missing_ok=True)
    msgs = []
    with sync_playwright() as p:
        b = launch(p)

        def page(w, h, scheme):
            pg = b.new_page(viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=1)
            pg.on('pageerror', lambda e: msgs.append(str(e)))
            pg.goto(url)
            pg.wait_for_timeout(1200)
            return pg

        def overflow(pg, name):
            sw, cw, sh = pg.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth, document.body.scrollHeight]')
            print(f'{name}: 宽 {cw}，内容宽 {sw}，高 {sh}' + ('  ← 有横向溢出' if sw > cw else ''))

        def click_first(pg, selector, what):
            """点页面上第一个符合 selector 的元素。没有这样的元素，或者点不到，就说一声并返回 False。"""
            found = pg.locator(selector)
            if found.count() == 0:
                print(f'{what}：页面上没有 {selector}，跳过')
                return False
            try:
                found.first.click(timeout=5000)
            except Exception as e:
                print(f'{what}：{selector} 点不到，跳过（{str(e).splitlines()[0]}）')
                return False
            return True

        pg = page(1100, 900, 'light')
        overflow(pg, '桌面')
        pg.screenshot(path=str(out / 'desktop.png'), full_page=True)
        people = pg.locator('#people button').count()
        if click_first(pg, '#rel-nz [data-x]', '桌面打开一条解释'):
            pg.wait_for_timeout(500)
            pg.screenshot(path=str(out / 'desktop_sheet.png'))
        pg.close()

        pg = page(390, 800, 'light')
        overflow(pg, '手机')
        pg.screenshot(path=str(out / 'mobile_top.png'))
        if click_first(pg, '[data-x="st|日"]', '手机打开一条解释'):
            pg.wait_for_timeout(600)
            pg.screenshot(path=str(out / 'mobile_sheet.png'))
        pg.close()

        pg = page(1100, 900, 'dark')
        pg.evaluate("() => { const el = document.getElementById('h-pan'); if (el) el.scrollIntoView(); }")
        if click_first(pg, '[data-x^="ss|"]', '深色打开一条解释'):
            pg.wait_for_timeout(500)
        pg.screenshot(path=str(out / 'dark.png'))
        pg.close()

        if people > 1:
            pg = page(1100, 900, 'light')
            if click_first(pg, '#people button >> nth=1', '切到第二个人'):
                pg.wait_for_timeout(500)
                overflow(pg, '桌面，第二个人')
                pg.screenshot(path=str(out / 'desktop_p2.png'), full_page=True)
            pg.close()
        b.close()
    print('脚本报错：', msgs or '无')
    print(f'截图在 {out}：' + '、'.join(n for n in NAMES if (out / n).exists()))


if __name__ == '__main__':
    main()
