"use strict";

let currentIconValue = "icon value";

function initServiceWorker(){
	if("serviceWorker" in navigator){
		window.addEventListener("load", () => {
			navigator.serviceWorker.register("/service_worker.js").then((registration) => {
				console.log("Service worker registered!", registration);
			}).catch((error) => {
				console.log("Could not register service worker. " + error);
			});
		});
	}
}

initServiceWorker();

const iconInput = document.getElementById("icon-input");
const iconImage = document.getElementById("icon-image");
iconInput.addEventListener("change", (evt) => {
	currentIconValue = evt.target.value;
	jdenticon.update(iconImage, evt.target.value);
});

//==============
//Authentication
//==============

let auth0 = null;

const configureClient = async () => {
	const response = await fetch("/auth_config.json");
	const config = await response.json();
	
	auth0 = await createAuth0Client({
		domain: config.domain,
		client_id: config.clientId,
		audience: config.audience
	});
};

const updateUI = async () => {
	const loginBtn = document.getElementById("btn-login");
	const logoutBtn = document.getElementById("btn-logout");
	const offlineBtn = document.getElementById("btn-offline");
	
	const isAuthenticated = await auth0.isAuthenticated();
	
	if(isAuthenticated){
		logoutBtn.disabled = false;
		logoutBtn.classList.remove("hidden");
		
		loginBtn.disabled = true;
		loginBtn.classList.add("hidden");
	}
	else{
		logoutBtn.disabled = true;
		logoutBtn.classList.add("hidden");
		
		loginBtn.disabled = false;
		loginBtn.classList.remove("hidden");
	}
	
	if(navigator.onLine){
		offlineBtn.classList.add("hidden");
	}
	else{
		offlineBtn.classList.remove("hidden");
		
		loginBtn.disabled = true;
		loginBtn.classList.add("hidden");
		
		logoutBtn.disabled = true;
		logoutBtn.classList.add("hidden");
	}
};

function getIconsDataFromIDB(){
	const request = indexedDB.open("small-db", 1);
	request.onerror = (errorEvent) => {
		console.log("Error opening local database.");
	};
	request.onsuccess = (successEvent) => {
		const db = successEvent.target.result;
		let jsonObject = {iconList: []};
		let dbRequest = db.transaction("iconList", "readonly").objectStore("iconList").openCursor();
		dbRequest.onsuccess = (successEvt) => {
			let cursor = successEvt.target.result;
			if(cursor){
				jsonObject.iconList.push(cursor.value);
				cursor.continue();
			}
			else{
				console.log("Finished iterating through IDB icons list.");
				updateIdenticonList(jsonObject);
			}
			
			db.close();
		};
	};
}

// Replaces the user's online stored data with the offline changes made and stored locally
const replaceUserData = async () => {
	try{
		// Get icons from indexedDB
		const request = indexedDB.open("small-db", 1);
		request.onerror = (errorEvent) => {
			console.log("Error opening local database.");
		};
		request.onsuccess = (successEvent) => {
			const db = successEvent.target.result;
			let jsonObject = {iconList: []};
			let dbRequest = db.transaction("iconList", "readonly").objectStore("iconList").openCursor();
			dbRequest.onsuccess = async (successEvt) => {
				let cursor = successEvt.target.result;
				if(cursor){
					jsonObject.iconList.push(cursor.value);
					cursor.continue();
				}
				else{
					// Finished getting icons from indexeDB, now format as JSON and send PUT request
					const token = await auth0.getTokenSilently();
					const response = await fetch("/api/identicon", {
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${token}`
						},
						body: JSON.stringify(jsonObject)
					});
					if(response.ok){
						localStorage.setItem("syncFlag", false);
						console.log("Successfully finished syncing offline changes!");
					}
					else{
						console.log("PUT was not response.ok");
						//const responseData = await response.json();
						//console.log(responseData.msg);
					}
					
					updateIdenticonList(jsonObject);
				}
				
				db.close();
			};
		};
	}
	catch(err){
		if(err.error === "login_required"){
			console.log("Error: PUT request made while logged out.");
		}
		else{
			console.log("PUT request error:", err);
		}
	}
};

const fetchUserData = async () => {
	try{
		if(navigator.onLine){
			// Check if offline changes were made, and if so, sync those changes to the user's online data.
			const syncNeeded = JSON.parse(localStorage.getItem("syncFlag"));
			if(syncNeeded){
				console.log("Need to sync offline changes to user's account...");
				replaceUserData();
			}
			else{
				// Send GET request only if offline changes do not need to be synced.
				const token = await auth0.getTokenSilently();
				const response = await fetch("/api/identicon", {
					headers: {
						Authorization: `Bearer ${token}`
					}
				});
				if(response.ok){
					const responseData = await response.json();
					updateIdenticonList(responseData);
				}
			}
		}
		else{
			/*const response = await fetch("/api/identicon");
			const responseData = await response.json();
			console.log("Got offline user data:", responseData);*/
			localStorage.setItem("syncFlag", true);
			getIconsDataFromIDB();
		}
	}
	catch(err){
		if(err.error === "login_required"){
			// Do nothing
			console.log("User not logged in when trying to fetch user data.");
		}
		else{
			console.error(err);
		}
	}
}

const removeIdenticon = async (evt) => {
	const iconData = evt.srcElement.parentNode.querySelector(".identicons-list-text").innerText;
	try{
		evt.srcElement.parentNode.remove();
		let response = null;
		if(navigator.onLine){
			// Get and send access token if online
			const token = await auth0.getTokenSilently();
			response = await fetch("/api/identicon", {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					iconValue: iconData
				})
			});
		}
		else{
			// If offline, don't attempt to get user's access token to send in the request
			response = await fetch("/api/identicon", {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					iconValue: iconData
				})
			});
		}
		if(response.ok){
			// DELETE was successful
		}
		else{
			const responseData = await response.json();
			console.log(responseData.msg);
		}
	}
	catch(err){
		if(err.error === "login_required"){
			//TODO: offline removing
			console.log("Could not remove identicon: Login required");
		}
		else{
			console.log("Could not remove identicon.", err);
			if(!navigator.onLine){
				// DELETE method failed and user is offline, so syncing is needed
				localStorage.setItem("syncFlag", true);
			}
		}
	}
};

// Creates and returns a new list element
const createIconEntry = (iconValue) => {
	const temp = document.getElementsByTagName("template")[0];
	
	let newNode = temp.content.cloneNode(true);
	newNode.querySelector(".identicons-list-text").textContent = iconValue;
	jdenticon.update(newNode.querySelector(".icon-small"), iconValue);
	newNode.querySelector(".btn-remove-icon").onclick = removeIdenticon;
	
	return newNode;
};

// Add an individual icon entry to the identicons list
const addIconEntry = (iconValue) => {
	let entry = createIconEntry(iconValue);
	const identiconList = document.querySelector(".identicons-list");
	identiconList.appendChild(entry);
};

// Replaces the entire identicons list with the new given list
const updateIdenticonList = (jsonList) => {
	const identiconsList = document.querySelector(".identicons-list");
	while(identiconsList.firstChild){
		identiconsList.removeChild(identiconsList.firstChild);
	}
	
	for(let i = 0; i < jsonList.iconList.length; i++){
		const value = jsonList.iconList[i];
		let entry = createIconEntry(value);
		identiconsList.appendChild(entry);
	}
};

const saveIdenticon = async () => {
	const iconData = currentIconValue;
	
	// Client-side check: is the identicon already saved
	const identiconsList = document.querySelector(".identicons-list").children;
	for(let i = 0; i < identiconsList.length; i++){
		const entry = identiconsList[i];
		if(entry.querySelector(".identicons-list-text").textContent === iconData){
			console.log("This identicon is already saved!");
			return;
		}
	}
	
	try{
		addIconEntry(iconData);
		let response = null;
		if(navigator.onLine){
			// Get and send access token if online
			const token = await auth0.getTokenSilently();
			response = await fetch("/api/identicon", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					iconValue: iconData
				})
			});
		}
		else{
			// If offline, don't attempt to get user's access token to send in the request
			response = await fetch("/api/identicon", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					iconValue: iconData
				})
			});
		}
		if(response.ok){
			// POST was successful
		}
		else{
			const responseData = await response.json();
			console.log(responseData.msg);
		}
	}
	catch(err){
		if(err.error === "login_required"){
			//TODO: offline saving or redirect to login page
			console.log("Could not save identicon: Login required");
		}
		else{
			console.log("Could not save identicon.", err);
			if(!navigator.onLine){
				// POST method failed and user is offline, so syncing is needed
				localStorage.setItem("syncFlag", true);
			}
		}
	}
};
document.getElementById("btn-save-identicon").onclick = saveIdenticon;

const login = async () => {
	await auth0.loginWithRedirect({
		redirect_uri: window.location.origin
	});
};

const logout = () => {
	// Clear the local indexedDB
	const request = indexedDB.open("small-db", 1);
	request.onerror = (errorEvent) => {
		console.log("Error opening local database.");
	};
	request.onsuccess = (successEvent) => {
		const db = successEvent.target.result;
		let dbRequest = db.transaction("iconList", "readwrite").objectStore("iconList").clear();
		dbRequest.onsuccess = (successEvt) => {
			console.log("Successfully cleared local indexedDB");
			db.close();
		};
	};
	
	auth0.logout({
		returnTo: window.location.origin
	});
};

const loginButton = document.getElementById("btn-login");
loginButton.onclick = login;

const logoutButton = document.getElementById("btn-logout");
logoutButton.onclick = logout;

window.onload = async () => {
	jdenticon.update(iconImage, "icon value");
	
	try{
		await configureClient();
	}
	catch(err){
		console.log("configureClient() error:", err);
		console.log("auth0 var:", auth0);
	}
	
	updateUI();
	
	const isAuthenticated = await auth0.isAuthenticated();
	
	if(isAuthenticated){
		window.history.replaceState({}, document.title, window.location.pathname);
		updateUI();
		fetchUserData();
		return;
	}
	
	const query = window.location.search;
	if(query.includes("code=") && query.includes("state=")){
		await auth0.handleRedirectCallback();
		updateUI();
		window.history.replaceState({}, document.title, "/");
	}
	
	fetchUserData();
};