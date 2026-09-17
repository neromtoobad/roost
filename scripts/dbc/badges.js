const { Connection, PublicKey } = require('@solana/web3.js');
const DBC = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
const mints = {
  // Backpack Securities (Token-2022 w/ hooks, no transfer fee)
  SPCX:'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb', RDDT:'RDDTGbhHwVXfyCvQMXzzowKjf5qrYBZAnehoXW83ooh', HIMS:'HiMSSzzwkZkrXJ4PGVJRdtfLaANeAztjjcgk5Dxe7Lwx',
  DJT:'DJTu7vi8norVzdVAffgvb39VP7wjKeTsgaMBJrzfxvoF', BA:'BArimz1PcKZr8PcPh3tcZ2dg4S7FJLk3cw6R5F8GsHKg', BABA:'BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp',
  COST:'CZEB3WNZuF2Yz1z2H81RcCk8T7fsw82KB33zqamASVsg', DELL:'DELL2aRKQz7DMq5DrKLtkn47ZCnbxXPZXrSGbkmd13wy', IBM:'BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk',
  JNJ:'JNJg1znKdF712Phe7L7z52AATAvEjEytBdN2w8Lnh1Y', LMT:'LMT3i1BHgixFqPUgcyteJhnEz2dpy9i3cYy4pi9BoeV', LULU:'LULUmT9VMttkfAJE236LXJcYJ2tTP7nunrSWR5G1BdS',
  PFE:'PFER6ENqP8r8NF3CqVt4mFowxsin3V5MLidBNQFCC3x', QUBT:'QUBTAD8C9bMU9LvmMNgKPhrmBGbHvxpu6vfWQtThxxw', RBLX:'RBLXDGRD64AtRamHMFVcjqne3Ar7NLWtFtYNtsrf1cE',
  RIVN:'RcZmt84VMJv9bDhKqmw1uWDahYrUT468VwAChTnfD8p', SHOP:'SH55hfaipFAbwT42nQYhRoM5o5t61QpkmJ6p62vXB3m', SNAP:'SNAPcESrvnH8yUdgeMF6xm1hym9b6hW6s8YeqeHdZFz',
  UPS:'UPSqUeMHcWbkdg784XuBUEF9DtySSnW9ur5LAVdcuB9', MGM:'MGMuubtUEirmkhfEQdmGUh4pr7HuUdMWcZXFtpPbVJD', MU:'MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1',
  SNDK:'SNDKbwMUQvZhnLnxLduradgLHG5KrPuKwpnrkkGRhfH', SKHY:'SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3', DKNG:'DKNGQFNGQmoBdXSRGKJ8tTu7uPDasw5JDcfMmWniNfow',
  NKE:'NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg', GRND:'GRNDYDpqwpCm6jVxpbh4xT5AM4r3p391qYsKTHqgaET2', TTWO:'TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo',
  HOOD:'HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A', MSTR:'MSTRdWXMeZxdE8osAQy3fA4rvTY5rgummDSMEx6U7Nz', BOT:'BoTx8y9ynfdxf5ZjWtCoBVkff52qKA82ysaLU8ZM6d8T',
  // xStocks (Token-2022 w/ scaledUi)
  NVDAx:'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', AAPLx:'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', TSLAx:'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', SPCXx:'Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8',
  // pre-IPO
  'T-OpenAI':'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ', 'T-SpaceX':'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v', 'PS-ANTHROPIC':'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw',
  // controls
  USDC:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};
(async () => {
  const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const names = Object.keys(mints);
  const pdas = names.map(n => PublicKey.findProgramAddressSync([Buffer.from('token_badge'), new PublicKey(mints[n]).toBuffer()], DBC)[0]);
  const infos = [];
  for (let i = 0; i < pdas.length; i += 50) infos.push(...await conn.getMultipleAccountsInfo(pdas.slice(i, i + 50)));
  let yes = [], no = [];
  names.forEach((n, i) => {
    const a = infos[i];
    if (a && a.owner.equals(DBC)) {
      // TokenBadge layout: 8-byte discriminator, then token_mint Pubkey (32)
      const mintInBadge = new PublicKey(a.data.slice(8, 40)).toBase58();
      yes.push(`${n} ${mintInBadge === mints[n] ? '(mint matches)' : '(mint MISMATCH)'}`);
    } else no.push(n);
  });
  console.log('TOKEN BADGE EXISTS  (' + yes.length + '):', yes.join(', ') || 'none');
  console.log('NO BADGE            (' + no.length + '):', no.join(', '));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
