import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { splitMarkers } from '../../shared/types';

type Variant = 'primary' | 'ghost' | 'danger' | 'gold' | 'subtle';
const VARIANTS: Record<Variant, string> = {
  primary: 'border-[1.5px] border-brand bg-brand text-white hover:border-brand2 hover:bg-brand2',
  gold: 'border-[1.5px] border-[#d4a94a] bg-[#d4a94a] text-navy hover:brightness-105',
  danger: 'border-[1.5px] border-bad bg-bad text-white hover:brightness-110',
  // The website's secondary button: white with a cyan border and cyan text.
  ghost: 'border-[1.5px] border-brand bg-card text-link hover:bg-brand hover:text-white',
  subtle: 'bg-tone/5 text-title hover:bg-tone/10',
};

export function Button({ variant = 'primary', size = 'md', className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  // Website buttons are at least 50px tall; small ones are for tables and toolbars.
  const sz = size === 'sm' ? 'min-h-[36px] px-3 text-sm' : size === 'lg' ? 'min-h-[56px] px-6 text-lg' : 'min-h-[50px] px-6 text-[15px]';
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-bold transition-colors duration-300 disabled:opacity-50 ${sz} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[12px] bg-card shadow-card ${className}`}>{children}</div>;
}

export function Field({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-title">{label}</span>
      <input
        {...rest}
        className="w-full rounded-[6px] border border-line bg-card px-4 py-3 text-title placeholder:text-faint focus:border-brand focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex min-h-[40vh] items-center justify-center text-muted">{label}</div>;
}

export function Ring({ pct, size = 96, stroke = 9, color = 'var(--color-brand)', children }:
  { pct: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'color-mix(in oklab, var(--color-tone) 9%, transparent)' }} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'good' | 'amber' | 'bad' | 'cyan' | 'gold' }) {
  const t = {
    muted: 'bg-tone/8 text-muted', good: 'bg-good/15 text-good', amber: 'bg-amber/15 text-amber',
    bad: 'bg-bad/10 text-bad', cyan: 'bg-soft text-link', gold: 'bg-gold/15 text-goldtext',
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}

// Renders text, styling [CONFIRM …] / [VERIFY …] markers. On the TV and phones they show as a short tag.
export function Marked({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <>
      {splitMarkers(text).map((p, i) =>
        p.marker ? (
          <span key={i} className="mx-1 inline-block rounded-md bg-amber/15 px-1.5 align-middle text-[0.7em] font-semibold text-amber" title={p.text}>
            {compact ? 'to be confirmed' : `${p.marker === 'VERIFY' ? 'Verify' : 'Confirm'}${p.text ? `: ${p.text}` : ''}`}
          </span>
        ) : (
          <Emphasis key={i} text={p.text} />
        ),
      )}
    </>
  );
}

// **bold** and *italic* from lesson markdown, rendered as elements (never innerHTML).
function Emphasis({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return (
    <>
      {parts.map((t, i) =>
        t.startsWith('**') && t.endsWith('**') && t.length > 4 ? <strong key={i} className="font-semibold text-title">{t.slice(2, -2)}</strong>
        : t.startsWith('*') && t.endsWith('*') && t.length > 2 ? <em key={i}>{t.slice(1, -1)}</em>
        : t ? <span key={i}>{t}</span> : null,
      )}
    </>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Portal to <body>: animated (transformed) ancestors would otherwise trap position:fixed.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/50 p-4 pt-[8vh] backdrop-blur-[2px]" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-[20px] bg-card p-6 shadow-panel fade-in`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="headline text-xl">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-tone/5" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Qr({ value, className = '' }: { value: string; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    // Loaded on demand: only the admin and TV screens show QR codes.
    import('qrcode')
      .then((QRCode) => QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1a2332', light: '#ffffff' } }))
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [value]);
  return <div className={`qr rounded-xl bg-white p-2 ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icon.svg" alt="" className={small ? 'h-7 w-7' : 'h-9 w-9'} />
      <div className="leading-tight">
        <div className="text-[10px] font-bold tracking-[0.22em] text-link">PROXIMITY PLUMBING</div>
        <div className={`font-extrabold tracking-[-0.02em] text-title ${small ? 'text-base' : 'text-lg'}`}>Titan <span className="em text-link">Academy</span></div>
      </div>
    </div>
  );
}

export const firstName = (name: string) => name.split(' ')[0];
