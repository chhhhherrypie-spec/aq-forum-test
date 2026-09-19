import { env } from 'cloudflare:workers';
import { service, type Env } from '@/lib/server';

export const dynamic = 'force-dynamic';

const handler = (request: Request) =>
  service(env as unknown as Env).handle(request);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
export const HEAD = handler;
