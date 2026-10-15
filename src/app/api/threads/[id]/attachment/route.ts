import { api, HttpError, requireUser } from '@/lib/session';
import { b64urlToBuffer, getAttachment } from '@/lib/gmail';

export const maxDuration = 60;

export const GET = api(async (req: Request) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const m = sp.get('m'), a = sp.get('a');
  if (!m || !a) throw new HttpError(400, 'Faltan parámetros');
  const name = (sp.get('name') || 'adjunto').replace(/[\r\n"]/g, '_');
  const type = sp.get('type') || 'application/octet-stream';
  const data = await getAttachment(user.id, m, a);
  const buf = b64urlToBuffer(data.data);
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'private, max-age=300',
    },
  });
});
