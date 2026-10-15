import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { appUrl, exchangeCode, fetchUserInfo, saveTokens } from '@/lib/google';
import { createSessionToken, HttpError, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { upsertUserOnLogin } from '@/lib/org';
import { db, schema } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

function fail(msg: string) {
  return NextResponse.redirect(`${appUrl()}/?error=${encodeURIComponent(msg)}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const err = url.searchParams.get('error');
  if (err) return fail(err === 'access_denied' ? 'Cancelaste el acceso a Google.' : `Google devolvió un error: ${err}`);
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const expected = req.cookies.get('mm_oauth_state')?.value;
  if (!code || !state || !expected || state !== expected) return fail('La sesión de inicio expiró. Intenta de nuevo.');
  try {
    const tokens = await exchangeCode(code);
    if (!tokens.scope.includes('gmail.modify')) return fail('Debes aceptar el acceso a Gmail para usar MetroMail.');
    const info = await fetchUserInfo(tokens.access_token);
    if (!info.email || info.email_verified === false) return fail('Tu cuenta de Google no tiene un correo verificado.');
    const user = await upsertUserOnLogin(info);
    const [prev] = await db().select().from(schema.accounts).where(eq(schema.accounts.userId, user.id)).limit(1);
    await saveTokens(user.id, user.email, tokens, prev ? decrypt(prev.refreshToken) : undefined);
    const res = NextResponse.redirect(`${appUrl()}/app`);
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
    res.cookies.delete('mm_oauth_state');
    return res;
  } catch (e) {
    console.error(e);
    return fail(e instanceof HttpError ? e.message : 'No se pudo completar el inicio de sesión.');
  }
}
