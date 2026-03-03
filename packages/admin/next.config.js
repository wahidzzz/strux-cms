/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cms/core', '@cms/api'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('sharp');
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
    serverActions: {
      bodySizeLimit: '10mb'
    }
  }
}

module.exports = nextConfig
