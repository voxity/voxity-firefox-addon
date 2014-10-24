/**
 *
 * @source: https://github.com/voxity/voxity-firefox-addon/blob/master/lib/main.js
 *
 * @licstart  The following is the entire license notice for the 
 *  JavaScript code in this page.
 *
 * Copyright (C) 2014  Voxity
 *
 *
 * The JavaScript code in this page is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License (GNU GPL) as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.  The code is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.
 *
 * As additional permission under GNU GPL version 3 section 7, you
 * may distribute non-source (e.g., minimized or compacted) forms of
 * that code without the copy of the GNU GPL normally required by
 * section 4, provided you include this license notice and a URL
 * through which recipients can access the Corresponding Source.
 *
 * @licend  The above is the entire license notice
 * for the JavaScript code in this page.
 *
 */

var self = require("sdk/self");
var tabs = require("sdk/tabs");
var simplePrefs = require('sdk/simple-prefs');
var notifications = require("sdk/notifications");
var contextMenu = require("sdk/context-menu");

var OAuthConsumer = require("./oauthconsumer").OAuthConsumer;

tabs.on("ready", runScript);

let provider = 'voxity';
let clientID = 'v009';
let completionURI = "http://localhost";
var svc = null;

function authorizationCallback(svcObj, exten) {
  svc = svcObj;
  // Handle the message
  let message = {
    contenttype: 'application/json',
    action: 'https://api.voxity.fr/api/v1/channel',
    method: "POST",
    parameters: JSON.stringify({'exten':exten})
  };

  // svc is retreived from the authorize callback above
  OAuthConsumer.call(svc, message, oauthCallback);
}

function makeCall(exten) {
  let handler = OAuthConsumer.authorize(provider, clientID, completionURI, function(svcObj) {
    authorizationCallback(svcObj, exten);
  });
}

function oauthCallback(req) {
  // you may need to handle a 401
  if (req.status == 401) {
      return;
  }else if(req.response.status == 200){
    var response = JSON.parse(req.response.text);
    var myIconURL = self.data.url("icon.png");
    var title = "Une erreur est survenue";
    var message = "Une erreur est survenue lors de l'appel. Merci de le signaler à support@voxity.fr";
    if(response.status == 1){
      title = "Demande validée";
      message = "Votre téléphone va sonner d\'ici quelques instants.";
    }
    if(response.status == 2){
      title = response.data.title;
      message = response.data.message;
    }
    notifications.notify({
      title: title,
      text: message,
      iconURL: myIconURL,
    });
  }
}

function runScript(tab) {
  var menuItem = contextMenu.Item({
    label: "Voxity - ClickToCall - Appeler ce numéro ",
    context: contextMenu.SelectionContext(),
    contentScript: 'self.on("click", function () {' +
                   '  var text = window.getSelection().toString();' +
                   '  self.postMessage(text);' +
                   '});',
    onMessage: function (selectionText) {
      makeCall(selectionText);
    }
  });
}
