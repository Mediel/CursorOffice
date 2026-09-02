import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const runtimeRoot = join(repositoryRoot, 'assets', 'runtime');
const manifestRoot = join(repositoryRoot, 'assets', 'manifests');
const requiredManifestFields = ['id', 'author', 'source', 'license', 'triangles', 'textures'];

async function filesUnder(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true, recursive: true });
    return entries
      .filter(entry => entry.isFile())
      .map(entry => join(entry.parentPath, entry.name));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

const runtimeFiles = (await filesUnder(runtimeRoot)).filter(file => extname(file).toLowerCase() === '.glb');
const errors = [];

for (const modelPath of runtimeFiles) {
  const relativeModel = relative(runtimeRoot, modelPath);
  const manifestPath = join(manifestRoot, relativeModel.replace(/\.glb$/i, '.asset.json'));
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    errors.push(`${relativeModel}: manifest is missing or unreadable: ${relative(repositoryRoot, manifestPath)} (${error.message})`);
    continue;
  }

  for (const field of requiredManifestFields) {
    if (manifest[field] === undefined || manifest[field] === '') {
      errors.push(`${relativeModel}: manifest is missing the required '${field}' field`);
    }
  }
  if (!Number.isInteger(manifest.triangles) || manifest.triangles < 0) {
    errors.push(`${relativeModel}: 'triangles' must be a non-negative integer`);
  }
  if (!Array.isArray(manifest.textures)) {
    errors.push(`${relativeModel}: 'textures' must be an array`);
  }

  const header = Buffer.alloc(12);
  const model = await readFile(modelPath);
  model.copy(header, 0, 0, Math.min(model.length, header.length));
  if (header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2) {
    errors.push(`${relativeModel}: file is not a valid GLB version 2 asset`);
  }
}

if (errors.length > 0) {
  console.error(`Asset validation failed (${errors.length}):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Asset validation: OK (${runtimeFiles.length} runtime GLB).`);
}
