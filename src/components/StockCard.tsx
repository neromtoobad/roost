'use client';
import type { Species, Stock } from '@/lib/pets';

// A stock as a first-time investor needs to see it before adopting it: what the company is, how
// big, how it is priced, what it pays, and — the part only a tokenized stock has — how far the
// token is trading from the share it stands for, and whether the issuer publishes its backing.

export type StockInfo = {
  stock: Stock;
  species: Species['id'];
  company: {
    industry: string | null; ceo: string | null; website: string | null; description: string | null;
    collateralReport: { supported: boolean; url: string | null } | null;
    high52w: number | null; low52w: number | null; marketCap: number | null;
    peRatio: number | null; dividendYieldPct: number | null;
  } | null;
  quote: {
    price: number | null; reference: number | null; spreadPct: number | null; pct24h: number; marketStatus: string | null;
    /** Per underlying share: a token can stand for more than one share once dividends are reinvested. */
    sharePrice?: number | null; tokenToShareRatio?: number | null;
  };
};

const money = (n: number) =>
  n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n.toFixed(0)}`;

const ISSUER: Record<string, string> = { bstock: 'bStock', ondo: 'Ondo' };

export function StockCard({ info, compact = false }: { info: StockInfo; compact?: boolean }) {
  const { stock, company: c, quote: q } = info;
  const price = q.price;
  // Where today's price sits in the 52-week range — per share, the range's own scale.
  const share = q.sharePrice ?? null;
  const pos = c?.low52w != null && c?.high52w != null && share != null && c.high52w > c.low52w
    ? Math.min(1, Math.max(0, (share - c.low52w) / (c.high52w - c.low52w)))
    : null;

  return (
    <div className="card px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{stock.company}</p>
          <p className="num text-[12px]" style={{ color: 'var(--muted)' }}>
            {stock.ticker} · {stock.tokenSymbol} · {ISSUER[stock.platform] ?? stock.platform}{stock.assetType === 3 ? ' · ETF' : ''}
          </p>
        </div>
        {price != null && (
          <div className="shrink-0 text-right">
            <p className="num text-[17px] font-bold">${price.toFixed(2)}</p>
            <p className="num text-[11.5px]" style={{ color: q.pct24h >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {q.pct24h >= 0 ? '+' : ''}{q.pct24h.toFixed(2)}% 24h
            </p>
          </div>
        )}
      </div>

      {q.spreadPct != null && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--muted)' }}>
          On-chain <b className="num" style={{ color: 'var(--ink)' }}>{q.spreadPct >= 0 ? '+' : ''}{q.spreadPct.toFixed(2)}%</b> against the share it stands for
          {q.marketStatus && q.marketStatus !== 'regular' ? ` · exchange ${q.marketStatus}` : ''}.
        </p>
      )}

      {c && (
        <>
          {pos != null && (
            <div className="mt-3">
              <div className="flex justify-between text-[11px] num" style={{ color: 'var(--muted)' }}>
                <span>52w low ${c.low52w!.toFixed(2)}</span><span>high ${c.high52w!.toFixed(2)}</span>
              </div>
              <div className="relative mt-1 h-1.5 rounded-full" style={{ background: 'var(--line)' }}>
                <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: `${pos * 100}%`, background: 'var(--accent)', boxShadow: 'var(--glow)' }} aria-label="today" />
              </div>
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Size" value={c.marketCap != null ? money(c.marketCap) : '—'} />
            <Stat label="P/E" value={c.peRatio != null ? c.peRatio.toFixed(1) : '—'} />
            <Stat label="Dividend" value={c.dividendYieldPct != null ? `${c.dividendYieldPct.toFixed(2)}%` : '—'} />
          </div>

          {!compact && (
            <>
              <p className="mt-3 text-[12px]" style={{ color: 'var(--muted)' }}>
                {c.industry ?? 'Sector not given'}{c.ceo ? ` · CEO ${c.ceo}` : ''}
                {c.website && <> · <a href={c.website} target="_blank" rel="noreferrer" className="underline">website</a></>}
              </p>
              {c.description && <p className="mt-2 line-clamp-4 text-[12.5px] leading-snug">{c.description}</p>}
            </>
          )}

          {q.tokenToShareRatio != null && Math.abs(q.tokenToShareRatio - 1) > 0.0005 && (
            <p className="mt-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>
              One token is <span className="num">{q.tokenToShareRatio.toFixed(4)}</span> shares — dividends are reinvested into the token rather than paid out.
            </p>
          )}
          <p className="mt-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>
            {c.collateralReport?.supported
              ? <>✓ {ISSUER[stock.platform] ?? 'The issuer'} publishes a collateral report for this token{c.collateralReport.url ? <> — <a href={c.collateralReport.url} target="_blank" rel="noreferrer" className="underline">read it</a></> : ''}.</>
              : 'No collateral report listed for this token.'}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] px-2 py-1.5" style={{ background: 'var(--canvas)' }}>
      <p className="text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="num text-[13.5px] font-bold">{value}</p>
    </div>
  );
}
