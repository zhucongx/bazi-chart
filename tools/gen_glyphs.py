"""用 Blender 把十个天干、十二个地支渲染成有材质的立体字，透明底，存成 src/glyph/g0…g9、z0…z11 的 webp。改了材质才跑，跑完再构建。

  blender -b -P tools/gen_glyphs.py                  渲染 22 个字，存到 src/glyph/
  blender -b -P tools/gen_glyphs.py -- 目录 甲丙戊辛壬  存到别的目录、只渲染这几个字（试的时候用）

2026-11-27 用户要标题四柱的大字有材质的质感、带光晕。先试的是把贴图叠在文字上，用户说「真的不试试直接渲染吗」，就改成直接渲染：
每个字是一个有厚度、带倒角的立体字，照它的五行用一种材质，打三盏灯，从正上方平着拍。
木是上了绿色的木头，看得出木纹的高低；火是自己发光的火，底下亮黄、往上发红；土是干裂的赭色泥土；金是拉丝的黄金；水是深蓝的水面，上面有流动的光纹。
颜色照页面里五行的颜色定：木绿、火红、土赭、金黄、水蓝，深浅取在中间，浅色、深色两种底上都看得清。
字体用系统自带的宋体（Songti.ttc），和页面上干支大字的宋体是一路；没有这个字体的机器上要改 FONT。
"""
import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = Path(args[0]) if args else ROOT / 'src' / 'glyph'
G, Z = '甲乙丙丁戊己庚辛壬癸', '子丑寅卯辰巳午未申酉戌亥'
G_EL = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]                      # 木火土金水的序号
Z_EL = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4]
ONLY = args[1] if len(args) > 1 else G + Z
FONT = '/System/Library/Fonts/Supplemental/Songti.ttc'
SIZE = 288


def sock(col, *names):
    for n in names:
        if n in col:
            return col[n]
    raise KeyError(f'找不到接口 {names}，Blender 的版本可能改了名字：{[s.name for s in col]}')


class Tree:
    """一种材质的节点图"""
    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        if self.mat.node_tree is None: self.mat.use_nodes = True      # 新版的 Blender 里新建的材质、环境本来就带节点，这个属性要去掉了；老版本才要打开
        self.t = self.mat.node_tree
        self.t.nodes.clear()
        self.out = self.t.nodes.new('ShaderNodeOutputMaterial')
        self.co = self.t.nodes.new('ShaderNodeTexCoord')

    def n(self, kind, props=None, **inputs):
        node = self.t.nodes.new(kind)
        for k, v in (props or {}).items():
            setattr(node, k, v)
        for k, v in inputs.items():
            sock(node.inputs, *k.replace('_', ' ').split('|')).default_value = v
        return node

    def link(self, a, b):
        self.t.links.new(a, b)

    def mapped(self, scale=(1, 1, 1), rot=(0, 0, 0), loc=(0, 0, 0)):
        m = self.n('ShaderNodeMapping')
        m.inputs['Scale'].default_value = scale
        m.inputs['Rotation'].default_value = rot
        m.inputs['Location'].default_value = loc
        self.link(self.co.outputs['Object'], m.inputs['Vector'])
        return m.outputs['Vector']

    def noise(self, vec, scale, detail=2.0, rough=0.5, distortion=0.0):
        nz = self.n('ShaderNodeTexNoise', Scale=scale, Detail=detail, Roughness=rough, Distortion=distortion)
        self.link(vec, nz.inputs['Vector'])
        return sock(nz.outputs, 'Fac', 'Factor')

    def ramp(self, fac, stops):
        r = self.n('ShaderNodeValToRGB')
        els = r.color_ramp.elements
        while len(els) < len(stops):
            els.new(0.5)
        for e, (pos, col) in zip(els, stops):
            e.position = pos
            e.color = (*col, 1) if len(col) == 3 else (col[0],) * 3 + (1,)
        self.link(fac, sock(r.inputs, 'Fac', 'Factor'))
        return r.outputs['Color']

    def math(self, op, a, b=None, clamp=False):
        m = self.n('ShaderNodeMath', {'operation': op, 'use_clamp': clamp})
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                self.link(v, m.inputs[i])
        return m.outputs[0]

    def warped(self, amount, scale=2.0, loc=(0, 0, 0)):
        """把坐标用噪声搅一搅：裂纹、光纹的边才不是直的"""
        w = self.noise(self.mapped(loc=loc), scale, detail=2)
        add = self.n('ShaderNodeVectorMath', {'operation': 'ADD'}); xyz = self.n('ShaderNodeCombineXYZ')
        self.link(self.math('MULTIPLY', w, amount), xyz.inputs[0]); self.link(self.math('MULTIPLY', w, amount * 0.6), xyz.inputs[1])
        self.link(self.mapped(loc=loc), add.inputs[0]); self.link(xyz.outputs[0], add.inputs[1])
        return add.outputs[0]

    def done(self, color, height=None, bump=0.4, emit=None, emit_strength=1.0, **inputs):
        p = self.n('ShaderNodeBsdfPrincipled', **inputs)
        if isinstance(color, tuple):
            p.inputs['Base Color'].default_value = (*color, 1)
        else:
            self.link(color, p.inputs['Base Color'])
        if height is not None:
            b = self.n('ShaderNodeBump', Strength=bump, Distance=0.02)
            self.link(height, b.inputs['Height']); self.link(b.outputs['Normal'], p.inputs['Normal'])
        if emit is not None:
            self.link(emit, sock(p.inputs, 'Emission Color', 'Emission'))
            p.inputs['Emission Strength'].default_value = emit_strength
        self.link(p.outputs[0], self.out.inputs['Surface'])
        return self.mat


def wood():
    """木：上了绿色的木头。顺着长的木纹，年轮的弯纹"""
    t = Tree('wood')
    streak = t.noise(t.mapped(scale=(22, 1.0, 1)), 3.0, detail=5, rough=0.65, distortion=0.8)
    w = t.n('ShaderNodeTexWave', {'wave_type': 'BANDS', 'bands_direction': 'X'}, Scale=3.2, Distortion=11.0, Detail=3.0)
    sock(w.inputs, 'Detail Scale').default_value = 0.7
    t.link(t.mapped(scale=(1, 0.25, 1), loc=(0.37, 0.1, 0)), w.inputs['Vector'])
    h = t.math('ADD', t.math('MULTIPLY', sock(w.outputs, 'Fac', 'Factor'), 0.6), t.math('MULTIPLY', streak, 0.55))
    col = t.ramp(h, [(0.25, (0.004, 0.035, 0.018)), (0.55, (0.012, 0.085, 0.042)), (0.8, (0.035, 0.17, 0.085)), (1.0, (0.08, 0.27, 0.14))])
    return t.done(col, h, bump=0.35, Roughness=0.45, **{'Coat Weight': 0.3, 'Coat Roughness': 0.25})


def fire():
    """火：自己发光。底下亮黄，往上橙、红，火舌是竖着拉长的"""
    t = Tree('fire')
    lick = t.noise(t.mapped(scale=(5.0, 1.4, 1)), 2.4, detail=5, rough=0.62, distortion=1.6)
    sep = t.n('ShaderNodeSeparateXYZ'); t.link(t.co.outputs['Object'], sep.inputs[0])
    up = t.math('ADD', sep.outputs[1], 0.5, clamp=True)                      # 字的底下是 0，顶上是 1
    v = t.math('SUBTRACT', t.math('ADD', lick, 0.3), t.math('MULTIPLY', up, 0.6), clamp=True)
    glow = t.ramp(v, [(0.05, (0.22, 0.004, 0.0)), (0.3, (0.62, 0.03, 0.004)), (0.52, (0.9, 0.16, 0.01)), (0.72, (1.0, 0.36, 0.03)), (0.95, (1.0, 0.62, 0.1))])
    return t.done((0.2, 0.015, 0.008), lick, bump=0.25, emit=glow, emit_strength=1.0, Roughness=0.5)


def earth():
    """土：干裂的赭色泥土，粗砂"""
    t = Tree('earth')
    v = t.n('ShaderNodeTexVoronoi', {'feature': 'DISTANCE_TO_EDGE'}, Scale=7.0)
    t.link(t.warped(0.18, 3.0), v.inputs['Vector'])
    crack = t.ramp(v.outputs['Distance'], [(0.0, (0.0,)), (0.07, (1.0,))])
    grain = t.noise(t.mapped(), 60.0, detail=4, rough=0.7)
    lump = t.noise(t.mapped(), 6.0, detail=2)
    h = t.math('ADD', t.math('MULTIPLY', crack, 0.9), t.math('ADD', t.math('MULTIPLY', grain, 0.3), t.math('MULTIPLY', lump, 0.5)))
    tone = t.math('ADD', t.math('MULTIPLY', crack, 0.5), t.math('ADD', t.math('MULTIPLY', lump, 0.4), t.math('MULTIPLY', grain, 0.15)))
    col = t.ramp(tone, [(0.1, (0.05, 0.022, 0.01)), (0.55, (0.24, 0.115, 0.045)), (1.0, (0.44, 0.24, 0.1))])
    return t.done(col, h, bump=1.0, Roughness=0.92)


def metal():
    """金：拉丝的黄金"""
    t = Tree('metal')
    line = t.noise(t.mapped(scale=(1, 220, 1), rot=(0, 0, math.radians(-40))), 1.0, detail=3, rough=0.6)
    col = t.ramp(line, [(0.2, (0.62, 0.4, 0.08)), (0.8, (0.95, 0.68, 0.2))])
    return t.done(col, line, bump=0.12, Metallic=1.0, Roughness=0.26)


def water():
    """水：深蓝的水，面上有光纹，自己发一点光"""
    t = Tree('water')
    def caustic(scale, seed):
        v = t.n('ShaderNodeTexVoronoi', {'feature': 'DISTANCE_TO_EDGE'}, Scale=scale)
        t.link(t.warped(0.45, 3.2, loc=(seed, seed * 0.7, 0)), v.inputs['Vector'])
        return t.ramp(v.outputs['Distance'], [(0.0, (1.0,)), (0.05, (0.22,)), (0.16, (0.0,))])
    c = t.math('ADD', caustic(5.5, 0.0), t.math('MULTIPLY', caustic(9.0, 3.1), 0.4), clamp=True)
    wave = t.noise(t.mapped(), 5.0, detail=2)
    col = t.ramp(wave, [(0.2, (0.003, 0.03, 0.2)), (0.8, (0.01, 0.1, 0.42))])
    light = t.ramp(c, [(0.0, (0.0, 0.012, 0.07)), (0.45, (0.015, 0.16, 0.6)), (0.8, (0.12, 0.5, 0.95)), (1.0, (0.5, 0.85, 1.0))])
    return t.done(col, wave, bump=0.3, emit=light, emit_strength=0.9, Roughness=0.12, **{'Coat Weight': 1.0})


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.quality = 92
    sc.render.image_settings.color_mode = 'RGBA'
    sc.world = bpy.data.worlds.new('w')
    if sc.world.node_tree is None: sc.world.use_nodes = True      # 新版的 Blender 里新建的材质、环境本来就带节点，这个属性要去掉了；老版本才要打开
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.8, 0.9, 1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.5
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 1.3      # 一个字高是 1，四周留出倒角和光晕的地方
    co = bpy.data.objects.new('c', cam); co.location = (0, 0, 5); sc.collection.objects.link(co); sc.camera = co
    def lamp(name, energy, size, loc, rot, color=(1, 1, 1)):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
        o = bpy.data.objects.new(name, l); o.location = loc; o.rotation_euler = [math.radians(a) for a in rot]; sc.collection.objects.link(o)
    lamp('key', 180, 2.5, (-1.6, 1.8, 2.6), (-32, -28, 0))                    # 主光：左上
    lamp('fill', 40, 3.0, (2.0, -1.2, 2.2), (26, 36, 0), (0.85, 0.9, 1.0))    # 补光：右下，偏冷
    lamp('rim', 90, 1.2, (1.6, 2.2, 0.9), (-62, 48, 0), (1.0, 0.95, 0.85))    # 轮廓光：右上，压着边
    font = bpy.data.fonts.load(FONT)
    mats = [wood(), fire(), earth(), metal(), water()]
    OUT.mkdir(parents=True, exist_ok=True)
    for kind, chars, els in (('g', G, G_EL), ('z', Z, Z_EL)):
        for i, ch in enumerate(chars):
            if ch not in ONLY:
                continue
            cu = bpy.data.curves.new('t', 'FONT'); cu.body = ch; cu.font = font
            cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.size = 1.0
            cu.extrude = 0.045; cu.bevel_depth = 0.012; cu.bevel_resolution = 3
            ob = bpy.data.objects.new('t', cu); sc.collection.objects.link(ob)
            ob.data.materials.append(mats[els[i]])
            sc.render.filepath = str(OUT / f'{kind}{i}.webp')
            bpy.ops.render.render(write_still=True)
            print('已渲染', ch, sc.render.filepath)
            bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)


main()
