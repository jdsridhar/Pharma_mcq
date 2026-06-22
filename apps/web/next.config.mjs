/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produce a self-contained server bundle for slim Docker images (disabled on Windows to avoid symlink EPERM issues).
  output: process.platform === 'win32' ? undefined : 'standalone',
  // Compile the workspace contracts package on the fly.
  transpilePackages: ['@pharmacy/contracts'],
  poweredByHeader: false,
};

export default nextConfig;
