import type { ReactNode } from 'react';
import { href, money, productImg } from '../app.ts';
import type { Product, ProductStatus } from '../backend/index.ts';

const PATHS: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 7.5l8 6 8-6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.400-6.500 11-6.500 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  check: <path d="M5 12.500l4.500 4.500L19 7.500" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M7 10l5 5 5-5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  shield: (
    <>
      <path d="M12 3.500l7 2.500v5.500c0 4.500-3 7.800-7 9-4-1.200-7-4.500-7-9V6z" />
      <path d="M9 12l2.200 2.200L15.200 10" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.500V5M7.500 9.500L12 5l4.500 4.500" />
      <path d="M5 15.500v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </>
  ),
  tag: (
    <>
      <path d="M3.500 12.200V5.500a2 2 0 0 1 2-2h6.700l8.300 8.300a2 2 0 0 1 0 2.800l-5.900 5.900a2 2 0 0 1-2.800 0z" />
      <circle cx="8.200" cy="8.200" r="1.300" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.500" r="3.700" />
      <path d="M4.500 20c1.200-3.600 4-5.300 7.500-5.300s6.300 1.700 7.500 5.300" />
    </>
  ),
  pencil: <path d="M4 20l1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500zM14.500 6l3 3" />,
  swap: <path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />,
  out: <path d="M10 4.500H6.500a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10M15 8l4 4-4 4M19 12H9" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.500" />
      <path d="M12 11v5M12 7.800v.2" />
    </>
  ),
  reset: <path d="M4.500 12a7.500 7.500 0 1 0 2.300-5.400M4.500 4.500v4h4" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The GG mark: two lowercase g's on a lime tile. */
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="GG">
      <rect width="64" height="64" rx="16" fill="var(--lime)" />
      <g fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round">
        <circle cx="21" cy="27" r="8.500" />
        <path d="M29.500 18V37.500a8.500 8.500 0 0 1-8.500 8.500c-2.800 0-5.300-1.100-7-3" />
        <circle cx="43" cy="27" r="8.500" />
        <path d="M51.500 18V37.500a8.500 8.500 0 0 1-8.500 8.500c-2.800 0-5.300-1.100-7-3" />
      </g>
    </svg>
  );
}

const STATUS_LABEL: Record<ProductStatus, string> = {
  pending: 'In review',
  'on-sale': 'On sale',
  'off-sale': 'Off sale',
  sold: 'Sold',
  rejected: 'Rejected',
};

export function StatusChip({ status }: { status: ProductStatus }) {
  return (
    <span className={`chip st-${status}`} data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ProductCard({ id, p, to }: { id: string; p: Product; to?: string }) {
  return (
    <a className="card" href={href(to ?? `/item/${id}`)} data-testid="product-card">
      <span className="card-img">
        <img src={productImg(p)} alt="" loading="lazy" />
      </span>
      <span className="card-name">{p.name}</span>
      <span className="card-row">
        <span className="card-price">{money(p.price)}</span>
        <span className="card-loc">
          <Icon name="pin" size={13} />
          {p.location}
        </span>
      </span>
    </a>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert" data-testid="api-error">
      Error: {error}
    </p>
  ) : null;
}
