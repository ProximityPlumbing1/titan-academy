import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { splitMarkers } from '../../shared/types';

type Variant = 'primary' | 'ghost' | 'danger' | 'gold' | 'subtle';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue text-white hover:bg-blue2',
  gold: 'bg-gold text-ink hover:brightness-110',
  danger: 'bg-bad/90 text-white hover:bg-bad',
  ghost: 'border border-line text-white hover:bg-white/5',
  subtle: 'bg-white/5 text-white hover:bg-white/10',
};

export function Button({ variant = 'primary', size = 'md', className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-4 text-lg' : 'px-4 py-2.5';
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 ${sz} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-panel ${className}`}>{children}</div>;
}

export function Field({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <input
        {...rest}
        className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white placeholder:text-faint focus:border-blue2 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-red-200">{error}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex min-h-[40vh] items-center justify-center text-muted">{label}</div>;
}

export function Ring({ pct, size = 96, stroke = 9, color = 'var(--color-gold)', children }:
  { pct: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / .08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'good' | 'amber' | 'bad' | 'cyan' | 'gold' }) {
  const t = {
    muted: 'bg-white/8 text-muted', good: 'bg-good/15 text-good', amber: 'bg-amber/15 text-amber',
    bad: 'bg-bad/15 text-bad', cyan: 'bg-cyan/15 text-cyan', gold: 'bg-gold/15 text-gold',
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
        t.startsWith('**') && t.endsWith('**') && t.length > 4 ? <strong key={i} className="font-semibold text-white">{t.slice(2, -2)}</strong>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-line bg-navy p-6 shadow-2xl fade-in`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-white/5" aria-label="Close">✕</button>
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
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0e1320', light: '#ffffff' } })
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
        <div className="text-[10px] font-bold tracking-[0.22em] text-cyan">PROXIMITY PLUMBING</div>
        <div className={`headline ${small ? 'text-base' : 'text-lg'}`}>Titan Academy</div>
      </div>
    </div>
  );
}

export const firstName = (name: string) => name.split(' ')[0];
