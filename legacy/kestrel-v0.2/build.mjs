// Builds index.html: inlines src/dsp.js into src/ui.html and wraps it in a page shell.
import { readFileSync, writeFileSync } from 'node:fs';
const ui = readFileSync(new URL('./src/ui.html', import.meta.url), 'utf8');
const dsp = readFileSync(new URL('./src/dsp.js', import.meta.url), 'utf8');
if (dsp.includes('</script')) throw new Error('dsp.js must not contain a closing script tag');
const body = ui.replace('/*DSP*/', () => dsp);
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync(new URL('./index.html', import.meta.url), page);
console.log('wrote index.html', page.length, 'bytes');
