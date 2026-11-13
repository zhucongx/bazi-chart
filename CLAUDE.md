# 八字命盘页面

一个打开就能用的单文件网页：在页面上填出生时间，排出八字命盘并逐格解释，支持多个人。它是学习八字理论时配套的学习工具，不是算命产品。

用户是八字的初学者，同时是会写代码的研究者。用中文交流。说清楚改了什么、怎么核对的；不确定的地方直说，不要含糊带过。

项目分成两部分：

- **公开的通用部分**：git 管理的全部内容，发布在 GitHub 上。仓库根目录的 `index.html` 就是网页，由 GitHub Pages 直接托管。里面只有两个虚构的示例人物；使用者自己添加的人只保存在他们的浏览器里。
- **个人数据**：`private/`，写在 `.gitignore` 里，永远不入库。个人部分的说明在 `private/CLAUDE.md`，这个文件存在时先读它。

## 命令

```bash
npm install                                    # 只需一次，装 jsdom
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # 只需一次，装 lunar_python 和 playwright

.venv/bin/python tools/gen_data.py             # 重新排盘：people/*.json → data/people.json、data/expected.json
python3 tools/build.py                         # 构建公开的页面：src/ + data/ → index.html（仓库根目录）
node tests/check_page.js                       # 检查示例页面，约 15 秒；加 --quick 只要几秒
.venv/bin/python tools/shot.py                 # 截图到 shots/

# 个人页面：同样的四条命令，各加 --private，读写的都是 private/ 里的对应文件，页面是 private/index.html
.venv/bin/python tools/gen_data.py --private
python3 tools/build.py --private
node tests/check_page.js --private
.venv/bin/python tools/shot.py --private

python3 tools/check_private.py                 # 检查个人数据有没有漏到 private/ 之外
.venv/bin/python tools/fuzz.py                 # 随机生成几百个虚构的出生时间，逐个排盘、对照、检查解释，约 10 秒
.venv/bin/python tools/shensha_freq.py         # 重算神煞频率和对照文件，约 1 分钟；加 --check-only 只生成对照文件
.venv/bin/python tools/gen_tables.py           # 重新导出节气时刻表和农历表 data/tables.json，约半分钟；一般不用重跑
```

## 个人数据的规矩

1. 真实的出生信息、四柱、个人页面、手写解读、artifact 链接，只能出现在 `private/` 里。不要把它们写进其他任何文件，也不要写进提交信息、示例、测试数据。四柱连在一起就能反推出出生日期和时辰，所以四柱本身也算个人数据。
2. 提交之前运行 `python3 tools/check_private.py`，有命中就不提交。
3. 公开部分的示例和测试只用虚构的人物。
4. 截图里有个人页面时，只存到 `private/shots/`。

## 工作方式

- 页面的源文件在 `src/`：`page.tpl.html`（结构和样式）、`engine.js`（干支计算）、`chart.js`（页面内排盘）、`text.js`（解释文字）、`ui.js`（渲染、事件、人物管理）。`index.html` 和 `private/index.html` 是构建产物，不要手改。
- 公开的页面发布在 <https://zhucongx.github.io/bazi-chart/>，由 GitHub Pages 从 `main` 分支的根目录托管，推送之后一两分钟生效。改了 `src/` 之后要重新构建并把 `index.html` 一起提交，否则线上还是旧的页面。
- 每次改动之后：两份页面都构建、都跑检查，运行 `tools/fuzz.py` 和 `tools/check_private.py`，截图看一眼桌面、手机、深色三种情况，然后才说完成。检查没过就不算完成。
- 改了取法，同步更新 `docs/取法约定.md`。改了某个人的事实，同步更新对应的 `tests/facts.json`（个人的在 `private/tests/facts.json`）。
- 用户要看效果时，把个人页面 `private/index.html` 发布成 artifact，链接记在 `private/CLAUDE.md` 里，之后的改动发布到同一个链接。公开的页面通过 GitHub Pages 发布，不发布成 artifact，除非用户要求。
- 页面必须是单个自包含文件。外部资源只允许 Google Fonts 的字体，其他样式、脚本、数据、图片全部内联。
- 做 `docs/进度与待办.md` 里的待办之前先问用户要哪一项，不要自己挑着做。
- 提交和推送都等用户开口。

## 内容规则

这部分比功能重要。写解读文字、加新面板时必须遵守。

1. **如实交代这套体系的地位。** 八字是传统的符号推演体系，没有可靠证据表明它能预测人生。解读写成「传统上读作……」，不写成事实，不做预测，不说哪一年会发生什么。
2. **只讲干支之间的结构，不落到具体的人和事。** 宫位的名称（年柱祖辈、月柱父母等）只作为分类习惯介绍，页面上已经有了；不据此对任何具体的人下判断，也不把十神对应到具体亲属。不对健康、疾病、寿命、婚姻成败、灾祸做任何推断。旧书里的这类断语可以作为旧说介绍，但不套在具体的盘上。
3. **公开部分的解读只写机械的事实。** `src/text.js` 生成的文字只陈述能从干支算出来的东西：个数、位置、谁生谁克、有没有根。日主强弱的结论、格局的名称这类带判断的话，不自动生成，只能来自某个人的手写解读（`<id>.notes.json`）。生成的文字用第三人称，说「这张盘」，不说「你」。
4. **个人经历由用户决定。** 不主动往页面里写任何人的个人经历。大事记这类功能，内容必须由用户明确给出。
5. **流派分歧要标出来。** 页面采用了某一派的取法时，在解释里注明还有别的说法，并记进 `docs/取法约定.md`。
6. **口诀和数字要用代码核对。** 新增任何口诀、对照表、统计数字，都要写脚本验证，不能凭记忆写进页面。现有的例子：页面内的排盘照搬 lunar_python，由检查脚本和随机检查逐项对照；节气时刻表和农历表从 lunar_python 导出并逐项核对；页面的十神、藏干、十二长生、空亡、纳音对照 lunar_python 另算的结果；神煞口诀的两份实现在全部四柱组合上逐柱对照。找不到可核对来源的内容不进公开部分，记在 `docs/取法约定.md` 的最后一节。
7. **文字。** 简体中文，白话，短句。不用未经解释的缩写和简称：写「食神和伤官」，不写「食伤」；写「比肩和劫财」，不写「比劫」。术语第一次出现时解释。不用破折号插入语，不用「不是……而是……」的句式。

## 页面结构

- 从上到下：顶部的人物切换和「＋ 添加」（点开是填出生信息的表单），顶部信息，四柱细盘（前两列是选中的流年和大运），大运、流年、流月、流日四行选择器，干支关系（原局一组，四层各自带来的各一组），五行，日主，十神对照。
- 页面自带的人在 `DATA.people` 里，是构建时由 lunar_python 排好的：出生信息、真太阳时、四柱、大运、可选的 `notes`。字段说明在 `tools/gen_data.py` 的开头。
- 使用者在页面上添加或导入的人，只把出生信息存在 localStorage 的 `bz-people` 里，每次打开由 `chart.js` 的 `chartOf(出生信息)` 现排，得到和 `DATA.people` 里同样字段的对象。两者合在一起是 `PEOPLE`。读写 localStorage 都包在 try/catch 里，存不了时页面照常能用并给出提示。
- `chartOf` 的结果必须和 `tools/gen_data.py` 逐项相同。改其中一个，另一个要一起改，再跑 `tools/fuzz.py`。节气和农历来自 `TABLES`（`data/tables.json`）。
- 导入的手写解读会经过 `cleanHTML` 过滤，只留排版用的标签。页面自带的 `notes` 是构建时写进去的，不过滤。
- 换人由 `usePerson(i)` 完成，`i` 是 `PEOPLE` 里的下标：它设置当前的人 `P`、日主 `DM`、原局四柱 `NATAL`、神煞 `SHENSHA`，然后调用 `renderPerson()` 重画全部内容。
- 每个版块有一个 `.read` 解读框，内容由 `text.js` 里的 `readPan()` 等函数生成，`notes.read` 里有手写的就用手写的。右上角的开关通过 `<html data-read="off">` 隐藏它们，状态存在 localStorage 的 `bz-read` 里，读写都包在 try/catch 里。
- 可点的元素都带 `data-x="类型|参数…"`。`X(key)` 返回 `{t: 标题, p: [[小标题, 文字], …]}`，由 `openSheet` 显示在底部的 `#sheet`。新增可点元素时沿用这套机制，并在 `text.js` 的 `X0()` 里补上对应的分支。
- 干支关系由 `relations(cols)` 计算。每一柱的 `layer` 表示来源：原局 0，大运 1，流年 2，流月 3，流日 4。每一层只列它新带来的关系。
- 神煞由 `shenshaOf(pillars, nayin)` 计算，同时给出每个神煞落在这一柱的原因。改口诀时 `tools/shensha.py` 要一起改，再重跑 `tools/shensha_freq.py`。
- 状态都在 `sel` 对象里（选中的人、大运、年、月、日，以及打开的解释）。选择变了就重新渲染对应的部分，最后调用 `refreshSheet()`。
- 颜色和字体都走 `:root` 里的变量。页面跟随查看者的浅色或深色主题，所以新增颜色要在三个地方都定义：`:root`、`@media (prefers-color-scheme: dark)` 里的 `:root:not([data-theme="light"])`、`:root[data-theme="dark"]`。
- 视觉方向：素净的纸面感。宋体只用在干支大字和面板标题上，正文用系统无衬线字体。五行固定五种颜色。不加装饰。

## 参考

- 采用的取法和流派分歧：`docs/取法约定.md`
- 待办：`docs/进度与待办.md`
- 出生信息文件和手写解读的格式：`README.md`
