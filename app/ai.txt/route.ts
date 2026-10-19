import { buildAiTxt } from '@/lib/ai-policy';
import { resolveSiteOrigin } from '@/lib/site';

/*
 * /ai.txt —— 给 AI 读的站点政策（机器可读版，Spawning 的 ai.txt 约定）。
 *
 * 和 /llms.txt 是**同一份政策的两种格式**，正文都出自 lib/ai-policy.ts，
 * 这里只负责挑格式、定响应头。两份同时提供是因为不同抓取器认的文件不一样：
 * 有的只扫 /ai.txt，有的只读 /llms.txt，谁都没到「事实标准」的程度，
 * 多一个文件成本几乎为零，漏一个就有一半 AI 看不到政策。
 *
 * 走 route handler 的理由与 /llms.txt 相同（绝对地址 + 内容跟常量走），
 * 见 app/llms.txt/route.ts 的注释，这里不重复。
 */
/*
 * ⚠️ 和 app/robots.ts 同一个理由：不写这行，构建期会被预渲染成静态文本，
 * 域名落到兜底值，线上会吐出一份写着 http://localhost:3000 的 ai.txt。
 */
export const revalidate = 86400;

export async function GET() {
  const origin = await resolveSiteOrigin();

  return new Response(buildAiTxt(origin), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
