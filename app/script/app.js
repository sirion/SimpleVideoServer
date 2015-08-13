/* global window, document */
/* eslint-disable no-underscore-dangle */
(function(window, document) {
"use strict";

function extend() {
	var object = arguments[0];

	for (var i = 1; i < arguments.length; ++i) {
		for (var key in arguments[i]) {
			object[key] = arguments[i][key];
		}
	}

	return object;
}

function enrich() {
	var object = arguments[0];

	for (var i = 1; i < arguments.length; ++i) {
		for (var key in arguments[i]) {
			if (!object.hasOwnProperty(key)) {
				object[key] = arguments[i][key];
			}
		}
	}

	return object;
}

function clean(domElement) {
	while (domElement.children.length > 0) {
		domElement.removeChild(domElement.children[0]);
	}
}

function request(options) {
	var defaults = {
		method: "GET",
		data: null
	};
	enrich(options, defaults);

	// Only asynchronous requests
	options.async = true;

	if (!options.url) {
		throw new Error("url-property is needed in argument for request function");
	}


	return new Promise(function(fnResolve, fnReject) {
		var req = new window.XMLHttpRequest();
		req.addEventListener("readystatechange", function() {
			if (req.readyState === window.XMLHttpRequest.DONE) {

				var data;
				if (req.getResponseHeader("content-type") === "application/json") {
					data = JSON.parse(req.responseText);
				} else {
					data = req.response;
				}

				fnResolve({
					type: req.responseType,
					data: data,
					req: req
				});
			}
		});

		req.addEventListener("error", function(error) {
			fnReject(error);
		});

		req.addEventListener("timeout", function(error) {
			fnReject(error);
		});

		if (typeof options.data === "object") {
			if (!options.headers) {
				options.headers = {};
			}
			options.headers["Content-Type"] = "application/json";
			options.data = JSON.stringify(options.data);
		}

		req.open(options.method, options.url, options.async);
		if (options.headers) {
			Object.keys(options.headers).forEach(function(header) {
				req.setRequestHeader(header, options.headers[header]);
			});
		}
		req.send(options.data);
	});
}

function PlayerUI() {
	this._currentActiveItem = null;
}

PlayerUI.prototype.show = function(domId) {
	var domBossOverlay = document.createElement("div");
	domBossOverlay.style.display = "none";
	domBossOverlay.style.position = "absolute";
	domBossOverlay.style.backgroundColor = "grey";
	domBossOverlay.style.top = "0";
	domBossOverlay.style.left = "0";
	domBossOverlay.style.right = "0";
	domBossOverlay.style.bottom = "0";

	var domMediaListContainer = document.createElement("div");
	domMediaListContainer.id = "mediaListContainer";
	var domRefreshButton = document.createElement("img");
	domRefreshButton.src = "img/reload.svg";
	domRefreshButton.className = "button";
	domRefreshButton.addEventListener("click", function() {
		request({ url: "/api/refresh" }).then(function() {
			this.render();
		}.bind(this));
	}.bind(this));

	var domMediaList = document.createElement("ol");
	domMediaList.id = "mediaList";
	domMediaListContainer.appendChild(domRefreshButton);
	domMediaListContainer.appendChild(domMediaList);

	var domMediaElement = document.createElement("video");
	domMediaElement.preload = "auto";
	domMediaElement.autoplay = "autoplay";
	domMediaElement.controls = "controls";
	domMediaElement.muted = true;
	domMediaElement.id = "media";


	var domMediaControls = document.createElement("div");
	domMediaControls.id = "mediaControls";

	var domRatingUp = document.createElement("img");
	domRatingUp.id = "mediaControlRateUp";
	domRatingUp.src = "img/thumb-up.svg";
	domRatingUp.addEventListener("click", this.rate.bind(this, 1));
	domMediaControls.appendChild(domRatingUp);

	var domRatingDown = document.createElement("img");
	domRatingDown.id = "mediaControlRateDown";
	domRatingDown.src = "img/thumb-down.svg";
	domRatingDown.addEventListener("click", this.rate.bind(this, -1));
	domMediaControls.appendChild(domRatingDown);

	var domMediaControlTitle = document.createElement("div");
	domMediaControlTitle.id = "mediaControlTitle";
	domMediaControls.appendChild(domMediaControlTitle);

	var domMediaControlTags = document.createElement("img");
	domMediaControlTags.id = "mediaControlTags";
	domMediaControlTags.src = "img/tags.svg";
	domMediaControlTags.addEventListener("click", function() {
		// TODO: Use nicer async UI
		if (!Array.isArray(this._currentActiveItem.file.tags)) {
			this._currentActiveItem.file.tags = [];
		}
		var tagString = prompt("Enter Tags:", this._currentActiveItem.file.tags.join(","));
		if (tagString === null) {
			// Canceled
			return;
		}
		var tags = tagString.split(",").map(function(tag) { return tag.trim(); });

		request({
			url: "/api/tag/" + this._currentActiveItem.filename,
			method: "POST",
			data: {
				tags: tags
			}
		}).then(function() {
			this._currentActiveItem.file.tags = tags;
		}.bind(this));

	}.bind(this));
	domMediaControls.appendChild(domMediaControlTags);


	document.addEventListener("keydown", function(event) {
		if (event.keyCode === 66) {
			// Boss key
			var show = 	domBossOverlay.style.display === "none";

			domBossOverlay.style.display = show ? "block" : "none";
			if (show) {
				domMediaElement.pause();
			}
		}
	});

	document.addEventListener("DOMContentLoaded", function() {
		document.body.appendChild(domBossOverlay);

		var domContainer = document.querySelector("#" + domId);
		domContainer.appendChild(domMediaControls);
		domContainer.appendChild(domMediaElement);
		domContainer.appendChild(domMediaListContainer);
		this.render();
	}.bind(this));
};

PlayerUI.prototype.rate = function(rating) {
	var requestData = {
		rating: rating
	};
	request({ url: "/api/rate/" + this._currentActiveItem.filename, method: "POST", data: requestData }).then(function() {
		this.render();
	}.bind(this));
};

PlayerUI.prototype.render = function() {
	request({ url: "/api/list" }).then(function(data) {
		var fileData = data.data.files;

		var domMediaElement = document.getElementById("media");
		var domMediaList = document.getElementById("mediaList");
		var domMediaControlTitle = document.getElementById("mediaControlTitle");

		clean(domMediaList);

		function activateMediaItem(filename, file, event) {
			domMediaElement.src = "/data/" + filename;
			domMediaControlTitle.textContent = filename;

			if (this._currentActiveItem) {
				this._currentActiveItem.domItem.classList.remove("activeMediaItem");
			}
			var item = event.currentTarget;
			item.classList.add("activeMediaItem");
			this._currentActiveItem = {
				filename: filename,
				file: file,
				domItem: item
			};
		}

		var files = [];
		var maxNumRatings = 0;
		for (var filename in fileData) {
			fileData[filename].name = filename;
			if (fileData[filename].numRatings > maxNumRatings) {
				maxNumRatings = fileData[filename].numRatings;
			}
			files.push(fileData[filename]);
		}
		maxNumRatings++;

		// Order list before rendering
		files.sort(function(fileA, fileB) {
			// Only change order of files that have enough ratings
			fileA.rating = fileA.rating === undefined ? 0 : fileA.rating;
			fileB.rating = fileB.rating === undefined ? 0 : fileB.rating;
			fileA.numRatings = fileA.numRatings === undefined ? 0 : fileA.numRatings;
			fileB.numRatings = fileB.numRatings === undefined ? 0 : fileB.numRatings;

			var result = fileB.rating - fileA.rating;
			if (result === 0) {
				result -= (fileB.numRatings - fileA.numRatings) / maxNumRatings;
			}

			if (result === 0) {
				// Fallback, sort by name
				var nameA = fileA.name.toLowerCase();
				var nameB = fileB.name.toLowerCase();
				result = nameB === nameA ? 0 : (nameB < nameA ? 1 : -1);
			}

			return result;
		});

		for (var i = 0; i < files.length; i++) {
			var file = files[i];
			var domMediaItem = document.createElement("li");
			domMediaItem.className = "mediaItem";
			domMediaItem.setAttribute("title", "Rating: " + (file.rating || 0) + " / " + (file.numRatings || 0));
			var link = document.createElement("a");
			var text = document.createTextNode(file.name);

			domMediaItem.addEventListener("click", activateMediaItem.bind(this, file.name, file));

			link.appendChild(text);
			domMediaItem.appendChild(link);
			domMediaList.appendChild(domMediaItem);
		}
	}.bind(this));

};

window.PlayerUI = PlayerUI;

})(window, document);
