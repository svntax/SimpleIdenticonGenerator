"use strict";

const express = require("express");
const { join } = require("path");
const app = express();

const jwt = require("express-jwt");
const jwtAuthz = require("express-jwt-authz");
const jwksRsa = require("jwks-rsa");
const authConfig = require("./auth_config.json");

if(!authConfig.domain || !authConfig.audience){
	throw "Please make sure that auth_config.json is in place and populated.";
}

app.use(express.json()); //Used to parse JSON bodies

// Serve static assets
app.use(express.static(join(__dirname, "public")));

const checkJwt = jwt({
	secret: jwksRsa.expressJwtSecret({
		cache: true,
		rateLimit: true,
		jwksRequestPerMinute: 5,
		jwksUri: `https://${authConfig.domain}/.well-known/jwks.json`
	}),
	
	audience: authConfig.audience,
	issuer: `https://${authConfig.domain}/`,
	algorithm: ["RS256"]
});

const checkScopes = jwtAuthz([ "read:messages" ], {customScopeKey: "permissions"});

app.get("/api/external", checkJwt, checkScopes, (req, res) => {
	res.send({
		msg: "Your access token was successfully validated!"
	});
});

app.post("/api/identicon", checkJwt, (req, res) => {
	console.log("Received:", req.body);
	//TODO: save to database
	res.json({
		iconList: [
			req.body.iconValue
		]
	});
});

// Endpoint to serve the configuration file
app.get("/auth_config.json", (req, res) => {
	res.sendFile(join(__dirname, "auth_config.json"));
});

// Error handler
app.use(function(err, req, res, next){
	if(err.name === "UnauthorizedError"){
		return res.status(401).send({
			msg: "Invalid token"
		});
	}
	
	next(err, req, res);
});

// Listen on port 3000
app.listen(3000, () => console.log("Application running on port 3000"));