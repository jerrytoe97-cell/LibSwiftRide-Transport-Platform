self.addEventListener("push", (event) => {
  const message = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(message.title ?? "LibSwiftRide", {
    body: message.body ?? "Your ride has an update.",
    data: { url: message.data?.url ?? "/", rideId: message.data?.rideId }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    return existing ? existing.focus() : clients.openWindow(target);
  }));
});
