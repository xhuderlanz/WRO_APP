import { useCallback } from 'react';
import { 
    DEFAULT_OBSTACLE_COLOR, 
    DEFAULT_OBSTACLE_OPACITY,
    OBSTACLE_HANDLE_SIZE,
    OBSTACLE_HANDLE_SPACING,
    COLLISION_ANIMATION_DURATION_MS
} from '../constants';
import { hexToRgba, getContrastingHex } from '../utils/helpers';
import { drawDirectionSymbol, drawMovementLabel } from '../utils/geometry';

/**
 * Hook que maneja toda la lógica de renderizado del canvas
 */
export const useCanvasRenderer = ({
    canvasRef,
    bgImage,
    bgOpacity,
    grid,
    unitToPx,
    obstacles,
    selectedObstacleId,
    obstacleMode,
    collisionAnimationRef,
    sections,
    drawMode,
    ghost,
    isRunning,
    playPose,
    dragging,
    hoverNode,
    computePoseUpToSection,
    currentSection,
    rulerActive,
    rulerPoints,
    pxToUnit,
    unit,
    cursorGuide,
    robot,
    robotImgObj,
    showRobot,
    sectionNodesRef,
    isolatedSectionId
}) => {
    /**
     * Dibuja el robot en una pose específica
     */
    const drawRobot = useCallback((ctx, pose, isGhost = false) => {
        ctx.save();
        ctx.translate(pose.x, pose.y);
        ctx.rotate(pose.theta);
        
        const w = unitToPx(robot.width);
        const l = unitToPx(robot.length);
        ctx.globalAlpha = (isGhost ? 0.5 : 1) * (robot.opacity ?? 1);
        
        if (robotImgObj) {
            ctx.drawImage(robotImgObj, -l / 2, -w / 2, l, w);
        } else {
            // Dibujar ruedas
            const wheelThickness = Math.max(unitToPx(1), Math.min(unitToPx(2), w * 0.32));
            const wheelLength = Math.max(l - unitToPx(4), l * 0.78);
            const wheelOffsetX = -wheelLength / 2;
            const wheelOffsetY = w / 2 + wheelThickness * 0.15;
            
            ctx.fillStyle = '#1f293b';
            ctx.fillRect(wheelOffsetX, -wheelOffsetY - wheelThickness, wheelLength, wheelThickness);
            ctx.fillRect(wheelOffsetX, wheelOffsetY, wheelLength, wheelThickness);

            // Dibujar cuerpo del robot
            ctx.fillStyle = robot.color;
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(-l / 2, -w / 2, l, w);
            ctx.fill();
            ctx.stroke();

            // Dibujar nariz direccional
            const noseInset = unitToPx(3);
            const noseHalf = Math.min(unitToPx(2), w * 0.35);
            ctx.beginPath();
            ctx.moveTo(l / 2, 0);
            ctx.lineTo(l / 2 - noseInset, noseHalf);
            ctx.lineTo(l / 2 - noseInset, -noseHalf);
            ctx.closePath();
            ctx.fillStyle = '#0f172a';
            ctx.fill();
        }
        
        ctx.restore();
    }, [robot, robotImgObj, unitToPx]);

    /**
     * Dibuja la cuadrícula del campo
     */
    const drawGrid = useCallback((ctx, cvs) => {
        const step = unitToPx(grid.cellSize);
        if (step <= 0) return;

        ctx.save();
        ctx.globalAlpha = grid.lineAlpha;
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;

        // Líneas verticales
        for (let x = grid.offsetX; x < cvs.width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, cvs.height);
            ctx.stroke();
        }
        for (let x = grid.offsetX - step; x > 0; x -= step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, cvs.height);
            ctx.stroke();
        }

        // Líneas horizontales
        for (let y = grid.offsetY; y < cvs.height; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(cvs.width, y);
            ctx.stroke();
        }
        for (let y = grid.offsetY - step; y > 0; y -= step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(cvs.width, y);
            ctx.stroke();
        }

        ctx.restore();
    }, [grid, unitToPx]);

    /**
     * Dibuja un obstáculo con animación de colisión
     */
    const drawObstacle = useCallback((ctx, obstacle, isSelected, collisionAnim) => {
        const halfW = obstacle.width / 2;
        const halfH = obstacle.height / 2;
        
        const animActive = collisionAnim?.active && 
                          Array.isArray(collisionAnim.obstacleIds) && 
                          collisionAnim.obstacleIds.includes(obstacle.id);
        
        const destructionProgress = animActive 
            ? Math.min(1, Math.max(0, 1 - (collisionAnim.timer / COLLISION_ANIMATION_DURATION_MS))) 
            : 0;
        
        const fadeFactor = animActive ? Math.max(0, 1 - destructionProgress) : 1;
        const fillOpacity = (Number.isFinite(obstacle.opacity) ? obstacle.opacity : DEFAULT_OBSTACLE_OPACITY) * fadeFactor;
        const strokeOpacity = Math.max(0.25, fadeFactor);
        
        const fillColor = hexToRgba(obstacle.fillColor || DEFAULT_OBSTACLE_COLOR, fillOpacity);
        const strokeColor = hexToRgba(obstacle.fillColor || DEFAULT_OBSTACLE_COLOR, strokeOpacity);

        ctx.save();
        ctx.translate(obstacle.x, obstacle.y);

        // Animación de destrucción
        ctx.save();
        if (animActive) {
            const burst = 0.15 * Math.sin(destructionProgress * Math.PI);
            const wobble = destructionProgress * 0.15 * Math.sin(destructionProgress * 8 * Math.PI);
            ctx.scale(1 + burst, 1 + burst);
            ctx.rotate(wobble);
        }

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isSelected && obstacleMode ? 3 : 2;
        ctx.beginPath();
        ctx.rect(-halfW, -halfH, obstacle.width, obstacle.height);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Fragmentos de destrucción
        if (animActive && destructionProgress > 0) {
            const shardCount = 4;
            const baseShardSize = Math.max(6, Math.min(obstacle.width, obstacle.height) * 0.25);
            const travel = Math.max(12, Math.min(obstacle.width, obstacle.height) * 0.6) * destructionProgress;
            const shardAlpha = Math.max(0, 0.75 - destructionProgress * 0.75);
            const shardColor = hexToRgba(obstacle.fillColor || DEFAULT_OBSTACLE_COLOR, shardAlpha);
            
            for (let i = 0; i < shardCount; i += 1) {
                const angle = (Math.PI / 2) * i;
                const direction = i % 2 === 0 ? 1 : -1;
                ctx.save();
                ctx.rotate(angle);
                ctx.translate(travel, 0);
                ctx.rotate(destructionProgress * Math.PI * 0.6 * direction);
                ctx.fillStyle = shardColor;
                ctx.fillRect(-baseShardSize / 2, -baseShardSize / 3, baseShardSize, baseShardSize / 1.5);
                ctx.restore();
            }

            // Líneas de impacto
            ctx.save();
            ctx.strokeStyle = hexToRgba('#ffffff', Math.max(0, 0.6 - destructionProgress * 0.6));
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(halfW * 0.8, halfH * 0.8);
            ctx.moveTo(0, 0);
            ctx.lineTo(-halfW * 0.8, halfH * 0.8);
            ctx.moveTo(0, 0);
            ctx.lineTo(halfW * 0.8, -halfH * 0.8);
            ctx.moveTo(0, 0);
            ctx.lineTo(-halfW * 0.8, -halfH * 0.8);
            ctx.stroke();
            ctx.restore();
        }

        // Handles de redimensionado
        if (isSelected && obstacleMode && fadeFactor > 0.15) {
            const handleHalf = OBSTACLE_HANDLE_SIZE / 2;
            const handleOffset = handleHalf + OBSTACLE_HANDLE_SPACING;
            const handlePoints = [
                { x: -halfW - handleOffset, y: -halfH - handleOffset },
                { x: halfW + handleOffset, y: -halfH - handleOffset },
                { x: halfW + handleOffset, y: halfH + handleOffset },
                { x: -halfW - handleOffset, y: halfH + handleOffset },
            ];
            
            const handleHex = getContrastingHex(obstacle.fillColor || DEFAULT_OBSTACLE_COLOR);
            ctx.fillStyle = hexToRgba(handleHex, 0.25);
            ctx.strokeStyle = hexToRgba(handleHex, 0.6);
            ctx.lineWidth = 1.2;
            
            handlePoints.forEach(pt => {
                ctx.beginPath();
                ctx.rect(pt.x - handleHalf, pt.y - handleHalf, OBSTACLE_HANDLE_SIZE, OBSTACLE_HANDLE_SIZE);
                ctx.fill();
                ctx.stroke();
            });
        }

        ctx.restore();
    }, [obstacleMode]);

    /**
     * Dibuja todas las secciones con sus trayectorias
     */
    const drawSections = useCallback((ctx) => {
        sections.forEach(section => {
            if (!section.isVisible) return;
            if (isolatedSectionId && section.id !== isolatedSectionId) return;

            const sectionColor = section.color || '#3b82f6';
            const nodes = sectionNodesRef.current.get(section.id) || [];

            // Dibujar líneas de trayectoria
            nodes.forEach(node => {
                if (node.kind !== 'move') return;

                const isReverse = node.isReverse === true;
                ctx.save();
                ctx.strokeStyle = sectionColor;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';

                if (node.hasCollision) {
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = '#ef4444';
                }

                ctx.beginPath();
                ctx.moveTo(node.startX, node.startY);
                ctx.lineTo(node.endX, node.endY);
                ctx.stroke();
                ctx.restore();

                // Dibujar flecha direccional
                const midX = (node.startX + node.endX) / 2;
                const midY = (node.startY + node.endY) / 2;
                const angle = Math.atan2(node.endY - node.startY, node.endX - node.startX);
                drawDirectionSymbol(ctx, midX, midY, angle, sectionColor, isReverse);

                // Etiqueta de distancia
                const distText = `${node.distance.toFixed(1)} ${unit}`;
                drawMovementLabel(ctx, midX, midY - 15, distText, sectionColor);
            });

            // Dibujar nodos (puntos de control)
            nodes.forEach(node => {
                const drawX = Number.isFinite(node.displayX) ? node.displayX : node.centerX;
                const drawY = Number.isFinite(node.displayY) ? node.displayY : node.centerY;

                const isHovered = hoverNode?.sectionId === section.id && hoverNode?.key === node.key;
                const isDragged = dragging?.active && dragging?.sectionId === section.id && dragging?.index === node.pointIndex;

                ctx.save();
                ctx.fillStyle = node.isFirst ? '#22c55e' : '#fbbf24';
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = isHovered || isDragged ? 3 : 2;

                ctx.beginPath();
                ctx.arc(drawX, drawY, isHovered || isDragged ? 8 : 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        });
    }, [sections, isolatedSectionId, sectionNodesRef, unit, hoverNode, dragging]);

    /**
     * Función principal de dibujado
     */
    const draw = useCallback(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        
        const ctx = cvs.getContext('2d');
        ctx.clearRect(0, 0, cvs.width, cvs.height);

        // 1. Fondo
        if (bgImage) {
            ctx.save();
            ctx.globalAlpha = bgOpacity;
            ctx.drawImage(bgImage, 0, 0, cvs.width, cvs.height);
            ctx.restore();
        }

        // 2. Cuadrícula
        drawGrid(ctx, cvs);

        // 3. Obstáculos
        const collisionAnim = collisionAnimationRef.current;
        obstacles.forEach(obstacle => {
            if (obstacle.isActive === false) return;
            const isSelected = obstacle.id === selectedObstacleId;
            drawObstacle(ctx, obstacle, isSelected, collisionAnim);
        });

        // 4. Secciones y trayectorias
        drawSections(ctx);

        // 5. Robot (si está visible)
        if (showRobot) {
            if (isRunning && playPose) {
                drawRobot(ctx, playPose, false);
            } else if (ghost && ghost.active) {
                const finalPose = computePoseUpToSection(currentSection?.id);
                if (finalPose) {
                    drawRobot(ctx, finalPose, false);
                }
                if (ghost.previewPose) {
                    drawRobot(ctx, ghost.previewPose, true);
                }
            } else {
                const finalPose = computePoseUpToSection(currentSection?.id);
                if (finalPose) {
                    drawRobot(ctx, finalPose, false);
                }
            }
        }

        // 6. Regla
        if (rulerActive && rulerPoints?.start && rulerPoints?.end) {
            ctx.save();
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(rulerPoints.start.x, rulerPoints.start.y);
            ctx.lineTo(rulerPoints.end.x, rulerPoints.end.y);
            ctx.stroke();

            const distance = pxToUnit(Math.hypot(
                rulerPoints.end.x - rulerPoints.start.x,
                rulerPoints.end.y - rulerPoints.start.y
            ));
            const midX = (rulerPoints.start.x + rulerPoints.end.x) / 2;
            const midY = (rulerPoints.start.y + rulerPoints.end.y) / 2;
            drawMovementLabel(ctx, midX, midY, `${distance.toFixed(2)} ${unit}`, '#8b5cf6');
            ctx.restore();
        }

        // 7. Guía del cursor
        if (cursorGuide?.visible && drawMode && !dragging?.active) {
            ctx.save();
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(cursorGuide.x, cursorGuide.y, 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }, [
        canvasRef,
        bgImage,
        bgOpacity,
        drawGrid,
        obstacles,
        selectedObstacleId,
        drawObstacle,
        drawSections,
        showRobot,
        isRunning,
        playPose,
        ghost,
        computePoseUpToSection,
        currentSection,
        drawRobot,
        rulerActive,
        rulerPoints,
        pxToUnit,
        unit,
        cursorGuide,
        drawMode,
        dragging,
        collisionAnimationRef
    ]);

    return {
        draw,
        drawRobot,
        drawGrid,
        drawObstacle,
        drawSections
    };
};
