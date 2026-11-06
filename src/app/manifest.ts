import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Alana Nails — Agenda',
    short_name: 'Alana Nails',
    description: 'Agenda de atendimento — demonstração',
    start_url: '/admin',
    display: 'standalone',
    background_color: '#f7f4ee',
    theme_color: '#211e1c',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
