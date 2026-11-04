import { useEffect } from 'react';

/**
 * Teclado en el móvil: la página NO se mueve ni se encoge, el teclado la tapa.
 * - index.html: `interactive-widget=overlays-content` (Android/Chrome no redimensiona al abrir el teclado).
 * - index.css: html/body no hacen scroll; cada pantalla scrollea en su propio contenedor (Shell), así iOS
 *   no tiene página que deslizar.
 * - Este hook (montado en `App`) mide el teclado: publica `--kb` (su altura) y pone `<html class="kb-open">`.
 *   Lo que debe seguir visible encima del teclado (cuadro del chat, diálogos) se levanta con `--kb`;
 *   `.kb-hide` y la barra inferior se ocultan. Si iOS desliza igualmente la ventana, se devuelve a 0.
 */
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const kbh = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--kb', `${kbh}px`);
      root.classList.toggle('kb-open', kbh > 120);
      if (kbh > 120 && (window.scrollY !== 0 || vv.offsetTop !== 0)) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); window.removeEventListener('resize', update);
      root.classList.remove('kb-open'); root.style.removeProperty('--kb');
    };
  }, []);
}
