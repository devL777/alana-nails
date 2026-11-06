'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowDownRight, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, Gem, LockKeyhole, Mail, MapPin, Minus, Plus, ShieldCheck } from 'lucide-react';
import {
  availableTimes, Booking, dateLabel, datesAvailable, isoDay,
  priceBRL, Service, StudioSettings, DEFAULT_SETTINGS, timeSummary,
} from '@/lib/booking';
import { createPublicBooking, fetchPublicBusyBookings, fetchPublicStudioSettings, getSupabaseBrowserClient } from '@/lib/supabase-browser';

const weekday = (day: Date) => day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
const monthName = (day: Date) => day.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className={`brand ${inverse ? 'brand-inverse' : ''}`} aria-label="Alana Nails, voltar ao início">
      <span className="brand-mark">A<span className="brand-mark-dot">.</span></span>
      <span className="brand-text"><strong>ALANA</strong><small>NAIL DESIGN</small></span>
    </Link>
  );
}

const serviceDetails: Record<string, { image: string; alt: string; description: string }> = {
  'banho-gel': {
    image: '/photos/servico-banho-de-gel.png',
    alt: 'Unhas naturais com acabamento delicado em gel',
    description: 'Uma camada de gel sobre as unhas naturais para dar estrutura e um acabamento uniforme, sem alongar o comprimento.',
  },
  'molde-f1': {
    image: '/photos/servico-molde-f1.png',
    alt: 'Alongamento de unhas feito com molde F1',
    description: 'Alongamento em gel construído com um molde que ajuda a definir o comprimento e o formato das unhas.',
  },
  'fibra-vidro': {
    image: '/photos/servico-fibra-de-vidro.png',
    alt: 'Unhas alongadas com acabamento azul em fibra de vidro',
    description: 'Alongamento construído com filamentos de fibra de vidro e gel, moldados para criar a extensão das unhas.',
  },
  'esmaltacao-gel': {
    image: '/photos/servico-esmaltacao-em-gel.png',
    alt: 'Unhas com esmaltação em gel escura e brilhante',
    description: 'Aplicação de esmalte em gel para um acabamento brilhante e uniforme, finalizada em cabine própria.',
  },
  'nail-art': {
    image: '/photos/servico-nail-art.png',
    alt: 'Unhas decoradas com nail art personalizada',
    description: 'Decoração personalizada com cores e desenhos para dar às unhas o estilo que você imaginou.',
  },
};

function ServiceCard({ item, number, active, onPick }: { item: Service; number: string; active: boolean; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const details = serviceDetails[item.id];

  return (
    <article className={`service-card ${active ? 'service-card-active' : ''} ${open ? 'service-card-open' : ''}`}>
      <div className="service-card-heading">
        <button type="button" className="service-card-toggle" aria-expanded={open} aria-controls={`service-details-${item.id}`} onClick={() => setOpen((value) => !value)}>
          {details && <Image src={details.image} alt={details.alt} width={88} height={88} className="service-card-photo" sizes="88px" />}
          <span className="service-card-title"><small className="service-card-number">{number}</small><strong className="serif">{item.name}</strong><small className="service-card-price">{priceBRL(item.price)}</small></span>
          <span className="service-toggle-icon" aria-hidden="true">{open ? <Minus size={18} /> : <Plus size={18} />}</span>
        </button>
        <button type="button" className="service-card-book" onClick={onPick} aria-label={`Ir para o agendamento de ${item.name}`} title={`Agendar ${item.name}`}><ArrowRight size={18} /></button>
      </div>
      {open && <div className="service-card-details" id={`service-details-${item.id}`}>
        <div className="service-card-copy"><p>{details?.description ?? item.detail}</p><div className="service-meta"><span>{priceBRL(item.price)} <small>· ilustrativo</small></span><span><Clock3 size={13} /> {timeSummary(item.durationMinutes)}</span></div></div>
      </div>}
    </article>
  );
}

export function BookingExperience() {
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const days = useMemo(() => datesAvailable(settings), [settings]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busyLoading, setBusyLoading] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [completed, setCompleted] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [bookingHelpOpen, setBookingHelpOpen] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchPublicStudioSettings()
      .then((nextSettings) => { if (mounted) { setSettings(nextSettings); setSettingsReady(true); setConnectionError(''); } })
      .catch(() => { if (mounted) { setSettingsReady(true); setConnectionError('Não foi possível carregar os serviços agora. Tente novamente em instantes.'); } });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!date || !getSupabaseBrowserClient()) return;
    let mounted = true;
    setBusyLoading(true);
    const refreshBusySlots = () => fetchPublicBusyBookings(date)
      .then((items) => { if (mounted) { setBookings(items); setConnectionError(''); } })
      .catch(() => { if (mounted) setConnectionError('Não foi possível atualizar os horários. Tente novamente.'); })
      .finally(() => { if (mounted) setBusyLoading(false); });
    void refreshBusySlots();
    const refreshTimer = window.setInterval(refreshBusySlots, 12000);
    return () => { mounted = false; window.clearInterval(refreshTimer); };
  }, [date]);

  useEffect(() => {
    if (!date || !days.some((day) => isoDay(day) === date)) {
      setDate(days.length > 0 ? isoDay(days[0]) : null);
      setTime(null);
    }
  }, [date, days]);

  const serviceOrder = [
    'Aplicação Fibra de vidro',
    'Aplicação Molde f1',
    'Banho de gel',
    'Esmaltação em gel',
    'Esmaltação em gel no pé',
    'Esmaltação tradicional no pé',
    'Manutenção fibra de vidro',
    'Manutenção molde f1',
  ];
  const services = settings.services.filter((item) => item.active).sort((a, b) => {
    const orderA = serviceOrder.indexOf(a.name);
    const orderB = serviceOrder.indexOf(b.name);
    return (orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA) - (orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB);
  });
  const service = services.find((item) => item.id === serviceId) ?? null;
  const available = useMemo(() => service && date ? availableTimes(service, date, bookings, settings) : [], [service, date, bookings, settings]);

  useEffect(() => {
    if (time && !available.includes(time)) setTime(null);
  }, [time, available]);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!service || !date || !time || service.durationMinutes === null) { setError('Selecione um serviço com duração definida, data e horário.'); return; }
    if (name.trim().length < 3) { setError('Informe seu nome completo.'); return; }
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError('Informe um e-mail válido.'); return; }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) { setError('Informe um número de WhatsApp válido com DDD.'); return; }
    try {
      const booking = await createPublicBooking({
        serviceId: service.id, date, time, name: name.trim(), email: cleanEmail,
        phone: cleanPhone, notes: notes.trim().slice(0, 280),
      });
      setConnectionError('');
      setCompleted(booking);
      const occupied = await fetchPublicBusyBookings(date);
      setBookings(occupied);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setTime(null);
      setError(message.includes('indisponível') || message.includes('23P01')
        ? 'Esse horário acabou de ficar indisponível. Escolha outro.'
        : 'Não foi possível salvar seu agendamento. Confira os dados e tente novamente.');
      fetchPublicBusyBookings(date).then(setBookings).catch(() => undefined);
    }
  }

  return (
    <div className="site-shell">
      <div className="demo-line">AGENDE NO SEU TEMPO · CONFIRMAÇÃO PELO PAINEL DA ALANA</div>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Navegação principal">
            <a href="#servicos">Serviços</a><a href="#sobre">Sobre mim</a><a href="#experiencia">Experiência</a><a href="#agendar">Agendamento</a>
          </nav>
          <a href="#agendar" className="header-cta">Reservar horário <ArrowRight size={15} /></a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow"><span className="mini-diamond" /> ALANA · NAIL DESIGN STUDIO</p>
              <h1 className="serif">O luxo está <br />nos <em>detalhes.</em></h1>
              <p className="hero-lead">Um momento só seu, pensado para valorizar sua essência e realçar sua beleza.</p>
              <div className="hero-actions">
                <a href="#agendar" className="button button-dark">Agendar meu horário <ArrowRight size={17} /></a>
                <a href="#servicos" className="text-link">Conhecer serviços <ArrowDownRight size={16} /></a>
              </div>
              <div className="hero-footnote"><Gem size={16} /> Beleza, cuidado e exclusividade.</div>
            </div>
            <div className="hero-art hero-photo-wrap">
              <Image
                src="/photos/alana-principal.png"
                alt="Atendimento de manicure no estúdio Alana Nails"
                fill
                preload
                sizes="(max-width: 760px) 100vw, 48vw"
                className="hero-photo"
              />
              <div className="hero-photo-overlay">
                <span>ALANA NAILS</span>
                <strong>Cuidado em cada detalhe</strong>
              </div>
            </div>
          </div>
        </section>

        <div className="luxury-strip"><div className="container strip-inner"><span>BEAUTY IN EVERY DETAIL</span><span className="strip-star">✧</span><span>AGENDE NO SEU TEMPO</span><span className="strip-star">✧</span><span>EXPERIÊNCIA ALANA</span></div></div>

        <section className="section portfolio-section" id="trabalhos" aria-labelledby="portfolio-title">
          <div className="container">
            <div className="portfolio-heading">
              <div>
                <p className="eyebrow">TRABALHOS DA ALANA</p>
                <h2 className="serif section-title" id="portfolio-title">Detalhes que <em>encantam.</em></h2>
              </div>
            </div>
            <div className="portfolio-track">
              <figure className="portfolio-card">
                <div className="portfolio-photo">
                  <Image src="/photos/trabalho-01.png" alt="Unhas decoradas em verde, amarelo e dourado" fill sizes="(max-width: 760px) 78vw, 31vw" />
                </div>
                <figcaption>Cor e brilho em cada detalhe</figcaption>
              </figure>
              <figure className="portfolio-card">
                <div className="portfolio-photo">
                  <Image src="/photos/trabalho-02.png" alt="Unhas com francesinha verde e detalhes dourados" fill sizes="(max-width: 760px) 78vw, 31vw" />
                </div>
                <figcaption>Francesinha com toque delicado</figcaption>
              </figure>
              <figure className="portfolio-card">
                <div className="portfolio-photo">
                  <Image src="/photos/trabalho-03.png" alt="Nail art em preto e branco com pedrarias" fill sizes="(max-width: 760px) 78vw, 31vw" />
                </div>
                <figcaption>Nail art feita à mão</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="section services-section" id="servicos">
          <div className="container">
            <div className="section-header">
              <div><p className="eyebrow">01 · NOSSOS CUIDADOS</p><h2 className="serif section-title">Beleza que se <em>sente.</em></h2></div>
              <p className="section-description">Escolha o cuidado que combina com você e veja os horários disponíveis.</p>
            </div>
            <div className="service-grid">
              {services.map((item, index) => <ServiceCard key={item.id} item={item} number={String(index + 1).padStart(2, '0')} active={serviceId === item.id} onPick={() => { setServiceId(item.id); setTime(null); document.getElementById('agendar')?.scrollIntoView({ behavior: 'smooth' }); }} />)}
            </div>
          </div>
        </section>

        <section className="about-section" id="sobre" aria-labelledby="about-title">
          <div className="container">
            <div className="about-card">
              <div className="about-signature-mark" aria-hidden="true"><span className="serif">A.</span><small>ALANA NAILS</small></div>
              <div className="about-copy">
                <p className="eyebrow">UM POUCO SOBRE MIM</p>
                <h2 className="serif" id="about-title">Minha história <em>está começando.</em></h2>
                <p>Tenho 19 anos e sou especialista em alongamento em gel. Minha trajetória como nail designer é guiada por amor, persistência e evolução constante.</p>
                <p>Mais do que um trabalho, cada atendimento é uma oportunidade de criar uma experiência única e memorável. Agradeço de coração a cada cliente que confiou em mim e faz parte do meu crescimento.</p>
                <p>Minha história está só começando. Sigo estudando e me aperfeiçoando para trazer novidades, técnicas e designs exclusivos.</p>
                <p className="about-author">Com carinho, <strong>Alana</strong></p>
              </div>
            </div>
          </div>
        </section>

        <section className="experience-section" id="experiencia">
          <div className="container experience-grid">
            <div className="experience-decoration"><div className="experience-diamond"><span className="serif">A</span></div><span className="exp-number">ALANA NAILS — BEAUTY STUDIO</span></div>
            <div className="experience-text"><p className="eyebrow eyebrow-light">02 · SUA EXPERIÊNCIA</p><h2 className="serif">Seu tempo é <br /><em>precioso.</em></h2><p>Faça sua solicitação de horário com poucos toques. Sem precisar trocar mensagens para saber os horários disponíveis.</p><div className="experience-points"><span><Check size={16} /> Escolha seu serviço</span><span><Check size={16} /> Veja os horários</span><span><Check size={16} /> Solicite sua reserva</span></div></div>
          </div>
        </section>

        <section className="section booking-section" id="agendar">
          <div className="container">
            <div className="booking-heading"><p className="eyebrow">03 · AGENDE SUA VISITA</p><h2 className="serif section-title">Seu próximo momento <em>especial.</em></h2><p>Escolha o serviço, o horário e deixe seus dados para a Alana confirmar.</p></div>
            <div className={`booking-help ${bookingHelpOpen ? 'booking-help-open' : ''}`}>
              <button type="button" className="booking-help-trigger" aria-expanded={bookingHelpOpen} aria-controls="booking-help-content" onClick={() => setBookingHelpOpen((open) => !open)}>
                <span><strong>Primeira vez agendando?</strong><small>Toque para ver como funciona</small></span>
                <span className="booking-help-icon" aria-hidden="true">{bookingHelpOpen ? <Minus size={20} /> : <Plus size={20} />}</span>
              </button>
              {bookingHelpOpen && (
                <div className="booking-help-content" id="booking-help-content">
                  <ol>
                    <li><strong>Escolha o serviço</strong><span>Veja o valor e selecione o cuidado desejado.</span></li>
                    <li><strong>Escolha data e horário</strong><span>Os horários disponíveis aparecem depois que a duração do serviço for confirmada.</span></li>
                    <li><strong>Informe seus dados</strong><span>Deixe seu nome e WhatsApp para a Alana confirmar o pedido.</span></li>
                  </ol>
                  <p className="booking-help-note">A confirmação automática ainda será ativada quando a agenda estiver conectada.</p>
                </div>
              )}
            </div>
            <div className="booking-layout">
              <div className="booking-form-card">
                {completed ? (
                  <div className="success-state" role="status">
                    <div className="success-icon"><CheckCircle2 size={38} /></div>
                    <p className="eyebrow">SOLICITAÇÃO DE TESTE</p>
                    <h3 className="serif">Tudo pronto, {completed.name.split(' ')[0]}!</h3>
                    <p>Seu pedido foi salvo. A Alana vai confirmar o horário.</p>
                    <div className="success-summary"><span>Serviço: <strong>{completed.serviceName ?? settings.services.find((s) => s.id === completed.serviceId)?.name}</strong></span><span>Data: <strong>{dateLabel(completed.date)} às {completed.time}</strong></span><span>Situação: <strong>Aguardando confirmação</strong></span></div>
                    <p className="demo-note"><LockKeyhole size={15} /> A confirmação será feita diretamente pela Alana.</p>
                    <button type="button" className="button button-dark" onClick={() => {setCompleted(null); setName(''); setEmail(''); setPhone(''); setNotes(''); setTime(null);}}>Fazer outro agendamento <ArrowRight size={16}/></button>
                  </div>
                ) : (
                  <form onSubmit={submitBooking}>
                    <div className="form-section-heading"><span className="step-index">01</span><div><h3>Escolha o serviço</h3><p>Selecione o cuidado desejado.</p></div></div>
                    <div className="service-select-list">
                      {services.map((item) => <button key={item.id} type="button" className={`service-select ${serviceId === item.id ? 'picked' : ''}`} onClick={() => { setServiceId(item.id); setTime(null); }}><span className="radio-dot" /><span className="service-select-body"><strong>{item.name}</strong><small>{item.durationMinutes === null ? 'Tempo a confirmar' : `${timeSummary(item.durationMinutes)} de atendimento`}</small></span><b>{priceBRL(item.price)}</b></button>)}
                    </div>
                    <div className="form-divider" />
                    <div className="form-section-heading"><span className="step-index">02</span><div><h3>Data e horário</h3><p>Os horários ocupados deixam de aparecer para as próximas clientes.</p></div></div>
                    {!settingsReady ? <p className="empty-slots">Carregando agenda...</p> : days.length === 0 ? <p className="empty-slots">A agenda ainda está sendo configurada. Tente novamente mais tarde.</p> : <div className="date-scroller" role="group" aria-label="Selecione o dia">
                      {days.map((day) => { const key = isoDay(day); return <button key={key} type="button" className={`day-tile ${date === key ? 'active' : ''}`} onClick={() => { setDate(key); setTime(null); }}><small>{weekday(day)}</small><strong>{day.getDate()}</strong><small>{monthName(day)}</small></button>; })}
                    </div>}
                    <div className="time-label"><Clock3 size={15}/><span>Horários disponíveis</span></div>
                    {!service ? <p className="empty-slots">Escolha um serviço para visualizar os horários.</p> : service.durationMinutes === null ? <p className="empty-slots">A duração deste atendimento será confirmada antes de liberar os horários.</p> : busyLoading ? <p className="empty-slots">Atualizando horários...</p> : available.length === 0 ? <p className="empty-slots">Sem horários para este dia. Escolha outra data.</p> : <div className="times-grid">{available.map((slot) => <button key={slot} type="button" className={`time-pill ${time === slot ? 'active' : ''}`} onClick={() => setTime(slot)}>{slot}</button>)}</div>}
                    {connectionError && <p className="form-error" role="status">{connectionError}</p>}
                    <div className="form-divider" />
                    <div className="form-section-heading"><span className="step-index">03</span><div><h3>Seus dados</h3><p>Precisamos deles para identificar e confirmar seu horário.</p></div></div>
                    <div className="fields-grid"><label className="field">Nome completo<input required type="text" autoComplete="name" placeholder="Seu nome" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label><label className="field">WhatsApp com DDD<input required type="tel" autoComplete="tel" inputMode="tel" placeholder="(24) 99999-9999" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} /></label></div>
                    <label className="field">E-mail<input required type="email" autoComplete="email" inputMode="email" placeholder="voce@email.com" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></label>
                    <label className="field notes-field">Observações (opcional)<textarea placeholder="Alguma preferência?" value={notes} maxLength={280} rows={3} onChange={(e) => setNotes(e.target.value)} /></label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <button type="submit" className="button button-dark submit-button" disabled={!service || !date || !time}>Solicitar agendamento <ArrowRight size={18}/></button>
                    <div className="payment-teaser"><ShieldCheck size={17}/><span>Seu horário fica reservado e aguarda a confirmação da Alana.</span></div>
                  </form>
                )}
              </div>
              <aside className="booking-aside"><p className="eyebrow">SUA ESCOLHA</p><h3 className="serif">Um cuidado <br/><em>exclusivo.</em></h3><div className="aside-rule" /><div className="aside-detail"><span>Serviço</span><strong>{service?.name ?? 'Escolha seu serviço'}</strong></div><div className="aside-detail"><span>Data</span><strong>{date ? dateLabel(date) : 'Selecione uma data'}</strong></div><div className="aside-detail"><span>Horário</span><strong>{time ?? 'Selecione um horário'}</strong></div><div className="aside-detail"><span>Valor</span><strong>{service ? priceBRL(service.price) : '—'}</strong></div><div className="aside-detail"><span>Sinal previsto ({settings.depositPercent}%)</span><strong>{service ? priceBRL(service.price * settings.depositPercent / 100) : '—'}</strong></div><div className="aside-rule" /><div className="aside-signature serif">Alana Nails</div><p className="aside-reminder">Cada detalhe da sua experiência importa.</p><span className="aside-sparkle">✧</span></aside>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <Brand inverse />
          <div className="footer-location"><p>LOCAL DE ATENDIMENTO</p><strong><MapPin size={17} /> Quatis, RJ</strong></div>
          <p>Alana Nails · Agendamentos sujeitos à confirmação.<br />Atendimento em Quatis, RJ.</p>
          <div className="footer-links"><Link href="/admin">Painel da Alana <ArrowRight size={14}/></Link><a href="#agendar">Voltar para agendar <ArrowLeft size={14}/></a></div>
        </div>
        <div className="container footer-bottom"><span>© Alana Nails</span><span>Site desenvolvido por <a href="https://github.com/devL777" target="_blank" rel="noreferrer">devL777</a></span></div>
      </footer>
    </div>
  );
}

