import type { Metadata } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600'],
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Nivesha Ventures Portal',
  description: 'Fund management portal for Nivesha Ventures',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmMono.variable} font-sans bg-[#f4f3ef] text-[#1a1917] antialiased`}>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            {/* Top bar */}
            <header className="h-[50px] bg-white border-b border-[#e8e6df] flex items-center px-[26px] gap-2.5 flex-shrink-0 sticky top-0 z-10">
              <div className="flex items-center gap-1.5 bg-[#f9f8f5] border border-[#e8e6df] rounded-[7px] px-3 h-8 flex-1 max-w-[320px]">
                <svg className="w-3 h-3 text-[#9b9890] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search funds, companies…"
                  className="border-none bg-transparent outline-none text-[12.5px] text-[#1a1917] w-full font-sans placeholder:text-[#9b9890]"
                />
              </div>
              <div className="ml-auto flex gap-1.5">
                <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white text-[#1a1917] hover:bg-[#f9f8f5] transition-colors">
                  All Funds
                </button>
                <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white text-[#1a1917] hover:bg-[#f9f8f5] transition-colors">
                  📅 Today
                </button>
              </div>
            </header>
            {/* Page content */}
            <main className="flex-1 p-[26px_30px] overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
