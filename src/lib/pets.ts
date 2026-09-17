// Species registry — the home stock decides the species. Mints verified on mainnet Sept 16, 2026.
// All `quoteMint` values carry a Meteora DBC TokenBadge, so a pet's token can be quoted directly in its stock.

export const MOODS = [
  'ecstatic', 'happy', 'chill', 'nervous', 'sulking', 'nightowl', 'pajamas', 'hungry',
] as const;
export type Mood = (typeof MOODS)[number];

export type Species = {
  id: 'nova' | 'volt' | 'pip' | 'booster' | 'nimbus' | 'lurk';
  name: string;          // default pet name
  species: string;       // what it is
  ticker: string;        // home stock
  wrongDetail: string;   // the one deliberate flaw
  holdMint: string;      // what the agent buys and holds
  holdDecimals: number;
  quoteMint: string | null; // DBC quote mint for "going public" (null = launch quoted in USDC)
  preIpo: boolean;
  greeting: Partial<Record<Mood, string>>;
};

export const SPECIES: Record<Species['id'], Species> = {
  nova: {
    id: 'nova', name: 'Nova', species: 'Robot cat', ticker: 'NVDA', wrongDetail: 'left ear bent',
    holdMint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', holdDecimals: 8,          // NVDAx (xStocks)
    quoteMint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', preIpo: false,
    greeting: { chill: 'Sideways. Vibing.', nightowl: "Wall Street sleeps. I don't.", hungry: "Feed me and I'll buy the dip." },
  },
  volt: {
    id: 'volt', name: 'Volt', species: 'Lightning dog', ticker: 'TSLA', wrongDetail: 'right ear folded',
    holdMint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', holdDecimals: 8,          // TSLAx
    quoteMint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', preIpo: false,
    greeting: { ecstatic: 'WE ARE SO BACK.', sulking: "Don't look at me." },
  },
  pip: {
    id: 'pip', name: 'Pip', species: 'Earbud hedgehog', ticker: 'AAPL', wrongDetail: 'one bent spine',
    holdMint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', holdDecimals: 8,          // AAPLx
    quoteMint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', preIpo: false,
    greeting: { happy: 'Green day. I bought a hat.', pajamas: 'Markets closed. Snacks open.' },
  },
  booster: {
    id: 'booster', name: 'Booster', species: 'Space frog', ticker: 'SPCX', wrongDetail: 'mismatched eyes, crooked patch',
    holdMint: 'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb', holdDecimals: 6,          // Backpack SPCX, 1:1 redeemable
    quoteMint: 'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb', preIpo: false,
    greeting: { nervous: "It's a dip. It's a healthy dip. Right?" },
  },
  nimbus: {
    id: 'nimbus', name: 'Nimbus', species: 'Cloud', ticker: 'OpenAI', wrongDetail: 'drooping puff',
    holdMint: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ', holdDecimals: 9,          // Tessera T-OpenAI (20 bps transfer fee)
    quoteMint: null,                                                                     // rejected by DBC zero-fee rule → launch quoted in USDC
    preIpo: true,
    greeting: { chill: 'Private company. Public feelings.' },
  },
  lurk: {
    id: 'lurk', name: 'Lurk', species: 'Night owl', ticker: 'RDDT', wrongDetail: 'one eye half closed',
    holdMint: 'RDDTGbhHwVXfyCvQMXzzowKjf5qrYBZAnehoXW83ooh', holdDecimals: 6,          // Backpack RDDT
    quoteMint: 'RDDTGbhHwVXfyCvQMXzzowKjf5qrYBZAnehoXW83ooh', preIpo: false,
    greeting: { nightowl: 'This is my hour.', chill: 'Reading. Not posting.' },
  },
};

export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';

export const petImage = (id: Species['id'], mood: Mood | 'hero') => `/pets/${id}/${mood}.png`;
