// proxy.ts (project root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Allow auth routes through
  if (pathname.startsWith('/login') || pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // Check for Supabase session cookie
  const cookies = req.cookies.getAll();
  const sessionCookie = cookies.find(c => 
    c.name.includes('auth-token') && !c.name.includes('code-verifier')
  );

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
