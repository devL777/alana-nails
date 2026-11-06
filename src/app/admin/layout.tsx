import type { Metadata } from 'next';

export const metadata: Metadata = {
  applicationName: 'Alana Nails — Painel',
  manifest: '/admin/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Alana Agenda', statusBarStyle: 'black-translucent' },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
