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
  let data = { title: '佐賀 蔵めぐり', body: '', url: '/', tag: '', requireInteraction: false, vibrate: null };
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
      // 同じ知らせが重ならないようにする。送る側が tag を決めていればそれを使う
      // （準備完了の通知は注文ごとに別の tag。別の注文の知らせを上書きしない）。
      tag: data.tag || data.url + data.title,
      // 送る側が決めたときだけ付ける（蔵への新しいリクエストの知らせ）。
      // 押すか閉じるまで出したままにし、ふだんと違う長めの振動で知らせる。
      requireInteraction: data.requireInteraction === true,
      ...(Array.isArray(data.vibrate) ? { vibrate: data.vibrate } : {}),
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // すでに開いているタブがあれば、そちらを前に出して、知らせの画面へ移す。
      // 前に出すだけだと、別の画面を開いていた人は何のことか分からない。
      for (const client of list) {
        if ('focus' in client) {
          return client.focus().then((focused) =>
            focused && 'navigate' in focused ? focused.navigate(url) : focused,
          );
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
