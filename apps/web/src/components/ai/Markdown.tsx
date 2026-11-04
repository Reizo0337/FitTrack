import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renderiza el Markdown de las respuestas del asistente con los estilos del sistema de diseño.
 * Seguro por diseño: react-markdown no interpreta HTML crudo y filtra enlaces peligrosos (p. ej. javascript:).
 */
const components: Components = {
  p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="t-head mt-3 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="t-head mt-3 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 font-semibold first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink-2">{children}</blockquote>,
  hr: () => <hr className="my-3 border-line" />,
  a: ({ href, children }) => !href ? <span>{children}</span> : <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-strong underline underline-offset-2">{children}</a>,
  code: ({ children, className }) => className
    ? <code className={className}>{children}</code> // bloque con lenguaje (dentro de <pre>)
    : <code className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.85em]">{children}</code>,
  pre: ({ children }) => <pre className="mt-2 overflow-x-auto rounded-ctl bg-surface-2 p-3 text-xs [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  table: ({ children }) => <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[16rem] text-sm">{children}</table></div>,
  th: ({ children }) => <th className="border-b border-line-strong px-2 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-2 py-1.5 align-top">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>;
}
