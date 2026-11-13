# 八字命盘页面

一个打开就能用的网页：填上出生时间，排出八字命盘，并且解释盘上每一格是怎么推出来的。配合学习八字理论用。

八字是一套传统的符号推演体系，没有可靠证据表明它能预测人生。页面上的解读讲的是这套体系内部怎么推演，不做预测。

## 怎么用

在线地址：<https://zhucongx.github.io/bazi-chart/>

仓库根目录的 `index.html` 就是整个网页，只有这一个文件。打开上面的地址，或者把这个文件下载下来用浏览器直接打开，都可以用，不需要安装任何东西。

- 页面自带三位历史人物作示例：康熙帝、曾国藩、孙中山。他们的出生日期和时辰取自史料，点顶部信息里的「公历」可以看到出处。页面对他们只排盘、讲干支结构，不作评价。
- 点顶部的「＋ 添加」，填上称呼、性别、出生日期和时间、出生地的经度，保存之后就是一张新的盘。只知道时辰的，可以只选时辰。可以添加多个人，在顶部切换。
- 填的内容只保存在你自己的浏览器里，不会上传到任何地方。换一个浏览器或清空浏览器数据之后就没有了，所以表单里有「导出」和「导入文件」，可以把添加的人存成文件、再读回来。
- 排盘在浏览器里完成，支持 1900 到 2100 年、按北京时间记录的出生时间。
- 带虚线的字都可以点，盘上的干支和每一条合冲刑害也可以点，解释就出现在所点的字旁边。
- 解释里标着「典籍」的段落引的是古书原文，出处有《滴天髓》《穷通宝鉴》《渊海子平》《子平真诠》《三命通会》《协纪辨方书》《神峰通考》。「日主」一栏里的「格局参考」「调候参考」两行，分别照《子平真诠》和《穷通宝鉴》的办法列出这张盘归哪一类、书里点到哪几个字，都附原文，不下结论。

## 两部分

- **公开的通用部分**：网页本身、排盘和检查用的脚本，加上几位历史人物的示例。git 管理的就是这一部分。
- **个人数据**：真实的出生信息、手写的解读、带着这些内容构建出来的个人页面，全部放在 `private/` 里。这个目录写在 `.gitignore` 里，不会进仓库。

四柱连在一起就能反推出出生日期和时辰，所以四柱本身也算个人数据。

## 手写的解读

页面上的解读是按干支生成的，只讲机械的事实，不下判断。想给某张盘加上自己写的解读，有两个办法。

**导入文件。** 准备一个 JSON 文件，写上出生信息和 `notes`，在页面的表单里点「导入文件」：

```json
{
  "name": "我",
  "gender": "男",
  "birth": "2000-01-01 12:00",
  "place": "北京市",
  "lon": 116.4,
  "notes": {
    "read": { "pan": "<p class=\"rd-h\">解读 · 这张表怎么读</p><p>……</p>" },
    "x": { "g|年|己": [["你的盘", "……"]] },
    "rel": { "相冲子午": "……" },
    "meta": [{ "k": "月令司令", "after": "节气", "dd": "……", "t": "标题", "p": [["是什么", "……"]] }],
    "kv": [{ "k": "调候参考", "after": "印", "dd": "……", "t": "标题", "p": [["是什么", "……"]] }]
  }
}
```

- `birth` 是北京时间的钟表时间。`lon` 是出生地的东经度数，用来换算真太阳时。可选的还有 `"dst": true`（出生时间是夏令时）和 `"source": "出生证"`（时间的来源）。
- 只知道时辰的，`birth` 只写日期，另外写 `"shichen": "巳"`，不用写 `lon`。这时取这个时辰的中点来排。
- `read`：整个顶替某个版块的解读框。可用的名字是 `pan`、`yun`、`rel`、`rel2`、`wx`、`tk`、`gods`。顶替 `yun` 时要保留 `<dl class="layers" id="layers"></dl>`。
- `x`：给某一条解释加段落。键是页面元素上的 `data-x`。标题是「你的盘」的段落会顶替生成的「这张盘」，标题相同的顶替原段落，其余的加在后面。
- `rel`：给原局的某一条干支关系加一段，键是类型加上涉及的字。
- `meta`、`kv`：在顶部信息和日主一栏里加行。行名和页面生成的某一行相同时（比如「调候参考」），手写的顶替生成的；手写的没有「典籍」一段时，生成的那一段原文会留下。
- 导入时，手写解读里只保留排版用的标签，脚本一类的内容会被去掉。

**构建个人页面。** 把出生信息放在 `private/people/<id>.json`，手写解读放在同一个目录的 `<id>.notes.json`（内容就是上面的 `notes`），然后：

```bash
.venv/bin/python tools/gen_data.py --private
python3 tools/build.py --private && node tests/check_page.js --private
open private/index.html
```

这样得到的 `private/index.html` 自带这些人和解读，不依赖浏览器里保存的数据。`gen_data.py` 生成的 `private/data/people.json` 也可以直接用「导入文件」读进在线的页面。

## 目录

```
index.html               构建出来的网页，GitHub Pages 发布的就是它
src/page.tpl.html        页面的结构和样式
src/engine.js            计算：干支换算、干支关系、神煞口诀
src/chart.js             页面内排盘：由出生信息算出四柱、真太阳时、大运等
src/classics.js          从典籍里摘出来的引文，每一句都登记了出处
src/text.js              解释文字，按干支生成
src/ui.js                渲染、事件、添加和导入人物
people/*.json            示例人物的出生信息（历史人物，写明出处）
data/people.json         示例人物的排盘数据，由 tools/gen_data.py 用 lunar_python 生成
data/expected.json       用 lunar_python 另算的一份事实，检查脚本拿它对照页面
data/tables.json         节气时刻表和农历表，由 tools/gen_tables.py 从 lunar_python 导出
data/shensha_freq.json   每个神煞的出现频率
data/shensha_check.json  神煞口诀在全部四柱组合上的结果摘要，用来对照页面里的那份实现
data/quotes_check.json   典籍引文的核对结果：日期、出处的页面和版本号、校验值
tools/build.py           构建
tools/gen_data.py        把出生信息排成数据（需要 lunar_python）
tools/gen_tables.py      导出节气时刻表和农历表（需要 lunar_python）
tools/shensha.py         神煞口诀
tools/shensha_freq.py    统计神煞的出现频率，生成对照文件
tools/check_quotes.js    把典籍的出处抓下来，核对每一句引文都逐字出现在原文里（要联网）
tools/fuzz.py            随机生成一批虚构的出生时间，逐个排盘和检查
tools/shot.py            截图
tools/check_private.py   检查个人数据有没有漏到 private/ 之外
tests/check_page.js      检查
tests/facts.json         人工核对过的事实
docs/取法约定.md          采用的取法和流派分歧
docs/进度与待办.md        待办
private/                 个人数据，不入库
```

## 改页面

构建和检查只需要 Python 3 和 Node：

```bash
npm install
python3 tools/build.py && node tests/check_page.js
open index.html
```

改了 `src/` 之后要重新构建，并把根目录的 `index.html` 一起提交，GitHub Pages 上的页面才会更新。

重新排盘、导出对照表、随机检查、截图要用 lunar_python 和 playwright，装在虚拟环境里：

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## 核对

- 页面内的排盘（`src/chart.js`）照搬 lunar_python 的算法。检查脚本让页面由出生信息重新排一遍，把四柱、真太阳时、农历、前后节气、胎元、命宫、身宫、起运、大运等 18 项结果和 lunar_python 排出来的逐项对照。
- 节气时刻表和农历表导出时逐项核对：三千多个节气时刻，以及 1900 到 2100 年每一天的农历日期。
- 页面上的十神、藏干、十二长生、空亡、纳音，对照 lunar_python 另算的结果。
- 神煞口诀有 Python 和页面两份实现，在全部 518400 种四柱组合上逐柱对照。
- 典籍的引文集中在 `src/classics.js`，一共两百多句。`tools/check_quotes.js` 把每个出处的页面抓下来，核对每一句都逐字出现在原文里。页面检查会对照核对结果，改了引文而没有重新核对就通不过。
- 神煞的口诀除了两份实现互相对照，还和引的原文对照：检查脚本把原文当口诀解出来，和页面用的表逐项比。各书不一样的地方记在 `docs/取法约定.md` 里。
- 对任意出生时间是不是都能用，靠随机检查：生成几百个虚构的出生时间，外加专挑节气交接、子时、夏令时这类边界的，逐个做上面的对照，并检查每一条解释。

```bash
.venv/bin/python tools/fuzz.py
```

改了 `src/classics.js` 里的引文之后，重新核对（要联网，约半分钟）：

```bash
node tools/check_quotes.js
```

重新统计神煞的出现频率、重新生成对照文件：

```bash
.venv/bin/python tools/shensha_freq.py
```

## 提交之前

```bash
python3 tools/check_private.py
```

它会从 `private/` 里取出出生日期、四柱、出生地，检查这些内容有没有出现在 `private/` 之外的文件里。
