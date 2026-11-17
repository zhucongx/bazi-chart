#!/usr/bin/env python3
"""由 src/icon.svg 生成页面图标的两张 PNG。改了 src/icon.svg 之后跑一遍，再构建。

  .venv/bin/python tools/gen_icon.py

  src/icon-32.png    浏览器标签用的后备图，32 像素，八边形外面透明。认 SVG 图标的浏览器用不到它
  src/icon-180.png   苹果设备「添加到主屏幕」用，180 像素。系统自己切圆角，所以整张垫白底，
                     八卦缩到 84% 放在正中，四个角切掉也碰不到图

三样都由 tools/build.py 内联进页面，页面仍然是单个文件。需要 playwright（见 requirements.txt）。
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault('PW_TEST_SCREENSHOT_NO_FONTS_READY', '1')

TOUCH_SCALE = 0.84      # 180 像素那张里八卦占的比例
CSS = '<style>body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>'


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
    raise SystemExit(f'找不到能用的浏览器：{last}。装了 Google Chrome，或者先运行 playwright install chromium。')


def html(svg, size, scale=1, ground='transparent'):
    inner = round(size * scale)
    pad = (size - inner) / 2
    return (f'{CSS}<div style="width:{size}px;height:{size}px;box-sizing:border-box;padding:{pad}px;background:{ground}">'
            f'<div style="width:{inner}px;height:{inner}px">{svg}</div></div>')


def main():
    svg = (ROOT / 'src' / 'icon.svg').read_text(encoding='utf-8')
    if 'viewBox="0 0 64 64"' not in svg:
        raise SystemExit('src/icon.svg 的 viewBox 不是 0 0 64 64。')
    jobs = (('icon-32.png', 32, html(svg, 32)),
            ('icon-180.png', 180, html(svg, 180, TOUCH_SCALE, '#fff')))
    with sync_playwright() as p:
        browser = launch(p)
        for name, size, text in jobs:
            page = browser.new_page(viewport={'width': size, 'height': size})
            page.set_content(text)
            page.wait_for_timeout(100)
            target = ROOT / 'src' / name
            page.screenshot(path=str(target), omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
            page.close()
            print(f'已生成 {target.relative_to(ROOT)}，{target.stat().st_size} 字节')
        browser.close()


if __name__ == '__main__':
    sys.exit(main())
