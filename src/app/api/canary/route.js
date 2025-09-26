export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, where: 'canary', method: 'GET' });
}

export async function POST() {
  return Response.json({ ok: true, where: 'canary', method: 'POST' });
}

