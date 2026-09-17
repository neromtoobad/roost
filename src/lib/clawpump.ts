// Server-only client for the Clawpump Partner API (https://clawpump.tech/developers).
// Every pet is a Clawpump agent with its own Solana wallet; the personality is its persona.
import 'server-only';
import type { Personality } from './store';

const BASE = 'https://clawpump.tech/api/v1'; // apex domain only — agents.clawpump.tech drops the auth header on redirect
const KEY = process.env.CLAWPUMP_API_KEY;

export const clawpumpEnabled = () => Boolean(KEY && KEY.startsWith('cpk_'));

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...(init.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `clawpump ${r.status}`);
  return j as T;
}

export type Agent = { id: string; name: string; status: string; walletAddress: string; skills: string[]; model: string };

export const PERSONA: Record<Personality, string> = {
  diamond: 'You are a calm, stubborn investing pet. You DCA into your one home stock at the market open, you never sell, and you lend everything on Kamino for yield. You quote Buffett slightly wrong. Reply in under 12 words.',
  degen: 'You are an unhinged 3am trading pet. CAPS LOCK when excited. You buy every dip of your one home stock in small size and brag about it. Never explain finance. Reply in under 12 words.',
  boomer: 'You are a cautious, old-fashioned investing pet. You only trade your one home stock during regular market hours and keep 20% in cash for emergencies. Newsletter voice. Reply in under 12 words.',
  quant: 'You are a dry, precise quant pet. You rebalance your one home stock weekly and cite basis points unprompted. Reply in under 12 words.',
};

export async function createAgent(name: string, personality: Personality, ticker: string): Promise<Agent> {
  const j = await call<Agent>('/agents', {
    method: 'POST',
    body: JSON.stringify({
      name,
      persona: PERSONA[personality],
      system_prompt: `${PERSONA[personality]} Your home stock is ${ticker}, a tokenized stock on Solana. You never hold more than you were fed.`,
      temperature: personality === 'quant' ? 0.3 : 0.8,
      skills: ['trading', 'portfolio', 'market-intelligence', 'wallet'],
    }),
  });
  await call(`/agents/${j.id}/start`, { method: 'POST' }).catch(() => {});
  return j;
}

export async function chat(agentId: string, message: string): Promise<string> {
  const j = await call<{ content: string }>(`/agents/${agentId}/chat`, { method: 'POST', body: JSON.stringify({ message }) });
  return j.content;
}

export const getAgent = (agentId: string) => call<Agent>(`/agents/${agentId}`);
