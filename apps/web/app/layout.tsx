import type { Metadata } from 'next';

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
