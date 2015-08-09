/* global module, require, console */
/* eslint-disable no-console, no-underscore-dangle */
(function(module) {
"use strict";


function VideoServer(appDirectory, dataDirectory) {
	this._fs = require("fs");
	this._path = require("path");
	this._http = require("http");

	this._dir = this._fs.realpathSync(dataDirectory);

	var StaticServer = require("node-static");
	this._appServer = new StaticServer.Server(appDirectory);
	this._dataServer = new StaticServer.Server(dataDirectory);

	this._infoIndex = null;

	// Set defaults
	this.filter({});
	this.infoDefaults({});

}

VideoServer.prototype.refresh = function() {
	this._readInfoIndex();
};

VideoServer.prototype.infoDefaults = function(info) {
	if (info === undefined) {
		// Getter
		return this._infoDefault;
	} else {
		// Setter
		this._infoDefault = info;
		return this;
	}
};

VideoServer.prototype._readInfoIndex = function() {
	var indexFile = this._path.join(this._dir, "index.json");
	try {
		this._infoIndex = JSON.parse(this._fs.readFileSync(indexFile, { encoding: "utf8" }));
	} catch (error) {
		if (error.code === "ENOENT") {
			this._fs.writeFileSync(indexFile, "{}", { encoding: "utf8" });
		} else {
			console.error("Error reading index: " + JSON.stringify(error));
		}
		this._infoIndex = {};
	}
};

VideoServer.prototype._updateInfoIndex = function() {
	return new Promise(function(resolve, reject) {
		var directory = this._dir;
		this._fs.readdir(directory, function(error, files) {
			if (error) {
				reject(error);
			} else {
				var filter = this.filter();
				if (filter && filter.extensions) {
					files = files.filter(function(file) {
						var ext = this._path.extname(file).toLowerCase();
						return filter.extensions.indexOf(ext) > -1;
					}.bind(this));
				}

				var indexChanged = false;
				for (var i = 0; i < files.length; ++i) {
					var file = files[i];
					if (!this._infoIndex[file]) {
						indexChanged = true;
						this._infoIndex[file] = {};
					}
				}
				if (indexChanged) {
					var indexFile = this._path.join(this._dir, "index.json");
					this._fs.writeFile(indexFile, JSON.stringify(this._infoIndex), { encoding: "utf8" }, function(writeError) {
						if (error) {
							reject(writeError);
						} else {
							resolve(this._infoIndex);
						}
					}.bind(this));
				} else {
					resolve(this._infoIndex);
				}
			}
		}.bind(this));
	}.bind(this));
};

VideoServer.prototype.list = function() {
	return new Promise(function(resolve) {
		resolve(this._infoIndex);
	}.bind(this));
};

VideoServer.prototype.serve = function() {
	this._readInfoIndex();
	this._updateInfoIndex().then(function() {
		console.log("Server is listening on port " + this._httpPort);
		this._http.createServer(this._serveRequest.bind(this)).listen(this._httpPort);
	}.bind(this));
};


VideoServer.prototype.port = function(port) {
	if (port === undefined) {
		return this._httpPort;
	} else {
		this._httpPort = port;
		return this;
	}
};

VideoServer.prototype.filter = function(filter) {
	if (filter === undefined) {
		return this._filter;
	} else {
		this._filter = filter;
		return this;
	}
};


VideoServer.prototype._serveRequest = function(request, response) {
	function answer(status, data) {
		response.writeHead(status, { "Content-Type": "application/json" });
		response.write(JSON.stringify(data));
		response.end();
	}

	if (request.url.indexOf("/api/") === 0) {
		console.log("serving API: " + request.url);

		var data = {
			version: 0.1
		};

		var subUrl = request.url.substr(5);

		if (subUrl.indexOf("list") === 0) {
			this.list().then(function(files) {
				data.files = files;
				answer(200, data);
			}).catch(function(error) {
				data.error = JSON.stringify(error);
				answer(500, data);
			});
		} else if (subUrl.indexOf("info/") === 0) {
			var file = subUrl.substr(5);

			data.info = this.info(file);
			answer(200, data);

		} else if (subUrl.indexOf("refresh") === 0) {
			this.refresh();
			answer(200, data);
		} else if (subUrl.indexOf("rate/") === 0) {
			var requestData = "";
			request.on("data", function(chunk) {
				requestData += chunk;
			});
			request.on("end", function() {
				try {
					requestData = JSON.parse(requestData);
					this.rate(decodeURI(subUrl.substr(5)), requestData)
						.then(answer.bind(this, 200, data))
						.catch(function(error) {
							data.error = error;
							answer(500, data);
						});
				} catch (error) {
					data.error = error;
					answer(500, data);
				}
			}.bind(this));
		} else {
			answer(500, data);
		}
	} else if (request.url.indexOf("/data/") === 0) {
		request.url = request.url.substr(6);
		this._dataServer.serve(request, response);
	} else {
		this._appServer.serve(request, response);
	}
};

VideoServer.prototype.rate = function(filename, requestData) {
	return new Promise(function(resolve, reject) {
		if (requestData.rating === undefined) {
			reject(new Error("No rating given"));
		} else if (!this._infoIndex[filename]) {
			reject(new Error("File not found"));
		} else {
			console.log("Rating...");
			if (!this._infoIndex[filename].rating) {
				console.log("Setting to... " + requestData.rating);
				this._infoIndex[filename].rating = requestData.rating;
				this._infoIndex[filename].numRatings = 1;
			} else {
				// TODO: Will rounding errors be a problem here...?
				this._infoIndex[filename].rating =
					(requestData.rating + (this._infoIndex[filename].rating * this._infoIndex[filename].numRatings)) /
					(++this._infoIndex[filename].numRatings);
				console.log("Setting to... " + this._infoIndex[filename].rating + " / " + this._infoIndex[filename].numRatings);
			}

			var indexFile = this._path.join(this._dir, "index.json");
			this._fs.writeFile(indexFile, JSON.stringify(this._infoIndex, null, 4), { encoding: "utf8" }, function(error) {
				console.log("Writing index file...");
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		}
	}.bind(this));
};

VideoServer.prototype.info = function(filename) {
	// Security checks
	if (filename.indexOf("\0") !== -1) {
		console.error("Hacking attempt detected");
		return {};
	}

	filename = this._path.join(this._dir, filename);
	if (filename.indexOf(this._dir) !== 0) {
		console.error("Hacking attempt detected");
		return {};
	}

	if (this._infoIndex[filename]) {
		return this._infoIndex[filename];
	}
	return {};
};

module.exports = VideoServer;

})(module);
