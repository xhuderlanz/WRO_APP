import { DEFAULT_OBSTACLE_SIZE } from "../constants";

export const toRect = (obstacle) => {
    const halfW = (obstacle.width || DEFAULT_OBSTACLE_SIZE.width) / 2;
    const halfH = (obstacle.height || DEFAULT_OBSTACLE_SIZE.height) / 2;
    return {
        left: obstacle.x - halfW,
        right: obstacle.x + halfW,
        top: obstacle.y - halfH,
        bottom: obstacle.y + halfH,
    };
};

export const pointInRect = (point, rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

export const orientation = (p, q, r) => {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < 1e-9) return 0;
    return val > 0 ? 1 : 2;
};

export const onSegment = (p, q, r) => q.x <= Math.max(p.x, r.x) + 1e-9 && q.x + 1e-9 >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) + 1e-9 && q.y + 1e-9 >= Math.min(p.y, r.y);

export const segmentsIntersect = (p1, p2, q1, q2) => {
    const o1 = orientation(p1, p2, q1);
    const o2 = orientation(p1, p2, q2);
    const o3 = orientation(q1, q2, p1);
    const o4 = orientation(q1, q2, p2);

    if (o1 !== o2 && o3 !== o4) return true;

    if (o1 === 0 && onSegment(p1, q1, p2)) return true;
    if (o2 === 0 && onSegment(p1, q2, p2)) return true;
    if (o3 === 0 && onSegment(q1, p1, q2)) return true;
    if (o4 === 0 && onSegment(q1, p2, q2)) return true;

    return false;
};

export const pointInConvexPolygon = (point, polygon) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let sign = null;
    for (let i = 0; i < polygon.length; i += 1) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];
        const d = (point.x - p1.x) * (p2.y - p1.y) - (point.y - p1.y) * (p2.x - p1.x);
        if (Math.abs(d) > 1e-9) {
            const currentSign = d < 0;
            if (sign === null) {
                sign = currentSign;
            } else if (sign !== currentSign) {
                return false;
            }
        }
    }
    return true;
};

export const polygonIntersectsRect = (polygon, rect) => {
    if (!polygon || polygon.length < 3) return false;
    if (polygon.some(pt => pointInRect(pt, rect))) return true;
    const rectPoints = [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.top },
        { x: rect.right, y: rect.bottom },
        { x: rect.left, y: rect.bottom },
    ];
    if (rectPoints.some(pt => pointInConvexPolygon(pt, polygon))) return true;
    for (let i = 0; i < polygon.length; i += 1) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];
        if (segmentsIntersect(p1, p2, rectPoints[0], rectPoints[1])) return true;
        if (segmentsIntersect(p1, p2, rectPoints[1], rectPoints[2])) return true;
        if (segmentsIntersect(p1, p2, rectPoints[2], rectPoints[3])) return true;
        if (segmentsIntersect(p1, p2, rectPoints[3], rectPoints[0])) return true;
    }
    return false;
};

export const drawDirectionSymbol = (context, x, y, angle, color, isReverse) => {
    const size = 11;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = color;
    const drawHead = () => {
        context.beginPath();
        context.moveTo(size, 0);
        context.lineTo(-size / 2, size / 2);
        context.lineTo(-size / 2, -size / 2);
        context.closePath();
        context.fill();
    };
    if (!isReverse) {
        drawHead();
    } else {
        context.rotate(Math.PI);
        drawHead();
        context.rotate(-Math.PI); // Rotate back
    }
    context.restore();
};

export const drawMovementLabel = (context, x, y, text, color) => {
    context.save();
    context.font = 'bold 12px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 4;
    context.strokeStyle = 'rgba(255,255,255,0.85)';
    context.strokeText(text, x, y);
    context.fillStyle = color;
    context.fillText(text, x, y);
    context.restore();
};
