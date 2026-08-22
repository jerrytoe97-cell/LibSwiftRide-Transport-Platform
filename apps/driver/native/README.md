# Driver native location bridge

The signed Android/iOS shell must expose `window.LibSwiftRideNativeLocation.start()` and `.stop()`. While tracking, it dispatches `libswiftride:native-location` events containing latitude, longitude, accuracy, heading, speed and an ISO UTC capture time. Failures dispatch `libswiftride:native-location-error` with `PERMISSION_DENIED`, `UNAVAILABLE`, `TIMEOUT` or `NOT_SECURE`.

The native implementation owns background execution, encrypted bounded offline buffering, persistent OS indicators and secure credential storage. It must stop on ride completion, offline state, suspension or session revocation. The TypeScript runtime falls back to foreground browser geolocation only when no native bridge exists.

The XML files in this directory are review templates, not complete native projects. Permission copy and platform behavior require legal, privacy, App Store and Play review before release.
