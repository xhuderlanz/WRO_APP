import { useCallback, useMemo } from 'react';
import { DEG2RAD } from '../constants';
import { toRect, polygonIntersectsRect } from '../utils/geometry';

/**
 * Hook que maneja toda la lógica de detección de colisiones
 */
export const useCollisionDetector = ({
    obstacles,
    robot,
    unitToPx,
    normalizeAngle
}) => {
    // Obstáculos activos solamente
    const activeObstacles = useMemo(
        () => obstacles.filter(obs => obs && obs.isActive !== false && Number.isFinite(obs.x) && Number.isFinite(obs.y)),
        [obstacles]
    );

    // Dimensiones del robot en píxeles
    const halfRobotLengthPx = useMemo(() => unitToPx(robot.length) / 2, [unitToPx, robot.length]);
    const halfRobotWidthPx = useMemo(() => unitToPx(robot.width) / 2, [unitToPx, robot.width]);

    /**
     * Calcula el polígono del robot (footprint) en una pose dada
     */
    const getRobotFootprint = useCallback((pose) => {
        if (!pose) return [];
        const cosT = Math.cos(pose.theta);
        const sinT = Math.sin(pose.theta);
        const hx = halfRobotLengthPx;
        const hy = halfRobotWidthPx;
        return [
            { x: pose.x + cosT * hx - sinT * hy, y: pose.y + sinT * hx + cosT * hy },
            { x: pose.x + cosT * hx + sinT * hy, y: pose.y + sinT * hx - cosT * hy },
            { x: pose.x - cosT * hx + sinT * hy, y: pose.y - sinT * hx - cosT * hy },
            { x: pose.x - cosT * hx - sinT * hy, y: pose.y - sinT * hx + cosT * hy },
        ];
    }, [halfRobotLengthPx, halfRobotWidthPx]);

    /**
     * Detecta colisiones entre un segmento de trayectoria y obstáculos
     * Samplea el movimiento y rotación para no perder colisiones intermedias
     */
    const detectSegmentCollisions = useCallback((startPose, endPose) => {
        if (!startPose || !endPose || !activeObstacles.length) return [];
        
        const hits = new Set();
        const dx = endPose.x - startPose.x;
        const dy = endPose.y - startPose.y;
        const distance = Math.hypot(dx, dy);
        const deltaTheta = normalizeAngle(endPose.theta - startPose.theta);
        const sampleStepPx = Math.max(halfRobotWidthPx, 12);
        
        // Si no hay movimiento lineal, solo rotación
        if (distance < 1e-3) {
            const steps = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (5 * DEG2RAD)));
            for (let i = 0; i <= steps; i += 1) {
                const t = steps === 0 ? 0 : i / steps;
                const pose = { 
                    x: startPose.x, 
                    y: startPose.y, 
                    theta: normalizeAngle(startPose.theta + deltaTheta * t) 
                };
                const footprint = getRobotFootprint(pose);
                for (const obstacle of activeObstacles) {
                    const rect = toRect(obstacle);
                    if (polygonIntersectsRect(footprint, rect)) {
                        hits.add(obstacle.id);
                    }
                }
            }
            return Array.from(hits);
        }
        
        // Movimiento lineal + rotación
        const steps = Math.max(1, Math.ceil(distance / sampleStepPx));
        for (let i = 0; i <= steps; i += 1) {
            const t = steps === 0 ? 0 : i / steps;
            const pose = {
                x: startPose.x + dx * t,
                y: startPose.y + dy * t,
                theta: normalizeAngle(startPose.theta + deltaTheta * t),
            };
            const footprint = getRobotFootprint(pose);
            for (const obstacle of activeObstacles) {
                const rect = toRect(obstacle);
                if (polygonIntersectsRect(footprint, rect)) {
                    hits.add(obstacle.id);
                }
            }
        }
        return Array.from(hits);
    }, [activeObstacles, getRobotFootprint, halfRobotWidthPx, normalizeAngle]);

    /**
     * Evalúa colisiones para un segmento considerando el punto de referencia
     * Retorna puntos de inicio/fin y lista de obstáculos colisionados
     */
    const evaluateSegmentCollision = useCallback((startPose, endPose, reference, getReferencePoint) => {
        if (!startPose || !endPose) {
            return { startPoint: null, endPoint: null, collisions: [] };
        }
        const startPoint = getReferencePoint(startPose, reference);
        const endPoint = getReferencePoint(endPose, reference);
        const collisions = detectSegmentCollisions(startPose, endPose);
        return { startPoint, endPoint, collisions };
    }, [detectSegmentCollisions]);

    /**
     * Formatea los nombres de obstáculos para mensajes al usuario
     */
    const formatObstacleNames = useCallback((ids) => {
        if (!ids?.length) return '';
        return ids
            .map(id => activeObstacles.find(obstacle => obstacle.id === id)?.name ?? '')
            .map(name => (typeof name === 'string' ? name.trim() : ''))
            .filter(Boolean)
            .join(', ');
    }, [activeObstacles]);

    return {
        activeObstacles,
        getRobotFootprint,
        detectSegmentCollisions,
        evaluateSegmentCollision,
        formatObstacleNames,
        halfRobotLengthPx,
        halfRobotWidthPx
    };
};
