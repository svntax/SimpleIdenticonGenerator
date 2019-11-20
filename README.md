# SimpleIdenticonGenerator

A progressive web app that generates identicons using [Jdenticon](https://jdenticon.com/). Users can sign up/log in with to save and keep track of their favorite identicons.

## Setup

This project relies on the following:

* [Node.js](https://nodejs.org/en/)
* [Express](https://expressjs.com/)
* MySQL
* [Auth0](https://auth0.com/)
* [Jdenticon](https://jdenticon.com/)

### Installing

Download [Node.js](https://nodejs.org/en/) v8.XX.X or higher and verify the installation.

```
node --version

// v8.11.3
```

Clone this repository and cd into the root folder.

```
git clone https://github.com/svntax/SimpleIdenticonGenerator.git
cd SimpleIdenticonGenerator
```

Install dependencies using npm.

```
npm install
```

The Jdenticon library was downloaded from https://github.com/dmester/jdenticon/releases/
The .min.js file included in the repository can be replaced with a newer release if available.
The library must be included in order for the service worker to cache it.

### Auth0 Setup

TODO

### MySQL Setup

Create a json file `db_config.json` and add the values of your MySQL server. For this project, a local server was set up using [MySQL Community Server](https://dev.mysql.com/downloads/mysql/).

```
{
	"host": "localhost",
	"database": "database",
	"user": "username",
	"password": "password",
	"port": 3306
}
```

The MySQL database can be set up with the following:

```
CREATE TABLE users (
	id INT NOT NULL AUTO_INCREMENT,
	user_id VARCHAR(80) NOT NULL,
	icons_list JSON,
	PRIMARY KEY(id)
);
```