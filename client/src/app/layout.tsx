import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { BottomNav } from '../components/BottomNav';

export const metadata: Metadata = {
  title: 'Tumbledry Operations',
  description: 'Multi-shop laundry and dry cleaning operations platform',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tumbledry',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#254B32',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-surface-cream text-content-primary antialiased min-h-screen flex flex-col">
        <AuthProvider>
          <Header />
          <main className="flex-1 pb-20 max-w-4xl w-full mx-auto p-4 sm:p-6">
            {children}
          </main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
