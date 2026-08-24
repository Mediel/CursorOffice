import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  outfile: 'dist/extension.js',
  sourcemap: true,
  logLevel: 'info'
};

if (process.argv.includes('--watch')) {
  const buildContext = await context(options);
  await buildContext.watch();
  console.log('Cursor Office extension build is watching for changes.');
} else {
  await build(options);
}
