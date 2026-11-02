import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import doShardedTagCache from '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache';

// 换掉官方 r2IncrementalCache：同样的 key 和结构，只是写入时 gzip（见该文件头）。
import r2IncrementalCache from './open-next.cache';

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
  tagCache: doShardedTagCache({ baseShardSize: 1 }),
  // Serve cached HTML/RSC before initializing the Next server renderer.
  enableCacheInterception: true,
});
