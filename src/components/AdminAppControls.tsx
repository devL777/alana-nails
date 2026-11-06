'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, BellRing, Check, Smartphone } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type AdminAppControlsProps = { isAdmin: boolean };

export function AdminAppControls({ isAdmin }: AdminAppControlsProps) {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [pushReady, setPushReady] = useState<boolean | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  async function persistSubscription(subscription: PushSubscription) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error('O painel ainda não está conectado.');

    const { data, error } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) throw new Error('Entre novamente no painel para ativar os avisos.');

    const response = await fetch('/api/push/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) throw new Error('Não foi possível salvar a inscrição neste aparelho.');
  }

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations.filter((registration) => {
          const worker = registration.active ?? registration.waiting ?? registration.installing;
          return registration.scope === window.location.origin + '/' &&
            Boolean(worker?.scriptURL.endsWith('/sw.js'));
        }).map((registration) => registration.unregister())
      )).catch(() => undefined);
    }

    const userAgent = navigator.userAgent;
    const appleMobile = /iPhone|iPad|iPod/i.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsIOS(appleMobile);
    setIsStandalone(standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsStandalone(true);
      setInstructionsOpen(false);
      setMessage('O painel foi adicionado à tela inicial.');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    let active = true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushReady(false);
    } else {
      navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' })
        .then(async (registered) => {
          await navigator.serviceWorker.ready;
          const registration = await navigator.serviceWorker.getRegistration('/admin') ?? registered;
          if (!active) return;
          registrationRef.current = registration;
          setPushReady(true);
          const subscription = await registration.pushManager.getSubscription();
          if (!active) return;
          setIsSubscribed(Boolean(subscription));
          if (subscription && isAdmin) {
            persistSubscription(subscription).catch(() => {
              if (active) setMessage('Abra o painel novamente para sincronizar os avisos deste aparelho.');
            });
          }
        })
        .catch(() => {
          if (active) setPushReady(false);
        });
    }

    return () => {
      active = false;
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [isAdmin]);

  async function handleInstall() {
    if (installPrompt) {
      const prompt = installPrompt;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') setMessage('O painel foi adicionado à tela inicial.');
      return;
    }
    setInstructionsOpen((open) => !open);
  }

  async function enableNotifications() {
    if (isIOS && !isStandalone) {
      setInstructionsOpen(true);
      setMessage('No iPhone, adicione o painel à Tela de Início e abra pelo ícone antes de ativar os avisos.');
      return;
    }
    if (!pushReady || !('Notification' in window) || !('PushManager' in window)) {
      setMessage('Este navegador não oferece suporte a notificações do painel.');
      return;
    }
    if (Notification.permission === 'denied') {
      setMessage('As notificações estão bloqueadas nas configurações deste navegador.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('Permita as notificações para receber novos pedidos de horário.');
        return;
      }

      const registration = registrationRef.current ??
        await navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' });
      const keyResponse = await fetch('/api/push/public-key', { cache: 'no-store' });
      if (!keyResponse.ok) throw new Error('Não foi possível obter a chave de notificações.');
      const { publicKey } = await keyResponse.json() as { publicKey?: string };
      if (!publicKey) throw new Error('A chave de notificações ainda não foi configurada.');

      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(publicKey),
      });
      await persistSubscription(subscription);
      registrationRef.current = registration;
      setIsSubscribed(true);
      setMessage('Você receberá um aviso quando uma cliente solicitar um horário.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível ativar as notificações.');
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('O painel ainda não está conectado.');
      const { data, error } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (error || !accessToken) throw new Error('Entre novamente no painel para alterar os avisos.');

      const registration = registrationRef.current;
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch('/api/push/subscriptions', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + accessToken,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error('Não foi possível desativar os avisos deste aparelho.');
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      setMessage('Os avisos foram desativados neste aparelho.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível desativar os avisos.');
    } finally {
      setBusy(false);
    }
  }

  const showInstallButton = !isStandalone;
  const showNotificationButton = isAdmin && (!isIOS || isStandalone);

  return (
    <section className={'admin-app-card' + (isAdmin ? '' : ' admin-app-card-login')} aria-label="Instalação e notificações do painel">
      <div className="admin-app-copy">
        <p className="eyebrow">PAINEL NA TELA INICIAL</p>
        <h2 className="serif">{isAdmin ? 'Sua agenda sempre por perto.' : 'Acesse sua agenda como um app.'}</h2>
        <p>{isAdmin
          ? 'Ative os avisos para saber quando uma cliente solicitar um horário.'
          : 'Adicione o painel à Tela de Início do iPhone para abrir como um aplicativo.'}</p>
      </div>
      <div className="admin-app-actions">
        {showInstallButton && (
          <button type="button" className="admin-app-button" onClick={() => void handleInstall()} aria-expanded={instructionsOpen}>
            {installPrompt ? <ArrowDownToLine size={16} /> : <Smartphone size={16} />}
            {installPrompt ? 'Instalar painel' : isIOS ? 'Como instalar no iPhone' : 'Como instalar'}
          </button>
        )}
        {showNotificationButton && isAdmin && !isSubscribed && (
          <button type="button" className="admin-app-button" onClick={() => void enableNotifications()} disabled={busy || !pushReady}>
            <BellRing size={16} />{busy ? 'Ativando...' : 'Ativar notificações'}
          </button>
        )}
        {showNotificationButton && isAdmin && isSubscribed && (
          <>
            <span className="admin-app-enabled"><Check size={15} /> Avisos ativados</span>
            <button type="button" className="admin-app-button admin-app-button-secondary" onClick={() => void disableNotifications()} disabled={busy}>
              Desativar
            </button>
          </>
        )}
      </div>
      {instructionsOpen && showInstallButton && (
        <div className="admin-app-instructions">
          <p>{isIOS ? 'No iPhone:' : 'Para adicionar o painel:'}</p>
          <ol>
            {isIOS ? <>
              <li>Abra esta página no Safari e toque em <strong>Compartilhar</strong>.</li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.</li>
              <li>Abra o ícone do painel e entre na sua conta.</li>
            </> : <>
              <li>Abra o menu do navegador.</li>
              <li>Escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
              <li>Abra o ícone criado para acessar a agenda.</li>
            </>}
          </ol>
          {isIOS && <p className="admin-app-note">Depois de abrir o painel pelo ícone, toque em “Ativar notificações”.</p>}
        </div>
      )}
      {message && <p className="admin-app-message" role="status" aria-live="polite">{message}</p>}
      {isAdmin && isIOS && !isStandalone && (
        <p className="admin-app-note">Os avisos no iPhone ficam disponíveis depois de instalar o painel na Tela de Início.</p>
      )}
      {isAdmin && pushReady === false && <p className="admin-app-note">Este navegador não oferece suporte a notificações push.</p>}
    </section>
  );
}

function decodeVapidPublicKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const encoded = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = window.atob(encoded);
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return buffer;
}

