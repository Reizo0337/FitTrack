import { useEffect } from 'react';

/**
 * Teclado en el móvil. iOS no redimensiona la página al abrir el teclado: encoge el «viewport visual» y
 * desplaza la página para que se vea el campo, y los elementos `fixed` (barra inferior, botón «+», diálogos)
 * se quedan flotando a medio camino. Este hook, montado una vez en la raíz, publica el viewport visual como
 * variables CSS y marca `<html class="kb-open">` mientras el teclado está abierto:
 *   --vv-h / --vv-top  alto y desplazamiento del área realmente visible (los diálogos se ajustan a ella)
 *   .kb-open           las clases `.kb-hide` (barra, botón «+») se ocultan para no tapar ni saltar
 */
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const kb = window.innerHeight - vv.height > 120;
      root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
      root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
      root.classList.toggle('kb-open', kb);
    };
    update();
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); window.removeEventListener('resize', update);
      root.classList.remove('kb-open'); root.style.removeProperty('--vv-h'); root.style.removeProperty('--vv-top');
    };
  }, []);
}
