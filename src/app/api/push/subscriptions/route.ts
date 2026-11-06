import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type PushKeys = {
  p256dh?: unknown;
  auth?: unknown;
};

type PushSubscriptionBody = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: PushKeys;
};

type AdminClientResult =
  | { supabase: SupabaseClient; user: User }
  | { response: Response };

async function getAdminClient(request: Request): Promise<AdminClientResult> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { response: Response.json({ error: 'Acesso não autorizado.' }, { status: 401 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return { response: Response.json({ error: 'O painel ainda não está conectado.' }, { status: 503 }) };
  }

  const accessToken = authorization.slice('Bearer '.length).trim();
  if (!accessToken) {
    return { response: Response.json({ error: 'Acesso não autorizado.' }, { status: 401 }) };
  }

  const supabase = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + accessToken } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) {
    return { response: Response.json({ error: 'A sessão expirou. Entre novamente.' }, { status: 401 }) };
  }

  const { data: admin, error: adminError } = await supabase
    .from('studio_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return { response: Response.json({ error: 'Acesso exclusivo à administração.' }, { status: 403 }) };
  }

  return { supabase, user };
}

export async function POST(request: Request) {
  const admin = await getAdminClient(request);
  if ('response' in admin) return admin.response;

  let body: PushSubscriptionBody;
  try {
    body = await request.json() as PushSubscriptionBody;
  } catch {
    return Response.json({ error: 'Inscrição de notificações inválida.' }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
  if (!endpoint.startsWith('https://') || endpoint.length > 4096 || !p256dh || !auth) {
    return Response.json({ error: 'Inscrição de notificações inválida.' }, { status: 400 });
  }

  const subscription = {
    endpoint,
    expirationTime: typeof body.expirationTime === 'number' ? body.expirationTime : null,
    keys: { p256dh, auth },
  };
  const { error } = await admin.supabase.from('admin_push_subscriptions').upsert({
    user_id: admin.user.id,
    endpoint,
    subscription,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  if (error) {
    return Response.json({ error: 'Não foi possível salvar esta inscrição.' }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const admin = await getAdminClient(request);
  if ('response' in admin) return admin.response;

  let body: { endpoint?: unknown };
  try {
    body = await request.json() as { endpoint?: unknown };
  } catch {
    return Response.json({ error: 'Inscrição de notificações inválida.' }, { status: 400 });
  }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint.startsWith('https://') || endpoint.length > 4096) {
    return Response.json({ error: 'Inscrição de notificações inválida.' }, { status: 400 });
  }

  const { error } = await admin.supabase.from('admin_push_subscriptions')
    .delete()
    .eq('user_id', admin.user.id)
    .eq('endpoint', endpoint);

  if (error) {
    return Response.json({ error: 'Não foi possível desativar esta inscrição.' }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}

