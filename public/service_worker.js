"use strict";

const CACHE_NAME = "static-cache-v1";

const FILES_TO_CACHE = [
	"/index.html",
	"/css/main.css",
	"/js/app.js",
	"/js/install.js"
];

self.addEventListener("install", (evt) => {
	evt.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log("[ServiceWorker] Pre-caching files.");
			cache.addAll(FILES_TO_CACHE);
		})
	);
	
	self.skipWaiting();
});

self.addEventListener("activate", (evt) => {
	evt.waitUntil(
		caches.keys().then((keyList) => {
			return Promise.all(keyList.map((key) => {
				if(key !== CACHE_NAME){
					console.log("[ServiceWorker] Removing old cache.", key);
					return caches.delete(key);
				}
			}));
		})
	);
	
	self.clients.claim();
});

self.addEventListener("fetch", (evt) => {
	/*
	evt.respondWith( //Cache first
		caches.open(CACHE_NAME).then((cache) => {
			return cache.match(evt.request).then((response) => {
				return response || fetch(evt.request);
			});
		})
	);
	*/
	
	evt.respondWith( //Network request first
		fetch(evt.request)
		.catch(() => {
			console.log("[ServiceWorker] Failed network request, serving cached files.");
			return caches.open(CACHE_NAME).then((cache) => {
				return cache.match(evt.request);
			});
		})
	);
});