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
	
	const isAuthenticated = await auth0.isAuthenticated();
	
	document.getElementById("btn-call-api").disabled = !isAuthenticated;
	
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
};

const fetchUserData = async () => {
	try{
		if(navigator.onLine){
			const token = await auth0.getTokenSilently();
			const response = await fetch("/api/identicon", {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});
			if(response.ok){
				const responseData = await response.json();
				console.log("Got user data.", responseData);
				updateIdenticonList(responseData);
			}
		}
		else{
			//TODO: if user logs in, logs out, then goes offline, old icons list in cache is served
			const response = await fetch("/api/identicon");
			const responseData = await response.json();
			console.log("Got offline user data:", responseData);
			updateIdenticonList(responseData);
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
	console.log("Removing identicon: " + iconData);	
	try{
		if(navigator.onLine){
			const token = await auth0.getTokenSilently();
			const response = await fetch("/api/identicon", {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					iconValue: iconData
				})
			});
			if(response.ok){
				const responseData = await response.json();
				//updateIdenticonList(responseData);
				evt.srcElement.parentNode.remove();
			}
			else{
				const responseData = await response.json();
				console.log(responseData.msg);
			}
		}
		else{
			evt.srcElement.parentNode.remove();
			console.log("Removed <" + iconData + "> while offline");
			//TODO: start making service worker periodically check if online again to send PUT request
		}
	}
	catch(err){
		if(err.error === "login_required"){
			//TODO: offline removing
			console.log("Could not remove identicon: Login required");
		}
		else{
			console.log("Could not remove identicon.", err);
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

const callApi = async () => {
	try{
		const token = await auth0.getTokenSilently();
		
		const response = await fetch("/api/external", {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});
		if(response.status === 200){
			const responseData = await response.json();
			
			const responseElement = document.getElementById("api-call-result");
			responseElement.innerText = JSON.stringify(responseData, {}, 2);
		}
	}
	catch(err){
		console.log("callApi() error"); //TODO: offline functionality
		//Also, probably not a good idea to store access token in Cache, so maybe when offline, here's how service worker should work:
		// - GET: cache first then fetch and save response, or if cache doesn't exist then fetch
		// - POST if online: Do NOT cache, just locally update the icons list, then update the cache entry for GET with new data
		// - POST if offline: Locally update icons list, then when user is back online, send PUT request with updated icons list
		// - DELETE if online: Locally update icons list, then update cache entry for GET with the updated icons list
		// - DELETE if offline: Locally update icons list, then when user is back online, send PUT request with updated icons list
		// - PUT (*new*): used only when user wants to completely overwrite the json in server with the current local icons list
		console.error(err);
	}
};
document.getElementById("btn-call-api").onclick = callApi;

const saveIdenticon = async () => {
	const iconData = currentIconValue;
	console.log("Saving " + iconData + " to favorites...");
	
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
		if(navigator.onLine){
			const token = await auth0.getTokenSilently();
			const response = await fetch("/api/identicon", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					iconValue: iconData
				})
			});
			if(response.ok){
				//const responseData = await response.text();
				//console.log(response.text());
				addIconEntry(iconData);
			}
			else{
				const responseData = await response.json();
				console.log(responseData.msg);
			}
		}
		else{
			addIconEntry(iconData);
			console.log("Added <" + iconData + "> while offline");
			//TODO: start making service worker periodically check if online again to send PUT request
		}
	}
	catch(err){
		if(err.error === "login_required"){
			//TODO: offline saving or redirect to login page
			console.log("Could not save identicon: Login required");
		}
		else{
			console.log("Could not save identicon.", err);
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