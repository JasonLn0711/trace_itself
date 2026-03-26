import type { NextRequest } from 'next/server';

import { proxyApiRequest } from '../../_backend';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return proxyApiRequest(request, '/asr/live-sessions', 'text');
}
