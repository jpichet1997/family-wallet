self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('push', function(event) {
    const payload = event.data ? event.data.text() : 'อย่าลืมแวะมาบันทึกรายรับ-รายจ่ายของวันนี้นะคะ';
    const options = {
        body: payload,
        icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135673.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135673.png',
        vibrate: [200, 100, 200]
    };
    event.waitUntil(
        self.registration.showNotification('Family Wallet', options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});