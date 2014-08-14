let {Cc, Ci, Cr} = require("chrome");

const wpl = Ci.nsIWebProgressListener;

var reporterListener = function(svc, callback) {
  this.svc = svc;
  this.callback = callback;
};

reporterListener.prototype = {
  _checkForRedirect: function(aURL, aWebProgress) {

      var oauth_verifier = this.svc.tokenRx.exec(aURL);

      if (oauth_verifier) {
        aWebProgress.removeProgressListener(this);
        this.callback(oauth_verifier[1]);
      }
      if (this.svc.deniedRx.test(aURL)) {
        aWebProgress.removeProgressListener(this);
        this.callback(null);
      }
  },

  QueryInterface: function(aIID) {
    if (aIID.equals(Ci.nsIWebProgressListener)   ||
        aIID.equals(Ci.nsISupportsWeakReference) ||
        aIID.equals(Ci.nsISupports))
      return this;
    throw Cr.NS_NOINTERFACE;
  },
  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    if (aStateFlags & wpl.STATE_START &&
        aStateFlags & wpl.STATE_IS_DOCUMENT) { // was STATE_IS_NETWORK, but that doesn't work here...

      this._checkForRedirect(aRequest.name, aWebProgress);
    }
    if (aStateFlags & wpl.STATE_STOP &&
        aStateFlags & wpl.STATE_IS_DOCUMENT) {
      let win = aWebProgress.DOMWindow.window;
      let elt = win.document.documentElement;
      // the scrollWidth etc are still often just a little small for the
      // actual content, so we hard-code a 20% increase.
      win.resizeTo(elt.scrollWidth*1.2, elt.scrollHeight*1.2);
    }
  },
  onLocationChange: function(aWebProgress, aRequest, aLocation) {
    this._checkForRedirect(aLocation.spec, aWebProgress);
  }
};

exports.listen = function(window, svc, callback) {
  // phew - lots of time went into finding this magic incantation to get an nsIWebProgress for the window...
  let webProgress = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation).QueryInterface(Ci.nsIWebProgress);
  let listener = new reporterListener(svc, callback);
  // seems important to keep a reference to the listener somewhere or
  // notifications stop when the object is GCd.
  webProgress.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_ALL);
  return listener;
};

exports.stopListening = function(window, listener) {
  let webProgress;
  try {
    webProgress = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation).QueryInterface(Ci.nsIWebProgress);
  } catch (ex) {
    // if the window has been closed we will fail to get the interface
    return;
  }
  webProgress.removeProgressListener(listener);
};
