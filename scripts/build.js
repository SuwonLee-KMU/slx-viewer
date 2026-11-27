const { buildSync } = require('esbuild');
const options = {bundle: true, target: 'es2020', legalComments: 'eof'};
buildSync({...options, entryPoints: ['src/extension.js'], outfile: 'dist/extension.js', platform: 'node', external: ['vscode']});
buildSync({...options, entryPoints: ['src/viewer.js'], outfile: 'dist/preview.js', platform: 'browser', format: 'iife', globalName: 'SLXViewer'});
