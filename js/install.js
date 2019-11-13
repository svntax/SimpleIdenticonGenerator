"use strict";

let deferredInstallPrompt = null;

const installButton = document.getElementById("install-button");
installButton.addEventListener("click", installPWA);

window.addEventListener("beforeinstallprompt", (evt) => {
	//Save the event to be used later
	deferredInstallPrompt = evt;
	installButton.removeAttribute("hidden");
});

function installPWA(evt){
	deferredInstallPrompt.prompt();
	evt.srcElement.setAttribute("hidden", true);
	deferredInstallPrompt.userChoice.then((choice) => {
		if(choice.outcome === "accepted") {
			console.log("User accepted the Add to Home Screen prompt", choice);
		}
		else{
			console.log("User dismissed the Add to Home Screen prompt", choice);
		}
		deferredInstallPrompt = null;
	});
}

window.addEventListener("appinstalled", (evt) => {
	console.log("PWA was installed.", evt);
});