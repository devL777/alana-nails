'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Check, Clock3, Inbox, LayoutDashboard, RotateCcw, Settings2, ShieldAlert, Trash2, X } from 'lucide-react';
import { Booking, BOOKING_CHANGE_EVENT, dateLabel, loadBookings, loadSettings, overlaps, priceBRL, saveBookings, StudioSettings, DEFAULT_SETTINGS, toMinutes } from '@/lib/booking';
import { StudioSettingsEditor } from './StudioSettingsEditor';

type Filter = 'todos' | 'pendente' | 'confirmado' | 'cancelado';
const filters: { label: string; key: Filter }[] = [
  { label: 'Todos', key: 'todos' }, { label: 'Pendentes', key: 'pendente' },
  { label: 'Confirmados', key: 'confirmado' }, { label: 'Cancelados', key: 'cancelado' },
];

export function AdminDashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<Filter>('todos');
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'agenda' | 'config'>('agenda');
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const reload = () => { setBookings(loadBookings()); setSettings(loadSettings()); setReady(true); };
    reload();
    window.addEventListener(BOOKING_CHANGE_EVENT, reload);
    window.addEventListener('storage', reload);
    return () => { window.removeEventListener(BOOKING_CHANGE_EVENT, reload); window.removeEventListener('storage', reload); };
  }, []);

  const pending = bookings.filter((item) => item.status === 'pendente').length;
  const confirmed = bookings.filter((item) => item.status === 'confirmado').length;
  const cancelled = bookings.filter((item) => item.status === 'cancelado').length;
  const shown = useMemo(() => bookings.filter((item) => filter === 'todos' || item.status === filter).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [bookings, filter]);

  const updateStatus = (id: string, status: Booking['status']) => {
    const current = loadBookings();
    const target = current.find((item) => item.id === id);
    if (!target) return;
    if (status !== 'cancelado') {
      const targetService = settings.services.find((item) => item.id === target.serviceId);
      const targetDuration = target.durationMinutes ?? targetService?.durationMinutes ?? 60;
      const hasConflict = current.some((other) => {
        if (other.id === id || other.status === 'cancelado' || other.date !== target.date) return false;
        const otherService = settings.services.find((item) => item.id === other.serviceId);
        return overlaps(toMinutes(target.time), targetDuration, toMinutes(other.time), other.durationMinutes ?? otherService?.durationMinutes ?? 60);
      });
      if (hasConflict) {
        window.alert('Este horário foi ocupado por outra reserva de teste. Não é possível restaurar ou confirmar.');
        return;
      }
    }
    const updated = current.map((item) => item.id === id ? { ...item, status } : item);
    saveBookings(updated);
    setBookings(updated);
  };

  const clearDemo = () => {
    if (window.confirm('Apagar todos os agendamentos de teste deste navegador?')) { saveBookings([]); setBookings([]); }
  };

  return (
    <div className="dashboard-root">
      <aside className="admin-sidebar"><Link href="/" className="admin-brand"><span className="admin-monogram serif">A.</span><span><b>ALANA</b><small>ADMINISTRATIVO</small></span></Link><div className="admin-nav"><button type="button" className={`admin-nav-item ${tab === 'agenda' ? 'active' : ''}`} onClick={() => setTab('agenda')}><LayoutDashboard size={18}/> Visão geral</button><button type="button" className={`admin-nav-item ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}><Settings2 size={18}/> Serviços e horários</button><Link className="admin-nav-item" href="/"><CalendarDays size={18}/> Página de agendamento</Link></div><div className="admin-sidebar-foot">AGENDAMENTO<br/><span>DEMONSTRAÇÃO V0.2</span></div></aside>
      <div className="admin-main">
        <header className="admin-topbar"><div className="admin-mobile-brand serif">ALANA NAILS</div><span className="admin-workspace">Área administrativa <span>/</span> {tab === 'agenda' ? 'Agenda' : 'Configurações'}</span><div className="admin-top-actions"><div className="admin-bell"><Bell size={17}/>{pending > 0 && <span className="notification-dot"/>}</div><span className="admin-avatar">A</span></div></header>
        <main className="admin-content">
          <div className="admin-mobile-tabs"><button type="button" className={tab === 'agenda' ? 'selected' : ''} onClick={() => setTab('agenda')}>Agenda</button><button type="button" className={tab === 'config' ? 'selected' : ''} onClick={() => setTab('config')}>Serviços e horários</button></div>
          <div className="admin-warning"><ShieldAlert size={18}/><p><strong>Ambiente demonstrativo.</strong> Não há login, banco de dados, cobrança ou sincronização entre dispositivos. Não insira dados reais de clientes.</p></div>
          {tab === 'config' ? <StudioSettingsEditor /> : <>
          <div className="admin-heading"><div><p className="eyebrow">PAINEL DE CONTROLE</p><h1 className="serif">Sua agenda, <em>organizada.</em></h1><p>Acompanhe as solicitações de teste do seu navegador.</p></div><Link href="/#agendar" className="button button-dark">Criar teste <ArrowRight size={16}/></Link></div>
          <section className="admin-metrics" aria-label="Resumo da agenda"><div className="metric"><span className="metric-icon"><CalendarDays size={18}/></span><small>Total de solicitações</small><strong>{bookings.length}</strong><span className="metric-caption">neste navegador</span></div><div className="metric"><span className="metric-icon"><Clock3 size={18}/></span><small>Aguardando análise</small><strong>{pending}</strong><span className="metric-caption">pendentes</span></div><div className="metric"><span className="metric-icon"><Check size={18}/></span><small>Confirmados</small><strong>{confirmed}</strong><span className="metric-caption">confirmados manualmente</span></div><div className="metric"><span className="metric-icon"><X size={18}/></span><small>Cancelados</small><strong>{cancelled}</strong><span className="metric-caption">cancelamentos de teste</span></div></section>
          <section className="appointments-panel"><div className="appointments-heading"><div><h2>Agendamentos</h2><p>Gerencie os dados fictícios criados no formulário.</p></div><button type="button" className="clear-button" onClick={clearDemo} disabled={bookings.length === 0}><Trash2 size={15}/> Limpar testes</button></div><div className="filter-row">{filters.map((item) => <button key={item.key} className={`filter-button ${filter === item.key ? 'active' : ''}`} onClick={() => setFilter(item.key)} type="button">{item.label}</button>)}</div>
            <div className="appointments-list">
              {!ready ? <div className="empty-dashboard">Carregando demonstração...</div> : shown.length === 0 ? <div className="empty-dashboard"><div className="empty-icon"><Inbox size={28}/></div><h3>Nenhum agendamento por aqui.</h3><p>Crie uma solicitação de teste na página pública para vê-la neste painel.</p><Link href="/#agendar" className="admin-empty-link">Ir para agendamento <ArrowRight size={15}/></Link></div> : shown.map((booking) => {
                const service = settings.services.find((item) => item.id === booking.serviceId);
                return <article className="appointment-row" key={booking.id}>
                  <div className="appointment-date"><strong>{booking.date.split('-')[2]}</strong><small>{new Date(`${booking.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div>
                  <div className="appointment-main"><div className="appointment-name"><strong>{booking.name}</strong><span className={`status-chip status-${booking.status}`}>{booking.status}</span></div><p>{booking.serviceName ?? service?.name ?? 'Serviço'} · {booking.time} · {booking.price != null ? priceBRL(booking.price) : service ? priceBRL(service.price) : '—'}</p><span>{dateLabel(booking.date)} · {booking.phone} {booking.notes ? ` · Obs.: ${booking.notes}` : ''}</span></div>
                  <div className="appointment-actions">{booking.status !== 'confirmado' && booking.status !== 'cancelado' && <button type="button" className="action-confirm" onClick={() => updateStatus(booking.id, 'confirmado')}><Check size={15}/> Confirmar</button>}{booking.status !== 'cancelado' && <button type="button" className="action-cancel" onClick={() => updateStatus(booking.id, 'cancelado')}><X size={15}/> Cancelar</button>}{booking.status === 'cancelado' && <button type="button" className="action-cancel" onClick={() => updateStatus(booking.id, 'pendente')}><RotateCcw size={15}/> Restaurar</button>}</div>
                </article>;
              })}
            </div>
          </section>
          <p className="admin-footnote">A versão de produção terá autenticação, sincronização no iPhone e notificações reais. <Link href="/">Voltar para o site <ArrowLeft size={14}/></Link></p>
          </>}
        </main>
      </div>
    </div>
  );
}
