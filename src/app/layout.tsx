import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import './globals.css';
import { PwaRegister } from '@/components/PwaRegister';
import { MetaPixel } from '@/components/MetaPixel';

const editorial = Cormorant_Garamond({
  variable: '--font-editorial',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
});
const interfaceFont = Manrope({
  variable: '--font-interface',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Alana Nails | Beleza em cada detalhe',
  description: 'Conheça os serviços de Alana Nails e solicite seu horário em Quatis, RJ.',
  applicationName: 'Alana Nails',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Alana Nails', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};

export const viewport: Viewport = { themeColor: '#211e1c', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${editorial.variable} ${interfaceFont.variable}`}>
      <body>
        <PwaRegister />
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}
