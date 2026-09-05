"use strict";
// STUB: Ecosystem was removed. This file prevents the market-maker
// from crashing the backend on startup when it requires this module.
Object.defineProperty(exports, "__esModule", { value: true });
exports.scyllaKeyspace = void 0;
exports.initialize = async function() {};
exports.scyllaKeyspace = "trading";
const stub = { execute: async () => ({}) };
exports.default = stub;
exports.client = stub;
