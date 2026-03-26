import type { NextRequest } from 'next/server';

import { proxyApiRequest } from '../../../_backend';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return proxyApiRequest(request, `/asr/live-sessions/${sessionId}`);
}
