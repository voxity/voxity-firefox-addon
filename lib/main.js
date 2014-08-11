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

var OAuthConsumer = require("./oauthconsumer").OAuthConsumer;

tabs.on("ready", runScript);
simplePrefs.on("confirmCredentials", onApply);

let provider = 'voxity';
let completionURI = "http://localhost";
var svc = null;


function onApply(prefName) {
  if(simplePrefs.prefs['clientSecret'] !== "" && simplePrefs.prefs['clientID'] !== ""){
    let secret = simplePrefs.prefs['clientSecret'];
    let key = simplePrefs.prefs['clientID'];
    let handler = OAuthConsumer.authorize(provider, key, secret, completionURI, authorizationCallback);
  }
}

function authorizationCallback(svcObj) {
  svc = svcObj;
  dump("*********FINISHED**********\naccess token: " + svc.token);
}

if(simplePrefs.prefs['clientSecret'] !== "" && simplePrefs.prefs['clientID'] !== ""){
  let handler = OAuthConsumer.authorize(provider, key, secret, completionURI, authorizationCallback);
}

function runScript(tab) {
  worker = tab.attach({
    contentScriptFile: [self.data.url("gator.min.js"), self.data.url("mutation-summary.js"), self.data.url("parseNumbers.js")]
  });
  onApply();
  worker.port.on("exten", function(exten) {
    // Handle the message
    let message = {
      action: 'https://api.voxity.fr/api/v1/channel',
      method: "POST",
      parameters: {'exten': exten}
    };

    function oauthCallback(req) {
      // you may need to handle a 401
      if (req.status == 401) {
          // var headers = req.getAllResponseHeaders();
          // if (req.statusText.indexOf('Token invalid') >= 0)
          // {
          //     // start over with authorization
          //     OAuthConsumer.resetAccess(svc.name, svc.consumerKey, svc.consumerSecret);
          //     // have to call OAuthConsumer.authorize
          //     return;
          // }
          // else if (headers.indexOf("oauth_problem=\"token_expired\"") > 0)
          // {
          //     handler.reauthorize();
          //     return;
          // }
          // some other error we don't handle
          return;
      }

        // everything is good, process the response
    }

  // svc is retreived from the authorize callback above
    OAuthConsumer.call(svc, message, oauthCallback);
  });
}