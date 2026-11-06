'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Booking, BookingStatus, Service, StudioSettings } from '@/lib/booking';
import { DEFAULT_SETTINGS } from '@/lib/booking';

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!browserClient) browserClient = createClient(url, key);
  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

type DbService = {
  id: string; name: string; detail: string; duration_minutes: number | null;
  price: number; symbol: string; active: boolean;
};

export async function fetchPublicStudioSettings(): Promise<StudioSettings> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('A conexão com a agenda ainda não está configurada.');
  const [servicesResult, hoursResult, blockedResult, settingsResult] = await Promise.all([
    supabase.from('studio_services').select('id,name,detail,duration_minutes,price,symbol,active,display_order').eq('active', true).order('display_order'),
    supabase.from('studio_hours').select('weekday,enabled,opens_at,closes_at,break_starts_at,break_ends_at').order('weekday'),
    supabase.from('blocked_dates').select('blocked_date'),
    supabase.from('studio_settings').select('deposit_percent').eq('singleton', true).maybeSingle(),
  ]);
  for (const result of [servicesResult, hoursResult, blockedResult, settingsResult]) {
    if (result.error) throw result.error;
  }
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const row = hoursResult.data?.find((item) => item.weekday === index);
    return {
      enabled: Boolean(row?.enabled),
      start: row?.opens_at?.slice(0, 5) ?? '09:00',
      end: row?.closes_at?.slice(0, 5) ?? '18:00',
      breakStart: row?.break_starts_at?.slice(0, 5) ?? row?.break_ends_at?.slice(0, 5) ?? '12:00',
      breakEnd: row?.break_ends_at?.slice(0, 5) ?? row?.break_starts_at?.slice(0, 5) ?? '12:00',
    };
  });
  return {
    services: (servicesResult.data as DbService[] | null ?? []).map((item) => ({
      id: item.id, name: item.name, detail: item.detail, durationMinutes: item.duration_minutes,
      price: Number(item.price), symbol: item.symbol, active: item.active,
    } as Service)),
    weekly,
    blockedDates: (blockedResult.data ?? []).map((item) => item.blocked_date),
    depositPercent: settingsResult.data?.deposit_percent ?? DEFAULT_SETTINGS.depositPercent,
  };
}

export async function fetchPublicBusyBookings(date: string): Promise<Booking[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('A conexão com a agenda ainda não está configurada.');
  const { data, error } = await supabase.rpc('get_public_busy_slots', { p_date: date });
  if (error) throw error;
  return (data ?? []).map((item: { service_id: string; starts_at: string; duration_minutes: number }, index: number) => ({
    id: `busy-${date}-${index}`, serviceId: item.service_id, date, time: item.starts_at.slice(0, 5),
    name: '', email: '', phone: '', notes: '', status: 'confirmado' as const, createdAt: '',
    durationMinutes: item.duration_minutes,
  }));
}

export async function createPublicBooking(input: {
  serviceId: string; date: string; time: string; name: string; email: string; phone: string; notes: string;
}): Promise<Booking> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('A conexão com a agenda ainda não está configurada.');
  const { data, error } = await supabase.rpc('create_public_appointment', {
    p_service_id: input.serviceId, p_date: input.date, p_time: input.time,
    p_name: input.name, p_email: input.email, p_phone: input.phone, p_notes: input.notes,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Não foi possível salvar o agendamento. Tente novamente.');
  return {
    id: row.appointment_id, serviceId: input.serviceId, date: row.appointment_date,
    time: row.starts_at.slice(0, 5), name: input.name, email: input.email, phone: input.phone,
    notes: input.notes, status: row.booking_status as BookingStatus, createdAt: new Date().toISOString(),
    serviceName: row.service_name,
  };
}

export async function fetchAdminBookings(): Promise<Booking[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('A conexão com o painel ainda não está configurada.');
  const { data, error } = await supabase.from('appointments')
    .select('id,service_id,service_name,service_price,duration_minutes,appointment_date,starts_at,notes,status,created_at,clients(name,email,phone)')
    .order('appointment_date').order('starts_at');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    return {
      id: row.id, serviceId: row.service_id, serviceName: row.service_name,
      price: Number(row.service_price), durationMinutes: row.duration_minutes,
      date: row.appointment_date, time: row.starts_at.slice(0, 5),
      name: client?.name ?? '', email: client?.email ?? '', phone: client?.phone ?? '',
      notes: row.notes, status: row.status as BookingStatus, createdAt: row.created_at,
    };
  });
}

export async function setAdminBookingStatus(id: string, status: BookingStatus): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('A conexão com o painel ainda não está configurada.');
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function fetchAdminStudioSettings(): Promise<StudioSettings> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('A conexão com o painel ainda não está configurada.');
  const [servicesResult, hoursResult, blockedResult, settingsResult] = await Promise.all([
    supabase.from('studio_services').select('id,name,detail,duration_minutes,price,symbol,active,display_order').order('display_order'),
    supabase.from('studio_hours').select('weekday,enabled,opens_at,closes_at,break_starts_at,break_ends_at').order('weekday'),
    supabase.from('blocked_dates').select('blocked_date').order('blocked_date'),
    supabase.from('studio_settings').select('deposit_percent').eq('singleton', true).maybeSingle(),
  ]);
  for (const result of [servicesResult, hoursResult, blockedResult, settingsResult]) if (result.error) throw result.error;
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const row = hoursResult.data?.find((item) => item.weekday === index);
    return { enabled: Boolean(row?.enabled), start: row?.opens_at?.slice(0, 5) ?? '09:00', end: row?.closes_at?.slice(0, 5) ?? '18:00', breakStart: row?.break_starts_at?.slice(0, 5) ?? row?.break_ends_at?.slice(0, 5) ?? '12:00', breakEnd: row?.break_ends_at?.slice(0, 5) ?? row?.break_starts_at?.slice(0, 5) ?? '12:00' };
  });
  return {
    services: (servicesResult.data as DbService[] | null ?? []).map((item) => ({ id: item.id, name: item.name, detail: item.detail, durationMinutes: item.duration_minutes, price: Number(item.price), symbol: item.symbol, active: item.active })),
    weekly, blockedDates: (blockedResult.data ?? []).map((item) => item.blocked_date),
    depositPercent: settingsResult.data?.deposit_percent ?? DEFAULT_SETTINGS.depositPercent,
  };
}

export async function saveAdminStudioSettings(settings: StudioSettings): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('A conexão com o painel ainda não está configurada.');
  const { data: existingServices, error: existingServicesError } = await supabase.from('studio_services').select('id');
  if (existingServicesError) throw existingServicesError;
  const removedServices = (existingServices ?? []).map((item) => item.id).filter((id) => !settings.services.some((service) => service.id === id));
  if (removedServices.length) {
    const removed = await supabase.from('studio_services').delete().in('id', removedServices);
    if (removed.error) throw removed.error;
  }
  const [servicesResult, hoursResult, blockedResult, depositResult] = await Promise.all([
    supabase.from('studio_services').upsert(settings.services.map((item, displayOrder) => ({
      id: item.id, name: item.name, detail: item.detail, duration_minutes: item.durationMinutes,
      price: item.price, symbol: item.symbol, active: item.active, display_order: displayOrder + 1, updated_at: new Date().toISOString(),
    }))),
    supabase.from('studio_hours').upsert(settings.weekly.map((item, weekday) => ({
      weekday, enabled: item.enabled, opens_at: item.enabled ? item.start : null,
      closes_at: item.enabled ? item.end : null,
      break_starts_at: item.enabled && item.breakStart !== item.breakEnd ? item.breakStart : null,
      break_ends_at: item.enabled && item.breakStart !== item.breakEnd ? item.breakEnd : null,
    }))),
    syncBlockedDates(supabase, settings.blockedDates),
    supabase.from('studio_settings').upsert({ singleton: true, deposit_percent: settings.depositPercent }),
  ]);
  for (const result of [servicesResult, hoursResult, blockedResult, depositResult]) if (result.error) throw result.error;
}

async function syncBlockedDates(supabase: SupabaseClient, dates: string[]) {
  const { data, error } = await supabase.from('blocked_dates').select('blocked_date');
  if (error) return { error };
  const existing = (data ?? []).map((item) => item.blocked_date);
  const remove = existing.filter((day) => !dates.includes(day));
  if (remove.length) {
    const deleted = await supabase.from('blocked_dates').delete().in('blocked_date', remove);
    if (deleted.error) return deleted;
  }
  const add = dates.filter((day) => !existing.includes(day));
  if (add.length) return supabase.from('blocked_dates').insert(add.map((blocked_date) => ({ blocked_date })));
  return { error: null };
}
