/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'api.xyra.chat'],
  },
};

module.exports = nextConfig;
