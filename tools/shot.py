#!/usr/bin/env python3
"""给构建好的页面截图，用来在发布前看一眼。

  .venv/bin/python tools/shot.py             截 index.html，存到 shots/
  .venv/bin/python tools/shot.py --private   截 private/build/index.html，存到 private/build/shots/

页面上有两张带标签栏的卡片，一次只显示一页，所以每个标签页都要点开来截：
桌面整页（两张卡片都在第一页）、桌面上十二个标签页各一张（tab_名字.png）、桌面打开一条解释、
手机顶部、手机上十二个标签页各一张（m_tab_名字.png）、手机打开一条解释、手机上的添加表单、深色。
页面上不止一个人时，再切到第二个人截一张桌面整页。
同时报告每一页有没有横向溢出、有没有脚本报错，有没有点不到的字：能点开解释的每一处，用真的浏览器看它的正中点下去是不是它自己，
被别的东西盖住的列出来。检查脚本用的 jsdom 不排版，查不出这一类（2026-11-22 关系图的圈就这样被名字那一层盖住过）。

页面用了 Google 的网络字体。取不到的时候不等它，照样截图，这时图里是系统自带的宋体。

需要：pip install playwright
浏览器：优先用本机的 Google Chrome；没有的话先运行 playwright install chromium。
也可以用环境变量 CHROME_PATH 指定浏览器的可执行文件。
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault('PW_TEST_SCREENSHOT_NO_FONTS_READY', '1')     # 截图时不等网络字体，取不到字体也不会卡住
TABS = [('card-natal', ['bz', 'tk', 'wx', 'qr', 'gods', 'gj', 'ys', 'lq']), ('card-pan', ['pan', 'rel', 'gt', 'sy'])]      # 两张卡片各自的标签，和 src/ui.js 的 TABS 相同
TAB_SHOTS = [f'{pre}tab_{t}.png' for pre in ('', 'm_') for _, ts in TABS for t in ts]
NAMES = ['desktop.png', 'desktop_sheet.png', 'mobile_top.png', 'mobile_sheet.png', 'mobile_form.png', 'dark.png', 'desktop_p2.png'] + TAB_SHOTS


# 能点开解释的每一处（data-x），看得见的，正中那一点点下去是不是它自己。窗口开得很高，不用滚动；横条和表格里没露出来的不算
HIT = '''() => {
  const bad = [];
  document.querySelectorAll('[data-x]').forEach(el => {
    const box = el.classList.contains('nd') ? el.querySelector('.ring') : el, r = box.getClientRects()[0];
    if (!r || r.width < 1 || r.height < 1) return;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    for (let n = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n), b = n.getBoundingClientRect();
      if (s.overflowX !== 'visible' && (x < b.left || x > b.right)) return;
    }
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !el.contains(hit)) bad.push(el.dataset.x + ' 被 ' + (hit ? (hit.getAttribute('class') || hit.tagName) : '空白') + ' 盖住');
  });
  return bad;
}'''


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
    base = ROOT / 'private' / 'build' if private else ROOT
    src = base / 'index.html'
    out = base / 'shots'
    if not src.exists():
        raise SystemExit(f'找不到 {src.relative_to(ROOT)}。先运行 python3 tools/build.py' + (' --private' if private else '') + '。')
    url = src.as_uri()
    out.mkdir(parents=True, exist_ok=True)
    for name in NAMES:              # 先清掉上一次的，免得这次跳过的那几张还留着旧图
        (out / name).unlink(missing_ok=True)
    msgs, slow = [], []
    with sync_playwright() as p:
        b = launch(p)

        def page(w, h, scheme):
            pg = b.new_page(viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=1, reduced_motion='reduce')      # 小动画不做，免得截在半路上
            pg.on('pageerror', lambda e: msgs.append(str(e)))
            try:
                pg.goto(url, timeout=15000)
            except Exception:           # 多半是网络字体迟迟取不到。页面本身已经在了，接着截
                if not slow:
                    print('网络字体没有及时取到，图里可能是系统自带的字体')
                slow.append(1)
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

        def each_tab(pg, pre, where):
            """把每个标签页点开，截那张卡片，报告有没有横向溢出。最后翻回各自的第一页。"""
            for card, tabs in TABS:
                for t in tabs:
                    if not click_first(pg, f'#h-{t}', f'{where}翻到标签 {t}'):
                        continue
                    pg.wait_for_timeout(200)
                    sw, cw = pg.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
                    if sw > cw:
                        print(f'{where}，标签 {t}: 宽 {cw}，内容宽 {sw}  ← 有横向溢出')
                    pg.locator(f'#{card}').screenshot(path=str(out / f'{pre}tab_{t}.png'))
                    size = pg.viewport_size
                    pg.set_viewport_size({'width': size['width'], 'height': 9000})
                    bad = pg.evaluate(HIT)
                    if bad:
                        print(f'{where}，标签 {t}: {len(bad)} 处点不到，比如 {bad[0]}')
                    pg.set_viewport_size(size)
                click_first(pg, f'#h-{tabs[0]}', f'{where}翻回第一页')

        pg = page(1440, 900, 'light')
        overflow(pg, '桌面')
        pg.screenshot(path=str(out / 'desktop.png'), full_page=True)
        people = pg.locator('#people [data-p]').count()
        each_tab(pg, '', '桌面')
        if click_first(pg, '#h-rel', '桌面翻到干支关系') and click_first(pg, '#lkmap [data-x]', '桌面打开一条解释'):
            pg.wait_for_timeout(500)
            pg.screenshot(path=str(out / 'desktop_sheet.png'))
        pg.close()

        pg = page(390, 800, 'light')
        overflow(pg, '手机')
        pg.screenshot(path=str(out / 'mobile_top.png'))
        each_tab(pg, 'm_', '手机')
        if click_first(pg, '[data-x="st|日"]', '手机打开一条解释'):
            pg.wait_for_timeout(600)
            pg.screenshot(path=str(out / 'mobile_sheet.png'))
        pg.close()

        pg = page(390, 800, 'light')
        if click_first(pg, '#pp-add', '手机打开添加表单'):
            pg.wait_for_timeout(400)
            overflow(pg, '手机，添加表单')
            pg.screenshot(path=str(out / 'mobile_form.png'))
        pg.close()

        pg = page(1440, 900, 'dark')
        pg.evaluate("() => { const el = document.getElementById('h-pan'); if (el) el.scrollIntoView(); }")
        if click_first(pg, '[data-x^="ss|"]', '深色打开一条解释'):
            pg.wait_for_timeout(500)
        pg.screenshot(path=str(out / 'dark.png'))
        pg.close()

        if people > 1:
            pg = page(1440, 900, 'light')
            if click_first(pg, '#people [data-p] >> nth=1', '切到第二个人'):
                pg.wait_for_timeout(500)
                overflow(pg, '桌面，第二个人')
                pg.screenshot(path=str(out / 'desktop_p2.png'), full_page=True)
            pg.close()
        b.close()
    print('脚本报错：', msgs or '无')
    print(f'截图在 {out}：' + '、'.join(n for n in NAMES if (out / n).exists()))


if __name__ == '__main__':
    main()
