import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { env } from 'cloudflare:workers';
import { service, type Env } from './lib/server';
export async function middleware(req: NextRequest) {
  const pathname = new URL(req.url).pathname;
  if (pathname.startsWith('/admin')) {
    const s = service(env as unknown as Env);
    try {
      await s.init();
      const u = await s.user(req);
      if (u.role !== 'admin')
        return new Response('无权访问管理员后台', { status: 403 });
    } catch {
      return new Response('请登录管理员账号后访问', { status: 403 });
    }
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  return response;
}
export const config = {
  matcher: ['/admin/:path*', '/((?!api|_next|assets|favicon).*)'],
};
