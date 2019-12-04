"use strict";

const CACHE_NAME = "static-cache-v2";
const DB_NAME = "small-db";

let db; // Database reference

const FILES_TO_CACHE = [
	"/",
	"/index.html",
	"/css/main.css",
	"/js/app.js",
	"/js/install.js",
	"/js/jdenticon-2.2.0.min.js",
	"/images/favicon.ico",
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
	
	//Create indexedDB database
	const request = indexedDB.open(DB_NAME, 1);
	request.onerror = (errorEvent) => {
		console.log("Error creating local database.");
	};
	request.onsuccess = (successEvent) => {
		db = successEvent.target.result;
	};
	request.onupgradeneeded = (upgradeEvent) => {
		const dbRef = upgradeEvent.target.result;
		const objectStore = dbRef.createObjectStore("iconList");
		//objectStore variable is unused, but we still needed to create the object store anyway
	};
	
	self.clients.claim();
});

self.addEventListener("fetch", async (evt) => {
	/*
	evt.respondWith( //Cache first
		caches.open(CACHE_NAME).then((cache) => {
			return cache.match(evt.request).then((response) => {
				return response || fetch(evt.request);
			});
		})
	);
	*/
	const req = evt.request;
	const url = new URL(req.url);
	const urlPath = url.pathname;
	
	if(/^\/api\/.+$/.test(urlPath)){ // Handle API requests
		if(req.method === "GET"){
			// Stale-while-revalidate strategy for GET request
			evt.respondWith(
				caches.open(CACHE_NAME).then((cache) => {
					return cache.match(req).then((response) => {
						console.log("GET cache", response);
						const fetchPromise = fetch(req).then((networkResponse) => {
							cache.add(req, networkResponse.clone()); //TODO: is the access token being saved here? You should probably make the key the URL or something, NOT the request itself
							return networkResponse;
						});
						
						return response || fetchPromise;
					});
				})
			);
		}
		else if(req.method === "POST"){
			// Save new identicon to indexedDB
			req.clone().json().then((jsonData) => {
				const iconValue = jsonData.iconValue;
				console.log("[ServiceWorker] Saving <" + iconValue + "> to indexedDB...");
				
				let dbRequest = db.transaction("iconList", "readwrite").objectStore("iconList").add(iconValue, iconValue); // Key and value will be the same
				dbRequest.onsuccess = (completeEvent) => {
					console.log("[ServiceWorker] Successfully saved <" + iconValue + "> to indexedDB!");
					let data = completeEvent.target.result;
				};
				dbRequest.onerror = (errorEvent) => {
					console.log("[ServiceWorker] Error when trying to add <" + iconValue + "> to indexedDB");
				};
			});
		}
		else if(req.method === "DELETE"){
			// Save new identicon to indexedDB
			req.clone().json().then((jsonData) => {
				const iconValue = jsonData.iconValue;
				console.log("[ServiceWorker] Deleting <" + iconValue + "> from indexedDB...");
				
				let dbRequest = db.transaction("iconList", "readwrite").objectStore("iconList").delete(iconValue);
				dbRequest.onsuccess = (completeEvent) => {
					//TODO: for some reason this runs even when deleting a non-existant iconValue?
					console.log("[ServiceWorker] Successfully deleted <" + iconValue + "> from indexedDB!");
					let data = completeEvent.target.result;
				};
				dbRequest.onerror = (errorEvent) => {
					console.log("[ServiceWorker] Error when trying to delete <" + iconValue + "> from indexedDB");
				};
			});
		}
		else{
			console.log("[ServiceWorker] did nothing: method was " + req.method);
		}
	}
	else if(/^.*\/auth_config.json$/.test(urlPath)){
		// Stale-while-revalidate for auth_config.json
		evt.respondWith(
			caches.open(CACHE_NAME).then((cache) => {
				return cache.match(req).then((response) => {
					const fetchPromise = fetch(req).then((networkResponse) => {
						cache.add(req, networkResponse.clone());
						return networkResponse;
					});
					
					return response || fetchPromise;
				});
			})
		);
	}
	else if(url.origin === location.origin){ // Handle requests for static files on homepage
		evt.respondWith( // Network request first
			fetch(req)
			.catch((reason) => {
				console.log("[ServiceWorker] Failed network request, serving cached files.", reason);
				return caches.open(CACHE_NAME).then((cache) => {
					return cache.match(req);
				});
			})
		);
	}
});