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
var buttons = require('sdk/ui/button/action');

var OAuthConsumer = require("./oauthconsumer").OAuthConsumer;
var base_url = require("./oauthconsumer").base_url;
// This menu item adds to the context menu automacally at its declaration
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

let provider = 'fieTjRLJPrUX25nmdR9z';
let clientID = 'fieTjRLJPrUX25nmdR9z';
let completionURI = "https://1pq79kpb3qkew3gbcu567422z80n7bb1gki1n30p.voxity.fr/";
var svc = null;

var myIconURL = self.data.url("icon.png");
var myIcon64URL = self.data.url("icon.png");
var last_exten = null; //we save the last number in order to retry if the token expired
function handleClick(state) {
  tabs.open("https://client.voxity.fr/");
}

function authorizationCallback(svcObj, exten) {
    svc = svcObj;
    // Handle the message
    let message = {
        contenttype: 'application/json',
        action: base_url + '/api/v1/channel',
        method: "POST",
        parameters: JSON.stringify({'exten':exten})
    };

    // svc is retreived from the authorize callback above
    OAuthConsumer.call(svc, message, oauthCallback);
}

function makeCall(exten) {
    last_exten = exten;
    let handler = OAuthConsumer.authorize(provider, clientID, completionURI, function(svcObj) {
        authorizationCallback(svcObj, exten);
    });
}

// Look for a key in line header and return its value.
// Example : parser('error_description',"Bearer realm="Users", error="invalid_token", error_description="expired_token"") --> expired_token
function parser (key, www_authenticate) {
    var arr = www_authenticate.substr(1, www_authenticate.length-2).split(',');
    for( var i=0; i<arr.length; i++) {
        value = arr[i];
        if (value.search('=') != -1) {
            var split = value.split('=');
            if (key === split[0].trim()) return split[1].trim().replace(/"/g, "");
        }
    }
    return undefined;
}

function oauthCallback(req) {
    // you may need to handle a 401
    var title = "Erreur !";
    var msg = "Une erreur est survenue lors de l'appel. Merci de le signaler à support@voxity.fr";
    var icon = self.data.url("icon.png");

    if (req.response.status == 401) {
        var error_str = parser('error', req.response.headers['WWW-Authenticate']);
        if (error_str !== undefined && error_str === "invalid_token" && last_exten != null ){ 
            //  if token has expired, or is revoked (for some reason) and this is the first try, we ask a new one and retry the action
            OAuthConsumer.resetAccess(null);
            makeCall(last_exten);
            last_exten = null;
        }
        // else if last_exten == null then this is the second try, we stop trying
    } else if (req.response.status == 429) {
        title = 'Trop de requêtes !';
        message = 'Veuillez réessayer dans quelques secondes';
    } else if (req.response.status == 400) {
        title = 'Erreur !';
        message = JSON.parse(req.response.text).error;
    } else if(req.response.status == 200){
        title = "Demande validée";
        message = "Votre téléphone va sonner d'ici quelques instants.";
    }

    notifications.notify({
      title: title,
      text: message,
      iconURL: myIconURL,
    });
}

buttons.ActionButton({
  id: "mozilla-link",
  label: "Visit Mozilla",
  icon: {
    "16": myIconURL,
    "32": myIconURL,
    "64": myIcon64URL
  },
  onClick: handleClick
});

// Events listener
pw = require("sdk/page-worker").Page({
    contentScriptFile: [self.data.url('socket.io-1.3.5.js'), self.data.url('websocket.js')],
    contentScriptWhen: "ready"
});

pw.port.on('getToken', function(data){
    // console.log('Asking token');
    OAuthConsumer.authorize(provider, clientID, completionURI, function(svcObj) {
        // console.log('Emitting token on ask', svcObj)
        pw.port.emit('getToken', {token:svcObj.token});
    });
});

pw.port.on('notify', function(data){
    notifications.notify({
        title: data.title,
        text: data.message,
        iconURL: self.data.url(data.icon),
    });

});

// cedric.thivolle@voxity.fr
