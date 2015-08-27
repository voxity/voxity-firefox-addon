/**
 *
 * @source: https://github.com/voxity/voxity-firefox-addon/blob/master/lib/oauthconsumer.js
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

var win = require('sdk/window/utils'),
    Request = require("sdk/request").Request,
    querystring = require("sdk/querystring"),
    simplePrefs = require('sdk/simple-prefs');

var OAuthConsumer = exports.OAuthConsumer = {};
// var base_url = "https://api.voxity.fr";
// var base_url = "http://localhost:3000";
var base_url = "http://192.168.16.161";
exports.base_url = base_url;
(function()
{
    this.authWindow = null; // only 1 auth can be happening at a time...

    function makeProvider(name, displayName, key, completionURI, calls, doNotStore) {
        return {
            name: name,
            displayName: displayName,
            version: "2.0",
            consumerKey   : key,
            token: null,       // oauth_token
            accessParams: {},  // results from request access
            requestParams: {
                response_type: "token"
            }, // results from request token
            requestMethod: "GET",
            oauthBase: null,
            completionURI: completionURI,
            tokenRx: /#access_token=([^&]*)/gi,
            deniedRx: /denied=([^&]*)/gi,
            serviceProvider: calls
        };
    }
    this.makeProvider = makeProvider;

    this._providers = {
        "fieTjRLJPrUX25nmdR9z": function(key, completionURI) {
            let calls = {
                  requestTokenURL     : base_url + "/api/v1/login",
                  userAuthorizationURL: base_url + "/api/v1/dialog/authorize",
                  accessTokenURL      : base_url + "/api/v1/oauth/token"
                };
            return makeProvider('voxity', 'Voxity', key, completionURI, calls);
        }
    };

    this.getProvider = function(providerName, key, completionURI) {
        return this._providers[providerName](key, completionURI);
    };


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
            message.parameters.redirect_uri = this.service.completionURI;
            message.parameters.client_id = this.service.consumerKey;

            var requestBody = querystring.stringify(message.parameters);
            let targetURL = message.action + "?" + requestBody;

            OAuthConsumer.openDialog(targetURL,
                           null,
                           self.service,
                           function(results, accessToken) {
                                let svc = self.service;
                                if (accessToken) {
                                    svc.token = self.decodePercent(accessToken);
                                    // save into prefs
                                    OAuthConsumer._setAccess(svc);
                                } else {
                                    svc.token = null;
                                    svc.accessParams = null;
                                    OAuthConsumer.resetAccess(svc);
                                }
                                self.afterAuthorizeCallback(svc);
                            });
        },

        decodePercent: function (s) {
            if (s !== null) {
                // Handle application/x-www-form-urlencoded, which is defined by
                // http://www.w3.org/TR/html4/interact/forms.html#h-17.13.4.1
                s = s.replace(/\+/g, " ");
            }
            return decodeURIComponent(s);
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
            require("./loginListener").stopListening(this.authWindow, this.oauth_listener);
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
        this.oauth_listener = require("./loginListener").listen(win, svc, callbackFunc);
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
    this.authorize = function(providerName, key, completionURI, callback, params, extensionID) {
        var svc = OAuthConsumer.getProvider(providerName, key, completionURI);
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
            req.content = message.parameters;
            req.contentType = message.contenttype;
            req.headers = {
                "Authorization": "Bearer " + svc.token
            };
            req.post();
        }
    };


}).call(OAuthConsumer);
