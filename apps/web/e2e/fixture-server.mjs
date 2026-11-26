// Serves a static job-posting page for E2E extraction tests.
import { createServer } from 'node:http';

const PORT = Number(process.env.FIXTURE_PORT ?? 4100);

const jobPage = (id) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Playwright Test Engineer ${id} | Fixture Careers</title>
<meta property="og:site_name" content="Fixture Careers" />
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: `Playwright Test Engineer ${id}`,
  employmentType: 'FULL_TIME',
  hiringOrganization: { '@type': 'Organization', name: `Fixture Labs ${id}` },
  jobLocation: { '@type': 'Place', address: { addressLocality: 'Pune', addressCountry: 'IN' } },
  description: '<p>Build end-to-end test suites with Playwright and TypeScript. Work from home.</p>',
  experienceRequirements: '1-3 years of experience',
  educationRequirements: 'B.E / B.Tech',
  skills: 'Playwright, TypeScript, API Testing',
})}</script></head>
<body><nav><a href="/">Home</a></nav>
<main><article class="job-description">
<h1>Playwright Test Engineer ${id}</h1>
<p>Location: Pune</p><p>Experience: 1-3 years</p><p>Qualification: B.E / B.Tech</p>
<p>We are hiring a test engineer to build end-to-end suites with Playwright and TypeScript, review pull requests and improve CI reliability. This is a work from home role.</p>
<ul><li>Write and maintain E2E tests</li><li>Automate API tests</li></ul>
<a href="https://fixture-careers.example/apply/${id}">Apply now</a>
</article></main></body></html>`;

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n');
    return;
  }
  const m = url.pathname.match(/^\/jobs\/([\w-]+)$/);
  if (m) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(jobPage(m[1]));
    return;
  }
  res.writeHead(404).end('not found');
}).listen(PORT, () => console.log(`fixture server on ${PORT}`));
