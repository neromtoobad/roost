import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Roost',
    short_name: 'Roost',
    description: 'Hire an AI fund manager for tokenized stocks. It trades 24/7 on BNB Chain, inside your limits, from your own wallet.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F5EE',
    theme_color: '#C8FF3D',
    icons: [{ src: '/icon.png', sizes: '1024x1024', type: 'image/png' }],
  };
}
