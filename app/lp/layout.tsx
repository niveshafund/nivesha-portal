// app/lp/layout.tsx
export default function LPLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      {children}
    </div>
  );
}
