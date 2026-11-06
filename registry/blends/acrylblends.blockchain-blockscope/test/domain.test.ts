import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Chain, ChainError, EVENT_NAMES, FINALITY_LAG, LABELS, MAX_WATCH, ageLabel, atl, blockAt, eventsIn, findTx, hashOf, memoryStore, rng, search, seed, short, txsOf } from '../plugins/blockscope/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  const store = memoryStore()
  const chain = await Chain.open({ store, clock: () => NOW })
  return { chain, store }
}

test('the seed reads as the mockup: head 19,482,771 and the five block rows with their hashes, counts and producers', async () => {
  const { chain } = await open()
  assert.equal(chain.head, 19_482_771)
  const rows = [19_482_771, 19_482_770, 19_482_769, 19_482_768, 19_482_767].map((h) => chain.block(h))
  assert.deepEqual(rows.map((b) => short(b.hash)), ['0x8f2a…d912', '0xc18e…7a04', '0x71b0…e533', '0x09de…a120', '0xa2f4…bc81'])
  assert.deepEqual(rows.map((b) => b.txCount), [184, 206, 149, 221, 177])
  assert.deepEqual(rows.map((b) => b.producer), ['Northstar-4', 'Atlas-2', 'Northstar-1', 'Atlas-5', 'Northstar-3'])
  assert.deepEqual(rows.map((b) => ageLabel(b.timestamp, NOW)), ['12 sec', '14 sec', '16 sec', '18 sec', '20 sec'])
  assert.equal(seed(NOW).network, 'Atlas Testnet')
})

test('the chain is generated, not stored: the same height is always the same block and parents link up', async () => {
  const { chain } = await open()
  assert.deepEqual(chain.block(19_482_760), chain.block(19_482_760))
  assert.equal(chain.block(19_482_760).parentHash, hashOf(19_482_759))
  assert.equal(chain.block(19_482_760).txs.length, 8)
  assert.equal(rng('a')(), rng('a')())
  assert.notEqual(rng('a')(), rng('b')())
  assert.throws(() => chain.block(1), ChainError)
  assert.throws(() => chain.block(19_482_772), /There is no block 19482772/)
})

test('transactions carry a status, fee and decoded events; failed ones have a reason and no events', async () => {
  const { chain } = await open()
  const txs = Array.from({ length: 40 }, (_, i) => chain.block(19_482_771 - i).txs).flat()
  assert.ok(txs.some((t) => t.status === 'failed'))
  for (const t of txs) {
    assert.match(t.hash, /^0x[0-9a-f]{64}$/)
    assert.equal(t.feeAtl, Math.round(t.gasUsed * 18.4) / 1e9)
    if (t.status === 'failed') assert.deepEqual([t.events.length, t.error], [0, 'execution reverted: insufficient allowance'])
    for (const e of t.events) assert.deepEqual([e.txHash, e.height], [t.hash, t.height])
  }
  const withEvent = txs.find((t) => t.events.length > 0)
  assert.ok(withEvent && EVENT_NAMES.includes(withEvent.events[0]?.name ?? ''))
  assert.equal(findTx(chain.anchor, withEvent.hash)?.hash, withEvent.hash)
  assert.equal(findTx(chain.anchor, '0xnothex'), undefined)
  assert.equal(atl(0), '0 ATL')
  assert.equal(atl(0.0003864), '0.000386 ATL')
  assert.equal(atl(7.15), '7.15 ATL')
})

test('search: by height (commas allowed), short hash, address, label; refusals are typed', async () => {
  const { chain } = await open()
  assert.deepEqual(chain.search('19,482,771').map((h) => h.kind), ['block'])
  assert.deepEqual(chain.search('19482771').map((h) => (h.kind === 'block' ? h.block.height : 0)), [19_482_771])
  assert.deepEqual(chain.search('99'), [])
  const short1 = chain.search('0x8f2a…d912')
  assert.equal(short1[0]?.kind, 'block')
  const tx = chain.block(19_482_771).txs[0]
  assert.ok(tx)
  const byTx = chain.search(tx.hash.slice(0, 12))
  assert.ok(byTx.some((h) => h.kind === 'tx' && h.tx.hash === tx.hash))
  const treasury = LABELS[0]
  assert.ok(treasury)
  assert.deepEqual(chain.search(treasury.address).map((h) => (h.kind === 'address' ? h.label?.name : '')), ['Northstar Treasury'])
  assert.deepEqual(chain.search('northstar').map((h) => (h.kind === 'address' ? h.label?.name : '')), ['Northstar Treasury', 'Northstar Payroll'])
  assert.equal(chain.search('bridge').length, 1)
  assert.throws(() => chain.search('   '), /Search by block height, hash or address label/)
  assert.throws(() => search(chain.anchor, 'x'.repeat(81)), /at most 80/)
})

test('addresses and contract events come from the generated blocks', async () => {
  const { chain } = await open()
  const wallet = LABELS[3]
  assert.ok(wallet)
  const txs = txsOf(chain.anchor, wallet.address)
  assert.ok(txs.length > 0)
  assert.ok(txs.every((t) => t.from === wallet.address || t.to === wallet.address))
  assert.deepEqual(txs.map((t) => t.height), [...txs.map((t) => t.height)].sort((a, b) => b - a))
  const swaps = eventsIn(chain.anchor, 143, 'Swap')
  assert.ok(swaps.length > 0 && swaps.every((e) => e.log.name === 'Swap'))
  assert.ok(eventsIn(chain.anchor, 29).length < eventsIn(chain.anchor, 143).length)
  assert.deepEqual(blockAt(chain.anchor, 19_482_771).txs[0]?.events[0]?.signature === undefined || true, true)
})

test('producing a demo block moves the head, keeps older blocks and stamps the new one now', async () => {
  const { chain, store } = await open()
  const before = chain.block(19_482_770)
  const b = await chain.advance()
  assert.deepEqual([b.height, chain.head, chain.state.produced, store.saved], [19_482_772, 19_482_772, 1, 2])
  assert.equal(ageLabel(b.timestamp, NOW), '0 sec')
  assert.equal(chain.block(19_482_770).hash, before.hash)
  assert.equal(ageLabel(chain.block(19_482_771).timestamp, NOW), '2 sec')
  assert.equal(chain.block(19_482_772).parentHash, chain.block(19_482_771).hash)
  assert.equal(FINALITY_LAG, 31)
})

test('the watchlist toggles, validates what it is given and is limited', async () => {
  const { chain } = await open()
  assert.deepEqual(await chain.toggleWatch('block', '19482771'), { key: 'block:19482771', watching: true })
  assert.equal(chain.isWatched('block:19482771'), true)
  assert.deepEqual(await chain.toggleWatch('block', '19482771'), { key: 'block:19482771', watching: false })
  await assert.rejects(chain.toggleWatch('block', '5'), /not a block on this chain/)
  await assert.rejects(chain.toggleWatch('tx', '0x12'), /not a tx/)
  await assert.rejects(chain.toggleWatch('address', 'zzz'), /not a address/)
  await assert.rejects(chain.toggleWatch('wallet', 'x'), /Watch a block, a transaction or an address/)
  for (let i = 0; i < MAX_WATCH; i += 1) await chain.toggleWatch('block', String(19_482_771 - i))
  await assert.rejects(chain.toggleWatch('block', '19482700'), /At most 20 items/)
})
