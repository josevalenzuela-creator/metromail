import type { AiInsight } from '@/db/schema';
import { HttpError } from './session';

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
const MODEL = () => process.env.AI_MODEL || 'claude-haiku-5-5';

async function claude(system: string, user: string, maxTokens = 900): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(400, 'La IA no está activada: falta ANTHROPIC_API_KEY en el servidor.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new HttpError(502, `La IA no respondió (${j?.error?.message || r.status})`);
  return (j.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('').trim();
}

const SYSTEM = 'Eres el asistente de correo de un gerente general de una empresa de telecomunicaciones en Chile. Escribes en español de Chile, claro y profesional. Nunca inventas datos que no estén en el correo.';

/** Resume un hilo y extrae solicitudes, compromisos, prioridad y próxima acción. */
export async function analyzeThread(threadText: string, myName: string): Promise<AiInsight> {
  const prompt = `Analiza este hilo de correo para ${myName}. Responde SOLO con JSON válido con esta forma exacta:
{"summary": "2 o 3 frases", "requests": ["lo que le piden a ${myName}"], "commitments": ["lo que ${myName} prometió"], "priority": "Alta | Media | Baja, y una razón breve", "nextAction": "la acción concreta recomendada"}
Si no hay solicitudes o compromisos, usa listas vacías.

<hilo>
${threadText.slice(0, 16000)}
</hilo>`;
  const out = await claude(SYSTEM, prompt, 700);
  const m = out.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : out);
    return {
      summary: String(j.summary || ''),
      requests: Array.isArray(j.requests) ? j.requests.map(String).slice(0, 6) : [],
      commitments: Array.isArray(j.commitments) ? j.commitments.map(String).slice(0, 6) : [],
      priority: String(j.priority || ''),
      nextAction: String(j.nextAction || ''),
      model: MODEL(),
    };
  } catch {
    return { summary: out.slice(0, 600), requests: [], commitments: [], priority: '', nextAction: '', model: MODEL() };
  }
}

const TONES: Record<string, string> = {
  ejecutivo: 'directo y ejecutivo, frases cortas',
  formal: 'formal y cortés, trato de usted',
  cercano: 'cercano y cordial, trato de tú',
  breve: 'muy breve, dos o tres líneas',
};

/** Redacta un borrador de respuesta. No incluye firma: MetroMail la agrega al enviar. */
export async function draftReply(threadText: string, myName: string, tone: string, instructions: string): Promise<string> {
  const prompt = `Redacta la respuesta de ${myName} al último mensaje de este hilo.
Tono: ${TONES[tone] || TONES.ejecutivo}.
${instructions ? `Indicaciones de ${myName}: ${instructions}\n` : ''}Reglas: empieza con un saludo al remitente por su nombre; no incluyas firma, nombre ni cargo al final (se agregan aparte); termina con una despedida breve como "Saludos," o "Quedo atento."; no inventes cifras, fechas ni compromisos que no estén en el hilo o en las indicaciones; si falta un dato usa [COMPLETAR].
Devuelve solo el texto del correo.

<hilo>
${threadText.slice(0, 16000)}
</hilo>`;
  return claude(SYSTEM, prompt, 800);
}

/** Mejora un texto escrito por el usuario manteniendo su contenido. */
export async function improveText(text: string, tone: string): Promise<string> {
  return claude(SYSTEM, `Mejora la redacción de este correo con tono ${TONES[tone] || TONES.ejecutivo}. Mantén el contenido y los datos; no agregues firma. Devuelve solo el texto.\n\n<correo>\n${text.slice(0, 8000)}\n</correo>`, 800);
}
