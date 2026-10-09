import { createRequire } from 'node:module';

// Works from both src/ and compiled dist/ without JSON import assertions.
const require = createRequire(import.meta.url);
export const RESTAP_VERSION: string = require('../package.json').version;
