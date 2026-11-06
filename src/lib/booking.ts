export type Service = {
  id: string;
  name: string;
  detail: string;
  durationMinutes: number | null;
  price: number;
  symbol: string;
  active: boolean;
};

export type OpeningHours = {
  enabled: boolean;
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
};

export type StudioSettings = {
  services: Service[];
  weekly: OpeningHours[]; // 0 = domingo, 6 = sábado
  blockedDates: string[];
  depositPercent: number; // previsão apenas, sem cobrar nesta demonstração
};

// EXEMPLOS: não publicar nem tratar como tabela real da cliente.
export const DEFAULT_SETTINGS: StudioSettings = {
  services: [
    { id: 'fibra-vidro', name: 'Aplicação Fibra de vidro', detail: 'Alongamento em fibra de vidro com gel, para unhas resistentes e acabamento natural.', durationMinutes: 90, price: 145, symbol: '01', active: true },
    { id: 'molde-f1', name: 'Aplicação Molde f1', detail: 'Alongamento com molde F1 e gel, com formato alinhado e natural.', durationMinutes: 80, price: 135, symbol: '02', active: true },
    { id: 'banho-gel', name: 'Banho de gel', detail: 'Aplicação de gel sobre a unha natural para resistência e proteção.', durationMinutes: 60, price: 100, symbol: '03', active: true },
    { id: 'esmaltacao-gel', name: 'Esmaltação em gel', detail: 'Esmaltação em gel sobre a unha natural, com brilho e maior durabilidade.', durationMinutes: 45, price: 50, symbol: '04', active: true },
    { id: 'esmaltacao-gel-pe', name: 'Esmaltação em gel no pé', detail: 'Esmaltação em gel nas unhas naturais dos pés, com brilho e maior durabilidade.', durationMinutes: 40, price: 50, symbol: '05', active: true },
    { id: 'esmaltacao-tradicional-pe', name: 'Esmaltação tradicional no pé', detail: 'Esmaltação tradicional nas unhas dos pés.', durationMinutes: 30, price: 25, symbol: '06', active: true },
    { id: 'manutencao-fibra', name: 'Manutenção fibra de vidro', detail: 'Manutenção do alongamento em fibra de vidro.', durationMinutes: 80, price: 105, symbol: '07', active: true },
    { id: 'manutencao-molde-f1', name: 'Manutenção molde f1', detail: 'Manutenção do alongamento com molde F1.', durationMinutes: 80, price: 100, symbol: '08', active: true },
  ],
  weekly: Array.from({ length: 7 }, (_, index) => ({
    enabled: index >= 2,
    start: '09:00',
    end: '18:00',
    breakStart: '12:00',
    breakEnd: '13:00',
  })),
  blockedDates: [],
  depositPercent: 30,
};

export type BookingStatus = 'pendente' | 'confirmado' | 'cancelado';
export type Booking = {
  id: string;
  serviceId: string;
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  status: BookingStatus;
  createdAt: string;
  // Snapshot para não alterar uma reserva antiga quando o catálogo mudar.
  serviceName?: string;
  durationMinutes?: number;
  price?: number;
};

const BOOKINGS_KEY = 'alana-nails-MOCK-bookings-v1';
const SETTINGS_KEY = 'alana-nails-MOCK-settings-v2';
const CATALOG_VERSION_KEY = 'alana-nails-catalog-version';
export const BOOKING_CHANGE_EVENT = 'alana-nails-bookings-updated';
export const SETTINGS_CHANGE_EVENT = 'alana-nails-settings-updated';

export function loadBookings(): Booking[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BOOKINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Booking[]) : [];
  } catch {
    return [];
  }
}

export function saveBookings(bookings: Booking[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  window.dispatchEvent(new Event(BOOKING_CHANGE_EVENT));
}

function cloneDefaults(): StudioSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as StudioSettings;
}

export function loadSettings(): StudioSettings {
  const defaults = cloneDefaults();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const candidate = parsed as Partial<StudioSettings>;
    if (!Array.isArray(candidate.services) || !Array.isArray(candidate.weekly) || candidate.weekly.length !== 7) return defaults;
    if (window.localStorage.getItem(CATALOG_VERSION_KEY) !== '2') {
      const migrated = {
        ...defaults,
        weekly: candidate.weekly,
        blockedDates: Array.isArray(candidate.blockedDates) ? candidate.blockedDates : [],
        depositPercent: typeof candidate.depositPercent === 'number' ? candidate.depositPercent : 30,
      };
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
      window.localStorage.setItem(CATALOG_VERSION_KEY, '2');
      return migrated;
    }
    return {
      services: candidate.services as Service[],
      weekly: candidate.weekly,
      blockedDates: Array.isArray(candidate.blockedDates) ? candidate.blockedDates : [],
      depositPercent: typeof candidate.depositPercent === 'number' ? candidate.depositPercent : 30,
    };
  } catch { return defaults; }
}

export function saveSettings(settings: StudioSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.localStorage.setItem(CATALOG_VERSION_KEY, '2');
  window.dispatchEvent(new Event(SETTINGS_CHANGE_EVENT));
}

export function priceBRL(price: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
}

export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateFromISO(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

export function datesAvailable(settings: StudioSettings): Date[] {
  const result: Date[] = [];
  const now = new Date();
  for (let offset = 0; offset < 45 && result.length < 15; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (settings.weekly[date.getDay()]?.enabled && !settings.blockedDates.includes(isoDay(date))) result.push(date);
  }
  return result;
}

export function toMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

export function overlaps(aStart: number, aDuration: number, bStart: number, bDuration: number): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

export function availableTimes(service: Service, date: string, bookings: Booking[], settings: StudioSettings): string[] {
  const now = new Date();
  const duration = service.durationMinutes;
  if (duration === null) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const chosen = dateFromISO(date);
  if (Number.isNaN(chosen.getTime()) || isoDay(chosen) !== date || date < isoDay(now)) return [];
  const day = settings.weekly[chosen.getDay()];
  if (!day?.enabled || settings.blockedDates.includes(date)) return [];
  const open = toMinutes(day.start);
  const close = toMinutes(day.end);
  const pauseStart = toMinutes(day.breakStart);
  const pauseEnd = toMinutes(day.breakEnd);
  if (![open, close, pauseStart, pauseEnd].every(Number.isFinite) || close <= open) return [];

  const result: string[] = [];
  for (let start = open; start + duration <= close; start += 30) {
    const time = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
    const isPast = date === isoDay(now) && start <= now.getHours() * 60 + now.getMinutes() + 60;
    const intersectsPause = pauseEnd > pauseStart && overlaps(start, duration, pauseStart, pauseEnd - pauseStart);
    const collision = bookings.some((booking) => {
      if (booking.date !== date || booking.status === 'cancelado') return false;
      const other = settings.services.find((item) => item.id === booking.serviceId);
      return overlaps(start, duration, toMinutes(booking.time), booking.durationMinutes ?? other?.durationMinutes ?? 60);
    });
    if (!isPast && !intersectsPause && !collision) result.push(time);
  }
  return result;
}

export function validateSettings(settings: StudioSettings): string | null {
  if (!Array.isArray(settings.services) || settings.services.length < 1) return 'Cadastre pelo menos um serviço.';
  if (settings.services.some((service) => service.name.trim().length < 2 || !Number.isFinite(service.price) || service.price < 0 || (service.durationMinutes !== null && (!Number.isInteger(service.durationMinutes) || service.durationMinutes < 30 || service.durationMinutes > 480)))) {
    return 'Confira o nome, valor e duração dos serviços (entre 30 e 480 minutos).';
  }
  if (new Set(settings.services.map((service) => service.id)).size !== settings.services.length) return 'Os identificadores dos serviços precisam ser únicos.';
  if (settings.weekly.length !== 7) return 'A agenda semanal precisa conter os sete dias.';
  for (let day = 0; day < 7; day++) {
    const item = settings.weekly[day];
    if (!item.enabled) continue;
    const start = toMinutes(item.start);
    const end = toMinutes(item.end);
    const breakStart = toMinutes(item.breakStart);
    const breakEnd = toMinutes(item.breakEnd);
    if (![start, end, breakStart, breakEnd].every(Number.isFinite) || start >= end) return 'Confira os horários de abertura e fechamento.';
    if (breakStart > breakEnd || breakStart < start || breakEnd > end) return 'O intervalo precisa estar dentro do horário de atendimento.';
  }
  if (!Number.isInteger(settings.depositPercent) || settings.depositPercent < 0 || settings.depositPercent > 100) return 'O sinal deve ser um percentual entre 0 e 100.';
  return null;
}

export function dateLabel(date: string): string {
  return dateFromISO(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

export function timeSummary(durationMinutes: number | null): string {
  if (durationMinutes === null) return 'Duração a confirmar';
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return hours ? `${hours}h${minutes ? ` ${minutes}min` : ''}` : `${minutes}min`;
}
