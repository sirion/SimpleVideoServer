/* global module, require, console, process */
/* eslint-disable no-console, no-underscore-dangle */
(function(module) {
"use strict";


function VideoServer(appDirectory, dataDirectory) {
	this._requiredModules = [
		"fs", "path", "http", "send", "node-static"
	];
	var hasrequiredModules = this._requiredModules.reduce(function(previousValue, currentValue) {
		var programExists = false;
		try {
			require.resolve(currentValue);
			programExists = true;
		} catch (ex) {
			console.error("Required module " + currentValue + " not found in path.");
		}

		return previousValue && programExists;
	});
	if (!hasrequiredModules) {
		console.error("Please install required modules using npm");
		process.exit(1);
	}


	this._fs = require("fs");
	this._path = require("path");
	this._http = require("http");
	this._send = require("send");

	this._dir = this._fs.realpathSync(dataDirectory);

	var StaticServer = require("node-static");
	this._appServer = new StaticServer.Server(appDirectory);
	this._dataServer = new StaticServer.Server(dataDirectory);

	this._infoIndex = null;

	// Set defaults
	this.filter({});
	this.infoDefaults({});

}


VideoServer.prototype.serve = function() {
	this._readInfoIndex();
	this._updateInfoIndex().then(function() {
		console.log("Server is listening on port " + this._httpPort);
		this._http.createServer(this._serveRequest.bind(this)).listen(this._httpPort);
	}.bind(this));
};


VideoServer.prototype._serveRequest = function(request, response) {
	var data = {
		version: 0.1
	};

	function answer(status, responseData) {
		response.writeHead(status, { "Content-Type": "application/json" });
		response.write(JSON.stringify(responseData));
		response.end();
	}

	function answerError(error) {
		data.error = error;
		answer(500, data);
	}



	if (request.url.indexOf("/api/") === 0) {
		console.log("serving API: " + request.url);

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
		} else if (subUrl.indexOf("tag/") === 0) {
			this.whenCompleted(request).then(function(requestData) {
				return this.tag(decodeURI(subUrl.substr(4)), requestData);
			}.bind(this)).then(answer.bind(this, 200, data), answerError);
		} else if (subUrl.indexOf("rate/") === 0) {
			this.whenCompleted(request).then(function(requestData) {
				return this.rate(decodeURI(subUrl.substr(5)), requestData);
			}.bind(this)).then(answer.bind(this, 200, data), answerError);
		} else {
			answer(500, data);
		}
	} else if (request.url.indexOf("/data/") === 0) {

		this._send(request, request.url.substr(6), { root: this._dir })
			.on("error", answer.bind(this, 500, data))
			.pipe(response);
	} else {
		this._appServer.serve(request, response);
	}
};

VideoServer.prototype.whenCompleted = function(request) {
	return new Promise(function(resolve, reject) {
		var requestBody = "";
		request.on("data", function(chunk) {
			requestBody += chunk;
		});
		request.on("end", function() {
			try {
				resolve(JSON.parse(requestBody));
			} catch (error) {
				reject(error);
			}
		});
	});
};

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
	var indexFile = this._path.join(this._dir, ".mediaIndex.json");
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
					return this._writeIndex();
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

VideoServer.prototype.tag = function(filename, requestData) {
	// TODO: implement getter semantics
	return new Promise(function(resolve, reject) {
		debug("TAG");
		if (!Array.isArray(requestData.tags)) {
			debug("No tags given");
			reject(new Error("No tag given"));
		} else if (!this._infoIndex[filename]) {
			debug("Invalid file");
			reject(new Error("File not found"));
		} else {
			debug("Setting Tags: " + requestData.tags.join(", "));
			this._infoIndex[filename].tags = requestData.tags;
			// if (!Array.isArray(this._infoIndex[filename].tags)) {
			// 	this._infoIndex[filename].tags = requestData.tags;
			// } else {
			// 	var pos = this._infoIndex[filename].tags.indexOf(requestData.tag);
			// 	if (pos === -1) {
			// 		this._infoIndex[filename].tags.push(requestData.tag);
			// 	} else {
			// 		this._infoIndex[filename].tags.splice(pos, 1);
			// 	}
			// }
			this._writeIndex().then(resolve, reject);
		}
	}.bind(this));
};

VideoServer.prototype.rate = function(filename, requestData) {
	// TODO: rename to rating and implement getter semantics
	return new Promise(function(resolve, reject) {
		if (requestData.rating === undefined) {
			reject(new Error("No rating given"));
		} else if (!this._infoIndex[filename]) {
			reject(new Error("File not found"));
		} else {
			if (!this._infoIndex[filename].rating) {
				this._infoIndex[filename].rating = requestData.rating;
				this._infoIndex[filename].numRatings = 1;
			} else {
				// TODO: Will rounding errors be a problem here...?
				this._infoIndex[filename].rating =
					(requestData.rating + (this._infoIndex[filename].rating * this._infoIndex[filename].numRatings)) /
					(++this._infoIndex[filename].numRatings);
			}

			this._writeIndex().then(resolve, reject);
		}
	}.bind(this));
};

VideoServer.prototype._writeIndex = function() {
	return new Promise(function(resolve, reject) {
		debug("Writing Index");
		var indexFile = this._path.join(this._dir, ".mediaIndex.json");
		this._fs.writeFile(indexFile, JSON.stringify(this._infoIndex, null, 4), { encoding: "utf8" }, function(error) {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	}.bind(this));
};


VideoServer.prototype.info = function(filename) {
	// TODO: Implement setter semantics
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
