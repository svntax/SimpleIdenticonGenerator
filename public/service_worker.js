"use strict";

const CACHE_NAME = "static-cache-v1";
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

function createIndexedDB(){
	const request = indexedDB.open(DB_NAME, 1);
	request.onerror = (errorEvent) => {
		console.log("Error creating local database.");
	};
	request.onsuccess = (successEvent) => {
		console.log("Successfully created indexedDB.");
		db = successEvent.target.result;
	};
	request.onupgradeneeded = (upgradeEvent) => {
		const dbRef = upgradeEvent.target.result;
		const objectStore = dbRef.createObjectStore("iconList");
		//objectStore variable is unused, but we still needed to create the object store anyway
	};
}

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
	
	createIndexedDB();
	
	self.clients.claim();
});

// Saves each entry in the iconList array to indexedDB
function saveIconListToIDB(iconList){
	for(let i = 0; i < iconList.length; i++){
		const iconValue = iconList[i];
		let dbRequest = db.transaction("iconList", "readwrite").objectStore("iconList").add(iconValue, iconValue); // Key, value
		dbRequest.onsuccess = (completeEvent) => {
			let data = completeEvent.target.result;
			console.log("[ServiceWorker] Saved " + data + " to indexedDB.");
		};
		dbRequest.onerror = (errorEvent) => {
			// A ConstraintError will be thrown when trying to add an already-existing key
			console.log("[ServiceWorker:GET response] Error when trying to add <" + iconValue + "> to indexedDB: ", errorEvent.target.error.name);
		};
	}
};

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
	const req = evt.request;
	const url = new URL(req.url);
	const urlPath = url.pathname;
	
	if(/^\/api\/.+$/.test(urlPath)){ // Handle API requests
		if(req.method === "GET"){
			// Network response first, then save to cache
			evt.respondWith(
				caches.open(CACHE_NAME).then((cache) => {
					return fetch(req).then((response) => {
						cache.put(req, response.clone());
						
						// Update indexedDB with the data from the response
						response.clone().json().then((responseData) => {
							saveIconListToIDB(responseData.iconList);
						});
						
						return response;
					});
				})
				.catch((reason) => {
					return caches.open(CACHE_NAME).then((cache) => {
						console.log("[ServiceWorker] Returning cached GET response");
						return cache.match(req).then((response) => {
							return response;
						});
					});
				})
			);
		}
		else if(req.method === "POST"){
			evt.respondWith(
				fetch(req.clone()).finally(() => { //Need to clone() because otherwise req would already be consumed when finally() runs
					// Save new identicon to indexedDB
					req.json().then((jsonData) => {
						const iconValue = jsonData.iconValue;
						console.log("[ServiceWorker] Saving <" + iconValue + "> to indexedDB...");
						
						let dbRequest = db.transaction("iconList", "readwrite").objectStore("iconList").add(iconValue, iconValue); // Key and value will be the same
						dbRequest.onsuccess = (completeEvent) => {
							console.log("[ServiceWorker] Successfully saved <" + iconValue + "> to indexedDB!");
							let data = completeEvent.target.result;
						};
						dbRequest.onerror = (errorEvent) => {
							//TODO: this runs when trying to add an already-existing iconValue
							console.log("[ServiceWorker] Error when trying to add <" + iconValue + "> to indexedDB");
						};
					});
				})
			);
		}
		else if(req.method === "DELETE"){
			evt.respondWith(
				fetch(req.clone()).finally(() => { //Need to clone() because otherwise req would already be consumed when finally() runs
					// Remove given identicon from indexedDB
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
				})
			);
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