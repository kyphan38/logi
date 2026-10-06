// Lets `import '@/lib/...'` work under node --test.
// Next.js/tsconfig understand the "@/*" -> "src/*" alias, Node does not.
// No outside library: just a node:module resolve hook.
import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');
const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = path.join(SRC, specifier.slice(2));
    for (const ext of CANDIDATES) {
      if (isFile(base + ext)) {
        return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
