export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return Response.json({ error: 'As notificações ainda não foram configuradas.' }, { status: 503 });
  }
  return Response.json({ publicKey }, { headers: { 'Cache-Control': 'no-store' } });
}

