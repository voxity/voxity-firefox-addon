/**
 *
 * @source: https://github.com/voxity/voxity-firefox-addon/blob/master/data/parseNumbers.js
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

function replaceInElement(element, find, replace) {
  // iterate over child nodes in reverse, as replacement may increase
  // length of child node list.
  for (var i = element.childNodes.length; i-->0;) {
    var child = element.childNodes[i];
    if (child.nodeType == 1) { // ELEMENT_NODE
      var tag = child.nodeName.toLowerCase();
      if (tag != 'style' && tag !='script'){ // special case, don't touch CDATA elements
        replaceInElement(child, find, replace);
      }
    } else if (child.nodeType == 3) { // TEXT_NODE
      replaceInText(child, find, replace);
    }
  }
}
function replaceInText(text, find, replace) {
  var match;
  var matches = [];
  while (match = find.exec(text.data)) {
    matches.push(match);
  }
  for (var i = matches.length; i-->0;) {
    match = matches[i];
    text.splitText(match.index);
    text.nextSibling.splitText(match[0].length);
    text.parentNode.replaceChild(replace(match), text.nextSibling);
  }
}

// keywords to match. This *must* be a 'g'lobal regexp or it'll fail bad
var find = /\+?([0-9]\s?\.?){10,}/gi;

function callbackReplace(match) {
  var link = document.createElement('a');
  link.href = '#';
  link.className = 'voxity-tel';
  link.appendChild(document.createTextNode(match[0]));
  return link;
}
// replace matched strings with wiki links
replaceInElement(document.body, find, callbackReplace);

// Observe changes in the DOM
var observer = new MutationSummary({
  callback: handlePageChanges,
  rootNode: document.body,
  observeOwnChanges: false,
  queries: [{
    characterData: true
  }]
});

function handlePageChanges(summaries){
  var pageSummary = summaries[0];
  var ignore = {
        SCRIPT: true,
        NOSCRIPT: true, 
        CDATA: true,
        '#comment': true
    };
  pageSummary.added.forEach(function(node) {
    if (!ignore[node.nodeName] || (node.parentNode && !ignore[node.parentNode.nodeName]) && node.nodeValue.trim()) {
      replaceInElement(node.parentNode, find, callbackReplace);
    }
  });
}

// Attach handler on phonenumbers links
Gator(document).on('click', 'a.voxity-tel', function(e) {
  e.preventDefault();
  exten = this.textContent;
  exten = exten.replace(/\s+|\./g, '');
  self.port.emit("exten", exten);
});