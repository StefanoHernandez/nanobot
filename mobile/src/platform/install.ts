// Import this module FIRST (side effect). Babel hoists imports, so calling installPolyfills()
// after imports is too late; a module body runs in import order.
import { installPolyfills } from "./polyfills";

installPolyfills();
