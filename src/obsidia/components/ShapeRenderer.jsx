import { useMemo, memo } from 'react';

export function ShapeMenuIcon({ type, color, size = 30 }) {
  const c = size / 2, r = c - 2;
  function polyPts(n, startAngle = -Math.PI / 2) {
    return Array.from({ length: n }, (_, i) => {
      const a = startAngle + (2 * Math.PI * i) / n;
      return `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
    }).join(' ');
  }
  const el = useMemo(() => {
    switch (type) {
      case 'circle':   return <circle cx={c} cy={c} r={r} fill={color} />;
      case 'square':   return <rect x={2} y={2} width={size-4} height={size-4} rx={4} fill={color} />;
      case 'triangle': return <polygon points={polyPts(3)} fill={color} />;
      case 'diamond':  return <polygon points={polyPts(4)} fill={color} />;
      case 'pentagon': return <polygon points={polyPts(5)} fill={color} />;
      case 'hexagon':  return <polygon points={polyPts(6, -Math.PI / 6)} fill={color} />;
      case 'octagon':  return <polygon points={polyPts(8, -Math.PI / 8)} fill={color} />;
      case 'decagon':  return <polygon points={polyPts(10)} fill={color} />;
      default: return null;
    }
  }, [type, color, c, r, size]);
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{el}</svg>;
}

function ShapeRenderer({ card, onEdit, onEndEdit, onChange }) {
  const { shapeType, shapeColor, content, editing } = card;
  const vb = 200;
  const c = vb / 2, pad = 14, r = c - pad;

  function polyPts(n, startAngle = -Math.PI / 2) {
    return Array.from({ length: n }, (_, i) => {
      const a = startAngle + (2 * Math.PI * i) / n;
      return `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
    }).join(' ');
  }

  const shapeEl = useMemo(() => {
    const fill = shapeColor;
    switch (shapeType) {
      case 'circle':   return <circle cx={c} cy={c} r={r} fill={fill} />;
      case 'square':   return <rect x={pad} y={pad} width={vb - pad*2} height={vb - pad*2} rx={14} fill={fill} />;
      case 'triangle': return <polygon points={polyPts(3)} fill={fill} />;
      case 'diamond':  return <polygon points={polyPts(4)} fill={fill} />;
      case 'pentagon': return <polygon points={polyPts(5)} fill={fill} />;
      case 'hexagon':  return <polygon points={polyPts(6, -Math.PI / 6)} fill={fill} />;
      case 'octagon':  return <polygon points={polyPts(8, -Math.PI / 8)} fill={fill} />;
      case 'decagon':  return <polygon points={polyPts(10)} fill={fill} />;
      default: return null;
    }
  }, [shapeType, shapeColor, c, r, pad, vb]);

  return (
    <div className="ob-shape-svg-wrap">
      <svg viewBox={`0 0 ${vb} ${vb}`} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        {shapeEl}
      </svg>
      {editing ? (
        <textarea
          className="ob-shape-edit"
          value={content}
          autoFocus
          onMouseDown={e => e.stopPropagation()}
          onChange={e => onChange(e.target.value)}
          onBlur={onEndEdit}
          placeholder="Add text..."
        />
      ) : (
        <div
          className="ob-shape-label"
          onDoubleClick={e => { e.stopPropagation(); onEdit(); }}
        >
          {content || <span style={{opacity:0.45, fontSize:11, color:'rgba(255,255,255,0.7)'}}>Double-click to type</span>}
        </div>
      )}
    </div>
  );
}

export default memo(ShapeRenderer);
