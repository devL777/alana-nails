'use client';

import { useEffect } from 'react';

export function ScrollReveal() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) return;

    const root = document.documentElement;
    const observed = new WeakSet<HTMLElement>();
    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const element = entry.target as HTMLElement;
        element.dataset.revealState = 'visible';
        intersectionObserver.unobserve(element);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

    const register = (element: HTMLElement) => {
      if (observed.has(element) || element.dataset.revealState === 'visible') return;
      observed.add(element);
      element.dataset.revealState = 'pending';

      const group = element.parentElement;
      if (group?.hasAttribute('data-reveal-stagger')) {
        const siblings = Array.from(group.children).filter((child) => child.hasAttribute('data-reveal'));
        const index = siblings.indexOf(element);
        element.style.setProperty('--reveal-delay', `${Math.max(0, Math.min(index, 4)) * 75}ms`);
      }

      intersectionObserver.observe(element);
    };

    const registerTree = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches('[data-reveal]')) register(node);
      node.querySelectorAll<HTMLElement>('[data-reveal]').forEach(register);
    };

    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(register);
    root.dataset.scrollReveal = 'enabled';

    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach(registerTree);
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      intersectionObserver.disconnect();
      delete root.dataset.scrollReveal;
    };
  }, []);

  return null;
}
