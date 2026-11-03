// Builds index.html: inlines src/dsp.js into src/ui.html and wraps it in a page shell.
import { readFileSync, writeFileSync } from 'node:fs';
const ui = readFileSync(new URL('./src/ui.html', import.meta.url), 'utf8');
// the worklet source is the effects (src/fx.js) followed by the engine (src/dsp.js)
const dsp = readFileSync(new URL('./src/fx.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('./src/dsp.js', import.meta.url), 'utf8');
if (dsp.includes('</script')) throw new Error('dsp.js must not contain a closing script tag');
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const body = ui.replace('/*DSP*/', () => dsp).replaceAll('__VERSION__', version);
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#161815">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync(new URL('./index.html', import.meta.url), page);
writeFileSync(new URL('./sw.js', import.meta.url), readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8').replaceAll('__VERSION__', version));
console.log('wrote index.html', 'v' + version, page.length, 'bytes');
