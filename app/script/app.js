/* global window, document, require */
/* eslint-disable no-underscore-dangle */
require.config({
    baseUrl: "script",
    paths: {
    }
});

require(["PlayerUI"], function(PlayerUI) {
"use strict";

new PlayerUI().show("content");

});
