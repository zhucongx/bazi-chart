# 八字命盘页面

一个单文件网页，展示并解读八字命盘。可以放任意出生时间，也可以放多个人。配合学习八字理论用。

八字是一套传统的符号推演体系，没有可靠证据表明它能预测人生。页面上的解读讲的是这套体系内部怎么推演。

## 两部分

- **公开的通用部分**：排盘、页面、检查脚本，加上两个虚构的示例人物。git 管理的就是这一部分。
- **个人数据**：真实的出生信息、个人页面、手写的解读，全部放在 `private/` 里。这个目录写在 `.gitignore` 里，不会进仓库。

四柱连在一起就能反推出出生日期和时辰，所以四柱本身也算个人数据。

## 目录

```
CLAUDE.md                给 Claude Code 的项目说明：命令、工作方式、内容规则
people/*.json            示例人物的出生信息（虚构）
src/page.tpl.html        页面的结构和样式
src/engine.js            计算：干支换算、干支关系、神煞口诀
src/text.js              解释文字，按干支生成
src/ui.js                渲染和事件
data/people.json         示例人物的排盘数据，由 tools/gen_data.py 生成
data/expected.json       用 lunar_python 另算的一份事实，检查脚本拿它对照页面
data/shensha_freq.json   每个神煞的出现频率
data/shensha_check.json  神煞口诀在全部四柱组合上的结果摘要，用来对照页面里的那份实现
dist/index.html          构建出来的示例页面，直接用浏览器打开即可
tools/gen_data.py        把出生信息排成数据（需要 lunar_python）
tools/build.py           构建
tools/shensha.py         神煞口诀
tools/shensha_freq.py    统计神煞的出现频率，生成对照文件
tools/shot.py            截图
tools/check_private.py   检查个人数据有没有漏到 private/ 之外
tools/fuzz.py            随机生成一批虚构的出生时间，逐个排盘和检查
tests/check_page.js      检查
tests/facts.json         人工核对过的事实
docs/取法约定.md          采用的取法和流派分歧
docs/进度与待办.md        待办
private/                 个人数据，不入库
```

## 第一次使用

构建和检查只需要 Python 3 和 Node。

```bash
npm install
python3 tools/build.py && node tests/check_page.js
open dist/index.html
```

## 加上自己的命盘

排盘要用 lunar_python，装在虚拟环境里：

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

在 `private/people/` 里给每个人建一个 JSON 文件，比如 `private/people/me.json`：

```json
{
  "id": "me",
  "name": "我",
  "gender": "男",
  "birth": "2000-01-01 12:00",
  "place": "北京市",
  "lon": 116.4,
  "order": 1
}
```

- `birth` 是北京时间的钟表时间。`lon` 是出生地的东经度数，用来换算真太阳时。
- 可选：`"dst": true` 表示出生时间是夏令时；`"source": "出生证"` 记下时间的来源；`"expect": ["年柱","月柱","日柱","时柱"]` 用来防止改错，排出来的四柱和它不一样就报错。
- 人物按 `order` 排序。页面上有多个人时，顶部会出现切换按钮。

然后生成数据、构建、检查：

```bash
.venv/bin/python tools/gen_data.py --private
python3 tools/build.py --private && node tests/check_page.js --private
open private/dist/index.html
```

### 手写的解读

页面上的解读是按干支生成的，只讲机械的事实，不下判断。想给某张盘加上自己写的解读，在同一个目录里建 `<id>.notes.json`：

```json
{
  "read": { "pan": "<p class=\"rd-h\">解读 · 这张表怎么读</p><p>……</p>" },
  "x": { "g|年|己": [["你的盘", "……"]] },
  "rel": { "相冲子午": "……" },
  "meta": [{ "k": "月令司令", "after": "节气", "dd": "……", "t": "标题", "p": [["是什么", "……"]] }],
  "kv": [{ "k": "调候参考", "after": "印", "dd": "……", "t": "标题", "p": [["是什么", "……"]] }]
}
```

- `read`：整个顶替某个版块的解读框。可用的名字是 `pan`、`yun`、`rel`、`rel2`、`wx`、`tk`、`gods`。顶替 `yun` 时要保留 `<dl class="layers" id="layers"></dl>`。
- `x`：给某一条解释加段落。键是页面元素上的 `data-x`。标题是「你的盘」的段落会顶替生成的「这张盘」，标题相同的顶替原段落，其余的加在后面。
- `rel`：给原局的某一条干支关系加一段，键是类型加上涉及的字。
- `meta`、`kv`：在顶部信息和日主一栏里加行。

## 核对

- 排盘交给 lunar_python。页面上的十神、藏干、十二长生、空亡、纳音、大运，由检查脚本对照 lunar_python 另算的结果。
- 神煞口诀有 Python 和页面两份实现，在全部 518400 种四柱组合上逐柱对照。
- 对任意出生时间是不是都能用，靠随机检查：生成几百个虚构的出生时间，外加专挑节气交接、子时、夏令时这类边界的，逐个对照细盘并检查每一条解释。

```bash
.venv/bin/python tools/fuzz.py
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
