import { renderOgImage } from '@/lib/og-image';

// Explicit image routes work with both public and admin root layouts without
// metadata inheritance from a nonexistent shared root layout.
export const dynamic = 'force-static';
export function GET() {
  return renderOgImage();
}
