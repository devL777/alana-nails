'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Check, Clock3, Inbox, LayoutDashboard, LogOut, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import { Booking, BookingStatus, dateLabel, priceBRL } from '@/lib/booking';
import { deleteAdminCancelledBooking, fetchAdminBookings, fetchAdminStudioSettings, getSupabaseBrowserClient, setAdminBookingStatus } from '@/lib/supabase-browser';
import { StudioSettingsEditor } from './StudioSettingsEditor';
import { AdminAppControls } from './AdminAppControls';

type Filter = 'todos' | 'pendente' | 'confirmado' | 'cancelado';
const filters: { label: string; key: Filter }[] = [
  { label: 'Todos', key: 'todos' }, { label: 'Pendentes', key: 'pendente' },
  { label: 'Confirmados', key: 'confirmado' }, { label: 'Cancelados', key: 'cancelado' },
];

export function AdminDashboard() {
  const supabase = getSupabaseBrowserClient();
  const [gate, setGate] = useState<'loading' | 'signed-out' | 'not-admin' | 'ready' | 'unavailable'>('loading');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<Filter>('todos');
  const [tab, setTab] = useState<'agenda' | 'config'>('agenda');
  const [settings, setSettings] = useState<{ services: { id: string; name: string; price: number }[] }>({ services: [] });
  const [dataError, setDataError] = useState('');

  async function hasAdminAccess(userId: string) {
    if (!supabase) return false;
    const { data, error } = await supabase.from('studio_admins').select('user_id').eq('user_id', userId).maybeSingle();
    return !error && Boolean(data);
  }

  async function loadDashboard() {
    try {
      const [nextBookings, nextSettings] = await Promise.all([fetchAdminBookings(), fetchAdminStudioSettings()]);
      setBookings(nextBookings);
      setSettings({ services: nextSettings.services });
      setDataError('');
    } catch {
      setDataError('Não foi possível carregar os dados do painel. Atualize a página e tente novamente.');
    }
  }

  useEffect(() => {
    if (!supabase) { setGate('unavailable'); return; }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      if (!user) { setGate('signed-out'); return; }
      const allowed = await hasAdminAccess(user.id);
      if (!active) return;
      setGate(allowed ? 'ready' : 'not-admin');
      if (allowed) await loadDashboard();
    }).catch(() => { if (active) setGate('signed-out'); });
    return () => { active = false; };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setLoginError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    if (error || !data.user) {
      setLoginError('Confira seu e-mail e sua senha e tente novamente.'); setBusy(false); return;
    }
    const allowed = await hasAdminAccess(data.user.id);
    if (!allowed) {
      await supabase.auth.signOut();
      setGate('not-admin');
      setLoginError('Esta conta ainda não tem acesso ao painel da Alana.');
      setBusy(false); return;
    }
    await loadDashboard();
    setGate('ready'); setLoginPassword(''); setBusy(false);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setBookings([]); setGate('signed-out'); setTab('agenda');
  }

  async function updateStatus(id: string, status: BookingStatus) {
    try {
      await setAdminBookingStatus(id, status);
      setBookings(await fetchAdminBookings());
      setDataError('');
    } catch {
      setDataError('Não foi possível atualizar o agendamento. Atualize a agenda e tente novamente.');
    }
  }

  async function deleteCancelledBooking(booking: Booking) {
    if (booking.status !== 'cancelado') return;
    const confirmed = window.confirm('Apagar permanentemente este agendamento cancelado? O cadastro da cliente será mantido.');
    if (!confirmed) return;
    try {
      await deleteAdminCancelledBooking(booking.id);
      setBookings((current) => current.filter((item) => item.id !== booking.id));
      setDataError('');
    } catch {
      setDataError('Não foi possível apagar este agendamento cancelado. Atualize a agenda e tente novamente.');
    }
  }

  const pending = bookings.filter((item) => item.status === 'pendente').length;
  const confirmed = bookings.filter((item) => item.status === 'confirmado').length;
  const cancelled = bookings.filter((item) => item.status === 'cancelado').length;
  const shown = useMemo(() => bookings.filter((item) => filter === 'todos' || item.status === filter), [bookings, filter]);

  if (gate !== 'ready') {
    return <main className="admin-login-page">
      <section className="admin-login-card" data-reveal>
        <Link href="/" className="admin-login-brand"><span className="admin-monogram serif">A.</span><span><b>ALANA</b><small>NAIL DESIGN</small></span></Link>
        <p className="eyebrow">ÁREA EXCLUSIVA</p>
        <h1 className="serif">Acesse sua <em>agenda.</em></h1>
        {gate === 'loading' ? <p>Verificando acesso...</p> : gate === 'unavailable' ? <p className="settings-error">O painel ainda não está conectado ao banco.</p> : <>
          <p>Entre com o e-mail e a senha definidos para a conta administrativa da Alana.</p>
          <form className="admin-login-form" onSubmit={signIn}>
            <label className="field">E-mail<input required type="email" autoComplete="username" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="alana@email.com" /></label>
            <label className="field">Senha do painel<input required type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Sua senha" /></label>
            {loginError && <p className="settings-error" role="alert">{loginError}</p>}
            <button type="submit" className="button button-dark" disabled={busy}>{busy ? 'Entrando...' : 'Entrar no painel'} <ArrowRight size={16} /></button>
          </form>
          {gate === 'not-admin' && !loginError && <p className="settings-error">Sua conta não tem permissão para acessar este painel.</p>}
        </>}
        <Link href="/" className="admin-login-back"><ArrowLeft size={15} /> Voltar ao site</Link>
        <AdminAppControls isAdmin={false} />
      </section>
    </main>;
  }

  return (
    <div className="dashboard-root">
      <aside className="admin-sidebar"><Link href="/" className="admin-brand"><span className="admin-monogram serif">A.</span><span><b>ALANA</b><small>ADMINISTRATIVO</small></span></Link><div className="admin-nav"><button type="button" className={`admin-nav-item ${tab === 'agenda' ? 'active' : ''}`} onClick={() => setTab('agenda')}><LayoutDashboard size={18}/> Minha agenda</button><button type="button" className={`admin-nav-item ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}><Settings2 size={18}/> Serviços e horários</button><Link className="admin-nav-item" href="/"><CalendarDays size={18}/> Página de agendamento</Link></div><div className="admin-sidebar-foot">ALANA NAILS<br/><span>PAINEL PRIVADO</span></div></aside>
      <div className="admin-main">
        <header className="admin-topbar"><div className="admin-mobile-brand serif">ALANA NAILS</div><span className="admin-workspace">Área administrativa <span>/</span> {tab === 'agenda' ? 'Agenda' : 'Configurações'}</span><div className="admin-top-actions"><div className="admin-bell"><Bell size={17}/>{pending > 0 && <span className="notification-dot"/>}</div><span className="admin-avatar">A</span><button type="button" className="admin-logout" onClick={signOut} aria-label="Sair do painel"><LogOut size={17}/></button></div></header>
        <main className="admin-content">
          <AdminAppControls isAdmin />
          <div className="admin-mobile-tabs"><button type="button" className={tab === 'agenda' ? 'selected' : ''} onClick={() => setTab('agenda')}>Agenda</button><button type="button" className={tab === 'config' ? 'selected' : ''} onClick={() => setTab('config')}>Serviços e horários</button></div>
          {dataError && <p className="settings-error" role="alert">{dataError}</p>}
          {tab === 'config' ? <StudioSettingsEditor /> : <>
          <div className="admin-heading" data-reveal><div><p className="eyebrow">PAINEL DE CONTROLE</p><h1 className="serif">Sua agenda, <em>organizada.</em></h1><p>Acompanhe clientes e horários em um só lugar.</p></div><Link href="/#agendar" className="button button-dark">Ver agendamento <ArrowRight size={16}/></Link></div>
          <div className="admin-warning" data-reveal><ShieldCheck size={18}/><p>Área privada. Os dados de contato das clientes ficam visíveis somente para a conta autorizada da Alana.</p></div>
          <section className="admin-metrics" aria-label="Resumo da agenda" data-reveal-stagger><div className="metric" data-reveal><span className="metric-icon"><CalendarDays size={18}/></span><small>Total de agendamentos</small><strong>{bookings.length}</strong><span className="metric-caption">na agenda</span></div><div className="metric" data-reveal><span className="metric-icon"><Clock3 size={18}/></span><small>Aguardando confirmação</small><strong>{pending}</strong><span className="metric-caption">pendentes</span></div><div className="metric" data-reveal><span className="metric-icon"><Check size={18}/></span><small>Confirmados</small><strong>{confirmed}</strong><span className="metric-caption">confirmados</span></div><div className="metric" data-reveal><span className="metric-icon"><X size={18}/></span><small>Cancelados</small><strong>{cancelled}</strong><span className="metric-caption">cancelados</span></div></section>
          <section className="appointments-panel"><div className="appointments-heading" data-reveal><div><h2>Agendamentos</h2><p>Veja os dados e atualize a situação de cada horário.</p></div></div><div className="filter-row">{filters.map((item) => <button key={item.key} className={`filter-button ${filter === item.key ? 'active' : ''}`} onClick={() => setFilter(item.key)} type="button">{item.label}</button>)}</div><div className="appointments-list" data-reveal-stagger>
            {shown.length === 0 ? <div className="empty-dashboard" data-reveal><div className="empty-icon"><Inbox size={28}/></div><h3>Nenhum agendamento por aqui.</h3><p>Quando uma cliente solicitar um horário, ele aparecerá nesta agenda.</p><Link href="/#agendar" className="admin-empty-link">Ver página de agendamento <ArrowRight size={15}/></Link></div> : shown.map((booking) => {
              const service = settings.services.find((item) => item.id === booking.serviceId);
              return <article className="appointment-row" key={booking.id} data-reveal>
                <div className="appointment-date"><strong>{booking.date.split('-')[2]}</strong><small>{new Date(`${booking.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div>
                <div className="appointment-main"><div className="appointment-name"><strong>{booking.name}</strong><span className={`status-chip status-${booking.status}`}>{booking.status}</span></div><p>{booking.serviceName ?? service?.name ?? 'Serviço'} · {booking.time} · {booking.price != null ? priceBRL(booking.price) : service ? priceBRL(service.price) : '—'}</p><span>{dateLabel(booking.date)} · {booking.phone} · {booking.email}{booking.notes ? ` · Obs.: ${booking.notes}` : ''}</span></div>
                <div className="appointment-actions">{booking.status !== 'confirmado' && booking.status !== 'cancelado' && <button type="button" className="action-confirm" onClick={() => updateStatus(booking.id, 'confirmado')}><Check size={15}/> Confirmar</button>}{booking.status !== 'cancelado' && <button type="button" className="action-cancel" onClick={() => updateStatus(booking.id, 'cancelado')}><X size={15}/> Cancelar</button>}{booking.status === 'cancelado' && <><button type="button" className="action-cancel" onClick={() => updateStatus(booking.id, 'pendente')}><Clock3 size={15}/> Reabrir horário</button><button type="button" className="action-delete" onClick={() => deleteCancelledBooking(booking)} aria-label={`Apagar agendamento cancelado de ${booking.name}`}><Trash2 size={15}/> Apagar</button></>}</div>
              </article>;
            })}
          </div></section>
          </>}
          <p className="admin-footnote" data-reveal>Alterações na agenda são salvas no banco e refletem para as clientes. <Link href="/"><ArrowLeft size={14}/> Voltar ao site</Link></p>
        </main>
      </div>
    </div>
  );
}
