import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../styles.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'trace_itself',
  description: 'Private self-hosted progress dashboard'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
