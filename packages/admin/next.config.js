/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cms/core', '@cms/api'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('sharp', 'chokidar', 'fsevents');
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'chokidar', 'fsevents'],
    serverActions: {
      bodySizeLimit: '10mb'
    }
  }
}

module.exports = nextConfig
