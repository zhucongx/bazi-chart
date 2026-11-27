"""用 Blender 把页面图标 src/icon.svg 渲染成一只青花瓷的八卦盘，放在标题右边：白瓷的八边形盘，钴蓝釉的卦画，中间一块太极。
盘和太极分开渲染成两张透明底的图 src/gua-plate.webp、src/gua-tj.webp，画幅一样、中心重合：页面上把太极那张叠在盘上，单独转。
改了图标或者材质才跑，跑完再构建。

  blender -b -P tools/gen_gua.py            渲染两张，存到 src/
  blender -b -P tools/gen_gua.py -- 目录     存到别的目录（试的时候用）

2026-11-27 用户说「你现在可以用blender了。你看看网页里有什么可以渲染一下吗」。
卦画、方位都不在这里重画：直接读 src/icon.svg 的图形（那张图的八卦是照出处核对过的，检查脚本逐卦核对），只是把每一块做出厚度、换上材质。
读进来的先后就是 SVG 里的先后：第 0 块是垫底的八边形，后面二十四块是八个卦的爻，最后四块是太极（墨色的圆、白的半边、两个鱼眼）。
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = Path(args[0]) if args else ROOT / 'src'
SIZE = 360


def material(name, color, rough, coat=1.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True      # 新版的 Blender 里新建的材质、环境本来就带节点，这个属性要去掉了；老版本才要打开
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = 0.04
    return m


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module='io_curve_svg')
    except Exception:
        pass
    bpy.ops.import_curve.svg(filepath=str(ROOT / 'src' / 'icon.svg'))
    objs = sorted((o for o in bpy.data.objects if o.type == 'CURVE'), key=lambda o: o.name)
    if len(objs) != 29:
        raise SystemExit(f'src/icon.svg 读出来 {len(objs)} 块，预想的是 29 块（八边形、二十四道爻、太极四块）。图标的画法变了，这个脚本要跟着改。')
    base, bars, taiji = objs[0], objs[1:25], objs[25:]
    f = 2.0 / base.dimensions.x                                   # 盘宽放大到 2
    box = [Vector(c) for c in base.bound_box]
    mid = sum(box, Vector()) / 8
    porcelain = material('porcelain', (0.9, 0.92, 0.95), 0.07)   # 白瓷，偏一点冷
    cobalt = material('cobalt', (0.012, 0.055, 0.34), 0.14)       # 钴蓝的釉
    def setup(o, mat, z, thick, bevel):
        o.data.dimensions = '2D'; o.data.fill_mode = 'BOTH'
        o.data.extrude = thick / f; o.data.bevel_depth = bevel / f; o.data.bevel_resolution = 3
        o.data.materials.clear(); o.data.materials.append(mat)
        o.scale = (f, f, f); o.location = (-mid.x * f, -mid.y * f, z)
    setup(base, porcelain, 0.0, 0.05, 0.03)                       # 盘：连倒角厚 0.16，顶面在 0.08
    for o in bars:
        setup(o, cobalt, 0.092, 0.008, 0.004)                     # 卦画：釉略略鼓起一点，底贴着盘面
    setup(taiji[0], cobalt, 0.102, 0.014, 0.008)                  # 太极的蓝底
    setup(taiji[1], porcelain, 0.131, 0.004, 0.003)               # 白的半边
    setup(taiji[2], porcelain, 0.131, 0.004, 0.003)               # 蓝半边里的白眼
    setup(taiji[3], cobalt, 0.145, 0.004, 0.003)                  # 白半边里的蓝眼

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 128; sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 92; sc.render.image_settings.color_mode = 'RGBA'
    sc.world = bpy.data.worlds.new('w')
    if sc.world.node_tree is None: sc.world.use_nodes = True      # 新版的 Blender 里新建的材质、环境本来就带节点，这个属性要去掉了；老版本才要打开
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.8, 0.85, 0.95, 1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.42
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 2.16
    co = bpy.data.objects.new('c', cam); co.location = (0, 0, 5); sc.collection.objects.link(co); sc.camera = co
    def lamp(name, energy, size, loc, rot, color=(1, 1, 1)):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
        o = bpy.data.objects.new(name, l); o.location = loc; o.rotation_euler = [math.radians(a) for a in rot]; sc.collection.objects.link(o)
    lamp('key', 84, 2.2, (-2.2, 2.4, 3.2), (-30, -28, 0))
    lamp('fill', 12, 4.0, (2.6, -1.6, 2.6), (26, 36, 0), (0.85, 0.9, 1.0))
    OUT.mkdir(parents=True, exist_ok=True)
    for name, show in (('gua-plate', [base] + bars), ('gua-tj', taiji)):
        for o in objs:
            o.hide_render = o not in show
        sc.render.filepath = str(OUT / f'{name}.webp')
        bpy.ops.render.render(write_still=True)
        print('已渲染', sc.render.filepath)


main()
