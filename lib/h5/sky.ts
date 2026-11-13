import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

/**
 * 真实天空（HDRI）—— 背景与 IBL 的唯一出口。
 *
 * 来源：Poly Haven「Aristea Wreck」2K HDR，**CC0 公有领域**（可商用、免署名），
 * 已下载到 `public/h5/sky/aristea_wreck_2k.hdr`。选它是因为这张的机位就在
 * 散货船甲板上（正午、薄云、海平面），和本作的运输船关卡同一套光线逻辑：
 * 太阳在中高角度、海面反光偏冷，甲板的蓝灰与天空的冷暖过渡能接上。
 *
 * ## 为什么不是「换一张天空球贴图」而是换掉整条光照
 *
 * 旧的天空只是 `level.ts` 里一张 Canvas 渐变贴在球上（`MeshBasicMaterial`，
 * 不吃光），所以它只能当背景看，对场景亮度一点贡献都没有 —— 金属件全靠
 * `RoomEnvironment` 那张摄影棚假反射撑着，这是「塑料感」的根源。
 *
 * 换成 HDR 之后同一份数据干两件事：
 *   1. `scene.background` 当背景（等距柱状投影，直接铺天球）；
 *   2. `PMREMGenerator.fromEquirectangular` 烘成预过滤环境图，当
 *      `scene.environment` —— 甲板、枪身、集装箱的反射开始有真实的天光层次。
 *
 * ## 模块级缓存，**永不 dispose**
 *
 * 和 `surface-textures.ts` 的贴图同一条铁律：这份 HDR 解出来是
 * 2048×1024 的半浮点纹理（≈16MB 显存），重进一次游戏就重新解码一遍太浪费，
 * 而且 PMREM 烘焙是几十毫秒的 GPU 阻塞，放在载入途中会让加载条卡一下。
 * 缓存 promise 连「并发重复请求」也一并挡掉（两个引擎实例同时构建时只会解码一次）。
 */

export interface SkyEnvironment {
  /** 等距柱状 HDR，直接赋给 `scene.background` */
  background: THREE.Texture;
  /** PMREM 预过滤环境图，赋给 `scene.environment` */
  environment: THREE.Texture;
}

const SKY_URL = '/h5/sky/aristea_wreck_2k.hdr';

let pending: Promise<SkyEnvironment | null> | null = null;

/** 天空的「地平线雾色」。背景换成实拍 HDR 之后，雾必须跟着走，否则远景是硬断层。 */
export const SKY_FOG_COLOR = 0xb9cad6;

/**
 * 手绘天空球的对象名。`level.ts` 里给球挂上这个名字，HDR 到位后引擎按名字
 * 把它藏掉 —— `Level` 的公开接口里不为了这一件事多加一个字段。
 */
export const SKY_OBJECT_NAME = 'h5-sky';

export function loadSkyEnvironment(renderer: THREE.WebGLRenderer): Promise<SkyEnvironment | null> {
  if (pending) return pending;

  pending = new Promise<SkyEnvironment | null>((resolve) => {
    new RGBELoader().load(
      SKY_URL,
      (hdr) => {
        // HDR 是线性数据：贴到背景上要按线性色彩空间解释，交给色调映射去压高光。
        // 标成 SRGB 会把太阳和云一起提亮成一片死白。
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        hdr.colorSpace = THREE.LinearSRGBColorSpace;
        hdr.minFilter = THREE.LinearFilter;
        hdr.magFilter = THREE.LinearFilter;
        hdr.generateMipmaps = false; // 背景只按 LOD 0 采；Mipmap 多占 1/3 显存

        const pmrem = new THREE.PMREMGenerator(renderer);
        const environment = pmrem.fromEquirectangular(hdr).texture;
        pmrem.dispose();

        resolve({ background: hdr, environment });
      },
      undefined,
      () => {
        // 拉不到就保持旧天空球（Canvas 渐变）与 RoomEnvironment 兜底 ——
        // 不能因为一张背景图让整局游戏开不起来。**不重试**：本地静态资源都
        // 拿不到说明部署有问题，重试只会每次载入都白等一次超时。
        pending = null;
        resolve(null);
      },
    );
  });

  return pending;
}
