import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Roost',
    short_name: 'Roost',
    description: 'Adopt a Fledgling — an AI with its own wallet that invests for you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0E11',
    theme_color: '#FCD535',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  };
}
