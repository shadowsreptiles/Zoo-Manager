import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { openVault, readDirectoryRecursive, readFile, writeFile, moveFile, deleteEntry, renameFile, renameDir } from './lib/fileSystem';
import { flattenTree, toggleExpanded, getAllFiles, renderMarkdownWithWikiLinks } from './lib/treeHelpers';
import GraphView from './components/GraphView';
import FreeformCanvas from './components/FreeformCanvas';
import './obsidia.css';

export default function Obsidia({ onBackToZoo }) {
  const [vaultHandle, setVaultHandle] = useState(null);
  const [tree, setTree] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [viewMode, setViewMode] = useState('split');
  const [appView, setAppView] = useState('canvas');
  const appViewRef = useRef('canvas');
  useEffect(() => { appViewRef.current = appView; }, [appView]);
  const [canvasTheme, setCanvasTheme] = useState(() => {
    try { return localStorage.getItem('obsidia-canvas-theme') || 'dark'; } catch { return 'dark'; }
  });

  const toggleCanvasTheme = useCallback(() => {
    setCanvasTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('obsidia-canvas-theme', next); } catch {}
      return next;
    });
  }, []);
  const [contextMenu, setContextMenu] = useState(null);
  const [renamingPath, setRenamingPath] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [dragOverPath, setDragOverPath] = useState(null);
  const [fileContents, setFileContents] = useState({});
  const saveTimerRef = useRef({});

  const handleOpenVault = useCallback(async () => {
    const handle = await openVault();
    if (handle) {
      setVaultHandle(handle);
      const entries = await readDirectoryRecursive(handle);
      setTree(entries);
      const contents = {};
      const allFiles = getAllFiles(entries);
      for (const f of allFiles) { try { contents[f.path] = await readFile(f.handle); } catch {} }
      setFileContents(contents);
    }
  }, []);

  const refreshTree = useCallback(async () => {
    if (!vaultHandle) return;
    const entries = await readDirectoryRecursive(vaultHandle);
    function mergeExpanded(ne, oe) { return ne.map(n => { const o = oe.find(x=>x.path===n.path); if (n.kind==='directory'&&o&&o.kind==='directory') return {...n,expanded:o.expanded,children:mergeExpanded(n.children||[],o.children||[])}; return n; }); }
    setTree(prev => mergeExpanded(entries, prev));
    const contents = {};
    const allFiles = getAllFiles(entries);
    for (const f of allFiles) { try { contents[f.path] = await readFile(f.handle); } catch {} }
    setFileContents(contents);
  }, [vaultHandle]);

  const openFile = useCallback(async (entry) => {
    if (appViewRef.current !== 'graph') setAppView('editor');
    const existing = openTabs.find(t => t.path === entry.path);
    if (existing) { setActiveTab(entry.path); return; }
    const content = await readFile(entry.handle);
    setOpenTabs(prev => [...prev, { path: entry.path, name: entry.name, content, originalContent: content, handle: entry.handle, modified: false }]);
    setActiveTab(entry.path);
  }, [openTabs]);

  const closeTab = useCallback((path, e) => {
    if (e) e.stopPropagation();
    setOpenTabs(prev => { const next = prev.filter(t=>t.path!==path); if (activeTab===path) setActiveTab(next.length>0?next[next.length-1].path:null); return next; });
  }, [activeTab]);

  const updateContent = useCallback((path, newContent) => {
    setOpenTabs(prev => prev.map(t => t.path===path ? {...t,content:newContent,modified:newContent!==t.originalContent} : t));
    setFileContents(prev => ({...prev, [path]: newContent}));
    if (saveTimerRef.current[path]) clearTimeout(saveTimerRef.current[path]);
    saveTimerRef.current[path] = setTimeout(async () => {
      const tab = openTabs.find(t => t.path === path);
      if (tab) {
        try {
          await writeFile(tab.handle, newContent);
          setOpenTabs(prev => prev.map(t => t.path===path?{...t,originalContent:newContent,modified:false}:t));
          setSaveStatus('saved'); setTimeout(() => setSaveStatus(''), 2000);
        } catch {}
      }
    }, 1000);
  }, [openTabs]);

  const saveActive = useCallback(async () => {
    const tab = openTabs.find(t => t.path === activeTab);
    if (!tab) return;
    try { await writeFile(tab.handle, tab.content); setOpenTabs(prev=>prev.map(t=>t.path===activeTab?{...t,originalContent:t.content,modified:false}:t)); setSaveStatus('saved'); setTimeout(()=>setSaveStatus(''),2000); } catch {}
  }, [openTabs, activeTab]);

  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); saveActive(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [saveActive]);

  const createNote = useCallback(async (dirPath) => {
    if (!vaultHandle) return;
    let parent = vaultHandle;
    if (dirPath) for (const p of dirPath.split('/')) parent = await parent.getDirectoryHandle(p);
    let name='Untitled.md', i=1;
    while (true) { try { await parent.getFileHandle(name); name=`Untitled ${i}.md`; i++; } catch { break; } }
    const handle = await parent.getFileHandle(name, {create:true}); await writeFile(handle, '');
    await refreshTree();
    const path = dirPath ? `${dirPath}/${name}` : name;
    setOpenTabs(prev=>[...prev,{path,name,content:'',originalContent:'',handle,modified:false}]);
    setActiveTab(path); setAppView('editor'); setRenamingPath(path); setRenameValue(name.replace('.md',''));
  }, [vaultHandle, refreshTree]);

  const createFolder = useCallback(async (dirPath) => {
    if (!vaultHandle) return;
    let parent = vaultHandle;
    if (dirPath) for (const p of dirPath.split('/')) parent = await parent.getDirectoryHandle(p);
    let name='New Folder', i=1;
    while (true) { try { await parent.getDirectoryHandle(name); name=`New Folder ${i}`; i++; } catch { break; } }
    await parent.getDirectoryHandle(name, {create:true}); await refreshTree();
    setRenamingPath(dirPath ? `${dirPath}/${name}` : name); setRenameValue(name);
  }, [vaultHandle, refreshTree]);

  const handleDelete = useCallback(async (path) => {
    if (!confirm(`Delete "${path.split('/').pop()}"?`)) return;
    try { await deleteEntry(vaultHandle, path); closeTab(path); await refreshTree(); } catch(e) { alert('Delete failed: '+e.message); }
  }, [vaultHandle, refreshTree, closeTab]);

  const handleRename = useCallback(async (oldPath, newName, isDir) => {
    if (!newName || !vaultHandle) return;
    try {
      let newPath = isDir ? await renameDir(vaultHandle, oldPath, newName) : await renameFile(vaultHandle, oldPath, newName);
      setOpenTabs(prev => prev.map(t => { if (t.path===oldPath||t.path.startsWith(oldPath+'/')) { const up=t.path.replace(oldPath,newPath); return {...t,path:up,name:up.split('/').pop()}; } return t; }));
      if (activeTab === oldPath) setActiveTab(newPath);
      await refreshTree();
    } catch {}
    setRenamingPath(null);
  }, [vaultHandle, refreshTree, activeTab]);

  const handleDragStart = useCallback((e, path) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.setData('application/x-obsidia-file', path);
    e.dataTransfer.effectAllowed = 'copyMove';
  }, []);
  const handleDragOver = useCallback((e, path, kind) => { e.preventDefault(); e.dataTransfer.dropEffect='move'; if (kind==='directory') setDragOverPath(path); }, []);
  const handleDrop = useCallback(async (e, destPath, destKind) => {
    e.preventDefault(); setDragOverPath(null);
    const src = e.dataTransfer.getData('text/plain'); if (!src||src===destPath) return;
    const dd = destKind==='directory'?destPath:destPath.split('/').slice(0,-1).join('/');
    if (src.startsWith(dd+'/')) return;
    try { const np=await moveFile(vaultHandle,src,dd); setOpenTabs(p=>p.map(t=>t.path===src?{...t,path:np}:t)); if(activeTab===src) setActiveTab(np); await refreshTree(); } catch {}
  }, [vaultHandle, refreshTree, activeTab]);

  const handleContextMenu = useCallback((e, entry) => { e.preventDefault(); setContextMenu({x:e.clientX,y:e.clientY,entry}); }, []);
  useEffect(() => { const d=()=>setContextMenu(null); window.addEventListener('click',d); return ()=>window.removeEventListener('click',d); }, []);

  const handleWikiLinkClick = useCallback((lt) => {
    const af = getAllFiles(tree); const t = af.find(f=>f.name.replace('.md','')=== lt); if (t) openFile(t);
  }, [tree, openFile]);

  const backlinks = useMemo(() => {
    if (!activeTab) return [];
    const an = activeTab.split('/').pop().replace('.md','');
    return openTabs.filter(t => t.path!==activeTab && t.content.includes(`[[${an}]]`)).map(t => {
      const cl = t.content.split('\n').find(l=>l.includes(`[[${an}]]`))||'';
      return {path:t.path,name:t.name,context:cl.trim()};
    });
  }, [activeTab, openTabs]);

  const allFiles = useMemo(() => getAllFiles(tree), [tree]);
  const activeTabData = openTabs.find(t => t.path === activeTab);

  const filteredFlat = useMemo(() => {
    if (!searchQuery) return flattenTree(tree);
    const q = searchQuery.toLowerCase();
    function f(entries) { return entries.reduce((a,e)=>{ if(e.kind==='file'&&e.name.toLowerCase().includes(q)) a.push({...e,depth:0}); if(e.children) a.push(...f(e.children)); return a; },[]); }
    return f(tree);
  }, [tree, searchQuery]);

  const previewHtml = useMemo(() => {
    if (!activeTabData) return '';
    return renderMarkdownWithWikiLinks(activeTabData.content, allFiles);
  }, [activeTabData?.content, allFiles]);

  const previewRef = useRef(null);
  useEffect(() => {
    const el = previewRef.current; if (!el) return;
    const h = (e) => { const l=e.target.closest('[data-wiki-link]'); if(l){e.preventDefault();handleWikiLinkClick(l.getAttribute('data-wiki-link'));} };
    el.addEventListener('click',h); return ()=>el.removeEventListener('click',h);
  }, [handleWikiLinkClick]);

  if (!vaultHandle) {
    return (
      <div className="ob-root">
        <div className="ob-app">
          <div className="ob-welcome">
            <h2>Whimsical Obsidia</h2>
            <p>A local-first markdown knowledge base with linked notes, graph view, and freeform canvas.</p>
            <p style={{fontSize:'13px'}}>Your notes are stored as .md files on your computer.</p>
            <button onClick={handleOpenVault}>Open Vault Folder</button>
            <p style={{fontSize:'11px',marginTop:'8px',color:'var(--ob-text-muted)'}}>Pick any folder — it becomes your vault.</p>
            <button className="ob-back-to-zoo" onClick={onBackToZoo} style={{marginTop:16}}>{'\u2190'} Zoo Manager</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ob-root">
      <div className="ob-app">
        <div className="ob-sidebar">
          <div className="ob-sidebar-header">
            <button className="ob-back-to-zoo" onClick={onBackToZoo}>{'\u2190'} Zoo Manager</button>
            <div className="ob-sidebar-actions">
              <button title="New Note" onClick={()=>createNote('')}>+</button>
              <button title="New Folder" onClick={()=>createFolder('')}>{"\uD83D\uDCC1"}</button>
              <button title="Refresh" onClick={refreshTree}>{"\u21BB"}</button>
            </div>
          </div>
          <div className="ob-sidebar-views">
            <button className={appView==='editor'?'ob-active':''} onClick={()=>setAppView('editor')}>{"\uD83D\uDCDD"} Editor</button>
            <button className={appView==='graph'?'ob-active':''} onClick={()=>setAppView('graph')}>{"\uD83D\uDD78"} Graph</button>
            <button className={appView==='canvas'?'ob-active':''} onClick={()=>setAppView('canvas')}>{"\uD83C\uDFA8"} Canvas</button>
          </div>
          <div className="ob-search-box">
            <input type="text" placeholder="Search notes..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
          </div>
          <div className="ob-file-tree">
            {filteredFlat.length===0 && <div className="ob-empty-tree">No notes yet. Create one!</div>}
            {filteredFlat.map(entry => (
              <div key={entry.path} className={`ob-tree-item ${activeTab===entry.path?'ob-active':''} ${dragOverPath===entry.path?'ob-drag-over':''}`}
                style={{paddingLeft:12+entry.depth*16}}
                onClick={()=>{ if(entry.kind==='directory') setTree(p=>toggleExpanded(p,entry.path)); else openFile(entry); }}
                onContextMenu={e=>handleContextMenu(e,entry)}
                draggable={entry.kind==='file'} onDragStart={e=>handleDragStart(e,entry.path)}
                onDragOver={e=>handleDragOver(e,entry.path,entry.kind)} onDragLeave={()=>setDragOverPath(null)}
                onDrop={e=>handleDrop(e,entry.path,entry.kind)}
              >
                <span className="ob-icon">
                  {entry.kind==='directory' ? (entry.expanded?'\u25BC':'\u25B6')
                    : entry.mediaType==='image' ? '\uD83D\uDDBC\uFE0F'
                    : entry.mediaType==='video' ? '\uD83C\uDFA5'
                    : '\uD83D\uDCC4'}
                </span>
                {renamingPath===entry.path ? (
                  <input className="ob-rename-input" autoFocus value={renameValue} onChange={e=>setRenameValue(e.target.value)}
                    onBlur={()=>handleRename(entry.path,renameValue,entry.kind==='directory')}
                    onKeyDown={e=>{if(e.key==='Enter')handleRename(entry.path,renameValue,entry.kind==='directory');if(e.key==='Escape')setRenamingPath(null);}}
                    onClick={e=>e.stopPropagation()} />
                ) : <span className="ob-name">{entry.mediaType ? entry.name : entry.name.replace('.md','')}</span>}
                <div className="ob-actions">
                  {entry.kind==='directory'&&<><button title="New Note" onClick={e=>{e.stopPropagation();createNote(entry.path);}}>+</button><button title="New Folder" onClick={e=>{e.stopPropagation();createFolder(entry.path);}}>{"\uD83D\uDCC1"}</button></>}
                  <button title="Rename" onClick={e=>{e.stopPropagation();setRenamingPath(entry.path);setRenameValue(entry.kind==='file'?entry.name.replace('.md',''):entry.name);}}>{"\u270E"}</button>
                  <button title="Delete" onClick={e=>{e.stopPropagation();handleDelete(entry.path);}}>{"\uD83D\uDDD1"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ob-main">
          {appView === 'editor' && (
            <>
              <div className="ob-tab-bar">
                {openTabs.map(tab=>(
                  <div key={tab.path} className={`ob-tab ${activeTab===tab.path?'ob-active':''}`} onClick={()=>setActiveTab(tab.path)}>
                    <span>{tab.modified?'\u25CF ':''}{tab.name.replace('.md','')}</span>
                    <span className="ob-close" onClick={e=>closeTab(tab.path,e)}>&times;</span>
                  </div>
                ))}
              </div>
              {activeTabData ? (
                <>
                  <div className="ob-mode-toggle">
                    <button className={viewMode==='edit'?'ob-active':''} onClick={()=>setViewMode('edit')}>Edit</button>
                    <button className={viewMode==='split'?'ob-active':''} onClick={()=>setViewMode('split')}>Split</button>
                    <button className={viewMode==='preview'?'ob-active':''} onClick={()=>setViewMode('preview')}>Preview</button>
                    <div className="ob-spacer" />
                    {saveStatus && <div className="ob-status ob-saved">{'\u2713'} Saved</div>}
                    <div className="ob-status">{activeTabData.path}</div>
                  </div>
                  <div className="ob-editor-area">
                    {(viewMode==='edit'||viewMode==='split')&&(
                      <div className="ob-editor-pane">
                        <textarea value={activeTabData.content} onChange={e=>updateContent(activeTab,e.target.value)}
                          placeholder="Start writing... Use [[Note Name]] to link to other notes." spellCheck={false}
                          onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();const s=e.target.selectionStart,end=e.target.selectionEnd,v=e.target.value;updateContent(activeTab,v.substring(0,s)+'  '+v.substring(end));requestAnimationFrame(()=>{e.target.selectionStart=e.target.selectionEnd=s+2;});}}} />
                      </div>
                    )}
                    {(viewMode==='preview'||viewMode==='split')&&(
                      <div className="ob-preview-pane" ref={previewRef}>
                        <div className="ob-markdown-body" dangerouslySetInnerHTML={{__html:previewHtml}} />
                      </div>
                    )}
                  </div>
                  {backlinks.length>0&&(
                    <div className="ob-backlinks-panel">
                      <h3>Backlinks ({backlinks.length})</h3>
                      {backlinks.map(bl=>(
                        <div key={bl.path} className="ob-backlink-item" onClick={()=>setActiveTab(bl.path)}>
                          {bl.name.replace('.md','')}{bl.context&&<span className="ob-backlink-context">...{bl.context.substring(0,80)}...</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="ob-welcome">
                  <h2>Whimsical Obsidia</h2>
                  <p>Select a note from the sidebar, or create a new one.</p>
                  <button onClick={()=>createNote('')}>New Note</button>
                </div>
              )}
            </>
          )}

          {appView === 'graph' && (
            <div style={{display:'flex', flex:1, overflow:'hidden'}}>
              <GraphView tree={tree} fileContents={fileContents} onOpenFile={openFile} />
              <div className="ob-graph-editor-panel">
                <div className="ob-tab-bar">
                  {openTabs.map(tab=>(
                    <div key={tab.path} className={`ob-tab ${activeTab===tab.path?'ob-active':''}`} onClick={()=>setActiveTab(tab.path)}>
                      <span>{tab.modified?'\u25CF ':''}{tab.name.replace('.md','')}</span>
                      <span className="ob-close" onClick={e=>closeTab(tab.path,e)}>&times;</span>
                    </div>
                  ))}
                </div>
                {activeTabData ? (
                  <>
                    <div className="ob-mode-toggle">
                      <button className={viewMode==='edit'?'ob-active':''} onClick={()=>setViewMode('edit')}>Edit</button>
                      <button className={viewMode==='split'?'ob-active':''} onClick={()=>setViewMode('split')}>Split</button>
                      <button className={viewMode==='preview'?'ob-active':''} onClick={()=>setViewMode('preview')}>Preview</button>
                      <div className="ob-spacer" />
                      {saveStatus && <div className="ob-status ob-saved">{'\u2713'} Saved</div>}
                    </div>
                    <div className="ob-editor-area">
                      {(viewMode==='edit'||viewMode==='split')&&(
                        <div className="ob-editor-pane">
                          <textarea value={activeTabData.content} onChange={e=>updateContent(activeTab,e.target.value)}
                            placeholder="Start writing..." spellCheck={false}
                            onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();const s=e.target.selectionStart,end=e.target.selectionEnd,v=e.target.value;updateContent(activeTab,v.substring(0,s)+'  '+v.substring(end));requestAnimationFrame(()=>{e.target.selectionStart=e.target.selectionEnd=s+2;});}}} />
                        </div>
                      )}
                      {(viewMode==='preview'||viewMode==='split')&&(
                        <div className="ob-preview-pane" ref={previewRef}>
                          <div className="ob-markdown-body" dangerouslySetInnerHTML={{__html:previewHtml}} />
                        </div>
                      )}
                    </div>
                    {backlinks.length>0&&(
                      <div className="ob-backlinks-panel">
                        <h3>Backlinks ({backlinks.length})</h3>
                        {backlinks.map(bl=>(
                          <div key={bl.path} className="ob-backlink-item" onClick={()=>setActiveTab(bl.path)}>
                            {bl.name.replace('.md','')}{bl.context&&<span className="ob-backlink-context">...{bl.context.substring(0,80)}...</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ob-text-muted)',fontSize:13,flexDirection:'column',gap:8}}>
                    <span style={{fontSize:28}}>{'\uD83D\uDD78'}</span>
                    <span>Click a node to open a note</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {appView === 'canvas' && (
            <FreeformCanvas tree={tree} fileContents={fileContents} onOpenFile={openFile} vaultHandle={vaultHandle} canvasTheme={canvasTheme} onToggleTheme={toggleCanvasTheme} />
          )}
        </div>

        {contextMenu && (
          <div className="ob-context-menu" style={{left:contextMenu.x,top:contextMenu.y}}>
            {contextMenu.entry.kind==='directory'&&(
              <>
                <div className="ob-context-menu-item" onClick={()=>{createNote(contextMenu.entry.path);setContextMenu(null);}}>+ New Note</div>
                <div className="ob-context-menu-item" onClick={()=>{createFolder(contextMenu.entry.path);setContextMenu(null);}}>+ New Folder</div>
                <div className="ob-context-menu-sep" />
              </>
            )}
            <div className="ob-context-menu-item" onClick={()=>{setRenamingPath(contextMenu.entry.path);setRenameValue(contextMenu.entry.kind==='file'?contextMenu.entry.name.replace('.md',''):contextMenu.entry.name);setContextMenu(null);}}>Rename</div>
            <div className="ob-context-menu-item ob-danger" onClick={()=>{handleDelete(contextMenu.entry.path);setContextMenu(null);}}>Delete</div>
          </div>
        )}
      </div>
    </div>
  );
}
