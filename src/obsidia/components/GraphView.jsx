import { useRef, useCallback, useEffect } from 'react';
import { getAllFiles, parseWikiLinks } from '../lib/treeHelpers';

function hashStr(s) { let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i)|0; return h; }

export default function GraphView({ tree, fileContents, onOpenFile }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({ nodes: [], edges: [], dragging: null, pan: {x:0,y:0}, zoom: 1, hover: null, mouse: {x:0,y:0} });

  const buildGraph = useCallback(() => {
    const allFiles = getAllFiles(tree).filter(f => f.name.endsWith('.md'));
    const colors = ['#cba6f7','#89b4fa','#a6e3a1','#f9e2af','#fab387','#f38ba8','#94e2d5','#f5c2e7','#89dceb','#b4befe'];
    const nodes = allFiles.map((f, i) => {
      const name = f.name.replace('.md', '');
      const content = fileContents[f.path] || '';
      const folder = f.path.includes('/') ? f.path.split('/')[0] : '(root)';
      const links = parseWikiLinks(content);
      const angle = (2 * Math.PI * i) / Math.max(allFiles.length, 1);
      const radius = 150 + allFiles.length * 15;
      return { id: f.path, name, folder, links, x: 400 + radius * Math.cos(angle), y: 300 + radius * Math.sin(angle), vx: 0, vy: 0, color: colors[Math.abs(hashStr(folder)) % colors.length], entry: f };
    });
    const edges = [];
    for (const n of nodes) {
      for (const link of n.links) {
        const target = nodes.find(t => t.name === link);
        if (target && target.id !== n.id) edges.push({ source: n.id, target: target.id });
      }
    }
    return { nodes, edges };
  }, [tree, fileContents]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;
    const { nodes, edges } = buildGraph();
    s.nodes = nodes; s.edges = edges;

    function resize() { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight; }
    resize(); window.addEventListener('resize', resize);

    function simulate() {
      const N = s.nodes;
      for (let i = 0; i < N.length; i++) {
        for (let j = i+1; j < N.length; j++) {
          let dx = N[j].x - N[i].x, dy = N[j].y - N[i].y;
          let dist = Math.sqrt(dx*dx + dy*dy) || 1;
          let force = 3000 / (dist * dist);
          let fx = (dx/dist)*force, fy = (dy/dist)*force;
          N[i].vx -= fx; N[i].vy -= fy; N[j].vx += fx; N[j].vy += fy;
        }
        N[i].vx += (canvas.width/2 - N[i].x) * 0.001;
        N[i].vy += (canvas.height/2 - N[i].y) * 0.001;
      }
      for (const e of s.edges) {
        const a = N.find(n => n.id === e.source), b = N.find(n => n.id === e.target);
        if (!a || !b) continue;
        let dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx*dx+dy*dy) || 1;
        let force = (dist - 120) * 0.005;
        a.vx += (dx/dist)*force; a.vy += (dy/dist)*force;
        b.vx -= (dx/dist)*force; b.vy -= (dy/dist)*force;
      }
      for (const n of N) {
        if (s.dragging === n) continue;
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#11111b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(s.pan.x, s.pan.y);
      ctx.scale(s.zoom, s.zoom);

      for (const e of s.edges) {
        const a = s.nodes.find(n => n.id === e.source), b = s.nodes.find(n => n.id === e.target);
        if (!a || !b) continue;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(108,112,134,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
        const ang = Math.atan2(b.y-a.y, b.x-a.x);
        const ax = b.x - Math.cos(ang)*14, ay = b.y - Math.sin(ang)*14;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 8*Math.cos(ang-0.4), ay - 8*Math.sin(ang-0.4));
        ctx.lineTo(ax - 8*Math.cos(ang+0.4), ay - 8*Math.sin(ang+0.4));
        ctx.closePath(); ctx.fillStyle = 'rgba(108,112,134,0.4)'; ctx.fill();
      }

      for (const n of s.nodes) {
        const isHover = s.hover === n;
        const linkCount = s.edges.filter(e => e.source === n.id || e.target === n.id).length;
        const radius = 6 + Math.min(linkCount * 2, 12);

        if (isHover) {
          ctx.beginPath(); ctx.arc(n.x, n.y, radius + 8, 0, Math.PI*2);
          ctx.fillStyle = n.color + '22'; ctx.fill();
        }

        ctx.beginPath(); ctx.arc(n.x, n.y, radius, 0, Math.PI*2);
        ctx.fillStyle = isHover ? n.color : n.color + 'cc';
        ctx.fill();
        ctx.strokeStyle = n.color; ctx.lineWidth = isHover ? 2 : 1; ctx.stroke();

        ctx.font = `${isHover ? 'bold ' : ''}12px -apple-system, sans-serif`;
        ctx.fillStyle = isHover ? '#cdd6f4' : '#a6adc8';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(n.name, n.x, n.y + radius + 6);
      }
      ctx.restore();
      simulate();
      animRef.current = requestAnimationFrame(draw);
    }
    animRef.current = requestAnimationFrame(draw);

    function toWorld(cx, cy) { return { x: (cx - s.pan.x)/s.zoom, y: (cy - s.pan.y)/s.zoom }; }
    function findNode(cx, cy) {
      const w = toWorld(cx, cy);
      for (const n of s.nodes) { const d = Math.sqrt((n.x-w.x)**2+(n.y-w.y)**2); if (d < 20) return n; }
      return null;
    }
    let isPanning = false, panStart = {x:0,y:0};
    function onDown(e) {
      const r = canvas.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const node = findNode(cx, cy);
      if (node) { s.dragging = node; canvas.style.cursor = 'grabbing'; }
      else { isPanning = true; panStart = {x: e.clientX - s.pan.x, y: e.clientY - s.pan.y}; canvas.style.cursor = 'grabbing'; }
    }
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      s.mouse = {x:cx, y:cy};
      if (s.dragging) { const w = toWorld(cx,cy); s.dragging.x = w.x; s.dragging.y = w.y; s.dragging.vx = 0; s.dragging.vy = 0; }
      else if (isPanning) { s.pan.x = e.clientX - panStart.x; s.pan.y = e.clientY - panStart.y; }
      else { s.hover = findNode(cx,cy); canvas.style.cursor = s.hover ? 'pointer' : 'grab'; }
    }
    function onUp() {
      if (s.dragging) { canvas.style.cursor = 'grab'; } s.dragging = null; isPanning = false; canvas.style.cursor = 'grab';
    }
    function onDblClick(e) {
      const r = canvas.getBoundingClientRect();
      const node = findNode(e.clientX-r.left, e.clientY-r.top);
      if (node && onOpenFile) onOpenFile(node.entry);
    }
    function onWheel(e) {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, s.zoom * delta));
      s.pan.x = cx - (cx - s.pan.x) * (newZoom / s.zoom);
      s.pan.y = cy - (cy - s.pan.y) * (newZoom / s.zoom);
      s.zoom = newZoom;
    }
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', onWheel, {passive: false});

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onUp);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [buildGraph, onOpenFile]);

  const resetView = () => { const s = stateRef.current; s.pan = {x:0,y:0}; s.zoom = 1; };

  return (
    <div className="ob-graph-container">
      <canvas ref={canvasRef} style={{cursor:'grab'}} />
      <div className="ob-graph-legend">
        <div style={{fontWeight:600, marginBottom:6, color:'var(--ob-text-primary)'}}>Graph View</div>
        <div className="ob-graph-legend-item"><div className="ob-graph-legend-dot" style={{background:'var(--ob-accent)'}} /> Notes</div>
        <div className="ob-graph-legend-item" style={{fontSize:11, color:'var(--ob-text-muted)'}}>Drag nodes to rearrange</div>
        <div className="ob-graph-legend-item" style={{fontSize:11, color:'var(--ob-text-muted)'}}>Double-click to open note</div>
        <div className="ob-graph-legend-item" style={{fontSize:11, color:'var(--ob-text-muted)'}}>Scroll to zoom, drag to pan</div>
      </div>
      <div className="ob-graph-controls">
        <button onClick={resetView} title="Reset view">R</button>
      </div>
    </div>
  );
}
