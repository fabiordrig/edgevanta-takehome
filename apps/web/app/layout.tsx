import './globals.css';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import Providers from '@/components/Providers';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Edgevanta Estimating Agent',
  description: 'AI-powered construction estimating platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
