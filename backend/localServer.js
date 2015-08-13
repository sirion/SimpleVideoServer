/* global require, process, console */
/* eslint-disable no-console */

var httpPort = 8888;
var dataDirectory = "../data";

if (typeof Promise === "undefined") {
	console.log("No native promise support - using polyfill");
	var ES6Promise = require("es6-promise");
	ES6Promise.polyfill();
}

debug = function() {}; // Ignore debug output;

(function() {
"use strict";


process.argv.forEach(function (val) {
	var pos = -1;

	pos = val.indexOf("DEBUG");
	if (pos > -1) {
		debug = function() {
			console.log.apply(console, arguments);
		};
	}

	pos = val.indexOf("--port=");
	if (pos > -1) {
		httpPort = parseInt(val.substr(pos + 7), 10) || httpPort;
		console.log("Setting server port to " + httpPort);
	}

	pos = val.indexOf("--data=");
	if (pos > -1) {
		dataDirectory = val.substr(pos + 7) || dataDirectory;
		console.log("Setting data directory to " + dataDirectory);
	}

});

process.on('uncaughtException', function (err) {
	console.error("Uncaught Exception:")
	console.error(err);
});

var Server = require("./modules/VideoServer.js");

var server = new Server("../app", dataDirectory);
server.port(httpPort);
server.filter({
	extensions: [ ".webm", ".mp4", ".ogg", ".mov" ]
});
server.serve();





})();
