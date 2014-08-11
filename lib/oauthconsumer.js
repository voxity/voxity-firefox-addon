/* ***** BEGIN LICENSE BLOCK *****
* Version: MPL 1.1/GPL 2.0/LGPL 2.1
*
* The contents of this file are subject to the Mozilla Public License Version
* 1.1 (the "License"); you may not use this file except in compliance with
* the License. You may obtain a copy of the License at
* http://www.mozilla.org/MPL/
*
* Software distributed under the License is distributed on an "AS IS" basis,
* WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
* for the specific language governing rights and limitations under the
* License.
*
* Based on concepts from FireUploader
* The Original Code is OAuthorizer
*
* The Initial Developer of the FireUploader is Rahul Jonna.
* The Initial Developer of the OAuthorizer is Shane Caraveo.
*
* Portions created by the Initial Developer are Copyright (C) 2007-2009
* the Initial Developer. All Rights Reserved.
*
* Alternatively, the contents of this file may be used under the terms of
* either the GNU General Public License Version 2 or later (the "GPL"), or
* the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
* in which case the provisions of the GPL or the LGPL are applicable instead
* of those above. If you wish to allow use of your version of this file only
* under the terms of either the GPL or the LGPL, and not to allow others to
* use your version of this file under the terms of the MPL, indicate your
* decision by deleting the provisions above and replace them with the notice
* and other provisions required by the GPL or the LGPL. If you do not delete
* the provisions above, a recipient may use your version of this file under
* the terms of any one of the MPL, the GPL or the LGPL.
*
* ***** END LICENSE BLOCK ***** */

var win = require('sdk/window/utils'),
    Request = require("sdk/request").Request,
    querystring = require("sdk/querystring"),
    simplePrefs = require('sdk/simple-prefs');

var OAuthConsumer = exports.OAuthConsumer = {};

(function()
{
    this.authWindow = null; // only 1 auth can be happening at a time...

    function makeProvider(name, displayName, key, secret, completionURI, calls, doNotStore) {
        return {
            name: name,
            displayName: displayName,
            version: "2.0",
            consumerKey   : key,
            consumerSecret: secret,
            token: null,       // oauth_token
            tokenSecret: null, // oauth_token_secret
            accessParams: {},  // results from request access
            requestParams: {}, // results from request token
            requestMethod: "GET",
            oauthBase: null,
            completionURI: completionURI,
            tokenRx: /\?code=([^&]*)/gi,
            deniedRx: /denied=([^&]*)/gi,
            serviceProvider: calls
        };
    }
    this.makeProvider = makeProvider;

    this._providers = {
        "voxity": function(key, secret, completionURI) {
            let calls = {
                  requestTokenURL     : "https://api.voxity.fr/api/v1/login",
                  userAuthorizationURL: "https://api.voxity.fr/api/v1/dialog/authorize",
                  accessTokenURL      : "https://api.voxity.fr/api/v1/oauth/token"
                };
            let p = makeProvider('voxity', 'Voxity',
                                     key, secret,
                                     completionURI, calls);

            p.requestParams = {
                'response_type': 'code'
            };

            return p;
        }
    };

    this.getProvider = function(providerName, key, secret, completionURI) {
        return this._providers[providerName](key, secret, completionURI);
    };

    function xpath(xmlDoc, xpathString) {
        let root = xmlDoc.ownerDocument == null ?
          xmlDoc.documentElement : xmlDoc.ownerDocument.documentElement;
        let nsResolver = xmlDoc.createNSResolver(root);

        return xmlDoc.evaluate(xpathString, xmlDoc, nsResolver,
                               Ci.nsIDOMXPathResult.ANY_TYPE, null);
    }


    this._authorizers = {};
    this.getAuthorizer = function(svc, onCompleteCallback) {
        return new this._authorizers[svc.version](svc, onCompleteCallback);
    };

    this.resetAccess = function(svc) {
        simplePrefs.prefs.token = "";
    };
    this._setAccess = function(svc) {
        simplePrefs.prefs.token = svc.token;
    };
    this.getAccess = function(svc) {
        svc.token = simplePrefs.prefs.token;
        return svc.token ? true : false;
    };

    /**
     * OAuth2Handler deals with authorization using the OAuth 2.0 protocol.
     */
    function OAuth2Handler(oauthSvc, afterAuthorizeCallback) {
        this.service = oauthSvc;
        this.afterAuthorizeCallback = afterAuthorizeCallback;
    }
    OAuth2Handler.prototype = {
        startAuthentication: function()
        {
            if (OAuthConsumer.getAccess(this.service))
                this.afterAuthorizeCallback(this.service);
            else
                this.getUserAuthorization();
        },
        getUserAuthorization: function() {
            let self = this;

            var message = {
                method: this.service.requestMethod,
                action: this.service.serviceProvider.userAuthorizationURL,
                parameters: this.service.requestParams
            };
            // we fake this big time so we can catch a redirect
            message.parameters['redirect_uri'] = this.service.completionURI;
            message.parameters['client_id'] = this.service.consumerKey;

            var requestBody = querystring.stringify(message.parameters);
            let targetURL = message.action + "?" + requestBody;

            OAuthConsumer.openDialog(targetURL,
                           null,
                           self.service,
                           function(results, code) {
                                let svc = self.service;
                                if (code) {
                                    let targetURL = svc.serviceProvider.accessTokenURL;
                                    let message = {
                                        action: targetURL,
                                        method: "POST",
                                        parameters: {
                                            'redirect_uri': svc.completionURI,
                                            'client_id': svc.consumerKey,
                                            'client_secret': svc.consumerSecret,
                                            'code': code,
                                            'grant_type': 'authorization_code'
                                        }
                                    };

                                    delete message.parameters.response_type;

                                    let tokenRequest = Request({
                                        url: message.action,
                                        content: message.parameters,
                                        onComplete: function (response) {
                                            if (response.status == 200) {
                                                svc.token = response.json.access_token;

                                                // save into prefs
                                                OAuthConsumer._setAccess(svc);
                                                self.afterAuthorizeCallback(svc);
                                            } else {
                                                console.log("Unable to access " + self.service.name + ": error " + response.status + " while getting access token:" + response.text);
                                                self.afterAuthorizeCallback({
                                                    error:"API Error",
                                                    message:"Error while accessing oauth: " + response.status + ": " +response.text
                                                });
                                            }
                                        }
                                    });
                                    tokenRequest.post();
                                } else {
                                    svc.token = null;
                                    svc.accessParams = null;
                                    OAuthConsumer.resetAccess(svc);
                                }
                            });
        },

        getToken: function(code) {

        },

        // reauthorize: function()
        // {
        //     // Facebook specific token format...
        //     // check expires {secret}.3600.{expires_at_seconds_after_epoch}-{user_id}
        //     // if we've expired, go through the full user authorization
        //     let details = /(.*?)\.3600\.(.*?)-(.*)/gi.exec(this.service.token);
        //     if (details && details[2]) {
        //         var expires = new Date(details[2] * 1000);
        //         if (expires < Date.now()) {
        //             this.getUserAuthorization();
        //             return;
        //         }
        //     }

        //     let parameters = this.service.accessParams;
        //     parameters['code'] = this.service.token;
        //     parameters['callback'] = this.service.completionURI;
        //     parameters['client_id'] = this.service.consumerKey;
        //     parameters['client_secret'] = this.service.consumerSecret;

        //     var requestBody = OAuth.formEncode(parameters);
        //     let targetURL = this.service.serviceProvider.accessTokenURL + "?" + requestBody;

        //     let call = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);

        //     let self = this;
        //     call.open('GET', targetURL, true);
        //     call.onreadystatechange = function (aEvt) {
        //         if (call.readyState == 4) {
        //             if (call.status == 200) {
        //                 results = OAuth.decodeForm(call.responseText);

        //                 self.service.accessParams = OAuth.getParameterMap(results);
        //                 self.service.token = self.service.accessParams["access_token"];

        //                 // save into prefs
        //                 OAuthConsumer._setAccess(self.service);

        //                 self.afterAuthorizeCallback(self.service);
        //             } else {
        //                 self._log.error("Unable to access "+self.service.name+": error " + call.status + " while getting access token:" + call.responseText);
        //                 self.afterAuthorizeCallback({error:"API Error", message:"Error while accessing oauth: " + call.status+": "+call.responseText});
        //             }
        //         }
        //     }
        //     call.send(null);
        // }
    };
    this._authorizers["2.0"] = OAuth2Handler;

    this._openDialog = function(location) {
        if (this.oauth_listener) {
            require("loginListener").stopListening(this.authWindow, this.oauth_listener);
            this.oauth_listener = null;
        }
        if (this.authWindow && !this.authWindow.closed) {
            // resize to the default size of the window.
            this.authWindow.resizeTo(800, 540);
            this.authWindow.location.href = location;
            this.authWindow.focus();
        } else {
            this.authWindow = win.openDialog({
                url: location,
                name: "oauth_authorization_dialog",
                features: Object.keys({
                    chrome: true,
                    dialog: true,
                    centerscreen: true,
                    resizable: false,
                    scrollbars: true
                }).join()
            });
        }
        return this.authWindow;
    };

    this.openLoadingDialog = function() {
        let url = require("sdk/self").data.url("content/loading.html");
        this._openDialog(url);
    };

    this.openDialog = function(loginUrl, requestData, svc, afterAuthCallback) {
        let win = this._openDialog(loginUrl);
        var callbackFunc = function(token)
        {
            // no need to stopListening here - if the callback was invoked the
            // listener has already removed itself.
            this.oauth_listener = null;
            this.authWindow.close();
            this.authWindow = null;
            afterAuthCallback(requestData, token);
        }.bind(this);
        this.oauth_listener = require("loginListener").listen(win, svc, callbackFunc);
    };

    /**
     * The one and only API you should use.  Call authorize with your
     * key and secret, your callback will receive a service object that
     * has 3 important members, token, tokenSecret and accessParams.
     * accessParams is an object that contains all the parameters returned
     * during the access request phase of the OAuth protocol.  If you need
     * more than the token or secret (e.g. xoauth_yahoo_guid), look in
     * accessParams.
     *
     * supported providers are at the top of this file.
     * Some providers require you set a redirection URI when you get your keys,
     * if so, use that same uri for the completionURI param, otherwise, make
     * up a fake uri, such as http://oauthcompletion.local/.  This is used to
     * catch the authorization code automatically.  If it is not provided,
     * oauthorizer will not complete successfully.
     *
     * @param providerName  string      Name of provider
     * @param key           string      api or oauth key from provider
     * @param secret        string      secret key from provider
     * @param completionURI string      redirection URI you configured with the provider
     * @param callback      function    which will recieve one param, the service object
     * @param params        object      extra parmams, such as scope
     * @param extensionID   string      extension id
     */
    this.authorize = function(providerName, key, secret, completionURI, callback, params, extensionID) {
        var svc = OAuthConsumer.getProvider(providerName, key, secret, completionURI);
        if (params)
            svc.requestParams = params;
        svc.extensionID = extensionID;
        var handler = OAuthConsumer.getAuthorizer(svc, callback);

        handler.startAuthentication();

        return handler;
    };

    /**
     * call wraps an API call with OAuth data.  You prepare the message, provide
     * a callback and we'll let  you know when we're done.
     *
     * @param svc      object   service object received in the authorize callback
     * @param message  object   message object contains action (url), method (GET|POST) and params (object)
     * @param callback function receives one param, nsIXMLHttpRequest
     */
    this.call = function(svc, message, aCallback) {
        // 2.0 GET: query should contain results of formEncode
        // 2.0 POST: message body contains OAuth parameters
        let req = Request({
            url: message.action,
            onComplete: function (response) {
                aCallback(req);
            }
        });

        var requestBody;
        requestBody = querystring.stringify(message.parameters);

        if (message.method == "GET") {
            req.url = message.action + "?" + requestBody;
            req.open(message.method, targetURL, true);
            req.send(null);
        } else {
            req.url = message.action;
            req.content = message.parameters,
            req.headers = {
                "Authorization": "Bearer " + svc.token
            };
            req.post();
        }
    };


}).call(OAuthConsumer);
