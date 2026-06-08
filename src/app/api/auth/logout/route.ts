import { NextRequest, NextResponse } from 'next/server';
import { SIMPLE_AUTH_COOKIE_NAME } from '@/domain/ganancias/auth/simpleAuth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SIMPLE_AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', req.url));
  response.cookies.set({
    name: SIMPLE_AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
