/**
 * DXF Parser for Pen Plotter CNC
 * Converts 2D CAD DXF files (LINE, LWPOLYLINE, CIRCLE, ARC) into SVG vector paths.
 */

export class DXFHandler {
  static parse(dxfText) {
    const lines = dxfText.split(/\r?\n/);
    const paths = [];

    let inEntities = false;
    let currentEntity = null;
    let code = null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < lines.length - 1; i += 2) {
      code = parseInt(lines[i].trim(), 10);
      const val = lines[i + 1].trim();

      if (code === 0) {
        if (val === 'SECTION') {
          // Check section name in next line
          if (lines[i + 3] && lines[i + 3].trim() === 'ENTITIES') {
            inEntities = true;
          }
        } else if (val === 'ENDSEC') {
          inEntities = false;
        }

        if (inEntities) {
          // Process completed entity
          if (currentEntity) {
            const p = DXFHandler.entityToPath(currentEntity);
            if (p) paths.push(p);
          }
          currentEntity = { type: val, vertices: [] };
        }
        continue;
      }

      if (inEntities && currentEntity) {
        if (code === 10) currentEntity.x1 = parseFloat(val);
        else if (code === 20) currentEntity.y1 = parseFloat(val);
        else if (code === 11) currentEntity.x2 = parseFloat(val);
        else if (code === 21) currentEntity.y2 = parseFloat(val);
        else if (code === 40) currentEntity.radius = parseFloat(val);
        else if (code === 50) currentEntity.startAngle = parseFloat(val);
        else if (code === 51) currentEntity.endAngle = parseFloat(val);
        else if (code === 70) currentEntity.closed = (parseInt(val, 10) & 1) === 1;
        // Vertex points for lwpolyline
        if (code === 10 && currentEntity.type === 'LWPOLYLINE') {
          currentEntity.vertices.push({ x: parseFloat(val), y: 0 });
        } else if (code === 20 && currentEntity.type === 'LWPOLYLINE' && currentEntity.vertices.length > 0) {
          currentEntity.vertices[currentEntity.vertices.length - 1].y = parseFloat(val);
        }
      }
    }

    if (currentEntity) {
      const p = DXFHandler.entityToPath(currentEntity);
      if (p) paths.push(p);
    }

    return paths.join(' ');
  }

  static entityToPath(ent) {
    if (ent.type === 'LINE') {
      if (ent.x1 !== undefined && ent.y1 !== undefined && ent.x2 !== undefined && ent.y2 !== undefined) {
        return `M ${ent.x1.toFixed(2)} ${ent.y1.toFixed(2)} L ${ent.x2.toFixed(2)} ${ent.y2.toFixed(2)}`;
      }
    } else if (ent.type === 'LWPOLYLINE' && ent.vertices.length > 1) {
      let cmd = `M ${ent.vertices[0].x.toFixed(2)} ${ent.vertices[0].y.toFixed(2)}`;
      for (let i = 1; i < ent.vertices.length; i++) {
        cmd += ` L ${ent.vertices[i].x.toFixed(2)} ${ent.vertices[i].y.toFixed(2)}`;
      }
      if (ent.closed) cmd += ' Z';
      return cmd;
    } else if (ent.type === 'CIRCLE') {
      const cx = ent.x1 || 0;
      const cy = ent.y1 || 0;
      const r = ent.radius || 10;
      return `M ${(cx - r).toFixed(2)} ${cy.toFixed(2)} A ${r} ${r} 0 1 0 ${(cx + r).toFixed(2)} ${cy.toFixed(2)} A ${r} ${r} 0 1 0 ${(cx - r).toFixed(2)} ${cy.toFixed(2)}`;
    } else if (ent.type === 'ARC') {
      const cx = ent.x1 || 0;
      const cy = ent.y1 || 0;
      const r = ent.radius || 10;
      const startRad = ((ent.startAngle || 0) * Math.PI) / 180;
      const endRad = ((ent.endAngle || 360) * Math.PI) / 180;
      const sx = cx + r * Math.cos(startRad);
      const sy = cy + r * Math.sin(startRad);
      const ex = cx + r * Math.cos(endRad);
      const ey = cy + r * Math.sin(endRad);
      const largeArc = Math.abs(endRad - startRad) > Math.PI ? 1 : 0;
      return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
    }
    return null;
  }
}
