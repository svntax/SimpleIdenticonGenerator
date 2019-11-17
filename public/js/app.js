"use strict";

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
	
	/*fetch("/auth_config.json").then((response) => {
		return response.json();
	}).then((config) => {
		return createAuth0Client({
			domain: config.domain,
			client_id: config.clientId
		});
	}).then((authResponse) => {
		auth0 = authResponse;
		
		updateUI();
		
		auth0.isAuthenticated().then((isAuthenticated) => {
			if(isAuthenticated){
				// show gated content
			}
			else{
				const query = window.location.search;
				if(query.includes("code=") && query.includes("state=")){
					auth0.handleRedirectCallback().then(() => {
						updateUI();
						
						window.history.replaceState({}, document.title, "/");
					});
				}
			}
		});
	});*/
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
		
		document.getElementById("gated-content").classList.remove("hidden");
		document.getElementById("ipt-user-profile").innerHTML = JSON.stringify(
			await auth0.getUser()
		);
	}
	else{
		logoutBtn.disabled = true;
		logoutBtn.classList.add("hidden");
		
		loginBtn.disabled = false;
		loginBtn.classList.remove("hidden");
		
		document.getElementById("gated-content").classList.add("hidden");
	}
	
	/*
	auth0.isAuthenticated().then((isAuthenticated) => {
		document.getElementById("btn-logout").disabled = !isAuthenticated;
		document.getElementById("btn-login").disabled = isAuthenticated;
	});
	*/
};

const callApi = async () => {
	try{
		const token = await auth0.getTokenSilently();
		const response = await fetch("/api/external", {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});
		
		const responseData = await response.json();
		
		const responseElement = document.getElementById("api-call-result");
		responseElement.innerText = JSON.stringify(responseData, {}, 2);
	}
	catch(err){
		console.error(err);
	}
};

document.getElementById("btn-call-api").onclick = callApi;

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
	await configureClient();
	
	updateUI();
	
	const isAuthenticated = await auth0.isAuthenticated();
	
	if(isAuthenticated){
		window.history.replaceState({}, document.title, window.location.pathname);
		updateUI();
		return;
	}
	
	const query = window.location.search;
	if(query.includes("code=") && query.includes("state=")){
		await auth0.handleRedirectCallback();
		updateUI();
		window.history.replaceState({}, document.title, "/");
	}
};