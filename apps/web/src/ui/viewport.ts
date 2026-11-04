import { useEffect } from 'react';

/**
 * Teclado en el móvil: la app conserva SIEMPRE su tamaño sin teclado y el teclado la tapa.
 * iOS, al enfocar un campo, desliza la ventana (visualViewport.offsetTop) y a veces también redimensiona el
 * viewport; eso movía y encogía la pantalla. Aquí se mide una vez el alto «sin teclado» y se publica:
 *   --app-h   alto fijo de la app (el del viewport sin teclado)
 *   --vv-top  cuánto ha deslizado iOS la ventana: el contenedor raíz se contra-desplaza esa cantidad y se queda quieto
 *   --kb      altura del teclado: solo lo que debe verse sobre él (cuadro del chat, diálogos) se levanta con ella
 *   html.kb-open  barra inferior y `.kb-hide` ocultos mientras está abierto
 */
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let base = vv.height;
    let lastW = vv.width;
    const update = () => {
      // Sin teclado (o al girar el móvil) el viewport visual es el alto base.
      if (vv.height >= base - 120 || vv.width !== lastW) base = vv.height;
      lastW = vv.width;
      const kbh = Math.max(0, Math.round(base - vv.height));
      root.style.setProperty('--app-h', `${Math.round(base)}px`);
      root.style.setProperty('--vv-top', `${Math.max(0, Math.round(vv.offsetTop))}px`);
      root.style.setProperty('--kb', `${kbh}px`);
      root.classList.toggle('kb-open', kbh > 120);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); window.removeEventListener('resize', update);
      root.classList.remove('kb-open');
      for (const p of ['--app-h', '--vv-top', '--kb']) root.style.removeProperty(p);
    };
  }, []);
}
