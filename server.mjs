// Placeholder server so the first Railway deploy is green.
// Replaced by the real app (BUILD_INSTRUCTIONS.md, version 1).
import http from 'node:http';

const port = Number(process.env.PORT) || 3000;

const page = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Titan Academy</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1b2333;color:#fff;
font-family:Inter,system-ui,sans-serif;text-align:center;padding:24px}
h1{font-family:Georgia,serif;font-style:italic;font-size:clamp(32px,6vw,72px);margin:.2em 0}
p{color:#b9c2d0}.e{color:#38b6e8;letter-spacing:.18em;font-weight:700;font-size:13px}</style></head>
<body><main><div class="e">PROXIMITY PLUMBING</div><h1>Titan Academy</h1>
<p>Being rebuilt. Field team training is coming soon.</p></main></body></html>`;

http
  .createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, app: 'titan-academy', stage: 'placeholder' }));
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
  })
  .listen(port, () => console.log(`titan-academy placeholder listening on ${port}`));
