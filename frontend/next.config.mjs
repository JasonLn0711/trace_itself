const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
