// CJS shim for uuid@14 (ESM-only) in Jest/CommonJS test environment.
// uuid@14 ships ESM-only modules; Jest's CommonJS transform cannot process them.
// This shim re-implements the v4 export using Node 22's built-in crypto.randomUUID().
'use strict';

const { randomUUID } = require('crypto');

module.exports = {
  v4: () => randomUUID(),
};
