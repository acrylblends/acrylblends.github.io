import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the overview shows the cluster as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<h1>Cluster overview<\/h1>/)
    assert.match(html, /Cluster North · KVM \/ QEMU · sample environment/)
    assert.match(html, /<strong>3 \/ 3<\/strong><small class="warn">1 with a warning<\/small>/)
    assert.match(html, /<strong id="vmCount">17<\/strong><small>14 running<\/small>/)
    assert.match(html, /<strong>42%<\/strong><small>Within threshold<\/small>/)
    assert.match(html, /<strong>186 GB<\/strong><small>of 224 GB capacity<\/small>/)
    assert.match(html, /· all hosts/)
    assert.equal((html.match(/<tr data-vm=/g) ?? []).length, 6)
    assert.match(html, /View all 17 machines →/)
    assert.match(html, /<b>hv-north-01<\/b><small>8 VMs · 64 GB RAM · <span class="">Healthy<\/span>/)
    assert.match(html, /hv-edge-01<\/b><small>3 VMs · 32 GB RAM · <span class="warn">Warning/)
    assert.match(html, /Snapshot created · Today 09:42/)
    assert.match(html, /api-prod-01 · before patch<\/b><br><small class="muted">Today 09:42 · 4\.2 GB/)
    assert.match(html, /Memory<\/b><div class="bar" role="img" aria-label="Memory 83%"/)
    assert.match(html, /No hypervisor connection/)
    assert.match(html, /<a class="navitem active" aria-current="page" href="\/">▦ &nbsp; Cluster overview<\/a>/)
  }))

test('a host from the rail filters the inventory and the allocation; search narrows further; no match is said', () =>
  withApp(async (app) => {
    const host = await app.page('/?host=hv-edge-01')
    assert.equal((host.html.match(/<tr data-vm=/g) ?? []).length, 3)
    assert.match(host.html, /· hv-edge-01/)
    assert.match(host.html, /hv-edge-01 capacity/)
    assert.match(host.html, /aria-current="true" data-host="hv-edge-01"/)
    const search = await app.page('/?host=hv-edge-01&q=proxy')
    assert.equal((search.html.match(/<tr data-vm=/g) ?? []).length, 1)
    assert.match(search.html, /edge-proxy-01/)
    const none = await app.page('/?q=zzz')
    assert.match(none.html, /No machines match\./)
  }))

test('the row actions follow the state: Pause and Snapshot, Start and Snapshot, Resume for a paused machine', () =>
  withApp(async (app) => {
    const { html } = await app.page('/machines')
    const row = (id: string) => html.slice(html.indexOf(`<tr data-vm="${id}"`)).split('</tr>')[0] ?? ''
    assert.match(row('vm-104'), /data-action="pause">Pause<[\s\S]*data-action="snapshot">Snapshot/)
    assert.doesNotMatch(row('vm-104'), /data-action="start"/)
    assert.match(row('vm-123'), /data-action="start">Start</)
    assert.match(row('vm-116'), /data-action="start">Resume<[\s\S]*data-action="stop">Stop/)
    assert.match(row('vm-104'), /<span class="state running">● Running<\/span>/)
    assert.match(row('vm-123'), /<span class="state stopped">● Stopped<\/span>/)
  }))

test('pause, start and snapshot post to the machine and come back to the page with a notice', () =>
  withApp(async (app) => {
    const paused = await app.post('/machines/vm-104/pause', { back: '/?host=hv-north-01' })
    assert.equal(paused.status, 303)
    assert.deepEqual(redirectOf(paused), { path: '/', ok: 'api-prod-01 is now paused.' })
    assert.equal(paused.headers.get('location'), '/?host=hv-north-01&ok=api-prod-01%20is%20now%20paused.')
    assert.equal(app.root.fleet.vm('vm-104').state, 'paused')
    const snap = await app.post('/machines/vm-104/snapshot', { back: '/' })
    assert.equal(redirectOf(snap).ok, 'Snapshot “api-prod-01 · manual” created.')
    const again = await app.post('/machines/vm-104/pause', {})
    assert.equal(redirectOf(again).path, '/machines')
    assert.match(redirectOf(again).error ?? '', /api-prod-01 is paused; it cannot be paused now/)
    assert.equal(redirectOf(await app.post('/machines/nope/start', {})).error, 'There is no such machine.')
  }))

test('a back address that leaves the app is ignored', () =>
  withApp(async (app) => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
      const response = await app.post('/machines/vm-104/pause', { back })
      assert.equal(redirectOf(response).path, '/machines', back)
      await app.post('/machines/vm-104/start', {})
    }
  }))

test('the inventory page filters by host, state and OS and keeps the filters in the form', () =>
  withApp(async (app) => {
    const all = await app.page('/machines')
    assert.equal((all.html.match(/<tr data-vm=/g) ?? []).length, 17)
    assert.match(all.html, /17 of 17 machines/)
    const some = await app.page('/machines?state=stopped&os=AlmaLinux+9')
    assert.equal((some.html.match(/<tr data-vm=/g) ?? []).length, 1)
    assert.match(some.html, /<option value="stopped" selected>Stopped<\/option>/)
    assert.match(some.html, /<option value="AlmaLinux 9" selected>/)
    assert.match(some.html, /<a class="vmname" href="\/machines\/vm-123">staging-web-01<\/a>/)
    assert.match(some.html, /<a class="navitem active" aria-current="page" href="\/machines">/)
  }))

test('a machine page shows its allocation, snapshots and events; an unknown one is a 404', () =>
  withApp(async (app) => {
    const page = await app.page('/machines/vm-104')
    assert.equal(page.status, 200)
    assert.match(page.html, /<h1>api-prod-01<\/h1><p>Ubuntu 24\.04 · VM-104 · on hv-north-01/)
    assert.match(page.html, /<b>4<\/b>/)
    assert.match(page.html, /<b>16 GB<\/b>/)
    assert.match(page.html, /10\.20\.1\.14/)
    assert.match(page.html, /api-prod-01 · before patch/)
    assert.match(page.html, /api-prod-01 resumed|Snapshot created/)
    assert.match(page.html, /data-action|>Pause<\/button>/)
    assert.doesNotMatch(page.html, />Remove</)
    assert.match((await app.page('/machines/vm-123')).html, />Remove<\/button>/)
    const missing = await app.page('/machines/nope')
    assert.equal(missing.status, 404)
    assert.match(missing.html, /No such machine/)
  }))

test('provisioning: the form lists the hosts with their free memory; a post creates the machine; errors show on the form', () =>
  withApp(async (app) => {
    const form = await app.page('/machines/new')
    assert.equal(form.status, 200)
    assert.match(form.html, /hv-north-01 · 8 GB memory free/)
    assert.match(form.html, /hv-north-02 · 22 GB memory free/)
    const created = await app.post('/machines', { name: 'new-workload-01', hostId: 'hv-north-01', os: 'Ubuntu 24.04', vcpu: '2', memoryGb: '4', diskGb: '40' })
    assert.equal(created.status, 303)
    assert.equal(redirectOf(created).path, '/machines/vm-124')
    assert.equal(redirectOf(created).ok, 'new-workload-01 is provisioning on hv-north-01.')
    const inventory = await app.page('/')
    assert.match(inventory.html, /<strong id="vmCount">18<\/strong>/)
    assert.match(inventory.html, /<span class="state provisioning">● Provisioning<\/span>/)
    assert.match(inventory.html, /Pending/)
    const bad = await app.post('/machines', { name: 'x y', hostId: 'hv-north-01', os: 'Ubuntu 24.04', vcpu: '2', memoryGb: '4', diskGb: '40' })
    assert.equal(bad.status, 422)
    const html = await bad.text()
    assert.match(html, /role="alert">A machine name is lowercase/)
    assert.match(html, /value="x y"/)
    const full = await app.post('/machines', { name: 'big', hostId: 'hv-edge-01', os: 'Debian 12', vcpu: '1', memoryGb: '12', diskGb: '8' })
    assert.equal(full.status, 422)
    assert.match(await full.text(), /hv-edge-01 has 8 GB of memory free; big needs 12 GB/)
    assert.equal(app.root.fleet.state.vms.length, 18)
  }))

test('removing a stopped machine works; a running one is refused', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/machines/vm-104/remove', {})).error ?? '', /stop it before removing it/)
    const removed = await app.post('/machines/vm-123/remove', {})
    assert.equal(redirectOf(removed).ok, 'staging-web-01 removed.')
    assert.equal(app.root.fleet.state.vms.length, 16)
  }))

test('the snapshots page lists the restore points and deletes one', () =>
  withApp(async (app) => {
    const page = await app.page('/snapshots')
    assert.equal(page.status, 200)
    assert.match(page.html, /2 restore points · 12\.9 GB/)
    assert.match(page.html, /<a href="\/machines\/vm-109">db-replica-02<\/a> · Today 02:00 · 8\.7 GB/)
    const deleted = await app.post('/snapshots/snap-1/delete', {})
    assert.equal(redirectOf(deleted).ok, 'Snapshot deleted.')
    assert.equal(redirectOf(await app.post('/snapshots/snap-1/delete', {})).error, 'There is no such snapshot.')
    assert.match((await app.page('/snapshots')).html, /1 restore points|1 restore point/)
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/machines/new"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/machines/vm-104/pause"`))
      const response = await app.post('/machines/vm-104/pause', { back: `${FRAME_MOUNT_PREFIX}/` })
      assert.equal(redirectOf(response).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the cluster headline', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'overview')
    assert.ok(widget)
    assert.match(String(await widget.render()), /Cluster North[\s\S]*14 of 17 machines running[\s\S]*186 GB memory assigned/)
  }))
