/**
 * Render a simple branded HTML page (used by external completion endpoints).
 */
export function htmlResponse(body: string, title: string, status = 200) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prism - ${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f8f9fa;
      color: #1a1a1a;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 2.5rem;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      text-align: center;
      max-width: 420px;
    }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { color: #666; margin: 0 0 1.5rem; font-size: 0.95rem; }
    a {
      display: inline-block;
      padding: 0.6rem 1.5rem;
      background: #2563eb;
      color: white;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
    }
    a:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}
