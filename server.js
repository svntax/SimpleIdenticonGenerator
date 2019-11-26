"use strict";

const express = require("express");
const { join } = require("path");
const app = express();

const jwt = require("express-jwt");
const jwtAuthz = require("express-jwt-authz");
const jwksRsa = require("jwks-rsa");
const authConfig = require("./auth_config.json");

const mysql = require("mysql");
const dbConfig = require("./db_config.json");
const connection = mysql.createConnection({
	host: dbConfig.host,
	user: dbConfig.user,
	password: dbConfig.password,
	database: dbConfig.database,
	port: dbConfig.port
});

connection.connect((err) => {
	if(err){
		throw err;
	}
	console.log("Connected to database!");
});

if(!authConfig.domain || !authConfig.audience){
	throw "Please make sure that auth_config.json is in place and populated.";
}

app.use(express.json()); //Used to parse JSON bodies

// Serve static assets
app.use(express.static(join(__dirname, "/public")));

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

const createUser = (userId) => {
	connection.query(`INSERT INTO users (user_id) VALUES('${userId}')`, (err, result, fields) => {
		if (err) throw err;
		console.log("Successfully added user " + userId);
	});
};

const updateUserData = (userId, jsonData) => {
	connection.query(`UPDATE users SET icons_list = '${jsonData}' WHERE user_id = '${userId}'`, (err, result, fields) => {
		if (err) throw err;
		console.log("Successfully updated icons list for " + userId);
	});
};

// Debug endpoint
app.get("/api/external", checkJwt, checkScopes, (req, res) => {
	const userId = req.user.sub;
	res.send({
		msg: "Your access token was successfully validated!"
	});
	connection.query(`SELECT * FROM users WHERE user_id = '${userId}'`, (err, result, fields) => {
		if (err) throw err;
		console.log(result);
		if(result.length > 0){
			console.log("Found user: " + userId);
		}
		else{
			console.log("Could not find user: " + userId);
			createUser(userId);
		}
	});		
});

// Get user data
app.get("/api/identicon", checkJwt, (req, res) => {
	const userId = req.user.sub;
	connection.query(`SELECT icons_list FROM users WHERE user_id = '${userId}'`, (err, result, fields) => {
		if (err) throw err;
		if(result.length > 0){
			// Existing user, get icons list and send to client
			console.log("Found user: " + userId);
			const jsonEntry = JSON.parse(JSON.stringify(result))[0].icons_list;
			if(jsonEntry){
				const jsonObject = JSON.parse(jsonEntry);
				res.json(jsonObject);
			}
			else{
				res.json({iconList: []});
			}
		}
		else{
			// New user, so add to database
			console.log("Could not find user: " + userId);
			createUser(userId);
			res.json({iconList: []});
		}
	});		
});

// Update user's icons list in database
// TODO: limit max number of entries to icons list
app.post("/api/identicon", checkJwt, (req, res) => {
	const userId = req.user.sub;
	connection.query(`SELECT icons_list FROM users WHERE user_id = '${userId}'`, (err, result, fields) => {
		if (err) throw err;
		if(result.length > 0){
			const jsonEntry = JSON.parse(JSON.stringify(result))[0].icons_list;
			if(jsonEntry){
				// Update the json data
				console.log("Updating icons list json for " + userId);
				const jsonObject = JSON.parse(jsonEntry);
				if(jsonObject.iconList.indexOf(req.body.iconValue) === -1){
					// Update the json data only if it's a new value
					jsonObject.iconList.push(req.body.iconValue);
					const newJsonData = JSON.stringify(jsonObject);
					updateUserData(userId, newJsonData);
					//Send updated json back to user
					res.json(jsonObject);
				}
				else{
					res.status(400).send({
						msg: "400 Bad Request: Icon value <" + req.body.iconValue + "> is already saved."
					});
				}
			}
			else{
				// Insert new json data
				console.log("Creating icons list json for " + userId);
				const newJsonObject = {
					iconList: [
						req.body.iconValue
					]
				};
				const newJsonData = JSON.stringify(newJsonObject);
				updateUserData(userId, newJsonData);
				// Send new json back to user
				res.json(newJsonObject);
			}
		}
		else{
			console.log("Could not find user: " + userId);
		}
	});
});

app.delete("/api/identicon", checkJwt, (req, res) => {
	const userId = req.user.sub;
	console.log("DELETE request from user " + userId + " for " + req.body.iconValue);
	connection.query(`SELECT icons_list FROM users WHERE user_id = '${userId}'`, (err, result, fields) => {
		if (err) throw err;
		if(result.length > 0){
			const jsonEntry = JSON.parse(JSON.stringify(result))[0].icons_list;
			if(jsonEntry){
				// Update the json data
				const jsonObject = JSON.parse(jsonEntry);
				const iconIndex = jsonObject.iconList.indexOf(req.body.iconValue);
				if(iconIndex >= 0){
					// Update the json data only if it's a new value
					jsonObject.iconList.splice(iconIndex, 1);
					const newJsonData = JSON.stringify(jsonObject);
					updateUserData(userId, newJsonData);
					//Send updated json back to user
					res.json(jsonObject);
				}
				else{
					console.log("Icon value " + req.body.iconValue + " does not exist.");
				}
			}
			else{
				console.log("Could not find user's icons list: " + userId);
			}
		}
		else{
			console.log("Could not find user: " + userId);
		}
	});
});

// Endpoint to serve the auth config file
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