import { marked } from 'marked';

export function flattenTree(entries, depth = 0) {
  const r = []; for (const e of entries) { r.push({...e, depth}); if (e.kind==='directory' && e.children && e.expanded) r.push(...flattenTree(e.children, depth+1)); } return r;
}

export function toggleExpanded(entries, path) {
  return entries.map(e => { if (e.path===path && e.kind==='directory') return {...e, expanded:!e.expanded}; if (e.children) return {...e, children: toggleExpanded(e.children, path)}; return e; });
}

export function getAllFiles(entries) {
  let f = []; for (const e of entries) { if (e.kind==='file') f.push(e); if (e.children) f.push(...getAllFiles(e.children)); } return f;
}

export function parseWikiLinks(text) { const r = /\[\[([^\]]+)\]\]/g; const l = []; let m; while ((m=r.exec(text))!==null) l.push(m[1]); return l; }

export function renderMarkdownWithWikiLinks(text, allFiles) {
  const processed = text.replace(/\[\[([^\]]+)\]\]/g, (m, lt) => {
    const t = allFiles.find(f => f.name.replace('.md','') === lt);
    return `<a class="${t ? 'ob-wiki-link' : 'ob-wiki-link ob-broken'}" data-wiki-link="${lt}">${lt}</a>`;
  });
  return marked.parse(processed);
}
