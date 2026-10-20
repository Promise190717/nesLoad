/**
 * 长文介绍（开发商 / 机种的「详细介绍」）的段落渲染。
 *
 * **为什么不是 `whitespace-pre-wrap` 一把梭**：库里这些介绍是**多段**文本，段与段之间
 * 存的是 `\n\n`（上游 `about.description` 那个字符串数组就是按空行拼起来的，见
 * `scripts/fill-game-texts-locales.mjs` 的 `aboutParagraph`）。`pre-wrap` 会把那两个
 * 换行**原样画出来** —— 等于一段之间空出整整一行：13px 正文配 `leading-7`（28px），
 * 空行就是 28px，再叠上段前段后，四段下来像四块断开的字（2026-10-20 用户指出
 * 「段与段之间空间太大」）。
 *
 * 所以：按空行切段、每段一个 `<p>`，段间距由 `space-y-3`（12px）统一给。
 * 段**内部**的单个换行仍然保留（`whitespace-pre-line`）—— 那是作者有意断的行，
 * 比如名单、地址、歌词。
 *
 * ⚠️ 段间距只有这一处定义。别在调用点再写 `mt-*` / `space-y-*` 叠加 ——
 *    两层间距叠起来又回到「太大」。
 * ⚠️ 纯文本，不解析 Markdown / HTML：这些内容来自后台输入框和爬虫，转义交给 React。
 */
export default function Paragraphs({
  text,
  className = '',
}: {
  /** 原始文本，段落用空行（`\n\n`）分隔。 */
  text: string;
  /** 排给**外层**的字体 / 字号 / 行高 / 颜色，段落自己继承。 */
  className?: string;
}) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    /* 首尾空行、连续三个以上换行都会切出空串，扔掉 */
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
