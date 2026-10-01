'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-2xl bg-brand-600 animate-spin flex items-center justify-center text-white font-bold shadow-lg shadow-brand-500/30">
        BZ
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">Loading Bazario Operations Portal...</p>
    </div>
  );
}
