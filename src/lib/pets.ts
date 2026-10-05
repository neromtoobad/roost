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
// Four of the six swap; Bara and Fen go through RFQ, because AAPL and RDDT are not
// listed as bStocks. That split is deliberate: it is the honest shape of the market.

export const MOODS = [
  'ecstatic', 'happy', 'chill', 'nervous', 'sulking', 'nightowl', 'pajamas', 'hungry',
] as const;
export type Mood = (typeof MOODS)[number];

export type Platform = 'bstock' | 'ondo';

/**
 * A tokenized stock a Fledgling can hold — any of the ~450 on BSC, not only the six below.
 * Keyed by `address`: one ticker can have two tokens (bStock and Ondo), and they are different
 * things with different prices and different reference prices.
 */
export type Stock = {
  ticker: string;
  company: string;
  tokenSymbol: string;
  platform: Platform;
  address: `0x${string}`;
  decimals: number;
  /** As the RWA list marks it: 1 a stock, 3 an ETF. */
  assetType?: number;
};

export type Species = {
  id: 'nova' | 'volt' | 'pip' | 'booster' | 'nimbus' | 'lurk';
  name: string;           // default pet name
  species: string;        // what it is
  company: string;        // its signature stock's company — a Species is also a Stock
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
    id: 'nova', name: 'Pango', species: 'Circuit pangolin', wrongDetail: 'one scale flipped up',
    company: 'Nvidia', ticker: 'NVDA', tokenSymbol: 'NVDAB', platform: 'bstock',
    address: '0x02fca66c1d1afb4e2a7884261eb00f63598a7436', decimals: 18, preIpo: false,
    greeting: { chill: 'Curled up. Computing.', nightowl: "Wall Street sleeps. I don't.", hungry: "Feed me and I'll roll toward the dip." },
  },
  volt: {
    id: 'volt', name: 'Coil', species: 'Copper axolotl', wrongDetail: 'one gill shorter',
    company: 'Tesla', ticker: 'TSLA', tokenSymbol: 'TSLAB', platform: 'bstock',
    address: '0x5b1910eaad6450e50f816082aa078c41f10c292f', decimals: 18, preIpo: false,
    greeting: { ecstatic: 'FULLY CHARGED.', sulking: 'Low battery. Leave me.' },
  },
  pip: {
    id: 'pip', name: 'Bara', species: 'Shopping capybara', wrongDetail: 'a notch in one ear',
    company: 'Apple', ticker: 'AAPL', tokenSymbol: 'AAPLon', platform: 'ondo',
    address: '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4', decimals: 18, preIpo: false,
    greeting: { happy: 'Green day. I bought a leaf.', pajamas: 'Markets closed. Bath time.' },
  },
  booster: {
    id: 'booster', name: 'Rivet', species: 'Jetpack beaver', wrongDetail: 'one chipped tooth',
    company: 'SpaceX', ticker: 'SPCX', tokenSymbol: 'SPCXB', platform: 'bstock',
    address: '0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1', decimals: 18, preIpo: true,
    greeting: { nervous: "It's a dip. I've built through worse.", chill: 'No closing bell for a private company.' },
  },
  nimbus: {
    // A woolly sheep reads as a cloud (CoreWeave rents out cloud compute), and wool sewn from many
    // patches is a basket — which is why ETFs hatch one too.
    id: 'nimbus', name: 'Patch', species: 'Patchwork sheep', wrongDetail: 'one patch upside down',
    company: 'CoreWeave', ticker: 'CRWV', tokenSymbol: 'CRWVB', platform: 'bstock',
    address: '0x33e7317e17838fee56b10fe8d0b9ca6ca3090c95', decimals: 18, preIpo: false,
    greeting: { chill: 'A little of everything. Mostly wool.', nightowl: 'Counting stocks instead of sheep.' },
  },
  lurk: {
    id: 'lurk', name: 'Fen', species: 'Dish-eared fennec', wrongDetail: 'one dented ear dish',
    company: 'Reddit', ticker: 'RDDT', tokenSymbol: 'RDDTon', platform: 'ondo',
    address: '0x4da12f47578ef89c76179b760c778e70b668f80b', decimals: 18, preIpo: false,
    greeting: { nightowl: 'I can hear the market at night.', chill: 'Listening. Not posting.' },
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

export const isAddress = (s: string): s is `0x${string}` => /^0x[a-fA-F0-9]{40}$/.test(s);

/**
 * Which Fledgling hatches from a stock, by the sector Binance's RWA profile gives its company.
 * Each creature keeps its signature stock and takes in the sector it stands for:
 *
 *   Pango, the circuit pangolin   Technology
 *   Coil, the copper axolotl      Energy, Utilities, Basic Materials — things that carry a charge
 *   Bara, the shopping capybara   Consumer (cyclical and defensive), Healthcare, Real Estate
 *   Rivet, the jetpack beaver     Industrials — aerospace, space and defence live here
 *   Patch, the patchwork sheep    ETFs — many patches, one basket — and anything the profile leaves blank
 *   Fen, the dish-eared fennec    Communication Services, Financial Services — it listens to the crowd
 *
 * The profile's industry list, sampled across 163 tokens, is exactly those eleven values plus ETF.
 */
export function speciesFor(industry: string | null | undefined, assetType?: number | null): Species['id'] {
  if (assetType === 3) return 'nimbus';
  const s = (industry ?? '').toLowerCase();
  if (s.includes('tech')) return 'nova';
  if (s.includes('energy') || s.includes('utilit') || s.includes('material')) return 'volt';
  if (s.includes('consumer') || s.includes('health') || s.includes('real estate')) return 'pip';
  if (s.includes('industrial')) return 'booster';
  if (s.includes('communication') || s.includes('financial')) return 'lurk';
  return 'nimbus';
}
