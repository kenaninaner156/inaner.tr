import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import url from 'url'

function apiDevMiddleware() {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const routeName = parsedUrl.pathname.replace('/api/', '').split('?')[0];
            const filePath = path.resolve(process.cwd(), 'api', `${routeName}.js`);
            
            const module = await import(`${url.pathToFileURL(filePath).href}?t=${Date.now()}`);
            const handler = module.default;
            
            const customRes = {
              statusCode: 200,
              status(code) {
                res.statusCode = code;
                return customRes;
              },
              json(data) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              },
              send(data) {
                res.end(data);
              },
              setHeader(k, v) {
                res.setHeader(k, v);
              }
            };
            
            let body = {};
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
              const buffers = [];
              for await (const chunk of req) {
                buffers.push(chunk);
              }
              const rawBody = Buffer.concat(buffers).toString();
              try {
                body = JSON.parse(rawBody);
              } catch {
                body = rawBody;
              }
            }
            req.body = body;
            req.query = Object.fromEntries(parsedUrl.searchParams.entries());

            await handler(req, customRes);
          } catch (err) {
            console.error('[API Middleware Error]:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    apiDevMiddleware()
  ],
})

