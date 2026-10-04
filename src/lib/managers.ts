import type { Personality } from './pet-math';
import type { Species } from './pets';

// The managers. Each is a character with a written philosophy, one rule the engine actually runs
// (lib/strategy), and a default list of stocks the client can trim when hiring. Nothing a manager
// says about itself is decoration: `rules` is the plain-language version of its `rule`, and the
// track record on its page is computed from what it really did, for every client at once.
//
// Shared by the browser, the API routes and the hourly worker, so it carries no imports that only
// one of them can load.

export type ManagerId = 'vesper' | 'margo' | 'orrin' | 'ade' | 'juno' | 'kai';

export type Manager = {
  id: ManagerId;
  name: string;
  title: string;
  /** The engine rule it trades by. */
  rule: Personality;
  /** One line, for cards. */
  tagline: string;
  /** In its own words: what it believes. */
  philosophy: string;
  /** What the engine does, in plain language — the mandate a client signs up to. */
  rules: string[];
  /** When it acts. */
  hours: string;
  universe: { ticker: string; name: string }[];
  /** Its colour, for the monogram until its portrait is in. */
  color: string;
  /** Portrait under /public/managers, once there is one. */
  art?: string;
  /** Internal: the species a position is filed under, so older code paths keep working. */
  species: Species['id'];
  voice: {
    /** First diary line of a new mandate. */
    hired: string;
    /** When there is cash waiting and the rule has not fired. */
    waiting: string;
    /** The memo's sign-off when it asks for a signature. */
    asks: string;
  };
};

export const MANAGERS: Manager[] = [
  {
    id: 'vesper', name: 'Vesper', title: 'The Night Desk', rule: 'night', species: 'lurk', color: '#5B6CFF',
    tagline: 'Trades only while Wall Street sleeps.',
    philosophy: 'The exchange is open about 32 hours a week. The token never closes. The other 136 hours are where the price drifts without anyone checking it — and that is where I buy.',
    rules: [
      'Acts only while the exchange is shut — nights, weekends, holidays.',
      'Buys when a stock trades at least 1% under where the exchange last closed it.',
      'Half of what is waiting per signal, at most once every six hours.',
      'Asks you first above $25.',
    ],
    hours: 'Off-hours only',
    universe: [
      { ticker: 'NVDA', name: 'Nvidia' }, { ticker: 'TSLA', name: 'Tesla' }, { ticker: 'QQQ', name: 'Nasdaq 100' },
      { ticker: 'SPY', name: 'S&P 500' }, { ticker: 'META', name: 'Meta' },
    ],
    voice: {
      hired: 'Vesper on the desk. I work the hours nobody is watching.',
      waiting: 'Waiting for the exchange to close, and for a discount.',
      asks: 'The exchange is shut and the price is soft. Your signature, please.',
    },
  },
  {
    id: 'margo', name: 'Margo', title: 'The Long-Term Owner', rule: 'diamond', species: 'pip', color: '#B98A4E',
    tagline: 'Buys at every open. Has never sold.',
    philosophy: 'I do not trade stocks. I buy pieces of businesses and keep them. The best time to add was the last open; the second best is the next one.',
    rules: [
      'Buys with everything waiting at every market open.',
      'Never sells — you can withdraw, she will not.',
      'Regular hours only.',
    ],
    hours: 'Every open',
    universe: [
      { ticker: 'AAPL', name: 'Apple' }, { ticker: 'BAC', name: 'Bank of America' }, { ticker: 'AXP', name: 'American Express' },
      { ticker: 'KO', name: 'Coca-Cola' }, { ticker: 'CVX', name: 'Chevron' }, { ticker: 'OXY', name: 'Occidental' },
    ],
    voice: {
      hired: 'Margo here. I buy at the open and I keep what I buy.',
      waiting: 'It goes in at the next open. Not before.',
      asks: 'The market is open. Shall we add to it?',
    },
  },
  {
    id: 'orrin', name: 'Orrin', title: 'The Indexer', rule: 'quant', species: 'nimbus', color: '#2F8F83',
    tagline: 'The whole market, equal-weighted, once a week.',
    philosophy: 'I do not pick. I own everything that matters in equal parts and put new money where the parts have fallen out of balance. Boring is the strategy.',
    rules: [
      'Invests once a week, in regular hours.',
      'New money tops up whichever fund has fallen furthest below an equal share.',
      'Broad index funds only.',
    ],
    hours: 'Weekly',
    universe: [
      { ticker: 'SPY', name: 'S&P 500' }, { ticker: 'QQQ', name: 'Nasdaq 100' },
      { ticker: 'IWM', name: 'Russell 2000' }, { ticker: 'GLD', name: 'Gold' },
    ],
    voice: {
      hired: 'Orrin initialised. Equal weights. No opinions.',
      waiting: 'Queued for the weekly rebalance.',
      asks: 'The weekly rebalance is due. Sign to execute.',
    },
  },
  {
    id: 'ade', name: 'Ade', title: 'The Income Steward', rule: 'boomer', species: 'booster', color: '#8A5A2B',
    tagline: 'Dividend payers, regular hours, 20% kept back.',
    philosophy: 'A company that pays you to own it is telling you something. I buy the payers, in daylight, and I always keep something back for the day it is cheaper.',
    rules: [
      'Buys once a day at the open, in regular hours only.',
      'Always keeps 20% of everything you have given him in reserve.',
      'Notes every dividend reinvested into the tokens he holds.',
    ],
    hours: 'Regular hours',
    universe: [
      { ticker: 'KO', name: 'Coca-Cola' }, { ticker: 'CVX', name: 'Chevron' },
      { ticker: 'BAC', name: 'Bank of America' }, { ticker: 'AXP', name: 'American Express' },
    ],
    voice: {
      hired: 'Ade at your service. Payers only, and something always kept back.',
      waiting: 'It will go in at the open, less the reserve.',
      asks: 'Regular hours, reserve kept. Your signature for the rest.',
    },
  },
  {
    id: 'juno', name: 'Juno', title: 'The Contrarian', rule: 'degen', species: 'volt', color: '#D6403F',
    tagline: 'Buys the drop, at any hour.',
    philosophy: 'When everyone is selling, the price is wrong. I buy 2% drops in pieces, day or night, and I wait for the crowd to come back around.',
    rules: [
      'Buys when a stock is 2% or more under its 24-hour high — at any hour.',
      'Spends 40% of what is waiting per drop, at most once every six hours.',
      'Asks you first above $25.',
    ],
    hours: 'Any hour',
    universe: [
      { ticker: 'NVDA', name: 'Nvidia' }, { ticker: 'AMD', name: 'AMD' }, { ticker: 'AVGO', name: 'Broadcom' },
      { ticker: 'TSM', name: 'TSMC' }, { ticker: 'MU', name: 'Micron' }, { ticker: 'ARM', name: 'Arm' },
    ],
    voice: {
      hired: 'Juno. When they panic, I buy. When they cheer, I wait.',
      waiting: 'Waiting for a drop worth buying.',
      asks: 'It dropped. Everyone is selling. Sign and we buy it.',
    },
  },
  {
    id: 'kai', name: 'Kai', title: 'The Momentum Manager', rule: 'momentum', species: 'nova', color: '#C8A800',
    tagline: 'Only rides what is already running.',
    philosophy: 'Trends last longer than people expect. Once a week I add to whatever is above its five-day average, and I leave alone whatever is falling.',
    rules: [
      'Buys at the market open, once a week.',
      'Only when a stock trades above its five-day average.',
      'Holds the cash, and says so, when it is below.',
    ],
    hours: 'Weekly, at the open',
    universe: [
      { ticker: 'AAPL', name: 'Apple' }, { ticker: 'MSFT', name: 'Microsoft' }, { ticker: 'GOOGL', name: 'Alphabet' },
      { ticker: 'AMZN', name: 'Amazon' }, { ticker: 'META', name: 'Meta' }, { ticker: 'NVDA', name: 'Nvidia' },
      { ticker: 'TSLA', name: 'Tesla' },
    ],
    voice: {
      hired: 'Kai on it. I ride what is running.',
      waiting: 'Waiting for the open, and for strength.',
      asks: 'It is above its five-day average. Sign and we ride it.',
    },
  },
];

export const managerById = (id: string | undefined | null): Manager | undefined => MANAGERS.find((m) => m.id === id);

/** The manager whose rule this is — how positions opened before the managers existed are filed. */
export const managerForRule = (rule: Personality): Manager => MANAGERS.find((m) => m.rule === rule) ?? MANAGERS[1];

/** Initials for the monogram. */
export const initials = (m: Pick<Manager, 'name'>) => m.name.slice(0, 2).toUpperCase();
