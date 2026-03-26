import type { NextRequest } from 'next/server';

const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

type ProxyBodyKind = 'none' | 'text' | 'arrayBuffer' | 'formData';

function copyResponseHeaders(source: Headers) {
  const headers = new Headers();
  const contentType = source.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }
  const setCookie = source.get('set-cookie');
  if (setCookie) {
    headers.set('set-cookie', setCookie);
  }
  return headers;
}

export async function proxyApiRequest(
  request: NextRequest,
  path: string,
  bodyKind: ProxyBodyKind = 'none'
) {
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }

  let body: BodyInit | undefined;
  if (bodyKind === 'text') {
    const contentType = request.headers.get('content-type');
    if (contentType) {
      headers.set('content-type', contentType);
    }
    body = await request.text();
  } else if (bodyKind === 'arrayBuffer') {
    const contentType = request.headers.get('content-type');
    if (contentType) {
      headers.set('content-type', contentType);
    }
    body = await request.arrayBuffer();
  } else if (bodyKind === 'formData') {
    body = await request.formData();
  }

  const response = await fetch(`${apiProxyTarget}/api${path}`, {
    method: request.method,
    headers,
    body
  });

  return new Response(response.body, {
    status: response.status,
    headers: copyResponseHeaders(response.headers)
  });
}
