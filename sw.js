// 스테이지큐 웹 버전 서비스 워커
// - ./media/<이름>: 브라우저 Cache 저장소의 그림·영상·음원을 내어 준다 (영상 탐색용 Range 요청 포함)
// - 앱 파일: 인터넷이 되면 새로 받고, 끊기면 저장해 둔 것으로 (방송실 인터넷이 잠깐 끊겨도 열리게)
const MEDIA_CACHE = 'stagecue-media-v1'
const APP_CACHE = 'stagecue-app-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('message', (e) => {
  if (e.data === 'claim') self.clients.claim()
})

const scope = () => new URL(self.registration.scope)

async function serveMedia(request, url) {
  const cache = await caches.open(MEDIA_CACHE)
  const res = await cache.match(url.origin + url.pathname)
  if (!res) return new Response('Not found', { status: 404 })
  const range = request.headers.get('range')
  if (!range) return res
  const blob = await res.blob()
  const size = blob.size
  const m = /bytes=(\d*)-(\d*)/.exec(range)
  let start = 0
  let end = size - 1
  if (m && m[1]) {
    start = Number(m[1])
    if (m[2]) end = Math.min(Number(m[2]), size - 1)
  } else if (m && m[2]) {
    start = Math.max(0, size - Number(m[2]))
  }
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  })
}

async function serveApp(request) {
  const cache = await caches.open(APP_CACHE)
  try {
    const res = await fetch(request)
    if (res.ok && request.method === 'GET') cache.put(request, res.clone())
    return res
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true })
    if (hit) return hit
    throw e
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  const s = scope()
  if (url.origin !== s.origin || !url.pathname.startsWith(s.pathname)) return
  if (url.pathname.startsWith(s.pathname + 'media/')) {
    e.respondWith(serveMedia(e.request, url))
    return
  }
  if (e.request.method === 'GET') e.respondWith(serveApp(e.request))
})
