import 'server-only';

// Everything lives in ./pg so the hourly worker — a plain Node process — can share it. This file is
// the app's door to it, and the guard makes importing it from a client component a build error.

export * from './pg';
