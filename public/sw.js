/**
 * お知らせを受け取って表示するだけの、小さな常駐スクリプト。
 *
 * ここでページを丸ごと保存（キャッシュ）はしない。会場では在庫やポイントが
 * 刻々と変わるので、古い画面を出してしまうほうが危ない。
 */

self.addEventListener('install', () => {
  // 新しい版をすぐ使う。古いまま残っていると、直した内容が届かない。
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: '佐賀 蔵めぐり', body: '', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      // 同じ節目の通知が重ならないようにする。
      tag: data.url + data.title,
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // すでに開いているタブがあれば、そちらを前に出す。
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
