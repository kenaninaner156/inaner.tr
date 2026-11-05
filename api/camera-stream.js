/* eslint-env node */
import cameraStreamHandler from '../lib/cameraStreamHandler.js';

export default async function handler(req, res) {
  return cameraStreamHandler(req, res);
}
