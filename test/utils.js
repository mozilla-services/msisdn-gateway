/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function range(start, stop, step) {
  if (typeof stop === 'undefined') {
    // one param defined
    stop = start;
    start = 0;
  }
  if (typeof step === 'undefined') {
    step = 1;
  }
  if ((step > 0 && start >= stop) ||
      (step < 0 && start <= stop)) {
    return [];
  }
  var result = [];
  for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
    result.push(i);
  }
  return result;
}

module.exports = {
  range: range
};
