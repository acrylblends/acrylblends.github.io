/**
 * The match relay: the phone-as-racket controller and the 1v1 match share their state through it. A phone opens `companion.html` and posts its
 * swings and motion; the game polls the state and posts its match snapshots. Rooms live in memory and go with the plugin.
 *
 * Routes (under the app's mount): GET /api/racket/state, GET /api/tunnel/status, GET /api/match/state, POST /api/racket/swing,
 * POST /api/racket/telemetry, POST /api/racket/feedback, POST /api/match/sync, POST /api/match/create.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'relay'
export const inject = ['router']

type Role = 'p1' | 'p2'

interface Swing {
  seq: number; role: string; type: string; shotType: string; speed: number; angleX: number; dirX: number; dirY: number
  pitch: number; roll: number; yaw: number; timestamp: number; serverTimeMs: number; source: string
}

interface Racket {
  role: Role; seq: number; lastSeenTs: number; connected: boolean
  orientation: { pitch: number; roll: number; yaw: number; accelMag: number; buttonB: boolean; connected: boolean }
  lastSwing: Swing | null; swingHistory: Swing[]; feedbackSeq: number; lastFeedback: Record<string, unknown> | null
}

interface Room {
  roomId: string; hostName: string; guestName: string; gamesToWin: number; rackets: Record<Role, Racket>
  stateSeq: number; matchSnapshot: Record<string, unknown> | null; p1DesktopSeenTs: number; p2DesktopSeenTs: number
}

/** A racket counts as connected while it was heard from in the last 12 s; a desktop is online for 8 s after its last poll. */
const RACKET_TIMEOUT_MS = 12_000
const DESKTOP_TIMEOUT_MS = 8_000

const racket = (role: Role): Racket => ({
  role, seq: 0, lastSeenTs: 0, connected: false,
  orientation: { pitch: 0, roll: 0, yaw: 0, accelMag: 0, buttonB: false, connected: false },
  lastSwing: null, swingHistory: [], feedbackSeq: 0, lastFeedback: null,
})

const room = (roomId: string, hostName = 'Player 1', guestName = 'Player 2', gamesToWin = 2): Room => ({
  roomId, hostName, guestName, gamesToWin, rackets: { p1: racket('p1'), p2: racket('p2') },
  stateSeq: 0, matchSnapshot: null, p1DesktopSeenTs: 0, p2DesktopSeenTs: 0,
})

function racketState(slot: Racket) {
  const lastSeenMs = slot.lastSeenTs > 0 ? Math.max(0, Date.now() - slot.lastSeenTs) : -1
  const connected = slot.connected && lastSeenMs >= 0 && lastSeenMs < RACKET_TIMEOUT_MS
  return {
    role: slot.role, connected, lastSeenMs, orientation: { ...slot.orientation, connected },
    lastSwing: slot.lastSwing ? { ...slot.lastSwing } : null, lastFeedback: slot.lastFeedback ? { ...slot.lastFeedback } : null,
    swingHistory: slot.swingHistory.slice(-15),
  }
}

const roleOf = (raw: unknown): Role => {
  const value = String(raw ?? 'p1').toLowerCase()
  return value === 'p2' || value === '2' || value === 'opponent' ? 'p2' : 'p1'
}

const num = (value: unknown, fallback: number): number => {
  const n = Number(value ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

/** The relay over one room table: an `Acryl` app with the eight routes, mounted at /api. */
export function relayApp(rooms = new Map<string, Room>([['default', room('default')]])): Acryl {
  const getRoom = (raw?: string | null): Room => {
    const clean = (raw || 'default').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() || 'default'
    const key = clean === 'DEFAULT' ? 'default' : clean
    let found = rooms.get(key)
    if (!found) rooms.set(key, (found = room(key)))
    return found
  }
  // The address phones and a second player open: this app's own origin and mount, read from the request (…/api/… under it).
  const baseOf = (url: string): string => {
    const at = new URL(url)
    return at.origin + at.pathname.slice(0, at.pathname.lastIndexOf('/api/'))
  }
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-cache, no-store, must-revalidate' },
    })
  const body = async (req: Request): Promise<Record<string, unknown>> => {
    try {
      const parsed: unknown = JSON.parse((await req.text()) || '{}')
      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  return new Acryl()
    .options('*', () => new Response(null, {
      status: 204,
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type' },
    }))
    .get('/racket/state', (c) => {
      const r = getRoom(c.req.query('room'))
      return json({ ...racketState(r.rackets[roleOf(c.req.query('role'))]), roomId: r.roomId, tunnelUrl: baseOf(c.req.url) })
    })
    .get('/tunnel/status', (c) => {
      const r = getRoom(c.req.query('room'))
      const role = roleOf(c.req.query('role'))
      const base = baseOf(c.req.url)
      const roomParam = r.roomId !== 'default' ? `room=${r.roomId}&` : ''
      return json({
        ok: true, active: true, tunnelUrl: base,
        companionUrl: `${base}/companion.html?${roomParam}role=${role}`, joinUrl: `${base}/join.html?room=${r.roomId}&role=${role}`,
      })
    })
    .get('/match/state', (c) => {
      const r = getRoom(c.req.query('room'))
      const touch = c.req.query('touch')
      if (touch === 'p2') r.p2DesktopSeenTs = Date.now()
      else if (touch === 'p1') r.p1DesktopSeenTs = Date.now()
      const now = Date.now()
      const p1 = racketState(r.rackets.p1)
      const p2 = racketState(r.rackets.p2)
      const p1DesktopOnline = r.p1DesktopSeenTs > 0 && now - r.p1DesktopSeenTs < DESKTOP_TIMEOUT_MS
      const p2DesktopOnline = r.p2DesktopSeenTs > 0 && now - r.p2DesktopSeenTs < DESKTOP_TIMEOUT_MS
      return json({
        ok: true, roomId: r.roomId, hostName: r.hostName, guestName: r.guestName, gamesToWin: r.gamesToWin,
        p1Online: p1DesktopOnline, p2Online: p2DesktopOnline, p1DesktopOnline, p2DesktopOnline,
        p1PhoneConnected: p1.connected, p2PhoneConnected: p2.connected, p1, p2, rackets: { p1, p2 },
        snapshotSeq: r.stateSeq, snapshot: r.matchSnapshot, tunnelUrl: baseOf(c.req.url),
      })
    })
    .post('/racket/swing', async (c) => {
      const b = await body(c.req.raw)
      const r = getRoom(String(b.room ?? c.req.query('room') ?? 'default'))
      const slot = r.rackets[roleOf(b.role ?? c.req.query('role'))]
      const now = Date.now()
      slot.seq += 1
      slot.lastSeenTs = now
      slot.connected = true
      const swing: Swing = {
        seq: slot.seq, role: slot.role, type: String(b.type ?? 'swing').toLowerCase() === 'toss' ? 'toss' : 'swing',
        shotType: String(b.shotType ?? 'topspin').toLowerCase(), speed: num(b.speed, 1),
        angleX: num(b.angleX ?? b.dirX, 0), dirX: num(b.angleX ?? b.dirX, 0), dirY: num(b.dirY, 0),
        pitch: num(b.pitch, slot.orientation.pitch), roll: num(b.roll, slot.orientation.roll), yaw: num(b.yaw, slot.orientation.yaw),
        timestamp: num(b.timestamp, now), serverTimeMs: now, source: String(b.source ?? 'phone'),
      }
      slot.lastSwing = swing
      slot.swingHistory.push(swing)
      if (slot.swingHistory.length > 50) slot.swingHistory.shift()
      return json({ ok: true, roomId: r.roomId, role: slot.role, swing })
    })
    .post('/racket/telemetry', async (c) => {
      const b = await body(c.req.raw)
      const r = getRoom(String(b.room ?? c.req.query('room') ?? 'default'))
      const slot = r.rackets[roleOf(b.role ?? c.req.query('role'))]
      slot.lastSeenTs = Date.now()
      slot.connected = Boolean(b.connected ?? true)
      slot.orientation = {
        pitch: num(b.pitch, slot.orientation.pitch), roll: num(b.roll, slot.orientation.roll), yaw: num(b.yaw, slot.orientation.yaw),
        accelMag: num(b.accelMag, 0), buttonB: Boolean(b.buttonB ?? false), connected: slot.connected,
      }
      return json({ ok: true, roomId: r.roomId, role: slot.role, orientation: slot.orientation, lastFeedback: slot.lastFeedback })
    })
    .post('/racket/feedback', async (c) => {
      const b = await body(c.req.raw)
      const r = getRoom(String(b.room ?? c.req.query('room') ?? 'default'))
      const slot = r.rackets[roleOf(b.role ?? c.req.query('role'))]
      slot.feedbackSeq += 1
      slot.lastFeedback = {
        seq: slot.feedbackSeq, role: slot.role, kind: String(b.kind ?? 'hit'), grade: String(b.grade ?? 'PERFECT'),
        shotType: String(b.shotType ?? 'TOPSPIN'), speedKmh: num(b.speedKmh, 160), intensity: num(b.intensity, 1), serverTimeMs: Date.now(),
      }
      return json({ ok: true, roomId: r.roomId, feedback: slot.lastFeedback })
    })
    .post('/match/sync', async (c) => {
      const b = await body(c.req.raw)
      const r = getRoom(String(b.room ?? c.req.query('room') ?? 'default'))
      r.stateSeq += 1
      r.p1DesktopSeenTs = Date.now()
      const snapshot = (b.snapshot !== null && typeof b.snapshot === 'object' ? b.snapshot : b) as Record<string, unknown>
      r.matchSnapshot = { ...snapshot, seq: r.stateSeq, serverTimeMs: Date.now() }
      return json({ ok: true, roomId: r.roomId, seq: r.stateSeq, p2Racket: racketState(r.rackets.p2) })
    })
    .post('/match/create', async (c) => {
      const b = await body(c.req.raw)
      const id = `MT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      rooms.set(id, room(id, String(b.hostName ?? 'Player 1'), String(b.guestName ?? 'Challenger'), num(b.gamesToWin, 2)))
      const base = baseOf(c.req.url)
      return json({
        ok: true, roomId: id,
        hostDesktopUrl: `${base}/?room=${id}&role=p1`, guestDesktopUrl: `${base}/?room=${id}&role=p2`,
        p1PhoneUrl: `${base}/companion.html?room=${id}&role=p1`, p2PhoneUrl: `${base}/companion.html?room=${id}&role=p2`,
        guestJoinHubUrl: `${base}/join.html?room=${id}&role=p2`,
      })
    })
}

export function apply(ctx: Context): void {
  ctx.router.route('/api', relayApp())
}
