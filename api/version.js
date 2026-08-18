// Vercel Serverless Function: Deployment Version Checker
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  return res.status(200).json({
    version: process.env.VERCEL_GIT_COMMIT_SHA || '2.0.4',
    buildTime: process.env.VERCEL_GIT_COMMIT_DATE || new Date().toISOString()
  });
}
