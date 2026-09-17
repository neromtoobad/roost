// Species registry — the home stock decides the species.
//
// Addresses are BEP-20 contracts on BSC (chain 56), taken from
// GET /api/v1/dex/market/rwa/tokens and confirmed on 2026-09-17.
// Re-check any time with: npx tsx scripts/rwa-map.ts
//
// `platform` is not decoration — it decides how the token can be traded at all:
//
//   bstock  quotes and swaps through the ordinary aggregator, no wallet needed to price.
//   ondo    is request-for-quote. It refuses to quote without a userWalletAddress and
//           settles through /dex/aggregator/order/submit instead of a plain swap.
//
// Four of the six swap; Pip and Lurk go through RFQ, because AAPL and RDDT are not
// listed as bStocks. That split is deliberate: it is the honest shape of the market.

export const MOODS = [
  'ecstatic', 'happy', 'chill', 'nervous', 'sulking', 'nightowl', 'pajamas', 'hungry',
] as const;
export type Mood = (typeof MOODS)[number];

export type Platform = 'bstock' | 'ondo';

export type Species = {
  id: 'nova' | 'volt' | 'pip' | 'booster' | 'nimbus' | 'lurk';
  name: string;           // default pet name
  species: string;        // what it is
  ticker: string;         // underlying ticker — how the API and the UI name the stock
  tokenSymbol: string;    // the BSC token, platform suffix and all
  platform: Platform;     // how it trades
  address: `0x${string}`; // BEP-20 contract on BSC
  decimals: number;
  wrongDetail: string;    // the one deliberate flaw
  preIpo: boolean;        // the underlying company is not publicly listed
  greeting: Partial<Record<Mood, string>>;
};

export const SPECIES: Record<Species['id'], Species> = {
  nova: {
    id: 'nova', name: 'Nova', species: 'Robot cat', wrongDetail: 'left ear bent',
    ticker: 'NVDA', tokenSymbol: 'NVDAB', platform: 'bstock',
    address: '0x02fca66c1d1afb4e2a7884261eb00f63598a7436', decimals: 18, preIpo: false,
    greeting: { chill: 'Sideways. Vibing.', nightowl: "Wall Street sleeps. I don't.", hungry: "Feed me and I'll buy the dip." },
  },
  volt: {
    id: 'volt', name: 'Volt', species: 'Lightning dog', wrongDetail: 'right ear folded',
    ticker: 'TSLA', tokenSymbol: 'TSLAB', platform: 'bstock',
    address: '0x5b1910eaad6450e50f816082aa078c41f10c292f', decimals: 18, preIpo: false,
    greeting: { ecstatic: 'WE ARE SO BACK.', sulking: "Don't look at me." },
  },
  pip: {
    id: 'pip', name: 'Pip', species: 'Earbud hedgehog', wrongDetail: 'one bent spine',
    ticker: 'AAPL', tokenSymbol: 'AAPLon', platform: 'ondo',
    address: '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4', decimals: 18, preIpo: false,
    greeting: { happy: 'Green day. I bought a hat.', pajamas: 'Markets closed. Snacks open.' },
  },
  booster: {
    id: 'booster', name: 'Booster', species: 'Space frog', wrongDetail: 'mismatched eyes, crooked patch',
    ticker: 'SPCX', tokenSymbol: 'SPCXB', platform: 'bstock',
    address: '0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1', decimals: 18, preIpo: true,
    greeting: { nervous: "It's a dip. It's a healthy dip. Right?", chill: 'No closing bell for a private company.' },
  },
  nimbus: {
    // Was OpenAI on Solana. OpenAI is listed by neither bStock nor Ondo, so the cloud keeps
    // its meaning by renting out compute instead of making the model.
    id: 'nimbus', name: 'Nimbus', species: 'Cloud', wrongDetail: 'drooping puff',
    ticker: 'CRWV', tokenSymbol: 'CRWVB', platform: 'bstock',
    address: '0x33e7317e17838fee56b10fe8d0b9ca6ca3090c95', decimals: 18, preIpo: false,
    greeting: { chill: 'I rent out the thunder.', nightowl: "The GPUs don't sleep either." },
  },
  lurk: {
    id: 'lurk', name: 'Lurk', species: 'Night owl', wrongDetail: 'one eye half closed',
    ticker: 'RDDT', tokenSymbol: 'RDDTon', platform: 'ondo',
    address: '0x4da12f47578ef89c76179b760c778e70b668f80b', decimals: 18, preIpo: false,
    greeting: { nightowl: 'This is my hour.', chill: 'Reading. Not posting.' },
  },
};

/** BSC mainnet. Every call carries it as `binanceChainId` — not `chainId`, which is rejected. */
export const CHAIN_ID = '56';

/** What a Fledgling is fed in, and the other leg of every quote. */
export const USDT = '0x55d398326f99059fF775485246999027B3197955';

export const ALL_SPECIES = Object.values(SPECIES);

export const speciesByTicker = (ticker: string): Species | undefined =>
  ALL_SPECIES.find((s) => s.ticker.toUpperCase() === ticker.toUpperCase());

export const petImage = (id: Species['id'], mood: Mood | 'hero') => `/pets/${id}/${mood}.png`;
