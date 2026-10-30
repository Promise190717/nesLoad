import postgres from 'postgres';
const sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false });
const rows = await sql`
  select g.slug, g.console_type, g.year, t_en.title as en, t_zh.title as zh, g.tags, g.genres
    from games g
    left join game_texts t_en on t_en.game_slug = g.slug and t_en.locale = 'en'
    left join game_texts t_zh on t_zh.game_slug = g.slug and t_zh.locale = 'zh'
   order by random() limit 22`;
console.table(rows);
await sql.end();
