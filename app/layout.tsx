import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'RestaurantOS',
  description: 'Run your restaurant from anywhere — role-gated operations platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <Nav />
        <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
