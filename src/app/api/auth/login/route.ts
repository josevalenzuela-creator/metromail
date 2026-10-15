import { NextResponse } from 'next/server';
import { authUrl } from '@/lib/google';
import { randomToken } from '@/lib/crypto';
import { api } from '@/lib/session';

export const GET = api(async () => {
  const state = randomToken();
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set('mm_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
});
