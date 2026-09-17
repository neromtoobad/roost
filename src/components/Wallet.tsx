'use client';
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

const RPC = process.env.NEXT_PUBLIC_RPC ?? 'https://api.mainnet-beta.solana.com';

// Explore without a wallet; connect only when money moves (feed, go public, back a pet).
export function Wallet({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function ConnectPill({ label = 'Connect wallet' }: { label?: string }) {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const short = publicKey ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}` : null;
  return (
    <button onClick={() => (connected ? disconnect() : setVisible(true))}
      className="rounded-full border px-3 py-1.5 text-[12px] font-semibold num" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      {connected ? short : label}
    </button>
  );
}
