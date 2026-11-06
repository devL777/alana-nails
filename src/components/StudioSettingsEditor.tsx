'use client';

import { useEffect, useState } from 'react';
import { CalendarOff, CheckCircle2, Clock3, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import {
  priceBRL,
  Service, StudioSettings, validateSettings,
} from '@/lib/booking';
import { fetchAdminBookings, fetchAdminStudioSettings, saveAdminStudioSettings } from '@/lib/supabase-browser';

const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export function StudioSettingsEditor() {
  const [draft, setDraft] = useState<StudioSettings | null>(null);
  const [blockedInput, setBlockedInput] = useState('');
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAdminStudioSettings().then(setDraft).catch(() => setProblem('Não foi possível carregar as configurações do banco.'));
  }, []);

  function mutate(update: (old: StudioSettings) => StudioSettings) {
    setDraft((old) => old ? update(old) : old);
    setNotice(''); setProblem('');
  }

  function editService(id: string, patch: Partial<Service>) {
    mutate((current) => ({ ...current, services: current.services.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function addService() {
    mutate((current) => ({
      ...current,
      services: [...current.services, {
        id: `novo-${Date.now()}`, name: 'Novo serviço', detail: 'Descreva o atendimento',
        price: 0, durationMinutes: 60, active: false,
        symbol: String(current.services.length + 1).padStart(2, '0'),
      }],
    }));
  }

  async function removeService(id: string) {
    try {
      const bookings = await fetchAdminBookings();
      if (bookings.some((booking) => booking.serviceId === id)) {
        setProblem('Este serviço já possui agendamentos. Desative-o em vez de excluí-lo.');
        return;
      }
      mutate((current) => ({ ...current, services: current.services.filter((item) => item.id !== id) }));
    } catch {
      setProblem('Não foi possível conferir os agendamentos deste serviço.');
    }
  }

  function editWeekday(index: number, field: 'enabled' | 'start' | 'end' | 'breakStart' | 'breakEnd', value: string | boolean) {
    mutate((current) => ({
      ...current,
      weekly: current.weekly.map((day, dayIndex) => dayIndex === index ? { ...day, [field]: value } : day),
    }));
  }

  function addBlockedDay() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(blockedInput) || Number.isNaN(new Date(`${blockedInput}T12:00:00`).getTime())) {
      setProblem('Selecione uma data válida para bloquear.'); return;
    }
    mutate((current) => ({ ...current, blockedDates: [...new Set([...current.blockedDates, blockedInput])].sort() }));
    setBlockedInput('');
  }

  async function handleSave() {
    if (!draft) return;
    const issue = validateSettings(draft);
    if (issue) { setProblem(issue); setNotice(''); return; }
    setSaving(true);
    try {
      await saveAdminStudioSettings(draft);
      setProblem('');
      setNotice('Configurações salvas. A agenda pública já pode usar esses horários.');
    } catch {
      setProblem('Não foi possível salvar as configurações. Confira os dados e tente novamente.');
      setNotice('');
    } finally { setSaving(false); }
  }

  if (!draft) return <div className="settings-panel">{problem || 'Carregando configurações...'}</div>;

  return (
    <div className="settings-workspace">
      <div className="admin-heading">
        <div><p className="eyebrow">PERSONALIZE O ATENDIMENTO</p><h1 className="serif">Seu estúdio, <em>suas regras.</em></h1><p>Configure o catálogo, a agenda e o sinal ilustrativo sem editar o código.</p></div>
      </div>
      <div className="settings-intro"><ShieldAlert size={18}/><span>Serviços, horários e datas bloqueadas são salvos no banco e atualizados para todas as clientes.</span></div>
      <section className="settings-panel">
        <div className="settings-panel-heading"><div><p className="eyebrow">01 · CATÁLOGO</p><h2 className="serif">Serviços & valores</h2><p>Somente serviços marcados como ativos aparecem no agendamento.</p></div><button className="settings-add" type="button" onClick={addService}><Plus size={16}/> Novo serviço</button></div>
        <div className="service-editor-list">
          {draft.services.map((item, index) => (
            <div className="service-editor" key={item.id}>
              <div className="service-editor-head"><strong>Serviço {String(index + 1).padStart(2, '0')}</strong><div className="settings-toggle-actions"><label className="checkbox-line"><input type="checkbox" checked={item.active} onChange={(event) => editService(item.id, { active: event.target.checked })}/> Disponível no site</label><button type="button" className="small-ghost" onClick={() => removeService(item.id)} title="Remover serviço sem agendamentos"><Trash2 size={16}/></button></div></div>
              <div className="settings-fields"><label>Nome do serviço<input maxLength={70} value={item.name} onChange={(event) => editService(item.id, { name: event.target.value })}/></label><label>Preço (R$)<input type="number" min="0" max="100000" step="0.01" value={item.price} onChange={(event) => editService(item.id, { price: Number(event.target.value) })}/></label><label>Duração (minutos)<input type="number" min="30" max="480" step="15" placeholder="A confirmar" value={item.durationMinutes ?? ''} onChange={(event) => editService(item.id, { durationMinutes: event.target.value ? Number(event.target.value) : null })}/></label><label className="settings-full">Descrição curta<input maxLength={140} value={item.detail} onChange={(event) => editService(item.id, { detail: event.target.value })}/></label></div>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-panel">
        <div className="settings-panel-heading"><div><p className="eyebrow">02 · DISPONIBILIDADE</p><h2 className="serif">Horários semanais</h2><p>O intervalo é bloqueado na agenda; para atender sem pausa, configure os dois campos de pausa com a mesma hora.</p></div><Clock3 color="#a78b55" size={24}/></div>
        <div className="week-editor">
          {draft.weekly.map((day, index) => (
            <div key={weekdays[index]} className={`week-editor-row ${!day.enabled ? 'disabled-day' : ''}`}>
              <label className="checkbox-line day-checkbox"><input type="checkbox" checked={day.enabled} onChange={(event) => editWeekday(index, 'enabled', event.target.checked)}/><span>{weekdays[index]}</span></label>
              <div className="week-editor-times">
                <label>Abre<input type="time" value={day.start} disabled={!day.enabled} onChange={(event) => editWeekday(index, 'start', event.target.value)}/></label>
                <label>Fecha<input type="time" value={day.end} disabled={!day.enabled} onChange={(event) => editWeekday(index, 'end', event.target.value)}/></label>
                <label>Pausa de<input type="time" value={day.breakStart} disabled={!day.enabled} onChange={(event) => editWeekday(index, 'breakStart', event.target.value)}/></label>
                <label>Pausa até<input type="time" value={day.breakEnd} disabled={!day.enabled} onChange={(event) => editWeekday(index, 'breakEnd', event.target.value)}/></label>
              </div>
            </div>
          ))}
        </div>
        <p className="settings-hint">Os horários são ofertados em intervalos de 30 minutos, respeitando a duração de cada atendimento e uma antecedência mínima de uma hora no mesmo dia.</p>
      </section>
      <section className="settings-panel">
        <div className="settings-panel-heading"><div><p className="eyebrow">03 · EXCEÇÕES</p><h2 className="serif">Datas bloqueadas</h2><p>Feriados, férias e dias sem atendimento.</p></div><CalendarOff size={24} color="#a78b55"/></div>
        <div className="blocked-add"><label>Selecione a data<input type="date" value={blockedInput} onChange={(event) => setBlockedInput(event.target.value)}/></label><button type="button" className="settings-add" onClick={addBlockedDay}><Plus size={16}/> Bloquear data</button></div>
        <div className="blocked-list">{draft.blockedDates.length === 0 ? <span>Nenhuma data bloqueada.</span> : draft.blockedDates.map((day) => <div className="blocked-tag" key={day}>{day.split('-').reverse().join('/')}<button type="button" onClick={() => mutate((current) => ({...current, blockedDates: current.blockedDates.filter((item) => item !== day)}))} aria-label={`Desbloquear ${day}`}><Trash2 size={15}/></button></div>)}</div>
      </section>
      <section className="settings-panel settings-payment"><div className="settings-panel-heading"><div><p className="eyebrow">04 · PREPARAÇÃO DE PAGAMENTO</p><h2 className="serif">Sinal de reserva</h2><p>Prévia do valor que poderá ser cobrado no Pix após a integração.</p></div></div><div className="deposit-config"><label>Percentual do sinal<input type="number" min="0" max="100" step="1" value={draft.depositPercent} onChange={(event) => mutate((old) => ({ ...old, depositPercent: Number(event.target.value) }))}/></label><div><small>Exemplo para um atendimento de R$ 100,00</small><strong>{priceBRL(100 * draft.depositPercent / 100)}</strong></div></div><p className="settings-hint">Nenhuma cobrança será realizada. A conexão com Mercado Pago e a confirmação por webhook serão etapas separadas.</p></section>
      <div className="settings-savebar">
        <div aria-live="polite">{problem ? <p className="settings-error">{problem}</p> : notice ? <p className="settings-success"><CheckCircle2 size={17}/>{notice}</p> : <p>Revise os dados e salve para atualizar a agenda.</p>}</div>
        <button type="button" className="button button-dark" onClick={handleSave} disabled={saving}><Save size={17}/> {saving ? 'Salvando...' : 'Salvar alterações'}</button>
      </div>
    </div>
  );
}
