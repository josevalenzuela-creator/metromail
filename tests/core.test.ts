import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bizHours, localDate } from '../src/lib/biz';
import { buildMime, encodeAddressList } from '../src/lib/mime';
import { sanitizeSignature, renderSignature } from '../src/lib/signature';
import { parseAddressList, type GMessage } from '../src/lib/gmail';
import { computeSla, eventsFromThread, senderType } from '../src/lib/sla';
import { categorize } from '../src/lib/inbox';

// Santiago en octubre es UTC-3.
const cl = (s: string) => new Date(s + '-03:00');

test('bizHours: mismo día hábil', () => {
  assert.equal(bizHours(cl('2026-10-14T10:00:00'), cl('2026-10-14T12:30:00'), true), 2.5);
});
test('bizHours: viernes tarde a lunes mañana', () => {
  // vie 18:00 → lun 10:00 = 1 h viernes + 1 h lunes
  assert.equal(bizHours(cl('2026-10-16T18:00:00'), cl('2026-10-19T10:00:00'), true), 2);
});
test('bizHours: fuera de horario no suma', () => {
  assert.equal(bizHours(cl('2026-10-14T20:00:00'), cl('2026-10-14T23:00:00'), true), 0);
  assert.equal(bizHours(cl('2026-10-14T20:00:00'), cl('2026-10-14T23:00:00'), false), 3);
});
test('localDate usa la zona de Santiago', () => {
  assert.equal(localDate(new Date('2026-10-15T02:00:00Z')), '2026-10-14');
});

test('parseAddressList con nombres, comillas y comas', () => {
  const r = parseAddressList('"Pérez, Ana" <Ana@Cliente.cl>, bob@x.com, Carla <carla@y.cl>');
  assert.deepEqual(r.map((a) => a.email), ['ana@cliente.cl', 'bob@x.com', 'carla@y.cl']);
  assert.equal(r[0].name, 'Pérez, Ana');
});

test('encodeAddressList codifica nombres no ASCII', () => {
  const s = encodeAddressList('José Núñez <jose@metrowan.cl>');
  assert.match(s, /=\?UTF-8\?B\?.+\?= <jose@metrowan\.cl>/);
});

test('buildMime: alternativa + adjunto + respuesta', () => {
  const raw = buildMime({ from: 'José <jose@metrowan.cl>', to: 'a@b.cl', subject: 'Cotización año 2027', text: 'hola', html: '<p>hola</p>', inReplyTo: '<x@y>', references: '<x@y>', attachments: [{ filename: 'a.txt', mimeType: 'text/plain', base64: Buffer.from('hi').toString('base64') }] });
  assert.match(raw, /multipart\/mixed/);
  assert.match(raw, /multipart\/alternative/);
  assert.match(raw, /In-Reply-To: <x@y>/);
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.match(raw, /filename="?a\.txt"?/);
  assert.doesNotMatch(raw, /\r?\n\r?\n[\s\S]*Cotización/); // asunto no viaja sin codificar
});

test('sanitizeSignature quita scripts y handlers', () => {
  const r = sanitizeSignature('<p onclick="x()">Hola<script>alert(1)</script></p><img src="javascript:x"><a href="https://ok.cl">ok</a>');
  assert.doesNotMatch(r.html, /script|onclick|javascript:/i);
  assert.match(r.html, /https:\/\/ok\.cl/);
  assert.ok(r.warnings.length > 0);
});

test('renderSignature con imagen usa CID incrustado', () => {
  const png = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');
  const r = renderSignature({ name: 'x', type: 'imagen', body: 'José', html: '', imageData: png, imageWidth: 100, imagePos: 'izquierda' });
  assert.equal(r.inline.length, 1);
  assert.match(r.html, new RegExp('cid:' + r.inline[0].cid));
});

const msg = (id: string, at: string, from: string, to: string, cc = '', extra: { name: string; value: string }[] = []): GMessage => ({
  id, threadId: 't1', internalDate: String(cl(at).getTime()), labelIds: ['INBOX'],
  payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: from }, { name: 'To', value: to }, { name: 'Cc', value: cc }, ...extra] },
});

test('eventsFromThread: espera abierta y cerrada por mi respuesta', () => {
  const ev = eventsFromThread([
    msg('1', '2026-10-14T10:00:00', 'cliente@acme.cl', 'jose@metrowan.cl'),
    msg('2', '2026-10-14T10:30:00', 'cliente@acme.cl', 'jose@metrowan.cl'), // segundo mensaje no abre otra espera
    msg('3', '2026-10-14T12:00:00', 'jose@metrowan.cl', 'cliente@acme.cl'),
    msg('4', '2026-10-14T15:00:00', 'ana@metrowan.cl', 'otro@metrowan.cl', 'jose@metrowan.cl'),
  ], 'jose@metrowan.cl', 'metrowan.cl', []);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].messageId, '1');
  assert.equal(ev[0].senderType, 'Clientes');
  assert.ok(ev[0].repliedAt);
  assert.equal(ev[1].toMe, false);
  assert.equal(ev[1].senderType, 'Equipo');
  assert.equal(ev[1].repliedAt, null);
});

test('eventsFromThread ignora correo automático', () => {
  const ev = eventsFromThread([
    msg('1', '2026-10-14T10:00:00', 'noreply@banco.cl', 'jose@metrowan.cl'),
    msg('2', '2026-10-14T10:00:00', 'news@tienda.cl', 'jose@metrowan.cl', '', [{ name: 'List-Unsubscribe', value: '<mailto:x>' }]),
  ], 'jose@metrowan.cl', 'metrowan.cl', []);
  assert.equal(ev.length, 0);
});

test('senderType y proveedores', () => {
  assert.equal(senderType('x@ventas.metrowan.cl', 'metrowan.cl', []), 'Equipo');
  assert.equal(senderType('x@courier.com', 'metrowan.cl', ['courier.com']), 'Proveedores');
  assert.equal(senderType('x@gmail.com', 'metrowan.cl', []), 'Clientes');
});

test('computeSla: a tiempo, tarde y atraso actual', () => {
  const now = cl('2026-10-15T18:00:00');
  const targets = { Clientes: 4, Equipo: 8, Proveedores: 24 };
  const s = computeSla([
    { threadId: 'a', senderType: 'Clientes', toMe: true, receivedAt: cl('2026-10-14T10:00:00'), handledAt: cl('2026-10-14T11:00:00') }, // 1 h ok
    { threadId: 'b', senderType: 'Clientes', toMe: true, receivedAt: cl('2026-10-14T10:00:00'), handledAt: cl('2026-10-14T17:00:00') }, // 7 h tarde
    { threadId: 'c', senderType: 'Clientes', toMe: true, receivedAt: cl('2026-10-15T09:00:00'), handledAt: null }, // 9 h sin responder: vencido
    { threadId: 'd', senderType: 'Equipo', toMe: false, receivedAt: cl('2026-10-14T10:00:00'), handledAt: cl('2026-10-14T11:00:00') }, // CC, excluido
  ], targets, true, 30, false, now);
  assert.equal(s.measured, 3);
  assert.equal(s.ok, 1);
  assert.equal(s.pct, 33);
  assert.equal(s.lateNow, 1);
  assert.equal(s.lateThreads[0].threadId, 'c');
});

test('categorize', () => {
  assert.equal(categorize(['CATEGORY_PROMOTIONS'], 'x@tienda.cl', 'metrowan.cl', []), 'Boletines');
  assert.equal(categorize(['INBOX'], 'ana@metrowan.cl', 'metrowan.cl', []), 'Equipo');
});
