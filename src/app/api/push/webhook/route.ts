import { timingSafeEqual } from 'node:crypto';
import { sendNotification, setVapidDetails, type PushSubscription as WebPushSubscription } from 'web-push';

export const runtime = 'nodejs';

type AppointmentNotification = {
  id: string;
  client_name: string;
  service_name: string;
  appointment_date: string;
  starts_at: string;
};

type StoredSubscription = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

type WebhookPayload = {
  appointment?: AppointmentNotification;
  subscriptions?: StoredSubscription[];
};

function isEqualSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

function isValidAppointment(value: unknown): value is AppointmentNotification {
  if (!value || typeof value !== 'object') return false;
  const appointment = value as Partial<AppointmentNotification>;
  return typeof appointment.id === 'string' &&
    typeof appointment.client_name === 'string' &&
    typeof appointment.service_name === 'string' &&
    typeof appointment.appointment_date === 'string' &&
    typeof appointment.starts_at === 'string';
}

function isValidSubscription(value: StoredSubscription): value is WebPushSubscription {
  return typeof value.endpoint === 'string' &&
    value.endpoint.startsWith('https://') &&
    typeof value.keys?.p256dh === 'string' &&
    typeof value.keys?.auth === 'string';
}

export async function POST(request: Request) {
  if (!isEqualSecret(request.headers.get('x-alana-push-secret'), process.env.SUPABASE_PUSH_WEBHOOK_SECRET)) {
    return Response.json({ error: 'Acesso não autorizado.' }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await request.json() as WebhookPayload;
  } catch {
    return Response.json({ error: 'Evento inválido.' }, { status: 400 });
  }

  if (!isValidAppointment(payload.appointment) || !Array.isArray(payload.subscriptions)) {
    return Response.json({ error: 'Evento inválido.' }, { status: 400 });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return Response.json({ error: 'O envio de notificações não está configurado.' }, { status: 503 });
  }

  const appointment = payload.appointment;
  const dateParts = appointment.appointment_date.split('-');
  const date = dateParts.length === 3
    ? dateParts[2] + '/' + dateParts[1]
    : appointment.appointment_date;
  const time = appointment.starts_at.slice(0, 5);
  const notification = JSON.stringify({
    title: 'Novo pedido de agendamento',
    body: appointment.client_name + ' solicitou um horário para ' + appointment.service_name + ', em ' + date + ' às ' + time + '.',
    url: '/admin',
    tag: 'appointment-' + appointment.id,
  });

  setVapidDetails(subject, publicKey, privateKey);
  const subscriptions = payload.subscriptions.filter(isValidSubscription).slice(0, 100);
  const deliveries = await Promise.allSettled(subscriptions.map((subscription) =>
    sendNotification(subscription, notification, { TTL: 86400 })
  ));
  const failed = deliveries.filter((delivery) => delivery.status === 'rejected').length;
  if (failed > 0) {
    console.warn('Alana Nails push delivery: ' + failed + ' of ' + deliveries.length + ' notifications failed.');
  }
  return Response.json({ sent: deliveries.length - failed, failed });
}

