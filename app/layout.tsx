import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'RestaurantOS',
  description: 'Run your restaurant from anywhere — role-gated operations platform.',
};

// Inlined into <head> as a blocking script so the correct theme class lands on
// <html> before first paint. Mirrors the Zustand persisted shape; falls back to
// 'system' (prefers-color-scheme) if storage is unreadable.
const NO_FLASH_THEME_SCRIPT = `
(function() {
  try {
    var theme = 'system';
    var raw = localStorage.getItem('restaurant-os-store');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.state && typeof parsed.state.theme === 'string') {
        theme = parsed.state.theme;
      }
    }
    var resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    /* localStorage unavailable — stay light */
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Nav />
        <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
