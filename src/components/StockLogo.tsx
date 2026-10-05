import { logoFor } from '@/lib/logos';
import { TickerBadge } from './TickerBadge';

/**
 * A stock as people recognise it: its own logo, as Binance shows the token (bStock's gold ring,
 * Ondo's grey). A token without one falls back to its ticker badge.
 */
export function StockLogo({ address, ticker, size = 36 }: { address?: string | null; ticker: string; size?: number }) {
  const src = logoFor(address, ticker);
  if (!src) return <TickerBadge ticker={ticker} size={size} />;
  return (
    <img src={src} alt="" width={size} height={size} loading="lazy" draggable={false}
      className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, boxShadow: '0 3px 8px -3px rgba(0,0,0,.45)' }} />
  );
}
