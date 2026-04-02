import { useState, useEffect, useRef, useCallback, useMemo, Fragment, memo } from 'react';
import { marked } from 'marked';
import { getAllFiles, parseWikiLinks } from '../lib/treeHelpers';
import { readFile, writeFile } from '../lib/fileSystem';
import { ShapeMenuIcon } from './ShapeRenderer';
import ShapeRenderer from './ShapeRenderer';
import NoteCardContent from './NoteCardContent';

export default function FreeformCanvas({ tree, fileContents, onOpenFile, vaultHandle, canvasTheme, onToggleTheme }) {
  const [cards, setCards] = useState([]);
  const [connections, setConnections] = useState([]);
  const [pan, setPan] = useState({x:0, y:0});
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState('');
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [selectedConn, setSelectedConn] = useState(null);
  const [connPopupPos, setConnPopupPos] = useState({ x: 0, y: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState(null);
  const [stackTarget, setStackTarget] = useState(null);
  const [openStackMenu, setOpenStackMenu] = useState(null);
  const [showWaypointPanel, setShowWaypointPanel] = useState(false);
  const waypointBtnRef = useRef(null);
  const containerRef = useRef(null);
  const shapeBtnRef = useRef(null);
  const panStart = useRef({x:0,y:0,panX:0,panY:0});
  const dragStart = useRef(null);
  const resizeStart = useRef(null);
  const historyRef = useRef([]);
  const cardsRef = useRef(cards);
  const nextId = useRef(1);
  const saveTimer = useRef(null);

  useEffect(() => { cardsRef.current = cards; }, [cards]);

  // Auto-restore media blob URLs when the vault tree becomes available
  useEffect(() => {
    if (!loaded) return;
    const allFiles = getAllFiles(tree);
    if (allFiles.length === 0) return;
    const needsRestore = cardsRef.current.filter(c => c.type === 'media' && !c.mediaSrc && c.filePath);
    if (needsRestore.length === 0) return;
    (async () => {
      const updates = await Promise.all(needsRestore.map(async mc => {
        try {
          const entry = allFiles.find(f => f.path === mc.filePath);
          if (!entry?.handle) return null;
          const file = await entry.handle.getFile();
          return { id: mc.id, mediaSrc: URL.createObjectURL(file) };
        } catch { return null; }
      }));
      const valid = updates.filter(Boolean);
      if (valid.length > 0) {
        setCards(prev => prev.map(c => {
          const u = valid.find(u => u.id === c.id);
          return u ? { ...c, mediaSrc: u.mediaSrc } : c;
        }));
      }
    })();
  }, [tree, loaded]);

  const saveFn = useCallback(async (cardsData, connsData, panData, zoomData) => {
    if (!vaultHandle) return;
    try {
      const serializable = cardsData.map(c => ({
        id: c.id, type: c.type, title: c.title, content: c.content,
        x: c.x, y: c.y, w: c.w, h: c.h, notePath: c.notePath || null,
        shapeType: c.shapeType || null, shapeColor: c.shapeColor || null,
        stackId: c.stackId || null, stackOrder: c.stackOrder != null ? c.stackOrder : null,
        parentId: c.parentId || null, collapsed: c.collapsed || false,
        mediaType: c.mediaType || null, fileName: c.fileName || null,
        filePath: c.filePath || null,
      }));
      const data = JSON.stringify({ cards: serializable, connections: connsData, pan: panData, zoom: zoomData, nextId: nextId.current, savedAt: new Date().toISOString() }, null, 2);
      const fh = await vaultHandle.getFileHandle('.obsidia-canvas.json', { create: true });
      await writeFile(fh, data);
      setSaveIndicator('saved');
      setTimeout(() => setSaveIndicator(''), 1500);
    } catch (err) {
      console.error('Canvas save failed:', err);
    }
  }, [vaultHandle]);

  // Debounced auto-save
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveFn(cards, connections, pan, zoom), 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [cards, connections, pan, zoom, loaded, saveFn]);

  // Load canvas state on mount
  useEffect(() => {
    if (!vaultHandle) return;
    (async () => {
      try {
        const fh = await vaultHandle.getFileHandle('.obsidia-canvas.json');
        const text = await readFile(fh);
        const data = JSON.parse(text);
        if (data.cards) {
          const allFiles = getAllFiles(tree);
          const restored = data.cards.map(c => {
            if (c.type === 'note' && c.notePath) {
              const entry = allFiles.find(f => f.path === c.notePath);
              const freshContent = fileContents[c.notePath] || '';
              const preview = freshContent.substring(0, 200) + (freshContent.length > 200 ? '...' : '');
              return { ...c, entry: entry || null, content: preview || c.content, editing: false };
            }
            if (c.type === 'text') {
              return { ...c, type: 'notecard', parentId: c.parentId || null, collapsed: false, editing: false, editingTitle: false };
            }
            return { ...c, editing: false, editingTitle: false, parentId: c.parentId || null };
          });
          setCards(restored);
        }
        if (data.connections) setConnections(data.connections.map((c, i) => ({
          color: '#cba6f7', strokeWidth: 2, ...c, id: c.id || ('conn-' + i)
        })));
        if (data.pan) setPan(data.pan);
        if (data.zoom) setZoom(data.zoom);
        if (data.nextId) nextId.current = data.nextId;
      } catch (err) {
        console.log('No saved canvas found or load failed:', err?.message);
      }
      setLoaded(true);
    })();
  }, [vaultHandle]);

  const addCanvasNote = useCallback(() => {
    const cx = (window.innerWidth/2 - pan.x) / zoom;
    const cy = (window.innerHeight/2 - pan.y) / zoom;
    const id = 'card-' + nextId.current++;
    setCards(prev => [...prev, {
      id, type: 'notecard', title: 'Note Card', content: '',
      parentId: null, collapsed: false, editing: false, editingTitle: false,
      x: cx - 120, y: cy - 40, w: 260, h: 'auto'
    }]);
    setSelected(id);
  }, [pan, zoom]);

  const addWaypoint = useCallback(() => {
    const containerEl = containerRef.current;
    const vw = containerEl ? containerEl.clientWidth : 800;
    const vh = containerEl ? containerEl.clientHeight : 600;
    const cx = (vw / 2 - pan.x) / zoom;
    const cy = (vh / 2 - pan.y) / zoom;
    const id = 'wp-' + nextId.current++;
    const wpCount = cardsRef.current.filter(c => c.type === 'waypoint').length;
    setCards(prev => [...prev, {
      id, type: 'waypoint', title: 'Waypoint ' + (wpCount + 1),
      x: cx, y: cy, w: 0, h: 0,
    }]);
    setSelected(id);
    setShowWaypointPanel(false);
  }, [pan, zoom]);

  const navigateToWaypoint = useCallback((wp) => {
    const containerEl = containerRef.current;
    const vw = containerEl ? containerEl.clientWidth : 800;
    const vh = containerEl ? containerEl.clientHeight : 600;
    setPan({ x: vw / 2 - wp.x * zoom, y: vh / 2 - wp.y * zoom });
    setShowWaypointPanel(false);
  }, [zoom]);

  const addNoteCard = useCallback((entry) => {
    const cx = (window.innerWidth/2 - pan.x) / zoom;
    const cy = (window.innerHeight/2 - pan.y) / zoom;
    const id = 'note-' + entry.path;
    if (cards.find(c => c.id === id)) { setSelected(id); return; }
    const content = fileContents[entry.path] || '';
    const preview = content.substring(0, 200) + (content.length > 200 ? '...' : '');
    setCards(prev => [...prev, { id, type: 'note', title: entry.name.replace('.md',''), content: preview, x: cx - 90 + Math.random()*60, y: cy - 40 + Math.random()*60, w: 280, h: 220, notePath: entry.path, entry }]);
    setSelected(id);
  }, [pan, zoom, cards, fileContents]);

  const addAllNotes = useCallback(() => {
    const allFiles = getAllFiles(tree).filter(f => f.name.endsWith('.md'));
    const newCards = []; const cols = Math.ceil(Math.sqrt(allFiles.length));
    allFiles.forEach((f, i) => {
      const content = fileContents[f.path] || '';
      const preview = content.substring(0, 200) + (content.length > 200 ? '...' : '');
      newCards.push({ id: 'note-'+f.path, type:'note', title: f.name.replace('.md',''), content: preview, x: 100 + (i%cols)*280, y: 100 + Math.floor(i/cols)*200, w: 280, h: 220, notePath: f.path, entry: f });
    });
    const newConns = [];
    allFiles.forEach(f => {
      const links = parseWikiLinks(fileContents[f.path] || '');
      links.forEach(link => {
        const target = allFiles.find(t => t.name.replace('.md','') === link);
        if (target) newConns.push({ from: 'note-'+f.path, to: 'note-'+target.path });
      });
    });
    setCards(newCards);
    setConnections(newConns);
  }, [tree, fileContents]);

  const addShape = useCallback((shapeType) => {
    const cx = (window.innerWidth/2 - pan.x) / zoom;
    const cy = (window.innerHeight/2 - pan.y) / zoom;
    const id = 'shape-' + nextId.current++;
    const shapeData = {
      circle:   { color: '#f5c2e7' },
      square:   { color: '#89dceb' },
      triangle: { color: '#a6e3a1' },
      diamond:  { color: '#f9e2af' },
      pentagon: { color: '#fab387' },
      hexagon:  { color: '#b4befe' },
      octagon:  { color: '#f38ba8' },
      decagon:  { color: '#94e2d5' },
    };
    const shape = shapeData[shapeType] || { color: '#cba6f7' };
    setCards(prev => [...prev, {
      id, type: 'shape',
      title: shapeType.charAt(0).toUpperCase() + shapeType.slice(1),
      content: '',
      x: cx - 110, y: cy - 110, w: 220, h: 220,
      shapeType, shapeColor: shape.color, editing: false
    }]);
    setSelected(id);
    setShowShapeMenu(false);
  }, [pan, zoom]);

  const deleteCard = useCallback((id) => {
    historyRef.current = [...historyRef.current.slice(-49), {
      cards: cards.map(c => ({...c})),
      connections: connections.map(c => ({...c})),
    }];
    setCards(prev => {
      const remaining = prev.filter(c => c.id !== id);
      const stackGroups = {};
      remaining.forEach(c => { if (c.stackId) { (stackGroups[c.stackId] = stackGroups[c.stackId] || []).push(c); } });
      return remaining.map(c => {
        if (!c.stackId) return c;
        const grp = stackGroups[c.stackId];
        if (!grp || grp.length <= 1) return { ...c, stackId: null, stackOrder: null };
        const sorted = [...grp].sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
        const newOrder = sorted.findIndex(s => s.id === c.id);
        return newOrder >= 0 ? { ...c, stackOrder: newOrder } : c;
      });
    });
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
    if (selected === id) setSelected(null);
  }, [selected, cards, connections]);

  const unstackCard = useCallback((id) => {
    setCards(prev => {
      const card = prev.find(c => c.id === id);
      if (!card || !card.stackId) return prev;
      const stackMates = prev.filter(c => c.stackId === card.stackId && c.id !== id)
                             .sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
      return prev.map(c => {
        if (c.id === id) {
          return { ...c, stackId: null, stackOrder: null, x: c.x + 36, y: c.y - 36 };
        }
        const ri = stackMates.findIndex(r => r.id === c.id);
        if (ri >= 0) {
          if (stackMates.length === 1) {
            return { ...c, stackId: null, stackOrder: null };
          }
          return { ...c, stackOrder: ri };
        }
        return c;
      });
    });
  }, []);

  const bringToFront = useCallback((stackId, cardId) => {
    setCards(prev => {
      const members = prev.filter(c => c.stackId === stackId)
                          .sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
      const newOrders = {};
      members.filter(c => c.id !== cardId).forEach((c, i) => { newOrders[c.id] = i; });
      newOrders[cardId] = members.length - 1;
      return prev.map(c => c.stackId === stackId ? { ...c, stackOrder: newOrders[c.id] } : c);
    });
  }, []);

  const updateCard = useCallback((id, updates) => {
    setCards(prev => prev.map(c => c.id === id ? {...c, ...updates} : c));
  }, []);

  const updateConn = useCallback((id, updates) => {
    setConnections(prev => prev.map(c => c.id === id ? {...c, ...updates} : c));
  }, []);

  const deleteConn = useCallback((id) => {
    historyRef.current = [...historyRef.current.slice(-49), {
      cards: cards.map(c => ({...c})),
      connections: connections.map(c => ({...c})),
    }];
    setConnections(prev => prev.filter(c => c.id !== id));
    setSelectedConn(null);
  }, [cards, connections]);

  // Canvas file drop handlers
  const handleCanvasDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const hasFile = e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-obsidia-file');
    const isWaypoint = e.dataTransfer.types.includes('application/x-obsidia-waypoint');
    if (hasFile) { e.dataTransfer.dropEffect = 'copy'; setIsDragOver(true); }
    else if (isWaypoint) { e.dataTransfer.dropEffect = 'copy'; }
  }, []);

  const handleCanvasDragLeave = useCallback((e) => {
    if (!containerRef.current?.contains(e.relatedTarget)) setIsDragOver(false);
  }, []);

  const handleCanvasDrop = useCallback(async (e) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const baseX = (e.clientX - rect.left - pan.x) / zoom;
    const baseY = (e.clientY - rect.top  - pan.y) / zoom;

    // Case 0: Waypoint chip
    if (e.dataTransfer.getData('application/x-obsidia-waypoint') === 'true') {
      const id = 'wp-' + nextId.current++;
      const wpCount = cardsRef.current.filter(c => c.type === 'waypoint').length;
      setCards(prev => [...prev, {
        id, type: 'waypoint', title: 'Waypoint ' + (wpCount + 1),
        x: baseX, y: baseY, w: 0, h: 0,
      }]);
      setSelected(id);
      return;
    }

    // Case 1: OS filesystem files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const id = 'card-' + nextId.current++;
        const wx = baseX - 130 + i * 28;
        const wy = baseY - 40  + i * 28;

        if (file.type.startsWith('image/')) {
          const mediaSrc = URL.createObjectURL(file);
          await new Promise(res => {
            const img = new Image();
            img.onload = () => {
              const maxW = 480, maxH = 400;
              let w = img.naturalWidth || maxW, h = img.naturalHeight || maxH;
              if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
              if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
              setCards(prev => [...prev, {
                id, type: 'media', mediaType: 'image',
                mediaSrc, fileName: file.name, title: file.name,
                x: wx, y: wy, w, h,
              }]);
              res();
            };
            img.onerror = () => {
              setCards(prev => [...prev, { id, type: 'media', mediaType: 'image', mediaSrc, fileName: file.name, title: file.name, x: wx, y: wy, w: 320, h: 240 }]);
              res();
            };
            img.src = mediaSrc;
          });
          setSelected(id);
          continue;
        }

        if (file.type.startsWith('video/')) {
          const mediaSrc = URL.createObjectURL(file);
          setCards(prev => [...prev, {
            id, type: 'media', mediaType: 'video',
            mediaSrc, fileName: file.name, title: file.name,
            x: wx, y: wy, w: 480, h: 270,
          }]);
          setSelected(id);
          continue;
        }

        const isText = /\.(md|txt|markdown)$/i.test(file.name);
        const content = isText ? await file.text() : '';
        const title   = file.name.replace(/\.(md|txt|markdown)$/i, '');
        setCards(prev => [...prev, {
          id, type: 'notecard', title, content,
          parentId: null, collapsed: false, editing: false, editingTitle: false,
          x: wx, y: wy, w: 280, h: 'auto'
        }]);
        setSelected(id);
      }
      return;
    }

    // Case 2: Sidebar vault file
    const vaultPath = e.dataTransfer.getData('application/x-obsidia-file');
    if (!vaultPath) return;
    const allFiles = getAllFiles(tree);
    const entry    = allFiles.find(f => f.path === vaultPath);
    if (!entry) return;

    if (entry.mediaType) {
      const id   = 'card-' + nextId.current++;
      const file = await entry.handle.getFile();
      const mediaSrc = URL.createObjectURL(file);
      if (entry.mediaType === 'image') {
        await new Promise(res => {
          const img = new Image();
          img.onload = () => {
            const maxW = 480, maxH = 400;
            let w = img.naturalWidth || maxW, h = img.naturalHeight || maxH;
            if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
            if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
            setCards(prev => [...prev, { id, type: 'media', mediaType: 'image', mediaSrc, fileName: entry.name, filePath: entry.path, title: entry.name, x: baseX - w/2, y: baseY - h/2, w, h }]);
            res();
          };
          img.onerror = () => { setCards(prev => [...prev, { id, type: 'media', mediaType: 'image', mediaSrc, fileName: entry.name, filePath: entry.path, title: entry.name, x: baseX - 160, y: baseY - 120, w: 320, h: 240 }]); res(); };
          img.src = mediaSrc;
        });
      } else {
        setCards(prev => [...prev, { id, type: 'media', mediaType: 'video', mediaSrc, fileName: entry.name, filePath: entry.path, title: entry.name, x: baseX - 240, y: baseY - 135, w: 480, h: 270 }]);
      }
      setSelected(id);
      return;
    }

    if (!vaultPath.endsWith('.md')) return;
    const cardId = 'note-' + entry.path;
    if (cards.find(c => c.id === cardId)) { setSelected(cardId); return; }
    const raw     = fileContents[entry.path] || '';
    const preview = raw.substring(0, 200) + (raw.length > 200 ? '...' : '');
    setCards(prev => [...prev, {
      id: cardId, type: 'note',
      title: entry.name.replace('.md', ''),
      content: preview,
      x: baseX - 140, y: baseY - 110, w: 280, h: 220,
      notePath: entry.path, entry
    }]);
    setSelected(cardId);
  }, [pan, zoom, tree, fileContents, cards]);

  // Pan handling
  const handleContainerDown = useCallback((e) => {
    if (e.target === containerRef.current || e.target.classList.contains('ob-canvas-world')) {
      setIsPanning(true); setSelected(null); setSelectedConn(null);
      setOpenStackMenu(null); setShowWaypointPanel(false);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleContainerMove = useCallback((e) => {
    if (isPanning) {
      setPan({ x: panStart.current.panX + (e.clientX - panStart.current.x), y: panStart.current.panY + (e.clientY - panStart.current.y) });
    }
    if (resizeStart.current) {
      const { id, corner, startX, startY, cardX, cardY, cardW, cardH } = resizeStart.current;
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;
      let newX = cardX, newY = cardY, newW = cardW, newH = cardH;
      if (corner.includes('e')) newW = Math.max(180, cardW + dx);
      if (corner.includes('s')) newH = Math.max(60, cardH + dy);
      if (corner.includes('w')) { newW = Math.max(180, cardW - dx); newX = cardX + cardW - newW; }
      if (corner.includes('n')) { newH = Math.max(60, cardH - dy); newY = cardY + cardH - newH; }
      updateCard(id, { x: newX, y: newY, w: newW, h: newH });
      return;
    }
    if (dragStart.current) {
      const { id, startX, startY, cardX, cardY, stackGroup } = dragStart.current;
      const dx = (e.clientX - startX) / zoom, dy = (e.clientY - startY) / zoom;
      if (stackGroup) {
        setCards(prev => prev.map(c => {
          const sg = stackGroup.find(s => s.id === c.id);
          return sg ? { ...c, x: sg.x + dx, y: sg.y + dy } : c;
        }));
      } else {
        updateCard(id, { x: cardX + dx, y: cardY + dy });
      }
    }
  }, [isPanning, zoom, updateCard]);

  const handleContainerUp = useCallback(() => {
    setIsPanning(false);
    dragStart.current = null;
    resizeStart.current = null;
    if (connectingFrom) setConnectingFrom(null);

    if (draggingCardId && stackTarget) {
      setCards(prev => {
        const dragged = prev.find(c => c.id === draggingCardId);
        const target  = prev.find(c => c.id === stackTarget);
        if (!dragged || !target) return prev;
        if (dragged.stackId && dragged.stackId === target.stackId) return prev;
        const newStackId = target.stackId || ('stack-' + dragged.id + '-' + target.id);
        const draggedStackIds = dragged.stackId
          ? prev.filter(c => c.stackId === dragged.stackId).map(c => c.id)
          : [dragged.id];
        const destinationCards = prev.filter(c =>
          c.stackId === newStackId && !draggedStackIds.includes(c.id)
        );
        let nextOrder = target.stackId
          ? (destinationCards.length > 0 ? Math.max(...destinationCards.map(c => c.stackOrder ?? 0)) + 1 : 0)
          : 1;
        return prev.map(c => {
          if (c.id === target.id && !c.stackId) {
            return { ...c, stackId: newStackId, stackOrder: 0 };
          }
          if (draggedStackIds.includes(c.id)) {
            const order = nextOrder++;
            return { ...c, stackId: newStackId, stackOrder: order, x: target.x, y: target.y };
          }
          return c;
        });
      });
      setSelected(null);
    }
    setDraggingCardId(null);
    setStackTarget(null);
  }, [connectingFrom, draggingCardId, stackTarget]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.max(0.15, Math.min(4, zoom * delta));
    const r = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    setPan(prev => ({ x: cx - (cx - prev.x) * (newZoom / zoom), y: cy - (cy - prev.y) * (newZoom / zoom) }));
    setZoom(newZoom);
  }, [zoom]);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Close shape menu when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (showShapeMenu && !e.target.closest('.ob-shape-menu') && !e.target.textContent.includes('Shapes')) {
        setShowShapeMenu(false);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [showShapeMenu]);

  // Delete key + Ctrl+Z
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) { deleteCard(selected); return; }
        if (selectedConn) { deleteConn(selectedConn); return; }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        const snapshot = historyRef.current.pop();
        if (snapshot) {
          setCards(snapshot.cards);
          setConnections(snapshot.connections);
          setSelected(null);
          setSelectedConn(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, selectedConn, deleteCard, deleteConn]);

  const handleCardDown = useCallback((e, card) => {
    e.stopPropagation();
    setSelected(card.id);
    setSelectedConn(null);
    if (connectingFrom) {
      if (connectingFrom !== card.id) {
        setConnections(prev => {
          if (prev.find(c => c.from === connectingFrom && c.to === card.id)) return prev;
          return [...prev, { id: 'conn-' + nextId.current++, from: connectingFrom, to: card.id, color: '#cba6f7', strokeWidth: 2 }];
        });
      }
      setConnectingFrom(null);
    } else {
      if (card.stackId && openStackMenu === card.stackId) {
        setOpenStackMenu(null);
      }
      const stackGroup = card.stackId
        ? cardsRef.current.filter(c => c.stackId === card.stackId).map(c => ({ id: c.id, x: c.x, y: c.y }))
        : null;
      dragStart.current = { id: card.id, startX: e.clientX, startY: e.clientY, cardX: card.x, cardY: card.y, stackGroup };
      if (card.type === 'notecard') setDraggingCardId(card.id);
    }
  }, [connectingFrom, openStackMenu]);

  // SVG connections
  const svgConnections = useMemo(() => {
    return connections.map((conn, i) => {
      const from = cards.find(c => c.id === conn.from);
      const to = cards.find(c => c.id === conn.to);
      if (!from || !to) return null;
      const x1 = from.x + from.w/2, y1 = from.y + from.h/2;
      const x2 = to.x + to.w/2, y2 = to.y + to.h/2;
      const ang = Math.atan2(y2-y1, x2-x1);
      const ex = x2 - Math.cos(ang)*20, ey = y2 - Math.sin(ang)*20;
      const color = conn.color || '#cba6f7';
      const sw = conn.strokeWidth || 2;
      const isSel = selectedConn === conn.id;
      const handleClick = (e) => {
        e.stopPropagation();
        setSelectedConn(isSel ? null : conn.id);
        setConnPopupPos({ x: e.clientX, y: e.clientY });
      };
      return (
        <g key={conn.id || i}>
          <line x1={x1} y1={y1} x2={ex} y2={ey} stroke="transparent" strokeWidth={16}
            style={{pointerEvents:'all', cursor:'pointer'}} onClick={handleClick} />
          {isSel && <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color} strokeWidth={sw + 6} strokeOpacity={0.25} />}
          <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color} strokeWidth={sw}
            strokeDasharray={isSel ? '8 4' : undefined} />
          <polygon
            points={`${ex},${ey} ${ex-10*Math.cos(ang-0.35)},${ey-10*Math.sin(ang-0.35)} ${ex-10*Math.cos(ang+0.35)},${ey-10*Math.sin(ang+0.35)}`}
            fill={color} />
        </g>
      );
    });
  }, [connections, cards, selectedConn]);

  return (
    <div
      ref={containerRef}
      className={`ob-canvas-container ${isPanning ? 'ob-grabbing' : ''}`}
      data-theme={canvasTheme}
      onMouseDown={handleContainerDown}
      onMouseMove={handleContainerMove}
      onMouseUp={handleContainerUp}
      onMouseLeave={handleContainerUp}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
    >
      {isDragOver && (
        <div className="ob-canvas-drop-overlay">
          <span>{'\uD83D\uDCC4'} Drop to open as card</span>
        </div>
      )}

      {/* Grid */}
      <svg style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none'}}>
        <defs>
          <pattern id="ob-grid" width={40*zoom} height={40*zoom} patternUnits="userSpaceOnUse" x={pan.x % (40*zoom)} y={pan.y % (40*zoom)}>
            <circle cx="1" cy="1" r="1" fill="var(--ob-grid-dot)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ob-grid)" />
      </svg>

      {/* Toolbar */}
      <div className="ob-canvas-toolbar">
        <button onClick={addCanvasNote}>{'\u2795'} Note Card</button>
        <button ref={shapeBtnRef} onClick={() => {
            const r = shapeBtnRef.current.getBoundingClientRect();
            const menuW = 296;
            const rawLeft = r.left + r.width / 2 - menuW / 2;
            const clampedLeft = Math.max(8, Math.min(window.innerWidth - menuW - 8, rawLeft));
            setMenuPos({ top: r.bottom + 8, left: clampedLeft });
            setShowShapeMenu(prev => !prev);
          }}>
          {'\u2727'} Shapes
        </button>
        {showShapeMenu && (
          <div className="ob-shape-menu" style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}>
            {[
              { type: 'circle',   label: 'Circle',   color: '#f5c2e7' },
              { type: 'square',   label: 'Square',   color: '#89dceb' },
              { type: 'triangle', label: 'Triangle', color: '#a6e3a1' },
              { type: 'diamond',  label: 'Diamond',  color: '#f9e2af' },
              { type: 'pentagon', label: 'Pentagon', color: '#fab387' },
              { type: 'hexagon',  label: 'Hexagon',  color: '#b4befe' },
              { type: 'octagon',  label: 'Octagon',  color: '#f38ba8' },
              { type: 'decagon',  label: 'Decagon',  color: '#94e2d5' },
            ].map(s => (
              <button key={s.type} onClick={() => addShape(s.type)} title={s.label}>
                <ShapeMenuIcon type={s.type} color={s.color} size={32} />
                <span style={{color: s.color}}>{s.label}</span>
              </button>
            ))}
          </div>
        )}
        {selected && <button onClick={() => setConnectingFrom(selected)} style={connectingFrom ? {background:'var(--ob-accent-dim)',color:'var(--ob-accent)'} : {}}>{'\u2194'} Connect</button>}
        {selected && <button onClick={() => deleteCard(selected)} style={{color:'var(--ob-red)'}}>{'\uD83D\uDDD1'} Delete</button>}
        {saveIndicator && <span style={{fontSize:11,color:'var(--ob-green)',padding:'4px 8px'}}>{'\u2713'} Saved</span>}
        <div style={{width:1,background:'rgba(255,255,255,0.1)',margin:'0 4px',alignSelf:'stretch'}} />
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <div
            className="ob-waypoint-drag-chip"
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('application/x-obsidia-waypoint', 'true');
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title="Drag onto canvas to place a waypoint"
          >
            {'\uD83D\uDCCD'}
          </div>
          {cards.filter(c => c.type === 'waypoint').length > 0 && (
            <div style={{position:'relative'}}>
              <button ref={waypointBtnRef} onClick={() => setShowWaypointPanel(p => !p)}
                title="Navigate to waypoint"
                style={showWaypointPanel ? {background:'var(--ob-accent-dim)',color:'var(--ob-accent)',fontSize:11,padding:'4px 7px'} : {fontSize:11,padding:'4px 7px'}}>
                {'\u25BE'} {cards.filter(c => c.type === 'waypoint').length}
              </button>
              {showWaypointPanel && (() => {
                const waypoints = cards.filter(c => c.type === 'waypoint');
                const btnR = waypointBtnRef.current?.getBoundingClientRect();
                return (
                  <div className="ob-waypoint-panel" style={{position:'fixed', top: btnR ? btnR.bottom + 8 : 60, left: btnR ? Math.max(8, btnR.left - 140) : 8}}
                    onMouseDown={e => e.stopPropagation()}>
                    <div style={{fontSize:10,fontWeight:700,color:'var(--ob-text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>Go to waypoint</div>
                    {waypoints.map(wp => (
                      <div key={wp.id} className="ob-waypoint-panel-item" onClick={() => navigateToWaypoint(wp)}>
                        <span style={{fontSize:13}}>{'\uD83D\uDCCD'}</span>
                        <span style={{flex:1}}>{wp.title || 'Waypoint'}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <button onClick={onToggleTheme} title={canvasTheme==='dark'?'Switch to Light Mode':'Switch to Dark Mode'} style={{fontSize:14}}>
          {canvasTheme === 'dark' ? '\u2600\uFE0F Light' : '\uD83C\uDF19 Dark'}
        </button>
      </div>

      {/* World */}
      <div className="ob-canvas-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg style={{position:'absolute', top:0, left:0, width:'10000px', height:'10000px', pointerEvents:'none', overflow:'visible'}}>
          {svgConnections}
        </svg>

        {(() => {
          const draggingCard = draggingCardId ? cards.find(c => c.id === draggingCardId) : null;
          const draggingStackId = draggingCard?.stackId || null;
          const stackMaxOrder = {};
          const stackCount = {};
          cards.forEach(c => {
            if (c.stackId) {
              stackMaxOrder[c.stackId] = Math.max(stackMaxOrder[c.stackId] ?? 0, c.stackOrder ?? 0);
              stackCount[c.stackId] = (stackCount[c.stackId] || 0) + 1;
            }
          });

          return cards.filter(c => !c.parentId && c.type !== 'waypoint').map(card => {
            const isDraggingThis   = draggingCardId === card.id;
            const isInDraggingStack = !isDraggingThis && draggingStackId && card.stackId === draggingStackId;
            const isStackTgt       = stackTarget === card.id;
            const canStack         = draggingCardId &&
                                     !isDraggingThis &&
                                     !isInDraggingStack &&
                                     card.type === 'notecard' &&
                                     !(draggingStackId && card.stackId === draggingStackId);

            const maxOrder   = card.stackId ? (stackMaxOrder[card.stackId] ?? 0) : 0;
            const myOrder    = card.stackOrder ?? 0;
            const isTopCard  = card.stackId && myOrder === maxOrder;

            let visualX = card.x, visualY = card.y;
            if (card.stackId) {
              const peekOffset = (maxOrder - myOrder) * 6;
              visualX = card.x + peekOffset;
              visualY = card.y + peekOffset;
            }
            const stackZ = card.stackId ? myOrder + 1 : 'auto';

            const stackMembers = (isTopCard && card.stackId)
              ? cards.filter(c => c.stackId === card.stackId).sort((a, b) => (b.stackOrder ?? 0) - (a.stackOrder ?? 0))
              : [];

            return (
            <Fragment key={card.id}>
            <div
              className={[
                'ob-canvas-card', `ob-${card.type}-card`,
                selected === card.id ? 'ob-selected' : '',
                (isDraggingThis || isInDraggingStack) ? 'ob-dragging-notecard' : '',
                isStackTgt ? 'ob-stack-target' : '',
                card.stackId ? 'ob-stacked-card' : '',
              ].filter(Boolean).join(' ')}
              data-shape-type={card.shapeType}
              style={{
                left: visualX, top: visualY,
                width: card.w,
                height: (card.h && card.h !== 'auto') ? card.h : 'auto',
                position: 'absolute',
                zIndex: stackZ,
                overflow: (card.h && card.h !== 'auto') ? 'hidden' : undefined,
              }}
              onMouseDown={e => handleCardDown(e, card)}
              onMouseEnter={() => { if (canStack) setStackTarget(card.id); }}
              onMouseLeave={() => { if (stackTarget === card.id) setStackTarget(null); }}
              onDoubleClick={() => {
                if (card.type === 'note' && card.entry && onOpenFile) onOpenFile(card.entry);
              }}
            >
              {isStackTgt && <div className="ob-stack-drop-hint">Drop to stack</div>}
              {isTopCard && !draggingCardId && (
                <button
                  className={`ob-stack-fan-btn${openStackMenu === card.stackId ? ' ob-expanded' : ''}`}
                  title={openStackMenu === card.stackId ? 'Close stack list' : 'Show stack list'}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    setOpenStackMenu(prev => prev === card.stackId ? null : card.stackId);
                  }}
                >
                  {'\u229E'} {stackCount[card.stackId]}
                </button>
              )}
              {['nw','ne','sw','se'].map(corner => (
                <div
                  key={corner}
                  className={`ob-resize-handle ob-resize-${corner}`}
                  onMouseDown={e => {
                    e.stopPropagation();
                    const cardEl = e.currentTarget.closest('.ob-canvas-card');
                    const renderedH = cardEl ? cardEl.getBoundingClientRect().height / zoom : (card.h || 120);
                    const cardH = (card.h === 'auto' || !card.h) ? renderedH : card.h;
                    resizeStart.current = {
                      id: card.id, corner,
                      startX: e.clientX, startY: e.clientY,
                      cardX: card.x, cardY: card.y,
                      cardW: card.w, cardH
                    };
                    setSelected(card.id);
                  }}
                />
              ))}
              {card.type === 'notecard' ? (
                <>
                  {card.stackId && selected === card.id && (
                    <button
                      className="ob-stack-pop-btn"
                      title="Pop out of stack"
                      onClick={e => { e.stopPropagation(); unstackCard(card.id); }}
                    >{'\u2197'} Pop</button>
                  )}
                  <NoteCardContent
                    cardId={card.id}
                    allCards={cards}
                    updateCard={updateCard}
                    deleteCard={deleteCard}
                  />
                </>
              ) : card.type === 'media' ? (
                card.mediaSrc ? (
                  card.mediaType === 'video'
                    ? <>
                        <div
                          style={{position:'absolute',top:0,left:0,right:0,height:22,zIndex:6,cursor:'move',
                            background:'linear-gradient(to bottom,rgba(0,0,0,0.45),transparent)',
                            borderRadius:'8px 8px 0 0', display:'flex', alignItems:'center', paddingLeft:8}}
                          onMouseDown={e => { e.stopPropagation(); handleCardDown(e, card); }}
                        >
                          <span style={{color:'rgba(255,255,255,0.55)',fontSize:11,letterSpacing:2,userSelect:'none'}}>{'\u2A2F\u2A2F'}</span>
                        </div>
                        <video className="ob-media-fill" src={card.mediaSrc} controls />
                      </>
                    : <img className="ob-media-fill" src={card.mediaSrc} alt={card.fileName || card.title} draggable={false} />
                ) : (
                  <div className="ob-media-placeholder">
                    <span style={{fontSize:28}}>{card.mediaType === 'video' ? '\uD83C\uDFA5' : '\uD83D\uDDBC\uFE0F'}</span>
                    <span>{card.fileName || 'Media'}</span>
                    <span style={{fontSize:10,color:'var(--ob-text-muted)'}}>Re-drop file to restore</span>
                  </div>
                )
              ) : (
                <>
                  <div className="ob-canvas-card-header">
                    <span>{card.title}</span>
                    <div className="ob-card-actions">
                      {card.stackId && <button onClick={e => { e.stopPropagation(); unstackCard(card.id); }} title="Pop out of stack" style={{fontSize:10,padding:'1px 4px'}}>{'\u2197'}</button>}
                      <button onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }}>{'\u2715'}</button>
                    </div>
                  </div>
                  <div className="ob-canvas-card-body">
                    {card.type === 'shape' ? (
                      <ShapeRenderer card={card}
                        onEdit={() => updateCard(card.id, {editing: true})}
                        onEndEdit={() => updateCard(card.id, {editing: false})}
                        onChange={v => updateCard(card.id, {content: v})} />
                    ) : (
                      <div
                        className="ob-md-preview"
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(fileContents[card.notePath] || card.content || '*No content*')
                        }}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
            {isTopCard && !draggingCardId && openStackMenu === card.stackId && (
              <div
                className="ob-stack-dropdown"
                style={{
                  position: 'absolute',
                  left: visualX + (card.w || 260) / 2,
                  top: visualY + (typeof card.h === 'number' ? card.h : 120) + 30,
                  transform: 'translateX(-50%)',
                  zIndex: 500,
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                <div className="ob-stack-dropdown-title">Stack — {stackMembers.length} cards</div>
                {stackMembers.map((m, idx) => (
                  <div
                    key={m.id}
                    className={`ob-stack-dropdown-item${m.id === card.id ? ' ob-current' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      bringToFront(card.stackId, m.id);
                      setOpenStackMenu(null);
                    }}
                  >
                    <span className="ob-stack-item-num">{idx + 1}</span>
                    <span className="ob-stack-item-title">{m.title || m.fileName || 'Untitled'}</span>
                    {m.id === card.id && <span className="ob-stack-item-badge">top</span>}
                  </div>
                ))}
              </div>
            )}
            </Fragment>
            );
          });
        })()}

        {/* Waypoints */}
        {cards.filter(c => c.type === 'waypoint').map(wp => (
          <div
            key={wp.id}
            style={{ position: 'absolute', left: wp.x, top: wp.y, width: 0, height: 0, zIndex: 60 }}
          >
            <div
              className={`ob-waypoint-orb${selected === wp.id ? ' ob-wp-selected' : ''}`}
              onMouseDown={e => { e.stopPropagation(); handleCardDown(e, wp); }}
              title={wp.title}
            />
            {selected === wp.id ? (
              <input
                className="ob-waypoint-label-input"
                defaultValue={wp.title}
                onMouseDown={e => e.stopPropagation()}
                onBlur={e => updateCard(wp.id, { title: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); }}
                autoFocus
              />
            ) : (
              <div className="ob-waypoint-label">{wp.title}</div>
            )}
          </div>
        ))}
      </div>

      {/* Off-screen waypoint arrows */}
      {(() => {
        const el = containerRef.current;
        if (!el) return null;
        const vw = el.clientWidth;
        const vh = el.clientHeight;
        const pad = 38;
        const waypoints = cards.filter(c => c.type === 'waypoint');
        return waypoints.map(wp => {
          const sx = pan.x + wp.x * zoom;
          const sy = pan.y + wp.y * zoom;
          const onScreen = sx >= -pad && sx <= vw + pad && sy >= -pad && sy <= vh + pad;
          if (onScreen) return null;
          const cx = Math.max(pad, Math.min(vw - pad, sx));
          const cy = Math.max(pad, Math.min(vh - pad, sy));
          const angle = Math.atan2(sy - cy, sx - cx) * 180 / Math.PI;
          return (
            <div
              key={`off-${wp.id}`}
              onClick={() => navigateToWaypoint(wp)}
              title={`Go to: ${wp.title}`}
              style={{
                position: 'absolute', left: cx, top: cy,
                transform: 'translate(-50%, -50%)',
                zIndex: 55, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                pointerEvents: 'all',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--ob-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#1e1e2e', fontWeight: 900,
                boxShadow: '0 0 0 3px rgba(203,166,247,0.3), 0 2px 10px rgba(0,0,0,0.5)',
                transform: `rotate(${angle}deg)`,
                transition: 'transform 0.15s',
              }}>{'\u25B6'}</div>
              <div style={{
                fontSize: 9, fontWeight: 700, color: 'var(--ob-accent)',
                background: 'rgba(30,30,46,0.9)',
                border: '1px solid rgba(203,166,247,0.3)',
                borderRadius: 4, padding: '1px 5px',
                whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{wp.title}</div>
            </div>
          );
        });
      })()}

      {/* Connection editor popup */}
      {selectedConn !== null && (() => {
        const conn = connections.find(c => c.id === selectedConn);
        if (!conn) return null;
        const COLORS = ['#cba6f7','#89b4fa','#a6e3a1','#f9e2af','#fab387','#f38ba8','#94e2d5','#f5c2e7','#ffffff','#6c7086'];
        const WIDTHS = [1, 2, 4, 6];
        const px = Math.min(connPopupPos.x, window.innerWidth - 220);
        const py = connPopupPos.y > window.innerHeight - 200 ? connPopupPos.y - 180 : connPopupPos.y + 16;
        return (
          <div className="ob-conn-editor" style={{ position: 'fixed', left: px, top: py }}
            onMouseDown={e => e.stopPropagation()}>
            <div className="ob-conn-editor-label">Line Color</div>
            <div className="ob-conn-editor-colors">
              {COLORS.map(c => (
                <div key={c} className={`ob-conn-color-swatch${conn.color === c ? ' ob-active' : ''}`}
                  style={{ background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px rgba(0,0,0,0.2)' : undefined }}
                  onClick={() => updateConn(selectedConn, { color: c })} />
              ))}
            </div>
            <div className="ob-conn-editor-label" style={{marginTop:2}}>Line Width</div>
            <div className="ob-conn-editor-widths">
              {WIDTHS.map(w => (
                <button key={w} className={`ob-conn-width-btn${conn.strokeWidth === w ? ' ob-active' : ''}`}
                  onClick={() => updateConn(selectedConn, { strokeWidth: w })} title={`${w}px`}>
                  <div style={{ width: 32, height: w * 2 + 2, background: conn.color || '#cba6f7', borderRadius: 2 }} />
                </button>
              ))}
            </div>
            <div className="ob-conn-editor-divider" />
            <button className="ob-conn-delete-btn" onClick={() => deleteConn(selectedConn)}>
              {'\uD83D\uDDD1'} Delete connection
            </button>
          </div>
        );
      })()}

      {/* Zoom controls */}
      <div className="ob-canvas-zoom">
        <button onClick={() => setZoom(z => Math.max(0.15, z * 0.8))}>-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z * 1.2))}>+</button>
        <button onClick={() => { setZoom(1); setPan({x:0,y:0}); }} style={{fontSize:11,marginLeft:4}}>Reset</button>
      </div>

      {connectingFrom && (
        <div style={{position:'absolute',top:60,left:'50%',transform:'translateX(-50%)',background:'var(--ob-accent-dim)',border:'1px solid var(--ob-accent)',borderRadius:8,padding:'8px 16px',fontSize:12,color:'var(--ob-accent)',zIndex:20}}>
          Click another card to connect, or click empty space to cancel
        </div>
      )}
    </div>
  );
}
