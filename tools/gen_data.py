#!/usr/bin/env python3
"""把出生信息排成页面要用的数据。排盘全部交给 lunar_python。

用法（需要 lunar_python，用虚拟环境里的 Python 跑）：
  .venv/bin/python tools/gen_data.py             读 people/*.json，写 data/people.json 和 data/expected.json
  .venv/bin/python tools/gen_data.py --private   读 private/people/*.json，写 private/build/data/ 下的同名文件

people.json 是页面的数据。expected.json 是用 lunar_python 自己的方法另算的一份事实，
检查脚本拿它对照页面，所以它不能从页面的算法推出来。

出生信息文件，每人一个：
  { "id": "example-a", "name": "示例甲", "gender": "男", "birth": "2000-01-01 12:00",
    "place": "北京市", "lon": 116.4, "order": 1 }
  只记到时辰的（比如史料里的古人），birth 只写日期，另外写 "shichen": "巳"，不用写 lon：
  { "id": "…", "name": "…", "gender": "男", "birth": "1654-05-04", "shichen": "巳", "place": "…", "order": 1 }
  这时取这个时辰的中点，直接当作真太阳时来排，不做经度和均时差的换算；子时取零点。
  生在国外、记录的是当地钟表时间的，birth 写当地时间，另外写 tz（2026-11-17 加示例里的外国人时加的）：
  { "id": "…", "name": "…", "gender": "男", "birth": "1955-02-24 19:15", "tz": -8, "tzName": "太平洋标准时间",
    "place": "…", "lon": -122.42, "order": 1 }
    "tz"       当地钟表比世界时快几小时（西边是负数，夏令时直接算进去），或者 "lmt"，表示按出生地经度定的当地平太阳时
    "tzName"   当地时间的名字，页面上显示
  这时先把当地时间换成北京时间，再和别人一样按北京时间加经度排；页面上显示的是当地时间。写了 tz 就不写 shichen 和 dst。
  可选字段：
    "dst": true                           出生时间是夏令时，先减一小时
    "expectLunar": "甲午年三月十八"        由公历换算出来的农历必须等于它，否则报错退出（史料多记农历，用它防止换算错）
    "source": "出生证"                    出生时间的来源
    "memo": "……"                         给自己看的备注，不进页面
    "expect": ["年柱","月柱","日柱","时柱"]  排出来的四柱必须等于它，否则报错退出
    "expectYunStart": "YYYY-MM-DD"        起运日期必须等于它，否则报错退出
    "expectTst": "YYYY-MM-DD HH:MM:SS"    真太阳时必须等于它，否则报错退出
  同一个目录下如果有 <id>.notes.json，它的内容原样放进这个人的 notes 字段。
  同一个目录下的 <id>.facts.json 是人工核对过的事实，给检查脚本用，这里不读。三种文件的格式见 docs/数据格式.md。
  人物按 order 排序，order 相同的按 id 排序。

people.json 的字段（写成紧凑的一行 JSON）：
  title    只有一个人时是「<日柱>日命盘」，否则是「八字命盘」
  nayin    {干支: 纳音}，六十甲子
  jie      {"年份": [十二个 "月/日"]}，每年十二个节的公历日期，从立春到次年一月的小寒。
           年份从最早的一步大运开始，到最晚的一步大运结束的下一年
  freq     data/shensha_freq.json 的内容，{神煞: 出现在百分之多少的盘里}
  people   排好序的人物，每个人：
    id、name
    gender         1 男，0 女
    clock          [年,月,日,时,分,秒]，钟表时间（北京时间），夏令时已经减掉
    dst            true。只有减过夏令时才有这个字段
    localClock、tz、tzName   只有写了 tz 的人才有：localClock 是记录里的当地钟表时间 [年,月,日,时,分,秒]，tz、tzName 照抄出生信息文件；
                   clock 是它换成的北京时间
    source         出生时间的来源。没写就没有这个字段
    place、lon     出生地和经度
    dlonSec        经度修正，秒
    eotSec         均时差，秒
    tst            [年,月,日,时,分,秒]，真太阳时，等于 clock 加上面两项
    lunar          真太阳时那一刻的农历：{year: 农历年的干支（以正月初一为界）, month: 月（比如「腊」，
                   闰月带「闰」字，比如「闰四」）, day: 日（比如「初二」）, leap: 是不是闰月}
    xingzuo        星座，按真太阳时的日期
    pillars        [年柱,月柱,日柱,时柱]，按真太阳时
    pillarsClock   按钟表时间排的四柱，用来对比
    prevJie        真太阳时之前最近的节：{name: 节名, at: [年,月,日,时,分,秒], min: 从这个节到真太阳时的整分钟数}
    nextJie        真太阳时之后最近的节，min 是从真太阳时到这个节的整分钟数
    taiyuan、minggong、shengong、taixi   胎元、命宫、身宫、胎息
    yun            起运：{forward: 是不是顺排, y、m、d、h: 折合成几年几个月几天几小时, start: [年,月,日] 起运的公历日期,
                   jie: 数到的那个节, gapMin: 钟表时间和这个节相隔的分钟数}。
                   gapMin 照 lunar_python 的算法，两头都先舍去秒；每 4320 分钟折一年，360 分钟折一个月，12 分钟折一天
    dayun          八步大运，每步 {gz: 干支, y0、y1: 起止年份, a0、a1: 起止虚岁}
    notes          <id>.notes.json 的内容。没有这个文件就没有这个字段

expected.json 的字段，{id: {…}}，每个人：
  pillars   四柱
  zhuxing   四柱天干的十神，日柱写「日主」
  canggan   四柱地支的藏干和它们的十神，每柱是 [[藏干, 十神], …]，本气排第一
  xingyun   日干在四个地支上的十二长生
  zizuo     每柱的天干在自己地支上的十二长生
  xunkong   四柱各自所在的旬的空亡
  nayin     四柱的纳音
  dayun     八步大运的干支
  wuxing    {all: [木,火,土,金,水] 的个数，数四个天干和全部藏干, face: 只数盘面八个字，地支按本身的五行}
  shensha   四柱各自的神煞，用 tools/shensha.py 的口诀算，按字符编码排序

取法：
- birth 是北京时间（东八区）的钟表时间。写了 "dst": true 就先减 1 小时。
  1986 到 1991 年中国实行过夏令时，这几年 4 到 9 月出生而没写 dst 字段的，会打印提醒。
- 真太阳时 = 钟表时间 + 经度修正 + 均时差。
  经度修正 =（经度 − 120）× 240 秒。
  均时差用 Meeus《Astronomical Algorithms》第 28 章的式 (28.3)，也就是 Smart 的公式，
  黄赤交角取平黄赤交角，时刻取出生那一刻（钟表时间减 8 小时，当作世界时）。
  两项各自四舍五入到整秒，再加到钟表时间上。
  这条公式是近似式，和严格算法相比最多差 4 秒左右，平均差 1 秒多。
- 四柱按真太阳时取，用 lunar_python 默认的取法：年以立春为界，月以节为界，日以零点为界。
  23 点以后出生的，日柱仍算当天，时柱的天干按第二天的子时取。另有子初就换日的说法。
  另外按钟表时间也排一遍，放在 pillarsClock。节气的时刻是北京时间，所以出生时间离节气
  交接很近时，两种排法的年柱或月柱可能不同，这时会打印提醒。
- 大运按钟表时间取，getYun(gender, 2)：从出生数到节的分钟数，4320 分钟（三天）折一年。
  阳年男、阴年女顺排，数到下一个节；阴年男、阳年女逆排，数到上一个节。
- 十二长生按阳干顺行、阴干逆行，土跟着火走。别的流派有阴干也顺行、土跟着水走的说法。
"""
import datetime
import json
import math
import sys
from pathlib import Path

from lunar_python import Solar
from lunar_python.util import LunarUtil

from shensha import shensha

ROOT = Path(__file__).resolve().parent.parent

G = '甲乙丙丁戊己庚辛壬癸'
Z = '子丑寅卯辰巳午未申酉戌亥'
JIA_ZI = [G[i % 10] + Z[i % 12] for i in range(60)]
JIE = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒']
WU_XING = '木火土金水'
ZHI_WU_XING = dict(zip(Z, '水土木木土火火土金金土水'))                  # 地支本身的五行
CHANG_SHENG = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养']
CHANG_SHENG_AT = dict(zip('甲丙戊庚壬乙丁己辛癸', '亥寅寅巳申午酉酉子卯'))  # 每个天干的长生落在哪个地支
J2000 = datetime.datetime(2000, 1, 1, 12)

REQUIRED = ['id', 'name', 'gender', 'birth', 'place', 'order']       # 另外，没写 shichen 的必须有 lon
OPTIONAL = ['lon', 'shichen', 'dst', 'tz', 'tzName', 'source', 'expect', 'expectYunStart', 'expectTst', 'expectLunar', 'memo']   # memo 是给自己看的备注，不进页面


# ---- 真太阳时 ------------------------------------------------------------------

def equation_of_time(jd):
    """均时差，单位秒。真太阳时 = 平太阳时 + 均时差。jd 是儒略日。

    Meeus《Astronomical Algorithms》第 2 版第 28 章的式 (28.3)。平黄经、平近点角、偏心率
    的表达式出自同一本书的第 25 章，平黄赤交角出自第 22 章。
    书里的时刻是力学时，这里直接用世界时。两者相差一分钟左右，对结果的影响不到 0.02 秒。
    """
    t = (jd - 2451545.0) / 36525
    l0 = math.radians(280.46646 + 36000.76983 * t + 0.0003032 * t * t)        # 太阳的平黄经
    m = math.radians(357.52911 + 35999.05029 * t - 0.0001537 * t * t)         # 太阳的平近点角
    e = 0.016708634 - 0.000042037 * t - 0.0000001267 * t * t                  # 地球轨道的偏心率
    eps = math.radians(23 + 26 / 60 + (21.448 - 46.8150 * t - 0.00059 * t * t + 0.001813 * t ** 3) / 3600)  # 平黄赤交角
    y = math.tan(eps / 2) ** 2
    rad = (y * math.sin(2 * l0) - 2 * e * math.sin(m) + 4 * e * y * math.sin(m) * math.cos(2 * l0)
           - 0.5 * y * y * math.sin(4 * l0) - 1.25 * e * e * math.sin(2 * m))
    return math.degrees(rad) * 240      # 1 度合 240 秒


def round_half_up(x):
    """四舍五入到整数，负数按绝对值算（−2.5 得 −3）。"""
    return int(math.copysign(math.floor(abs(x) + 0.5), x))


def true_solar_time(clock, lon):
    """由北京时间和经度算真太阳时。返回 (经度修正秒数, 均时差秒数, 真太阳时)。"""
    dlon = round_half_up((lon - 120) * 240)
    ut = clock - datetime.timedelta(hours=8)
    eot = round_half_up(equation_of_time(2451545.0 + (ut - J2000).total_seconds() / 86400))
    return dlon, eot, clock + datetime.timedelta(seconds=dlon + eot)


# ---- 小工具 --------------------------------------------------------------------

def six(t):
    return [t.year, t.month, t.day, t.hour, t.minute, t.second]


def solar_of(t):
    return Solar.fromYmdHms(*six(t))


def time_of(solar):
    return datetime.datetime(solar.getYear(), solar.getMonth(), solar.getDay(),
                             solar.getHour(), solar.getMinute(), solar.getSecond())


def whole_minutes(a, b):
    """从 a 到 b 相隔的整分钟数，向下取整。"""
    return int((b - a).total_seconds() // 60)


def span(minutes):
    d, rest = divmod(minutes, 1440)
    return f'{d} 天 {rest // 60} 小时 {rest % 60} 分钟'


def chang_sheng(gan, zhi):
    """天干 gan 在地支 zhi 上的十二长生。阳干顺行，阴干逆行。"""
    step = Z.index(zhi) - Z.index(CHANG_SHENG_AT[gan])
    return CHANG_SHENG[(step if G.index(gan) % 2 == 0 else -step) % 12]


def jie_dates(y):
    """y 年十二个月各自开始的那个节的公历日期，从立春到次年一月的小寒。"""
    out = []
    table = Solar.fromYmd(y, 7, 1).getLunar().getJieQiTable()
    for name in JIE[:11]:
        s = table[name]
        assert s.getYear() == y, (y, name, s.toYmd())
        out.append(f'{s.getMonth()}/{s.getDay()}')
    s = Solar.fromYmd(y + 1, 7, 1).getLunar().getJieQiTable()['小寒']
    assert s.getYear() == y + 1 and s.getMonth() == 1, s.toYmd()
    out.append(f'{s.getMonth()}/{s.getDay()}')
    return out


def selfcheck():
    """每次运行都先核对几样东西，不对就不往下走。"""
    # 均时差：Meeus 例 28.b，1992 年 10 月 13 日 0 时（儒略日 2448908.5），书上的结果是 +3.427752 度
    got = equation_of_time(2448908.5) / 240
    assert abs(got - 3.427752) < 2e-5, f'均时差公式和 Meeus 例 28.b 对不上：{got}'
    assert [round_half_up(x) for x in (-2.5, -2.49, 2.5, 0.4, -0.4)] == [-3, -2, 3, 0, 0]
    # 十二长生：拿 lunar_python 的「地势」对一遍，十个天干乘十二个地支
    for day in range(1, 11):
        for hour in range(0, 24, 2):
            ec = Solar.fromYmdHms(2000, 1, day, hour, 30, 0).getLunar().getEightChar()
            mine = chang_sheng(ec.getDayGan(), ec.getTimeZhi())
            assert mine == ec.getTimeDiShi(), (ec.getDayGan(), ec.getTimeZhi(), mine, ec.getTimeDiShi())
    # 五行和纳音的对照表
    assert dict(LunarUtil.WU_XING_ZHI) == ZHI_WU_XING, LunarUtil.WU_XING_ZHI
    assert all(LunarUtil.WU_XING_GAN[g] in WU_XING for g in G)
    assert all(LunarUtil.NAYIN[gz][-1] in WU_XING for gz in JIA_ZI)


# ---- 读出生信息 ----------------------------------------------------------------

def parse_time(text, what):
    for fmt in ('%Y-%m-%d %H:%M', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.datetime.strptime(text, fmt)
        except (ValueError, TypeError):
            pass
    raise SystemExit(f'{what} 的格式应当是 "YYYY-MM-DD HH:MM" 或 "YYYY-MM-DD HH:MM:SS"，现在是 {text!r}')


def load_people(src_dir):
    files = sorted(p for p in src_dir.glob('*.json') if not p.name.endswith(('.notes.json', '.facts.json')))
    if not files:
        raise SystemExit(f'{src_dir.relative_to(ROOT)}/ 里没有出生信息文件。格式见 tools/gen_data.py 开头的说明。')
    people = []
    for f in files:
        name = str(f.relative_to(ROOT))
        src = json.loads(f.read_text(encoding='utf-8'))
        missing = [k for k in REQUIRED if k not in src]
        if missing:
            raise SystemExit(f'{name} 缺少字段：{missing}')
        extra = [k for k in src if k not in REQUIRED + OPTIONAL]
        if extra:
            print(f'提醒：{name} 里有不认识的字段 {extra}，已忽略。')
        if src['gender'] not in ('男', '女'):
            raise SystemExit(f'{name} 的 gender 应当是 "男" 或 "女"，现在是 {src["gender"]!r}')
        if 'shichen' in src:
            if src['shichen'] not in Z:
                raise SystemExit(f'{name} 的 shichen 应当是十二地支之一，现在是 {src["shichen"]!r}')
        elif 'lon' not in src:
            raise SystemExit(f'{name} 缺少字段：lon（只记到时辰的写 shichen，可以不写 lon）')
        elif isinstance(src['lon'], bool) or not isinstance(src['lon'], (int, float)) or not -180 <= src['lon'] <= 180:
            raise SystemExit(f'{name} 的 lon 应当是经度的度数（东经为正），现在是 {src["lon"]!r}')
        if 'tz' in src:
            tz = src['tz']
            if 'shichen' in src or 'dst' in src:
                raise SystemExit(f'{name}：写了 tz 就不写 shichen 和 dst（夏令时直接算进 tz）')
            if not (tz == 'lmt' or (not isinstance(tz, bool) and isinstance(tz, (int, float)) and -12 <= tz <= 14)):
                raise SystemExit(f'{name} 的 tz 应当是当地钟表比世界时快几小时（-12 到 14），或者 "lmt"（当地平太阳时），现在是 {tz!r}')
        elif 'tzName' in src:
            raise SystemExit(f'{name}：写了 tzName 却没有写 tz')
        if isinstance(src['order'], bool) or not isinstance(src['order'], (int, float)):
            raise SystemExit(f'{name} 的 order 应当是数字，现在是 {src["order"]!r}')
        if not isinstance(src['id'], str) or not src['id']:
            raise SystemExit(f'{name} 的 id 应当是一段文字，现在是 {src["id"]!r}')
        if f.stem != src['id']:
            print(f'提醒：{name} 的文件名和 id（{src["id"]}）不一致。备注文件按 id 找：{src["id"]}.notes.json')
        notes_file = f.with_name(f'{src["id"]}.notes.json')
        notes = json.loads(notes_file.read_text(encoding='utf-8')) if notes_file.exists() else None
        people.append((name, src, notes))
    ids = [src['id'] for _, src, _ in people]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise SystemExit(f'id 重复了：{dup}')
    return sorted(people, key=lambda item: (item[1]['order'], item[1]['id']))


# ---- 排盘 ----------------------------------------------------------------------

def chart(name, src, notes, nayin_el):
    """排一个人。返回 (people.json 里的这个人, expected.json 里的这个人)。"""
    gender = 1 if src['gender'] == '男' else 0          # lunar_python 的约定：1 男，0 女
    shichen = src.get('shichen')
    if shichen:
        # 只记到时辰：取这个时辰的中点，直接当作真太阳时，不做经度和均时差的换算。子时取零点。
        try:
            day = datetime.datetime.strptime(src['birth'], '%Y-%m-%d')
        except (ValueError, TypeError):
            raise SystemExit(f'{name} 写了 shichen，birth 的格式应当是 "YYYY-MM-DD"，现在是 {src["birth"]!r}')
        clock = tst = day + datetime.timedelta(hours=2 * Z.index(shichen))
        dlon = eot = 0
        local = None
    else:
        birth = parse_time(src['birth'], f'{name} 的 birth')
        local = None
        if 'tz' in src:
            # 当地的钟表时间，先换成北京时间。lmt 的偏差照出生地经度算，取整的办法和经度修正相同，这样真太阳时正好是当地时间加均时差
            off = round_half_up(src['lon'] * 240) if src['tz'] == 'lmt' else round(src['tz'] * 3600)
            local, clock = birth, birth + datetime.timedelta(seconds=8 * 3600 - off)
        else:
            if 1986 <= birth.year <= 1991 and 4 <= birth.month <= 9 and 'dst' not in src:
                print(f'提醒：{name} 的出生日期在 1986 到 1991 年的 4 到 9 月，那几年中国实行过夏令时。'
                      '请确认记录的时间是不是夏令时，然后写上 "dst": true 或 "dst": false。')
            clock = birth - datetime.timedelta(hours=1) if src.get('dst') else birth
        dlon, eot, tst = true_solar_time(clock, src['lon'])

    # 四柱：按真太阳时。另按钟表时间排一遍。
    lunar = solar_of(tst).getLunar()
    ec = lunar.getEightChar()
    pillars = [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()]
    lunar_clock = solar_of(clock).getLunar()
    ec_clock = lunar_clock.getEightChar()
    pillars_clock = [ec_clock.getYear(), ec_clock.getMonth(), ec_clock.getDay(), ec_clock.getTime()]

    # 真太阳时前后的两个节
    prev_jie, next_jie = lunar.getPrevJie(), lunar.getNextJie()
    prev_at, next_at = time_of(prev_jie.getSolar()), time_of(next_jie.getSolar())
    prev_min, next_min = whole_minutes(prev_at, tst), whole_minutes(tst, next_at)

    # 大运：按钟表时间
    yun = ec_clock.getYun(gender, 2)
    forward = yun.isForward()
    yun_jie = lunar_clock.getNextJie() if forward else lunar_clock.getPrevJie()
    clock_solar = lunar_clock.getSolar()
    # lunar_python 数分钟时两头都先舍去秒，这里照它的算法，才能和折合出来的年月日时对上
    gap = yun_jie.getSolar().subtractMinute(clock_solar) if forward else clock_solar.subtractMinute(yun_jie.getSolar())
    assert gap == yun.getStartYear() * 4320 + yun.getStartMonth() * 360 + yun.getStartDay() * 12 + yun.getStartHour() // 2
    start = yun.getStartSolar()
    dayun = [{'gz': d.getGanZhi(), 'y0': d.getStartYear(), 'y1': d.getEndYear(), 'a0': d.getStartAge(), 'a1': d.getEndAge()}
             for d in yun.getDaYun()[1:9]]

    # 摘要
    print(f'【{src["id"]}】{src["name"]}，{src["gender"]}')
    if shichen:
        print(f'  只记到时辰：{clock:%Y-%m-%d} {shichen}时，取中点 {clock:%H:%M}，{src["place"]}')
    else:
        if local:
            print(f'  当地钟表时间 {local}（{src.get("tzName") or src["tz"]}），换成北京时间是 {clock}')
        print(f'  钟表时间 {clock}（北京时间' + ('，已减去夏令时的 1 小时' if src.get('dst') else '') + f'），{src["place"]}，经度 {src["lon"]}')
        print(f'  经度修正 {dlon} 秒，均时差 {eot} 秒，真太阳时 {tst}')
    print(f'  农历 {lunar.getYearInGanZhi()}年 {lunar.getMonthInChinese()}月 {lunar.getDayInChinese()}，星座 {solar_of(tst).getXingZuo()}')
    print(f'  四柱 {" ".join(pillars)}' + ('' if pillars == pillars_clock else f'；按钟表时间排是 {" ".join(pillars_clock)}'))
    print(f'  上一个节 {prev_jie.getName()} {prev_at}，在 {span(prev_min)}之前；下一个节 {next_jie.getName()} {next_at}，在 {span(next_min)}之后')
    print(f'  胎元 {ec.getTaiYuan()}，命宫 {ec.getMingGong()}，身宫 {ec.getShenGong()}，胎息 {ec.getTaiXi()}')
    print(f'  大运{"顺" if forward else "逆"}排，数到{yun_jie.getName()}相隔 {gap} 分钟，折合 {yun.getStartYear()} 年 {yun.getStartMonth()} 个月 '
          f'{yun.getStartDay()} 天 {yun.getStartHour()} 小时，{start.toYmd()} 起运')
    print('  大运 ' + ' '.join(f'{d["gz"]}({d["y0"]},{d["a0"]}岁)' for d in dayun))

    # 提醒
    if pillars[:2] != pillars_clock[:2] or min(prev_min, next_min) < 180:
        print('  提醒：出生时间离节气交接很近，年柱或月柱可能有争议。'
              + ('按真太阳时和按钟表时间排出的年柱或月柱不同；大运是按钟表时间排的，和上面的四柱对不上。'
                 if pillars[:2] != pillars_clock[:2] else ''))
    if pillars[2:] != pillars_clock[2:]:
        print('  提醒：真太阳时和钟表时间落在不同的时辰或不同的日子，日柱、时柱取决于用不用真太阳时。页面用的是真太阳时。')

    # 核对
    if 'expect' in src and pillars != src['expect']:
        raise SystemExit(f'{name}：排出来的四柱是 {pillars}，和 expect 写的 {src["expect"]} 不一致。')
    if 'expectYunStart' in src and start.toYmd() != src['expectYunStart']:
        raise SystemExit(f'{name}：起运日期是 {start.toYmd()}，和 expectYunStart 写的 {src["expectYunStart"]} 不一致。')
    if 'expectTst' in src and tst != parse_time(src['expectTst'], f'{name} 的 expectTst'):
        raise SystemExit(f'{name}：真太阳时是 {tst}，和 expectTst 写的 {src["expectTst"]} 不一致。')
    lunar_text = f'{lunar.getYearInGanZhi()}年{lunar.getMonthInChinese()}月{lunar.getDayInChinese()}'
    if 'expectLunar' in src and lunar_text != src['expectLunar']:
        raise SystemExit(f'{name}：换算出来的农历是 {lunar_text}，和 expectLunar 写的 {src["expectLunar"]} 不一致。')

    person = {'id': src['id'], 'name': src['name'], 'gender': gender, 'clock': six(clock)}
    if local:
        person['localClock'] = six(local)
        person['tz'] = src['tz']
        if 'tzName' in src:
            person['tzName'] = src['tzName']
    if shichen:
        person['shichen'] = shichen
    if src.get('dst') and not shichen:
        person['dst'] = True
    if 'source' in src:
        person['source'] = src['source']
    person['place'] = src['place']
    if not shichen:
        person['lon'] = src['lon']
    person.update({
        'dlonSec': dlon, 'eotSec': eot, 'tst': six(tst),
        'lunar': {'year': lunar.getYearInGanZhi(), 'month': lunar.getMonthInChinese(), 'day': lunar.getDayInChinese(),
                  'leap': lunar.getMonth() < 0},
        'xingzuo': solar_of(tst).getXingZuo(),
        'pillars': pillars, 'pillarsClock': pillars_clock,
        'prevJie': {'name': prev_jie.getName(), 'at': six(prev_at), 'min': prev_min},
        'nextJie': {'name': next_jie.getName(), 'at': six(next_at), 'min': next_min},
        'taiyuan': ec.getTaiYuan(), 'minggong': ec.getMingGong(), 'shengong': ec.getShenGong(), 'taixi': ec.getTaiXi(),
        'yun': {'forward': forward, 'y': yun.getStartYear(), 'm': yun.getStartMonth(), 'd': yun.getStartDay(),
                'h': yun.getStartHour(), 'start': [start.getYear(), start.getMonth(), start.getDay()],
                'jie': yun_jie.getName(), 'gapMin': gap},
        'dayun': dayun,
    })
    if notes is not None:
        person['notes'] = notes

    # 页面应当显示的事实，全部用 lunar_python 的方法另算
    hide = [ec.getYearHideGan(), ec.getMonthHideGan(), ec.getDayHideGan(), ec.getTimeHideGan()]
    hide_ss = [ec.getYearShiShenZhi(), ec.getMonthShiShenZhi(), ec.getDayShiShenZhi(), ec.getTimeShiShenZhi()]
    assert ec.getDayShiShenGan() == '日主' and ec.getDayDiShi() == chang_sheng(pillars[2][0], pillars[2][1])
    every = [LunarUtil.WU_XING_GAN[p[0]] for p in pillars] + [LunarUtil.WU_XING_GAN[g] for row in hide for g in row]
    face = [LunarUtil.WU_XING_GAN[p[0]] for p in pillars] + [LunarUtil.WU_XING_ZHI[p[1]] for p in pillars]
    expected = {
        'pillars': pillars,
        'zhuxing': [ec.getYearShiShenGan(), ec.getMonthShiShenGan(), '日主', ec.getTimeShiShenGan()],
        'canggan': [[[g, s] for g, s in zip(gs, ss)] for gs, ss in zip(hide, hide_ss)],
        'xingyun': [ec.getYearDiShi(), ec.getMonthDiShi(), ec.getDayDiShi(), ec.getTimeDiShi()],
        'zizuo': [chang_sheng(p[0], p[1]) for p in pillars],
        'xunkong': [ec.getYearXunKong(), ec.getMonthXunKong(), ec.getDayXunKong(), ec.getTimeXunKong()],
        'nayin': [ec.getYearNaYin(), ec.getMonthNaYin(), ec.getDayNaYin(), ec.getTimeNaYin()],
        'dayun': [d['gz'] for d in dayun],
        'wuxing': {'all': [every.count(w) for w in WU_XING], 'face': [face.count(w) for w in WU_XING]},
        'shensha': [sorted(s) for s in shensha(pillars, nayin_el, gender == 1)],
    }
    return person, expected


def dump_expected(expected):
    """每个事实占一行的 JSON，方便人看，也方便比较改动。"""
    one = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    blocks = [f' {one(pid)}: {{\n' + ',\n'.join(f'  {one(k)}: {one(v)}' for k, v in facts.items()) + '\n }'
              for pid, facts in expected.items()]
    return '{\n' + ',\n'.join(blocks) + '\n}\n'


def main():
    unknown = [a for a in sys.argv[1:] if a != '--private']
    if unknown:
        raise SystemExit(f'不认识的参数：{unknown}。用法见文件开头的说明。')
    private = '--private' in sys.argv
    src_dir = ROOT / 'private' / 'people' if private else ROOT / 'people'
    out = ROOT / 'private' / 'build' / 'data' if private else ROOT / 'data'      # 个人的生成物都放在 private/build/ 里，随时可以删
    freq_file = ROOT / 'data' / 'shensha_freq.json'
    if not freq_file.exists():
        raise SystemExit('找不到 data/shensha_freq.json。先运行 .venv/bin/python tools/shensha_freq.py。')

    selfcheck()
    nayin = {gz: LunarUtil.NAYIN[gz] for gz in JIA_ZI}
    nayin_el = {gz: v[-1] for gz, v in nayin.items()}

    people, expected = [], {}
    for name, src, notes in load_people(src_dir):
        person, facts = chart(name, src, notes, nayin_el)
        people.append(person)
        expected[person['id']] = facts

    # 每年十二个节的日期：从最早的一步大运开始，到最晚的一步大运结束的下一年
    y0 = min(d['y0'] for p in people for d in p['dayun'])
    y1 = max(d['y1'] for p in people for d in p['dayun']) + 1
    jie = {str(y): jie_dates(y) for y in range(y0, y1 + 1)}

    data = {
        'title': f'{people[0]["pillars"][2]}日命盘' if len(people) == 1 else '八字命盘',
        'nayin': nayin,
        'jie': jie,
        'freq': json.loads(freq_file.read_text(encoding='utf-8')),
        'people': people,
    }
    out.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    (out / 'people.json').write_text(text, encoding='utf-8', newline='\n')
    (out / 'expected.json').write_text(dump_expected(expected), encoding='utf-8', newline='\n')
    assert json.loads((out / 'expected.json').read_text(encoding='utf-8')) == expected
    print(f'节的日期表 {y0} 到 {y1} 年；标题「{data["title"]}」')
    print(f'已写入 {(out / "people.json").relative_to(ROOT)}（{len(text.encode("utf-8"))} 字节）'
          f'和 {(out / "expected.json").relative_to(ROOT)}，共 {len(people)} 人')


if __name__ == '__main__':
    main()
