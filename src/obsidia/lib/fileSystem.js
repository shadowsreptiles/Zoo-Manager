export const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif|ico|tiff?)$/i;
export const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|ogv|m4v|wmv)$/i;

export async function openVault() {
  try { return await window.showDirectoryPicker({ mode: 'readwrite' }); } catch { return null; }
}

export async function readDirectoryRecursive(dirHandle, path = '') {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith('.')) continue;
    const fullPath = path ? `${path}/${name}` : name;
    if (handle.kind === 'directory') {
      entries.push({ name, path: fullPath, kind: 'directory', handle, children: await readDirectoryRecursive(handle, fullPath) });
    } else if (name.endsWith('.md')) {
      entries.push({ name, path: fullPath, kind: 'file', handle });
    } else if (IMAGE_EXT.test(name)) {
      entries.push({ name, path: fullPath, kind: 'file', handle, mediaType: 'image' });
    } else if (VIDEO_EXT.test(name)) {
      entries.push({ name, path: fullPath, kind: 'file', handle, mediaType: 'video' });
    }
  }
  entries.sort((a, b) => { if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1; return a.name.localeCompare(b.name); });
  return entries;
}

export async function readFile(fh) { return await (await fh.getFile()).text(); }
export async function writeFile(fh, c) { const w = await fh.createWritable(); await w.write(c); await w.close(); }

async function getParentHandle(root, fp) { const p = fp.split('/'); p.pop(); let c = root; for (const x of p) c = await c.getDirectoryHandle(x); return c; }

export async function moveFile(root, src, destDir) {
  const parts = src.split('/'); const fn = parts[parts.length-1];
  const sp = await getParentHandle(root, src); const sfh = await sp.getFileHandle(fn);
  const content = await readFile(sfh);
  let dd = root; if (destDir) for (const p of destDir.split('/')) dd = await dd.getDirectoryHandle(p);
  const nfh = await dd.getFileHandle(fn, { create: true }); await writeFile(nfh, content); await sp.removeEntry(fn);
  return destDir ? `${destDir}/${fn}` : fn;
}

export async function deleteEntry(root, ep) { const p = ep.split('/'); const n = p.pop(); let parent = root; for (const x of p) parent = await parent.getDirectoryHandle(x); await parent.removeEntry(n, { recursive: true }); }

export async function renameFile(root, oldPath, newName) {
  const parts = oldPath.split('/'); const oldName = parts.pop(); const pp = parts.join('/');
  let parent = root; for (const p of parts) parent = await parent.getDirectoryHandle(p);
  const oh = await parent.getFileHandle(oldName); const content = await readFile(oh);
  const fn = newName.endsWith('.md') ? newName : newName + '.md';
  const nh = await parent.getFileHandle(fn, { create: true }); await writeFile(nh, content); await parent.removeEntry(oldName);
  return pp ? `${pp}/${fn}` : fn;
}

export async function renameDir(root, oldPath, newName) {
  const parts = oldPath.split('/'); const oldName = parts.pop(); const pp = parts.join('/');
  let parent = root; for (const p of parts) parent = await parent.getDirectoryHandle(p);
  const od = await parent.getDirectoryHandle(oldName); const nd = await parent.getDirectoryHandle(newName, { create: true });
  async function cp(s, d) { for await (const [n, h] of s.entries()) { if (h.kind==='file') { const c=await readFile(h); const f=await d.getFileHandle(n,{create:true}); await writeFile(f,c); } else { const sd=await d.getDirectoryHandle(n,{create:true}); await cp(h,sd); } } }
  await cp(od, nd); await parent.removeEntry(oldName, { recursive: true });
  return pp ? `${pp}/${newName}` : newName;
}
