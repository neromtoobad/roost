import { createConfig, http, cookieStorage, createStorage } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// BSC mainnet, and only BSC mainnet. The hackathon is mainnet-only, and a Fledgling holding a
// testnet token would be a lie told in public — dry runs go through the Transaction API's
// simulate endpoint instead, which costs nothing and proves the same thing.
//
// No wallet-specific connector here on purpose. wagmi discovers injected wallets over EIP-6963,
// so Binance Web3 Wallet, MetaMask, Rabby and the rest announce themselves and appear by name.
// The alternative, @binance/w3w-wagmi-connector-v2, is built for wagmi 2 and this is wagmi 3.

export const BSC_CHAIN_ID = bsc.id; // 56

export const config = createConfig({
  chains: [bsc],
  connectors: [injected()],
  transports: { [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC || undefined) },
  // The app renders on the server first; cookie storage lets the connection survive that.
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
