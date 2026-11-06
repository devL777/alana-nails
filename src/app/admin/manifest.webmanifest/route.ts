import type { MetadataRoute } from 'next';

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: '/admin',
    name: 'Alana Nails — Painel',
    short_name: 'Alana Agenda',
    description: 'Agenda administrativa da Alana Nails.',
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    background_color: '#f7f4ee',
    theme_color: '#211e1c',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };

  return Response.json(manifest, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
