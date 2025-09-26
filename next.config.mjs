/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // habilitamos AVIF/WebP y los hosts externos que estás usando
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.oscarbarbieri.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'oscarbarbieri.com',
        pathname: '/**',
      },
      // Vercel Blob (guardar/cargar imágenes en producción)
      {
        protocol: 'https',
        hostname: '**.vercel-storage.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.blob.vercel-storage.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
