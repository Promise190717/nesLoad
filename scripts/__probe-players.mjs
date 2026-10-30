import postgres from 'postgres';

const sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false });

const byConsole = await sql`
  select console_type, count(*)::int as n,
         count(*) filter (where players is not null)::int as filled
    from games group by console_type order by n desc`;
console.log('=== 机种分布 ===');
console.table(byConsole);

const tagTop = await sql`
  select t, count(*)::int as n
    from games, unnest(tags) as t
   group by t order by n desc limit 40`;
console.log('=== tags 前 40 ===');
console.table(tagTop);

const genreTop = await sql`
  select g, count(*)::int as n
    from games, unnest(genres) as g
   group by g order by n desc limit 40`;
console.log('=== genres 前 40 ===');
console.table(genreTop);

const like = await sql`
  select slug, console_type, tags, genres
    from games
   where array_to_string(tags, ' ') ~* '(player|multi|2p|1p|coop|双人|多人)'
      or array_to_string(genres, ' ') ~* '(player|multi|2p|coop)'
   limit 15`;
console.log('=== tags/genres 里带 player/多人 字样的样例 ===');
console.dir(like, { depth: 5 });

await sql.end();
