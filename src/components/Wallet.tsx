'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { config, BSC_CHAIN_ID } from '@/lib/chain';

// A new query client per server render, one reused in the browser.
let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === 'undefined') return new QueryClient();
  browserQueryClient ??= new QueryClient();
  return browserQueryClient;
}

export function Wallet({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

/** The connection, in the one shape the rest of the app cares about. */
export function useWallet() {
  const { address, isConnected, chainId } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Before hydration the server knows nothing about the wallet; claiming otherwise mismatches.
  return {
    address: mounted && isConnected ? address : undefined,
    isConnected: mounted && isConnected,
    onBsc: mounted && chainId === BSC_CHAIN_ID,
    ready: mounted,
  };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const pill: React.CSSProperties = {
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-display)',
};

export function ConnectPill() {
  const { address, isConnected, onBsc, ready } = useWallet();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);

  // Render the same markup the server did until hydration settles.
  if (!ready) {
    return <span className="px-3 py-1.5 text-[12px] font-semibold" style={{ ...pill, opacity: 0.5 }}>Wallet</span>;
  }

  if (isConnected && !onBsc) {
    return (
      <button onClick={() => switchChain({ chainId: BSC_CHAIN_ID })}
        className="px-3 py-1.5 text-[12px] font-semibold"
        style={{ ...pill, background: 'var(--down)', color: '#fff', borderColor: 'transparent' }}>
        Switch to BSC
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <button onClick={() => disconnect()} title="Disconnect"
        className="px-3 py-1.5 text-[12px] font-semibold num" style={pill}>
        {short(address)}
      </button>
    );
  }

  // EIP-6963 usually turns up more than one wallet, so name them rather than guessing.
  const usable = connectors.filter((c) => c.type === 'injected' || c.id !== 'injected');

  if (usable.length === 1) {
    return (
      <button onClick={() => connect({ connector: usable[0] })} disabled={isPending}
        className="px-3 py-1.5 text-[12px] font-semibold"
        style={{ ...pill, background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }}>
        {isPending ? 'Connecting…' : 'Connect'}
      </button>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} disabled={isPending}
        className="px-3 py-1.5 text-[12px] font-semibold"
        style={{ ...pill, background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }}>
        {isPending ? 'Connecting…' : 'Connect'}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 min-w-[180px] overflow-hidden p-1"
          style={{ borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          {usable.length === 0 && (
            <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--muted)' }}>
              No wallet found. Install Binance Web3 Wallet or MetaMask.
            </p>
          )}
          {usable.map((c) => (
            <button key={c.uid}
              onClick={() => { connect({ connector: c }); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold"
              style={{ color: 'var(--ink)' }}>
              {c.icon && <img src={c.icon} alt="" width={16} height={16} style={{ borderRadius: 4 }} />}
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
