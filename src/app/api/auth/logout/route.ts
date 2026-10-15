import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/google';
import { SESSION_COOKIE } from '@/lib/session';

export async function POST() {
  const res = NextResponse.json({ ok: true, redirect: `${appUrl()}/` });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
