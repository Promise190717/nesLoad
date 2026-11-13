#!/usr/bin/env python3
"""把 ambientCG 的 PBR 素材转成 H5 关卡用的三张通道图（`public/h5/tex/`）。

## 为什么要有这一步，而不是直接把 zip 里的 jpg 丢进 public

ambientCG 的 Color 图是**带色相的照片**（镀锌钢偏蓝、松木偏黄、脏钢板偏棕）。
本作关卡的所有大件都是「一张灰度图 × 材质 color」染色出来的（五只箱子的米白 /
军绿 / 深绿 / 蓝灰 / 卡其共用同一张贴图，见 `level.ts` 的 `containerMaterials`）。
直接把带色相的照片乘上去，等于给每只箱子再叠一层不属于它的颜色 —— 米白箱会
发蓝、军绿箱会发灰。所以这里把金属类的 Color **彻底去色**，色相 100% 交给
`color` 决定；木头保留一部分原色（木箱本来就该是木色）。

去色之后还要把平均亮度**拉回材质预期**：`color` 是乘在贴图上的，灰度图均值
如果是 0.5，五只箱子会比现在暗一半。每类的目标亮度写在 `TARGET_LUMA`。

## 输入从哪来

    https://ambientcg.com/get?file=<ID>_<1K|2K>-JPG.zip

全部 **CC0 公有领域**（可商用、免署名）。用户明确「本地自己玩，忽略商业许可」，
但 CC0 正好也不欠人情。解压到临时目录后跑：

    python3 scripts/h5-surfaces.py /path/to/unpacked

## 为什么输出 webp 而不是 jpg

法线图用有损 jpg（q92）会在平坦区域留下块状色噪，法线一解码就是一片细碎的
假凹凸；png 又太大（2K 法线单张 4MB）。webp q92 在法线上肉眼无损、体积只有
png 的三分之一，2026 年的浏览器全支持。

## 🔴 改了这里必须同步 `surface-textures.ts` 的 SPEC.tileMeters

贴图覆盖多少米写在那边（几何 UV 按它铺，见 `level.ts` 的 `fitBoxUv`）。这里的
`NOTE` 只是说明各自的物理尺度是怎么估的，不是真相来源。
"""

import os
import sys

import numpy as np
from PIL import Image

# 源：kind -> (ambientCG ID, 分辨率, 处理方式, 目标平均亮度)
#
# 目标亮度的估算：带染色的材质（箱体 / 舷墙 / 箱顶）必须接近白，否则乘上 tint
# 之后整片发暗；甲板材质是 `color: 0xffffff`，亮度完全由贴图承担，取实景的
# 蓝灰钢板亮度（~0.52）；木箱本来就是深色木头，取 0.62。
# 源：kind -> {asset, res, mode, floor, rotate, contrast}
#
# `floor` 是**暗部下限**，不是平均亮度 —— 第一版按均值缩放，结果整张图被拉成
# 一片死白：镀锌板本身均值就有 0.75，乘 1.2 之后所有高光一起 clip。现在改成
# 「按 2%/98% 分位线性重映射到 [floor, 1]」，对比度由源图决定、亮度由 floor
# 决定，两者不再互相打架。
#
# `rotate` 顺时针转 90°（法线的 xy 分量要跟着换轴，见 `rotate_surface`）。
# `contrast` < 1 压对比，只给「刷漆钢板」用。
#
# ## 2026-11-13 第二轮：为什么把集装箱从 CorrugatedSteel005 换成 009
#
# 用户反馈「除了地板之外都太丑、一点不真实」。病根不在分辨率：ambientCG 的
# CorrugatedSteel 系列**颜色图本身是平的**（波纹只存在于法线图里），去色之后
# 就剩一片大小不一的灰斑，染成米白就是一堵脏墙。而 009 是 photogrammetry，
# 颜色图里就带着真实的波纹明暗（凸起受光、凹槽积灰），去色后结构还在 ——
# 这才是集装箱「一眼能看出是波纹钢板」的那层信息。它的波纹是横向的，转 90°
# 正好当侧板的竖波纹；箱顶不用转，横向细波纹本来就是实箱顶的样子。
SOURCES = {
    # 2K：甲板是唯一铺满全屏的表面，斜着看的时候纹理被拉得很长
    "deck": dict(asset="DiamondPlate009", res="2K", mode="metal", floor=0.50),
    # 2K：集装箱是画面里数量最多、离玩家最近的障碍物
    "container": dict(asset="CorrugatedSteel009", res="4K", mode="metal", floor=0.78, rotate=True),
    # 端门复用侧板同一张（真实端门也是同一种波纹板，锁杆在 `level.ts` 里是几何）
    "containerDoor": dict(asset="CorrugatedSteel009", res="4K", mode="metal", floor=0.78, rotate=True),
    "containerRoof": dict(asset="CorrugatedSteel009", res="2K", mode="metal", floor=0.78),
    # ⚠️ 'steel'（舷墙 / 狙击台 / 吊臂的涂漆钢板）**已停用**：2026-11-13 用户
    # 要求「墙面的金属板全部换成和地板一样的贴图」，`level.ts` 里那些材质全部
    # 改吃 deck 的 DiamondPlate。下面这行保留是为了能一键恢复 ——
    # 恢复时把注释去掉、重跑本脚本，并在 `hd-textures.ts` 的 HD_SOURCES 里加回
    # `steel: { base: '/h5/tex/steel-v2' }`。
    # "steel": dict(asset="PaintedMetal004", res="1K", mode="metal", floor=0.76, contrast=0.55),
    "wood": dict(asset="Planks021", res="1K", mode="wood", floor=0.20),
}

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "h5", "tex")

# 🔴 文件名里带版本号，改完图必须 +1，并**同步 `lib/h5/hd-textures.ts` 的
# `HD_SOURCES[*].base`**。原因：`public/_headers` 给 `/h5/*` 挂了 86400 的
# 缓存，同名文件换内容后浏览器会继续用旧的 —— 表现是「改了没生效」，
# 而且 DevTools 里看响应是 200（from disk cache）。这套做法和项目里 R2 换图
# 传新键（`-v2`）是同一条纪律。
VERSION = "v2"

# 同一张源图只处理一次（侧板和端门共用），落盘也共用一份文件 —— 运行时由
# `hd-textures.ts` 用两次 `TextureLoader.load` 拿到两个独立的 Texture 实例，
# 因为端门要单独设 `repeat` 把整张图压进一面门（见 `level.ts` 的 doorRepeat）。
SHARED = {"containerDoor": "container"}


def find_source(root: str, asset: str, res: str, suffix: str) -> str:
    path = os.path.join(root, asset, f"{asset}_{res}-JPG_{suffix}.jpg")
    if not os.path.exists(path):
        raise SystemExit(f"缺文件：{path}")
    return path


def contrast_stretch(rgb: np.ndarray, floor: float, contrast: float = 1.0) -> np.ndarray:
    """按 2%/98% 分位线性重映射到 [floor, 1]，保住源图的对比度。

    不能按均值缩放：镀锌板均值本来就 0.75，拉亮 20% 之后高光全 clip，
    菱形绊钉、波纹、脏污一起糊成白纸（第一版就是这么翻的）。

    `contrast < 1` 再把结果往中灰压，用来给「白划痕太抢眼」的贴图收劲。
    """
    gray = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lo = float(np.percentile(gray, 2))
    hi = float(np.percentile(gray, 98))
    if hi - lo < 1e-3:
        hi = lo + 1.0
    unit = np.clip((rgb.astype(np.float32) - lo) / (hi - lo), 0.0, 1.0)
    if contrast < 1.0:
        unit = np.clip(0.5 + (unit - 0.5) * contrast, 0.0, 1.0)
    return (floor + (1.0 - floor) * unit) * 255.0


def crop_square(image: Image.Image) -> Image.Image:
    """居中裁成正方形。

    three 的 `repeat` 是 uv 上同一个标量，非方形贴图铺出来会被拉伸 ——
    CorrugatedSteel009 是 2:1 的长条，直接铺到方形的箱顶上，横波纹的间距
    会比实线宽一倍。裁掉两边（波纹是等距的，裁多少不影响周期）。
    """
    w, h = image.size
    if w == h:
        return image
    side = min(w, h)
    return image.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))


def rotate_surface(image: Image.Image, normal: bool) -> Image.Image:
    """顺时针转 90°。

    🔴 法线图不能只转像素：法线是**向量**，转了之后的 (R,G) 在新坐标下换轴了。
    顺时针 90° 时新 u 轴 = 旧 -v 轴、新 v 轴 = 旧 u 轴，所以
    `R' = 255 - G`、`G' = R`。只转像素不换轴的话，波纹的受光方向会整个反过来
    （凸起看着像凹进去），斜光下尤其明显。
    """
    rotated = image.transpose(Image.ROTATE_270)
    if not normal:
        return rotated
    r, g, b = rotated.split()
    r = r.point(lambda v: 255 - v)
    return Image.merge("RGB", (r, g, b))


def process_color(path: str, mode: str, floor: float, contrast: float) -> Image.Image:
    pixels = np.asarray(crop_square(Image.open(path).convert("RGB")))
    stretched = contrast_stretch(pixels, floor, contrast)

    if mode == "metal":
        # 金属类完全去色：色相 100% 交给材质 `color`（五只箱子共用一张图）
        luma = stretched @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        gray = np.repeat(luma[:, :, None], 3, axis=2)
    else:
        # 木头：保留 55% 原色相，别把松木压成水泥
        luma = stretched @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        gray = luma[:, :, None] + (stretched - luma[:, :, None]) * 0.40

    return Image.fromarray(np.clip(gray, 0, 255).astype(np.uint8))


def main() -> None:
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(OUT_DIR, exist_ok=True)

    done = set()
    for kind, spec in SOURCES.items():
        key = SHARED.get(kind, kind)
        if key in done:
            print(f"  = {kind:14s} 复用 {key}")
            continue

        asset, res = spec["asset"], spec["res"]
        mode, floor = spec["mode"], spec["floor"]
        rotate = spec.get("rotate", False)
        contrast = spec.get("contrast", 1.0)

        color = process_color(find_source(root, asset, res, "Color"), mode, floor, contrast)
        normal = crop_square(Image.open(find_source(root, asset, res, "NormalGL")).convert("RGB"))
        rough = crop_square(Image.open(find_source(root, asset, res, "Roughness")).convert("L"))

        # 三张图尺寸必须一致（three 不校验，但采样器会按各自的 wrap 走）
        if normal.size != color.size:
            normal = normal.resize(color.size, Image.LANCZOS)
        if rough.size != color.size:
            rough = rough.resize(color.size, Image.LANCZOS)

        # 旋转必须在尺寸对齐之后、落盘之前，三张一起转（法线要换轴）
        if rotate:
            color = rotate_surface(color, normal=False)
            normal = rotate_surface(normal, normal=True)
            rough = rotate_surface(rough, normal=False)

        color.save(os.path.join(OUT_DIR, f"{key}-{VERSION}-color.webp"), "WEBP", quality=88, method=6)
        # 法线 q92：再低会在平坦区出现块状噪点，解码后是一片假凹凸
        normal.save(os.path.join(OUT_DIR, f"{key}-{VERSION}-normal.webp"), "WEBP", quality=92, method=6)
        # 粗糙度**降采样到 1024**：它是乘在 specular 上的低频量，高频噪点看不出
        # 区别，但 2K 的 webp 有 1.3MB（甲板那张比 color 还大）
        if rough.width > 1024:
            rough = rough.resize((1024, 1024), Image.LANCZOS)
        rough.save(os.path.join(OUT_DIR, f"{key}-{VERSION}-rough.webp"), "WEBP", quality=82, method=6)

        size = color.size[0]
        spin = " ↻90°" if rotate else ""
        print(f"  + {kind:14s} {asset} {res}{spin} → {key}-*.webp ({size}px)")
        done.add(key)

    total = sum(
        os.path.getsize(os.path.join(OUT_DIR, name))
        for name in os.listdir(OUT_DIR)
        if name.endswith(".webp")
    )
    print(f"合计 {total / 1024 / 1024:.1f} MB → {os.path.normpath(OUT_DIR)}")


if __name__ == "__main__":
    main()
