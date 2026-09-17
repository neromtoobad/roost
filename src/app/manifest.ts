import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stocklings',
    short_name: 'Stocklings',
    description: 'Adopt a Stockling — an AI with its own wallet that invests for you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F5EE',
    theme_color: '#C8FF3D',
    icons: [{ src: '/icon.png', sizes: '1024x1024', type: 'image/png' }],
  };
}
