// app/auth/callback/layout.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function CallbackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
