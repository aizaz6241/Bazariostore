import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import AppNavbar from '@/components/AppNavbar';
import MobileBottomNav from '@/components/MobileBottomNav';

export const metadata = {
  title: 'Bazario Operations CRM | Team, Clients & Rewards',
  description: 'Enterprise internal management system for ecommerce admins and members.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen flex flex-col pb-16 md:pb-0">
        <AuthProvider>
          <AppNavbar />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            {children}
          </main>
          <MobileBottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
