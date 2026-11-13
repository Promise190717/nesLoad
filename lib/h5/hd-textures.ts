import * as THREE from 'three';
import { surfaceTileMeters, type SurfaceKind, type SurfaceMaps } from './surface-textures';

/**
 * **实拍扫描的 PBR 贴图**（ambientCG，CC0）—— 关卡大件表面的高清版。
 *
 * ## 这一层到底替代了什么
 *
 * `surface-textures.ts` 用 Canvas 2D 现画每一张图（程序化噪声 + 画出来的板缝 /
 * 锁杆 / 绊钉）。它解决的是「有法线、按米铺」，但**细节的分布是伪随机生成的** ——
 * 一块钢板上的划痕、漆面剥落、铆钉周围的锈渍，程序化永远只能近似成均匀噪声，
 * 凑近看就露馅。这里换成真实拍摄 / 扫描的图集后，同一块面积上有几百处互不重复
 * 的磨损痕迹，这才是「像使命召唤」的那部分。
 *
 * ## 三层叠起来是一套东西，不是三选一
 *
 *   1. `surface-textures.ts` 先同步画一份**兜底图** —— 关卡不能在等网络时才建，
 *      而且 base64 内联的 canvas 图保证「断网 / 图挂了」也有一张能看的脸；
 *   2. 本文件异步拉 webp，到货后由 `level.applySurfaceTexture()` 换掉材质上的
 *      三张贴图（**几何 UV 不动**，`tileMeters` 由 `surface-textures` 的 SPEC 定，
 *      所以两者必须指同一份数字，见 `surfaceTileMeters()`）；
 *   3. `level.ts` 里集装箱的**锁杆 / 角件 / 门框是几何**，不是画出来的 —— 画在
 *      贴图上的凸起一换图就没了，而真实扫图里也没有这些结构。
 *
 * ## 铁律
 *
 * - **永不 dispose**：和 `surface-textures.ts` / `sky.ts` 一样是模块级缓存。
 *   材质每次 `buildLevel` 重建，贴图不重建。
 * - **一张失败就整类放弃**：三张图缺一张（法线没到、色彩空间搞错）比不换更糟，
 *   宁可留程序化兜底。
 * - **不重试**：本地静态资源拿不到就是部署问题，重试只会每次载入都白等一次超时。
 */

interface HdSource {
  /** 三个文件共用的前缀，实际是 `<base>-color.webp` / `-normal.webp` / `-rough.webp` */
  base: string;
}

/**
 * 每个表面从哪张图来。生成脚本见 `scripts/h5-surfaces.py`（带素材 ID 与裁剪理由）。
 *
 * 🔴 **`-v2` 是贴图版本号，改图必须和脚本里的 `VERSION` 一起 +1**：`public/_headers`
 * 给 `/h5/*` 挂了 86400 的缓存，同名文件换内容浏览器会继续用旧的。
 *
 * 侧板和端门**共用同一个文件**：真实集装箱端门本来就是同一种波纹板。但这里
 * 会各自 `load` 一次，拿到两个独立的 `Texture` 实例 —— 端门要把整张图压进一面
 * 门（`level.ts` 的 `doorRepeat`），共享实例会让 side 和 door 的 repeat 打架。
 * 浏览器缓存保证网络层面只下载一次。
 */
const HD_SOURCES: Partial<Record<SurfaceKind, HdSource>> = {
  deck: { base: '/h5/tex/deck-v2' },
  container: { base: '/h5/tex/container-v2' },
  containerDoor: { base: '/h5/tex/container-v2' },
  containerRoof: { base: '/h5/tex/containerRoof-v2' },
  wood: { base: '/h5/tex/wood-v2' },
  // 'steel'（涂漆钢板）**没有条目**：2026-11-13 用户要求墙面金属板全部改用
  // 甲板那张防滑钢板，`level.ts` 里已经没有任何材质引用 'steel'。恢复时既要在
  // 这里加回来，也要把 `scripts/h5-surfaces.py` 里被注释掉的那条放出来重跑。
};

let pending: Promise<Map<SurfaceKind, SurfaceMaps> | null> | null = null;

function loadTexture(loader: THREE.TextureLoader, url: string, srgb: boolean): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // 甲板 / 箱体有大量掠射角，各向异性不给到 8 远处会糊成一片灰
        texture.anisotropy = 8;
        // 只有底色是 sRGB。法线和粗糙度是**数据**不是颜色，按 sRGB 解码会把
        // 法线的 z 分量压偏，光照方向整片歪掉（这是最容易翻的一处）
        texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/**
 * 拉全套高清贴图。成功返回 kind → 三张图的映射，任何一类失败就把它从结果里剔掉。
 *
 * 结果缓存在模块级：重复进关卡（换模式 / 重开一局）不会重新下载，也不会重新
 * 解码 —— 解码 5 套 webp 是几百毫秒的主线程活。
 */
export function loadHdSurfaces(): Promise<Map<SurfaceKind, SurfaceMaps> | null> {
  if (pending) return pending;

  const loader = new THREE.TextureLoader();

  pending = Promise.all(
    (Object.entries(HD_SOURCES) as [SurfaceKind, HdSource][]).map(async ([kind, source]) => {
      const [map, normalMap, roughnessMap] = await Promise.all([
        loadTexture(loader, `${source.base}-color.webp`, true),
        loadTexture(loader, `${source.base}-normal.webp`, false),
        loadTexture(loader, `${source.base}-rough.webp`, false),
      ]);
      if (!map || !normalMap || !roughnessMap) return null;
      const maps: SurfaceMaps = {
        map,
        normalMap,
        roughnessMap,
        // 🔴 不在这里自己写米数：几何 UV 是 `buildLevel` 时按 SPEC 铺死的，
        // 这里必须与之一致，否则贴图会被拉伸成完全不同的纹素密度
        tileMeters: surfaceTileMeters(kind),
      };
      return [kind, maps] as const;
    }),
  ).then((entries) => {
    const result = new Map<SurfaceKind, SurfaceMaps>();
    for (const entry of entries) if (entry) result.set(entry[0], entry[1]);
    if (result.size === 0) {
      // 全军覆没：清掉 promise，下次进关卡再试一次（只可能是部署漏了文件）
      pending = null;
      return null;
    }
    return result;
  });

  return pending;
}
