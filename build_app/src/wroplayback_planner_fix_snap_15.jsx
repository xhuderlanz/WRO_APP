import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import juniorFieldImg from "./assets/WRO-2025-GameMat-Junior2025.jpg";
import elementaryFieldImg from "./assets/WRO-2025-GameMat-Elementary2025.jpg";
import doubleTennisFieldImg from "./assets/WRO-2025_RoboSports_Double-Tennis_Playfield.jpg";


// WRO Mission Planner – Reproducción (v19 - Snap 45°)
// - Actualizado: el botón "Snap 45°" bloquea la dirección del siguiente segmento al múltiplo
//   de 45° más cercano (0°, 45°, 90°, ...), proyectando el punto sobre dicho eje.
// - Sin cambios en la lógica de snap a cuadrícula ni en el modo regla.

/** @typedef {{x:number, y:number}} Vec2 */
/** @typedef {{x:number, y:number, theta:number}} Pose */
/** @typedef {{type:'move', distance:number, reference?:'center'|'tip'} | {type:'rotate', angle:number}} Action */
/** @typedef {{id:string, name:string, points:Vec2[], actions:Action[], color?:string, isVisible:boolean}} Section */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const MAT_MM = { w: 2362, h: 1143 };
const MAT_CM = { w: MAT_MM.w / 10, h: MAT_MM.h / 10 };
const FIELD_PRESETS = [
    { key: "junior", name: "RoboMission Junior 2025", bg: juniorFieldImg },
    { key: "elementary", name: "RoboMission Elementary 2025", bg: elementaryFieldImg },
    { key: "double-tennis", name: "RoboSports Double Tennis 2025", bg: doubleTennisFieldImg },
    { key: "custom", name: "Personalizado", bg: null },
];
const DEFAULT_GRID = { cellSize: 1, pixelsPerUnit: 5, lineAlpha: 0.35, offsetX: 0, offsetY: 0 };
const DEFAULT_ROBOT = { width: 18, length: 20, color: "#0ea5e9", imageSrc: null, opacity: 1 };
const DEFAULT_OBSTACLE_SIZE = { width: 80, height: 80 };
const DEFAULT_OBSTACLE_COLOR = "#ef4444";
const DEFAULT_OBSTACLE_OPACITY = 0.35;
const OBSTACLE_RENDER = { fill: "rgba(248,113,113,0.25)", stroke: "#ef4444", blockedStroke: "#dc2626" };
const OBSTACLE_HANDLE_SIZE = 10;
const OBSTACLE_DRAG_THRESHOLD = 4;
const ZOOM_LIMITS = { min: 0.5, max: 2, step: 0.25 };
const SNAP_45_BASE_ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
const PLAYBACK_LINEAR_SPEED_UNITS_PER_SEC = 40;
const PLAYBACK_ROTATION_DEG_PER_SEC = 300;

const toRect = (obstacle) => {
    const halfW = (obstacle.width || DEFAULT_OBSTACLE_SIZE.width) / 2;
    const halfH = (obstacle.height || DEFAULT_OBSTACLE_SIZE.height) / 2;
    return {
        left: obstacle.x - halfW,
        right: obstacle.x + halfW,
        top: obstacle.y - halfH,
        bottom: obstacle.y + halfH,
    };
};

const pointInRect = (point, rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

const orientation = (p, q, r) => {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < 1e-9) return 0;
    return val > 0 ? 1 : 2;
};

const onSegment = (p, q, r) => q.x <= Math.max(p.x, r.x) + 1e-9 && q.x + 1e-9 >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) + 1e-9 && q.y + 1e-9 >= Math.min(p.y, r.y);

const segmentsIntersect = (p1, p2, q1, q2) => {
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

const sameIdList = (a = [], b = []) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
};

const hexToRgba = (hex, alpha = 1) => {
    if (typeof hex !== 'string') return `rgba(239,68,68,${alpha})`;
    let sanitized = hex.trim().replace(/^#/, '');
    if (sanitized.length === 3) {
        sanitized = sanitized.split('').map(ch => ch + ch).join('');
    }
    if (sanitized.length !== 6) return `rgba(239,68,68,${alpha})`;
    const r = parseInt(sanitized.slice(0, 2), 16);
    const g = parseInt(sanitized.slice(2, 4), 16);
    const b = parseInt(sanitized.slice(4, 6), 16);
    const clampedAlpha = Math.max(0, Math.min(1, alpha ?? 1));
    return `rgba(${Number.isFinite(r) ? r : 239}, ${Number.isFinite(g) ? g : 68}, ${Number.isFinite(b) ? b : 68}, ${clampedAlpha})`;
};

const getContrastingHex = (hex) => {
    if (typeof hex !== 'string') return '#ffffff';
    let sanitized = hex.trim().replace(/^#/, '');
    if (sanitized.length === 3) sanitized = sanitized.split('').map(ch => ch + ch).join('');
    if (sanitized.length !== 6) return '#ffffff';
    const r = parseInt(sanitized.slice(0, 2), 16) || 0;
    const g = parseInt(sanitized.slice(2, 4), 16) || 0;
    const b = parseInt(sanitized.slice(4, 6), 16) || 0;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 140 ? '#0f172a' : '#ffffff';
};

const applyAlphaToColor = (baseColor, alpha = 1) => {
    if (typeof baseColor !== 'string') return baseColor;
    const trimmed = baseColor.trim();
    if (trimmed.startsWith('#')) {
        return hexToRgba(trimmed, alpha);
    }
    return trimmed;
};

const drawDirectionSymbol = (context, x, y, angle, color, isReverse) => {
    const size = 11;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = color;
    const drawHead = () => {
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(-size, size * 0.55);
        context.lineTo(-size, -size * 0.55);
        context.closePath();
        context.fill();
    };
    if (!isReverse) {
        drawHead();
    } else {
        context.save();
        context.rotate(Math.PI / 4);
        drawHead();
        context.restore();
        context.save();
        context.rotate(-Math.PI / 4);
        drawHead();
        context.restore();
    }
    context.restore();
};

const drawMovementLabel = (context, x, y, text, color) => {
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

const pointInConvexPolygon = (point, polygon) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let sign = null;
    for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
        if (cross === 0) continue;
        const currentSign = Math.sign(cross);
        if (sign == null) {
            sign = currentSign;
        } else if (currentSign !== sign) {
            return false;
        }
    }
    return true;
};

const polygonIntersectsRect = (polygon, rect) => {
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
        const topLeft = rectPoints[0];
        const topRight = rectPoints[1];
        const bottomRight = rectPoints[2];
        const bottomLeft = rectPoints[3];
        if (
            segmentsIntersect(p1, p2, topLeft, topRight) ||
            segmentsIntersect(p1, p2, topRight, bottomRight) ||
            segmentsIntersect(p1, p2, bottomRight, bottomLeft) ||
            segmentsIntersect(p1, p2, bottomLeft, topLeft)
        ) {
            return true;
        }
    }
    return false;
};

const IconChevronLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>;
const IconChevronRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
const IconChevronDown = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
const IconGripVertical = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-slate-400"><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg>;
const IconEye = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEyeOff = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>;
const IconRuler = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L3 8.4a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0L15.3 21.3"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>;
const IconTarget = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;

const OptionsPanel = ({ showOptions, setShowOptions, fieldKey, setFieldKey, bgOpacity, setBgOpacity, grid, setGrid, robot, setRobot, initialPose, setInitialPose, handleBgUpload, handleRobotImageUpload, setIsSettingOrigin, unit, setUnit }) => {
    const isMM = unit === 'mm';
    const sizeMin = isMM ? 1 : 0.1;
    const sizeMax = isMM ? 50 : 5;
    const sliderStep = isMM ? 1 : 0.1;
    const numberStep = isMM ? 0.1 : 0.01;

    useEffect(() => {
        if (!showOptions) return undefined;
        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setShowOptions(false);
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [showOptions, setShowOptions]);

    const handleSizeChange = (valueStr) => {
        const value = parseFloat(valueStr) || 0;
        const cmValue = isMM ? value / 10 : value;
        setGrid(g => ({ ...g, cellSize: Math.max(0.1, Math.min(5, cmValue)) }));
    };

    const numericCellSize = isMM ? grid.cellSize * 10 : grid.cellSize;
    const formattedCellSize = isMM ? numericCellSize.toFixed(1) : numericCellSize.toFixed(2);

    return (
        <div className={`options-overlay ${showOptions ? 'options-overlay--visible' : ''}`} aria-hidden={!showOptions}>
            <div
                className="options-overlay__backdrop"
                onClick={() => setShowOptions(false)}
                role="presentation"
            />
            <div
                className="options-drawer"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="options-drawer__header">
                    <div>
                        <h3 className="options-drawer__title">Opciones</h3>
                        <p className="options-drawer__subtitle">Configura el tapete, la cuadrícula y el robot para organizar mejor tu planificación.</p>
                    </div>
                    <button className="options-close-btn" onClick={() => setShowOptions(false)}>Cerrar</button>
                </div>
                <div className="options-drawer__intro">El tapete se escala automáticamente a <b>2362mm × 1143mm</b>. Ajusta los controles para que coincida con tu entorno.</div>
                <div className="options-drawer__content">
                    <section className="option-section">
                        <header className="option-section__header">
                            <h4 className="option-section__title">Tapete</h4>
                            <p className="option-section__subtitle">Elige un tapete predefinido o sube una imagen personalizada.</p>
                        </header>
                        <div className="option-card">
                            <div className="option-card__grid option-card__grid--auto">
                                <label className="option-field">
                                    <span className="option-field__label">Tapete base</span>
                                    <select className="option-field__control" value={fieldKey} onChange={e => setFieldKey(e.target.value)}>
                                        {FIELD_PRESETS.map(p => (
                                            <option key={p.key} value={p.key}>{p.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="option-field option-field--file">
                                    <span className="option-field__label">Fondo personalizado</span>
                                    <span className="option-upload">
                                        <input type="file" accept="image/*" onChange={handleBgUpload} />
                                        <span className="option-upload__text">Subir imagen</span>
                                    </span>
                                    <span className="option-field__hint">Ideal para mapas escaneados o fotografías de tu tapete.</span>
                                </label>
                                <div className="option-field option-field--range">
                                    <div className="option-field__label">Opacidad del fondo</div>
                                    <div className="option-field__controls">
                                        <input type="range" min={0} max={1} step={0.05} value={bgOpacity} onChange={e => setBgOpacity(Number(e.target.value))} />
                                        <span className="option-field__value">{Math.round(bgOpacity * 100)}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="option-section">
                        <header className="option-section__header">
                            <h4 className="option-section__title">Cuadrícula y unidades</h4>
                            <p className="option-section__subtitle">Controla la densidad de la cuadrícula y alinea el origen con tu referencia física.</p>
                        </header>
                        <div className="option-card">
                            <div className="option-card__grid option-card__grid--two">
                                <div className="option-field">
                                    <span className="option-field__label">Unidad de trabajo</span>
                                    <div className="option-field__controls option-field__controls--single">
                                        <button
                                            type="button"
                                            className="option-chip-button"
                                            onClick={() => setUnit(u => u === 'cm' ? 'mm' : 'cm')}
                                        >
                                            Mostrar en {unit === 'cm' ? 'milímetros' : 'centímetros'}
                                        </button>
                                    </div>
                                    <span className="option-field__hint">Actualmente estás introduciendo valores en {unit === 'cm' ? 'centímetros' : 'milímetros'}.</span>
                                </div>
                                <div className="option-field">
                                    <span className="option-field__label">Origen de coordenadas</span>
                                    <div className="option-field__controls option-field__controls--single">
                                        <button
                                            type="button"
                                            className="option-action-button"
                                            onClick={() => { setIsSettingOrigin(true); setShowOptions(false); }}
                                        >
                                            <IconTarget /> Fijar en el mapa
                                        </button>
                                    </div>
                                    <span className="option-field__hint">Pulsa sobre el tapete para definir dónde se ubica (0, 0).</span>
                                </div>
                            </div>
                            <div className="option-divider" />
                            <div className="option-field option-field--range">
                                <div className="option-field__label">Tamaño de celda</div>
                                <span className="option-field__hint">Cada cuadrícula representa {formattedCellSize} {unit}.</span>
                                <div className="option-field__controls">
                                    <input
                                        type="range"
                                        min={sizeMin}
                                        max={sizeMax}
                                        step={sliderStep}
                                        value={numericCellSize}
                                        onChange={e => handleSizeChange(e.target.value)}
                                    />
                                    <input
                                        type="number"
                                        min={sizeMin}
                                        max={sizeMax}
                                        step={numberStep}
                                        className="option-number"
                                        value={Number(numericCellSize.toFixed(isMM ? 1 : 2))}
                                        onChange={e => handleSizeChange(e.target.value)}
                                    />
                                    <span className="option-field__value">{unit}</span>
                                </div>
                            </div>
                            <div className="option-field option-field--range">
                                <div className="option-field__label">Opacidad de líneas</div>
                                <div className="option-field__controls">
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={grid.lineAlpha}
                                        onChange={e => setGrid(g => ({ ...g, lineAlpha: Number(e.target.value) }))}
                                    />
                                    <span className="option-field__value">{Math.round(grid.lineAlpha * 100)}%</span>
                                </div>
                            </div>
                            <div className="option-card__grid option-card__grid--two">
                                <div className="option-field option-field--range">
                                    <div className="option-field__label">Offset X</div>
                                    <span className="option-field__hint">Desplaza la cuadrícula horizontalmente.</span>
                                    <div className="option-field__controls">
                                        <input
                                            type="range"
                                            min="-100"
                                            max="100"
                                            step="1"
                                            value={grid.offsetX}
                                            onChange={e => setGrid(g => ({ ...g, offsetX: Number(e.target.value) }))}
                                        />
                                        <input
                                            type="number"
                                            step="1"
                                            className="option-number"
                                            value={grid.offsetX}
                                            onChange={e => setGrid(g => ({ ...g, offsetX: Number(e.target.value) }))}
                                        />
                                        <span className="option-field__value">px</span>
                                    </div>
                                </div>
                                <div className="option-field option-field--range">
                                    <div className="option-field__label">Offset Y</div>
                                    <span className="option-field__hint">Desplaza la cuadrícula verticalmente.</span>
                                    <div className="option-field__controls">
                                        <input
                                            type="range"
                                            min="-100"
                                            max="100"
                                            step="1"
                                            value={grid.offsetY}
                                            onChange={e => setGrid(g => ({ ...g, offsetY: Number(e.target.value) }))}
                                        />
                                        <input
                                            type="number"
                                            step="1"
                                            className="option-number"
                                            value={grid.offsetY}
                                            onChange={e => setGrid(g => ({ ...g, offsetY: Number(e.target.value) }))}
                                        />
                                        <span className="option-field__value">px</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="option-section">
                        <header className="option-section__header">
                            <h4 className="option-section__title">Robot</h4>
                            <p className="option-section__subtitle">Define las dimensiones y apariencia del robot en pantalla.</p>
                        </header>
                        <div className="option-card">
                            <div className="option-card__grid option-card__grid--two">
                                <label className="option-field">
                                    <span className="option-field__label">Ancho (cm)</span>
                                    <input
                                        type="number"
                                        className="option-field__control"
                                        value={robot.width}
                                        onChange={e => setRobot(r => ({ ...r, width: Number(e.target.value) || 0 }))}
                                    />
                                </label>
                                <label className="option-field">
                                    <span className="option-field__label">Largo (cm)</span>
                                    <input
                                        type="number"
                                        className="option-field__control"
                                        value={robot.length}
                                        onChange={e => setRobot(r => ({ ...r, length: Number(e.target.value) || 0 }))}
                                    />
                                </label>
                                <label className="option-field">
                                    <span className="option-field__label">Color</span>
                                    <input
                                        type="color"
                                        className="option-field__control option-field__control--color"
                                        value={robot.color}
                                        onChange={e => setRobot(r => ({ ...r, color: e.target.value }))}
                                    />
                                </label>
                                <label className="option-field option-field--file">
                                    <span className="option-field__label">Imagen del robot</span>
                                    <span className="option-upload">
                                        <input type="file" accept="image/*" onChange={handleRobotImageUpload} />
                                        <span className="option-upload__text">Seleccionar archivo</span>
                                    </span>
                                    <span className="option-field__hint">Utiliza PNG con fondo transparente para mejores resultados.</span>
                                </label>
                            </div>
                            <div className="option-field option-field--range">
                                <div className="option-field__label">Opacidad del robot</div>
                                <div className="option-field__controls">
                                    <input
                                        type="range"
                                        min={0.1}
                                        max={1}
                                        step={0.05}
                                        value={robot.opacity ?? 1}
                                        onChange={e => setRobot(r => ({ ...r, opacity: Number(e.target.value) }))}
                                    />
                                    <span className="option-field__value">{Math.round((robot.opacity ?? 1) * 100)}%</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="option-section">
                        <header className="option-section__header">
                            <h4 className="option-section__title">Posición inicial</h4>
                            <p className="option-section__subtitle">Ajusta la ubicación inicial del robot en el plano.</p>
                        </header>
                        <div className="option-card">
                            <div className="option-card__grid option-card__grid--three">
                                <label className="option-field">
                                    <span className="option-field__label">Posición X (px)</span>
                                    <input
                                        type="number"
                                        className="option-field__control"
                                        value={Math.round(initialPose.x)}
                                        onChange={e => setInitialPose(p => ({ ...p, x: Number(e.target.value) }))}
                                    />
                                </label>
                                <label className="option-field">
                                    <span className="option-field__label">Posición Y (px)</span>
                                    <input
                                        type="number"
                                        className="option-field__control"
                                        value={Math.round(initialPose.y)}
                                        onChange={e => setInitialPose(p => ({ ...p, y: Number(e.target.value) }))}
                                    />
                                </label>
                                <label className="option-field">
                                    <span className="option-field__label">Ángulo (°)</span>
                                    <input
                                        type="number"
                                        className="option-field__control"
                                        value={Math.round(initialPose.theta * RAD2DEG)}
                                        onChange={e => setInitialPose(p => ({ ...p, theta: Number(e.target.value) * DEG2RAD }))}
                                    />
                                </label>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

const SectionsPanel = ({ sections, setSections, selectedSectionId, setSelectedSectionId, addSection, exportMission, importMission, updateSectionActions, computePoseUpToSection, pxToUnit, isCollapsed, setIsCollapsed, expandedSections, toggleSectionExpansion, toggleSectionVisibility, unit }) => {
    const [draggedAction, setDraggedAction] = useState(null);

    const handleActionDragStart = (e, sectionId, actionIndex) => { setDraggedAction({ sectionId, actionIndex }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); };
    const handleActionDrop = (e, targetSectionId, targetActionIndex) => { e.preventDefault(); if (!draggedAction || draggedAction.sectionId !== targetSectionId) return; const { actionIndex: draggedIndex } = draggedAction; if (draggedIndex === targetActionIndex) return; const section = sections.find(s => s.id === targetSectionId); if (!section) return; const reorderedActions = [...section.actions]; const [draggedItem] = reorderedActions.splice(draggedIndex, 1); reorderedActions.splice(targetActionIndex, 0, draggedItem); updateSectionActions(targetSectionId, reorderedActions); };

    if (isCollapsed) {return (
            <div className="panel-card self-start flex items-center justify-center w-16 h-16">
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="toolbar-btn toolbar-btn--muted"
                    title="Expandir Panel"
                >
                    <IconChevronRight />
                </button>
            </div>
        );
    }return (
        <div className="panel-card self-start">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-slate-700">Secciones</h2>
                <div className="flex items-center gap-2">
                    <button onClick={addSection} className="toolbar-btn toolbar-btn--emerald text-sm">+ Añadir</button>
                    <button onClick={() => setIsCollapsed(true)} className="toolbar-btn toolbar-btn--muted" title="Minimizar Panel">
                        <IconChevronLeft />
                    </button>
                </div>
            </div>
            <div className="section-scroll space-y-3">
                {sections.map(s => {
                    const isExpanded = expandedSections.includes(s.id);return (
                        <div
                            key={s.id}
                            className={`section-card ${selectedSectionId === s.id ? 'section-card--active' : ''}`}
                            onClick={() => setSelectedSectionId(s.id)}
                        >
                            <div className="section-card__header px-3 py-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleSectionExpansion(s.id); }}
                                    className="toolbar-btn toolbar-btn--muted px-2 py-1"
                                >
                                    {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
                                </button>
                                <input
                                    className="flex-1 border border-slate-200/70 rounded-lg px-3 py-1 text-sm bg-white/80"
                                    value={s.name}
                                    onChange={e => setSections(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))}
                                    onClick={e => e.stopPropagation()}
                                />
                                <input
                                    type="color"
                                    className="w-9 h-9 rounded-lg border border-slate-200/50"
                                    value={s.color || '#0ea5e9'}
                                    onChange={e => setSections(prev => prev.map(x => x.id === s.id ? { ...x, color: e.target.value } : x))}
                                    onClick={e => e.stopPropagation()}
                                />
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleSectionVisibility(s.id); }}
                                    className={`toolbar-btn px-2 py-1 ${s.isVisible ? 'toolbar-btn--muted' : 'toolbar-btn--muted opacity-40'}`}
                                >
                                    {s.isVisible ? <IconEye /> : <IconEyeOff />}
                                </button>
                            </div>
                            {isExpanded && (
                                <div className="section-card__content" onDrop={() => setDraggedAction(null)} onDragEnd={() => setDraggedAction(null)}>
                                    <div className="text-xs text-slate-500">Inicio: {(() => { const start = computePoseUpToSection(s.id); return `${pxToUnit(start.x).toFixed(1)}cm, ${pxToUnit(start.y).toFixed(1)}cm, ${Math.round(start.theta * RAD2DEG)}°`; })()}</div>
                                    <div className="text-xs text-slate-600 font-semibold">Acciones:</div>
                                    {s.actions.length === 0 ? (<div className="text-xs text-slate-500">Sin acciones. Dibuja para crear.</div>) : (
                                        s.actions.map((a, i) => {
                                            const isDragging = draggedAction?.sectionId === s.id && draggedAction?.actionIndex === i;return (
                                                <div
                                                    key={i}
                                                    draggable
                                                    onDragStart={(e) => handleActionDragStart(e, s.id, i)}
                                                    onDrop={(e) => handleActionDrop(e, s.id, i)}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    className={`section-card__actions ${isDragging ? 'opacity-60 border-dashed border-indigo-300' : 'border-slate-200/70'}`}
                                                >
                                                    <span className="cursor-move touch-none p-1 text-slate-400"><IconGripVertical /></span>
                                                    <span className="text-xs font-medium text-slate-600">{a.type === 'move' ? 'Avanzar' : 'Girar'}</span>
                                                    {a.type === 'move' ? (
                                                        <div className="section-card__field">
                                                            <label className="text-xs flex items-center gap-2">Dist ({unit})
                                                                <input
                                                                    type="number"
                                                                    step={unit === 'mm' ? 0.1 : 0.01}
                                                                    className="w-full border border-slate-200/80 rounded-lg px-2 py-1 text-slate-700 bg-white/80"
                                                                    value={unit === 'mm' ? (a.distance * 10).toFixed(1) : a.distance.toFixed(2)}
                                                                    onChange={e => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        const cmValue = unit === 'mm' ? val / 10 : val;
                                                                        const newActions = s.actions.map((act, idx) => (i === idx ? { ...act, distance: cmValue } : act));
                                                                        updateSectionActions(s.id, newActions);
                                                                    }}
                                                                />
                                                            </label>
                                                            <div className={`section-card__meta ${a.reference === 'tip' ? 'section-card__meta--tip' : 'section-card__meta--center'}`}>
                                                                {a.reference === 'tip' ? 'Medido desde la punta del robot' : 'Medido desde el centro de las ruedas'}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <label className="text-xs flex items-center gap-2">Ángulo (°)
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                className="w-full border border-slate-200/80 rounded-lg px-2 py-1 text-slate-700 bg-white/80"
                                                                value={a.angle}
                                                                onChange={e => {
                                                                    const newActions = s.actions.map((act, idx) => (i === idx ? { ...act, angle: parseFloat(e.target.value) || 0 } : act));
                                                                    updateSectionActions(s.id, newActions);
                                                                }}
                                                            />
                                                        </label>
                                                    )}
                                                    <button
                                                        onClick={() => { const newActions = s.actions.filter((_, idx) => idx !== i); updateSectionActions(s.id, newActions); }}
                                                        className="toolbar-btn toolbar-btn--rose px-2 py-1 text-[11px]"
                                                    >
                                                        Quitar
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="pt-2 flex flex-wrap gap-2">
                <button onClick={exportMission} className="toolbar-btn toolbar-btn--amber text-sm">Guardar (.json)</button>
                <label className="toolbar-btn toolbar-btn--muted text-sm cursor-pointer">
                    Cargar
                    <input type="file" accept="application/json" className="hidden" onChange={importMission} />
                </label>
            </div>
        </div>
    );
};

const ObstaclesPanel = ({ obstacles, addObstacle, updateObstacle, removeObstacle }) => {
    const [collapsedIds, setCollapsedIds] = useState({});

    useEffect(() => {
        setCollapsedIds(prev => {
            let changed = false;
            const next = { ...prev };
            obstacles.forEach(obs => {
                if (next[obs.id] === undefined) {
                    next[obs.id] = false;
                    changed = true;
                }
            });
            Object.keys(next).forEach(id => {
                if (!obstacles.some(obs => obs.id === id)) {
                    delete next[id];
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [obstacles]);

    const toggleCollapse = useCallback((id) => {
        setCollapsedIds(prev => ({ ...prev, [id]: !prev[id] }));
    }, []);

    return (
        <div className="panel-card self-start mt-4">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-slate-700">Obstáculos</h2>
                <button
                    onClick={addObstacle}
                    className="toolbar-btn toolbar-btn--emerald text-sm px-3 py-1"
                >
                    + Agregar
                </button>
            </div>
            {obstacles.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                    No hay obstáculos definidos. Usa &quot;Agregar&quot; para colocar uno en el tapete.
                </p>
            ) : (
                <div className="mt-4 flex flex-col gap-3">
                    {obstacles.map(obstacle => (
                        <div key={obstacle.id} className="section-card">
                            <header className="section-card__header">
                                <button
                                    type="button"
                                    className="toolbar-btn toolbar-btn--muted px-2 py-1"
                                    onClick={(e) => { e.stopPropagation(); toggleCollapse(obstacle.id); }}
                                >
                                    {collapsedIds[obstacle.id] ? <IconChevronRight /> : <IconChevronDown />}
                                </button>
                                <input
                                    type="text"
                                    className="section-card__title-input"
                                    value={obstacle.name}
                                    onChange={e => updateObstacle(obstacle.id, { name: e.target.value })}
                                />
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1 text-xs text-slate-500">
                                        <input
                                            type="checkbox"
                                            checked={obstacle.isActive !== false}
                                            onChange={e => updateObstacle(obstacle.id, { isActive: e.target.checked })}
                                        />
                                        Activo
                                    </label>
                                    <button
                                        onClick={() => removeObstacle(obstacle.id)}
                                        className="toolbar-btn toolbar-btn--rose text-xs px-2 py-1"
                                    >
                                        Quitar
                                    </button>
                                </div>
                            </header>
                            {!collapsedIds[obstacle.id] && (
                                <div className="section-card__grid section-card__grid--two">
                                    <label className="section-card__field">
                                        <span className="section-card__label">Posición X (px)</span>
                                        <input
                                            type="number"
                                            className="section-card__input"
                                            value={Math.round(obstacle.x)}
                                            onChange={e => {
                                                const val = Number(e.target.value);
                                                if (Number.isFinite(val)) updateObstacle(obstacle.id, { x: val });
                                            }}
                                        />
                                    </label>
                                    <label className="section-card__field">
                                        <span className="section-card__label">Posición Y (px)</span>
                                        <input
                                            type="number"
                                            className="section-card__input"
                                            value={Math.round(obstacle.y)}
                                            onChange={e => {
                                                const val = Number(e.target.value);
                                                if (Number.isFinite(val)) updateObstacle(obstacle.id, { y: val });
                                            }}
                                        />
                                    </label>
                                    <label className="section-card__field">
                                        <span className="section-card__label">Ancho (px)</span>
                                        <input
                                            type="number"
                                            min="10"
                                            className="section-card__input"
                                            value={Math.round(obstacle.width)}
                                            onChange={e => {
                                                const val = Math.max(10, Number(e.target.value) || 10);
                                                updateObstacle(obstacle.id, { width: val });
                                            }}
                                        />
                                    </label>
                                    <label className="section-card__field">
                                        <span className="section-card__label">Alto (px)</span>
                                        <input
                                            type="number"
                                            min="10"
                                            className="section-card__input"
                                            value={Math.round(obstacle.height)}
                                            onChange={e => {
                                                const val = Math.max(10, Number(e.target.value) || 10);
                                                updateObstacle(obstacle.id, { height: val });
                                            }}
                                        />
                                    </label>
                                    <label className="section-card__field">
                                        <span className="section-card__label">Color</span>
                                        <input
                                            type="color"
                                            className="section-card__input"
                                            value={obstacle.fillColor || DEFAULT_OBSTACLE_COLOR}
                                            onChange={e => updateObstacle(obstacle.id, { fillColor: e.target.value })}
                                        />
                                    </label>
                                    <label className="section-card__field">
                                        <span className="section-card__label">Opacidad</span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.05"
                                                value={Number.isFinite(obstacle.opacity) ? obstacle.opacity : DEFAULT_OBSTACLE_OPACITY}
                                                onChange={e => updateObstacle(obstacle.id, { opacity: Number(e.target.value) })}
                                                className="flex-1"
                                            />
                                            <span className="text-xs text-slate-600 w-10 text-right">
                                                {Math.round(((Number.isFinite(obstacle.opacity) ? obstacle.opacity : DEFAULT_OBSTACLE_OPACITY) || 0) * 100)}%
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const Toolbar = ({
    drawMode,
    setDrawMode,
    obstacleMode,
    setObstacleMode,
    snap45,
    setSnap45,
    snapGrid,
    setSnapGrid,
    isRunning,
    isPaused,
    startMission,
    startMissionReverse,
    startSection,
    startSectionReverse,
    pauseResume,
    stopPlayback,
    setShowOptions,
    rulerActive,
    handleRulerToggle,
    showRobot,
    onToggleRobot,
    playbackSpeedMultiplier,
    onPlaybackSpeedChange,
    reverseDrawing,
    onToggleReverse,
    referenceMode,
    onReferenceModeChange,
    zoom,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    showZoomGroup = true,
}) => {
    const [quickMenu, setQuickMenu] = useState({ open: false, target: null, anchor: { x: 0, y: 0 } });
    const longPressTimerRef = useRef(null);
    const pointerStateRef = useRef({ pointerId: null, target: null, triggered: false });
    const ignoreClickRef = useRef(false);
    const LONG_PRESS_DELAY = 350;

    const closeQuickMenu = useCallback(() => {
        setQuickMenu({ open: false, target: null, anchor: { x: 0, y: 0 } });
    }, []);

    useEffect(() => {
        if (!quickMenu.open) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeQuickMenu();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [quickMenu.open, closeQuickMenu]);

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const triggerQuickMenu = useCallback((target, buttonElement) => {
        const rect = buttonElement.getBoundingClientRect();
        setQuickMenu({
            open: true,
            target,
            anchor: {
                x: rect.right + 12,
                y: rect.top + rect.height / 2,
            },
        });
    }, []);

    const handlePointerDown = useCallback((event, target) => {
        if (event.button !== 0) return;
        ignoreClickRef.current = false;
        pointerStateRef.current = { pointerId: event.pointerId, target, triggered: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
            ignoreClickRef.current = true;
            pointerStateRef.current = { pointerId: event.pointerId, target, triggered: true };
            triggerQuickMenu(target, event.currentTarget);
            longPressTimerRef.current = null;
        }, LONG_PRESS_DELAY);
    }, [triggerQuickMenu]);

    const handlePointerUp = useCallback((event, target) => {
        const state = pointerStateRef.current;
        if (state.pointerId !== event.pointerId || state.target !== target) {
            return;
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
        pointerStateRef.current = { pointerId: null, target: null, triggered: false };
        clearLongPressTimer();
    }, []);

    const handlePointerCancel = useCallback((event) => {
        const state = pointerStateRef.current;
        if (state.pointerId !== event.pointerId) return;
        clearLongPressTimer();
        if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        pointerStateRef.current = { pointerId: null, target: null, triggered: false };
        ignoreClickRef.current = false;
    }, []);

    const handleClick = useCallback((event, onForward) => {
        if (ignoreClickRef.current) {
            ignoreClickRef.current = false;
            event.preventDefault();
            return;
        }
        onForward();
    }, []);

    const runForward = useCallback((target) => {
        if (target === 'mission') {
            startMission();
        } else {
            startSection();
        }
    }, [startMission, startSection]);

    const runReverse = useCallback((target) => {
        if (target === 'mission') {
            startMissionReverse();
        } else {
            startSectionReverse();
        }
        closeQuickMenu();
    }, [startMissionReverse, startSectionReverse, closeQuickMenu]);

    const handleQuickForward = useCallback((target) => {
        runForward(target);
        closeQuickMenu();
    }, [runForward, closeQuickMenu]);

    const handleSnapGridToggle = () => {
        const isTurningOn = !snapGrid;
        setSnapGrid(isTurningOn);
    };

    const handleSnap45Toggle = useCallback(() => {
        setSnap45(prev => !prev);
    }, [setSnap45]);

    const zoomLabel = Math.round(zoom * 100);
    return (
        <div className="toolbar-card sticky top-4 z-20">
            <button
                type="button"
                className={`toolbar-btn toolbar-reverse-btn ${reverseDrawing ? 'toolbar-reverse-btn--active' : ''}`}
                onClick={onToggleReverse}
                aria-pressed={reverseDrawing}
            >
                <span className="toolbar-reverse-label">Modo reversa</span>
                <span className="toolbar-reverse-state">{reverseDrawing ? 'Dibujando hacia atrás' : 'Dibujando hacia adelante'}</span>
                <span className="toolbar-reverse-chip">Espacio</span>
            </button>
            <div className="toolbar-group toolbar-group--measure">
                <span className="toolbar-group__label">Referencia</span>
                <div className="toolbar-segmented">
                    <button
                        type="button"
                        className={`toolbar-segmented__btn ${referenceMode === 'center' ? 'toolbar-segmented__btn--active' : ''}`}
                        onClick={() => onReferenceModeChange('center')}
                        aria-pressed={referenceMode === 'center'}
                    >
                        Centro ruedas
                    </button>
                    <button
                        type="button"
                        className={`toolbar-segmented__btn ${referenceMode === 'tip' ? 'toolbar-segmented__btn--active' : ''}`}
                        onClick={() => onReferenceModeChange('tip')}
                        aria-pressed={referenceMode === 'tip'}
                    >
                        Punta robot
                    </button>
                </div>
            </div>
            <button onClick={() => setDrawMode(d => !d)} disabled={obstacleMode} className={`toolbar-btn w-28 ${drawMode ? 'toolbar-btn--emerald' : 'toolbar-btn--muted'} ${obstacleMode ? 'opacity-60 pointer-events-none' : ''}`}>
                {drawMode ? 'Dibujando' : 'Editando'}
            </button>
            <button onClick={() => setObstacleMode(prev => !prev)} className={`toolbar-btn ${obstacleMode ? 'toolbar-btn--rose' : 'toolbar-btn--muted'}`} aria-pressed={obstacleMode}>
                Obstáculos
            </button>
            <button onClick={handleRulerToggle} className={`toolbar-btn ${rulerActive ? 'toolbar-btn--rose' : 'toolbar-btn--muted'}`}>
                <IconRuler /> Regla
            </button>
            <button
                onClick={handleSnap45Toggle}
                className={`toolbar-btn ${snap45 ? 'toolbar-btn--indigo' : 'toolbar-btn--muted'}`}
                title="Bloquea la dirección en múltiplos de 45°"
            >
                Snap 45°
            </button>
            <button onClick={handleSnapGridToggle} className={`toolbar-btn ${snapGrid ? 'toolbar-btn--indigo' : 'toolbar-btn--muted'}`}>Snap Grid</button>
            <button
                onClick={onToggleRobot}
                className={`toolbar-btn ${showRobot ? 'toolbar-btn--emerald' : 'toolbar-btn--muted'}`}
                aria-pressed={showRobot}
            >
                {showRobot ? 'Robot visible' : 'Robot oculto'}
            </button>
            <div className="toolbar-divider" />
            <div className="toolbar-group toolbar-group--playback">
                <span className="toolbar-group__label">Reproducción</span>
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200/80 bg-white/80 p-3 shadow-sm">
                    <div className="flex flex-wrap gap-2">
                        <button
                            onPointerDown={(event) => handlePointerDown(event, 'mission')}
                            onPointerUp={(event) => handlePointerUp(event, 'mission')}
                            onPointerLeave={handlePointerCancel}
                            onPointerCancel={handlePointerCancel}
                            onClick={(event) => handleClick(event, startMission)}
                            className="toolbar-btn toolbar-btn--sky flex-1 min-w-[120px]"
                        >
                            Misión ▶
                        </button>
                        <button
                            onPointerDown={(event) => handlePointerDown(event, 'section')}
                            onPointerUp={(event) => handlePointerUp(event, 'section')}
                            onPointerLeave={handlePointerCancel}
                            onPointerCancel={handlePointerCancel}
                            onClick={(event) => handleClick(event, startSection)}
                            className="toolbar-btn toolbar-btn--indigo flex-1 min-w-[120px]"
                        >
                            Sección ▶
                        </button>
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-slate-600">
                        <span className="font-medium uppercase tracking-wide text-slate-500">Velocidad</span>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min="0.25"
                                max="2"
                                step="0.05"
                                value={playbackSpeedMultiplier}
                                onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
                                className="flex-1"
                            />
                            <span className="w-12 text-right text-sm text-slate-700">{Math.round(playbackSpeedMultiplier * 100)}%</span>
                        </div>
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={pauseResume}
                            disabled={!isRunning}
                            className={`toolbar-btn flex-1 min-w-[120px] ${isPaused ? 'toolbar-btn--emerald' : 'toolbar-btn--amber'}`}
                        >
                            {isPaused ? 'Reanudar' : 'Pausar'}
                        </button>
                        <button
                            onClick={stopPlayback}
                            disabled={!isRunning}
                            className="toolbar-btn toolbar-btn--rose flex-1 min-w-[120px]"
                        >
                            Detener
                        </button>
                    </div>
                </div>
            </div>
            {showZoomGroup && (
                <div className="toolbar-group toolbar-group--zoom">
                    <span className="toolbar-group__label">Zoom</span>
                    <div className="toolbar-zoom-control">
                        <button type="button" className="toolbar-zoom-btn" onClick={onZoomOut} aria-label="Alejar">−</button>
                        <span className="toolbar-zoom-value">{zoomLabel}%</span>
                        <button type="button" className="toolbar-zoom-btn" onClick={onZoomIn} aria-label="Acercar">+</button>
                        <button type="button" className="toolbar-zoom-reset" onClick={onZoomReset}>Restablecer</button>
                    </div>
                </div>
            )}
            <div className="ml-auto flex items-center gap-2 text-sm">
                <button onClick={() => setShowOptions(true)} className="toolbar-btn toolbar-btn--slate">Opciones</button>
            </div>

            {quickMenu.open && (
                <div className="playback-menu" role="dialog" aria-modal="true">
                    <div className="playback-menu__backdrop" role="presentation" onClick={closeQuickMenu} />
                    <div
                        className={`playback-menu__panel playback-menu__panel--${quickMenu.target}`}
                        style={{ top: `${quickMenu.anchor.y}px`, left: `${quickMenu.anchor.x}px` }}
                    >
                        <div className="playback-menu__title">{quickMenu.target === 'mission' ? 'Reproducir misión' : 'Reproducir sección'}</div>
                        <div className="playback-menu__actions">
                            <button type="button" className="playback-menu__btn playback-menu__btn--forward" onClick={() => handleQuickForward(quickMenu.target)}>▶ Adelante</button>
                            <button type="button" className="playback-menu__btn playback-menu__btn--reverse" onClick={() => runReverse(quickMenu.target)}>◀ Reversa</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function WROPlaybackPlanner() {
    const [fieldKey, setFieldKey] = useState(FIELD_PRESETS[0].key);
    const [bgImage, setBgImage] = useState(null);
    const [bgOpacity, setBgOpacity] = useState(1);
    const [grid, setGrid] = useState({ ...DEFAULT_GRID });
    const [robot, setRobot] = useState({ ...DEFAULT_ROBOT });
    const [robotImgObj, setRobotImgObj] = useState(null);
    const [showRobot, setShowRobot] = useState(true);
    const [playbackSpeedMultiplier, setPlaybackSpeedMultiplier] = useState(1);
    const [sections, setSections] = useState([{ id: uid('sec'), name: 'Sección 1', points: [], actions: [], color: DEFAULT_ROBOT.color, isVisible: true }]);
    const [obstacles, setObstacles] = useState([]);
    const [obstacleMode, setObstacleMode] = useState(false);
    const [selectedObstacleId, setSelectedObstacleId] = useState(null);
    const [obstacleTransform, setObstacleTransform] = useState({ type: 'idle', obstacleId: null, corner: null, offsetX: 0, offsetY: 0, baseRect: null });
    const [selectedSectionId, setSelectedSectionId] = useState(sections[0].id);
    const [expandedSections, setExpandedSections] = useState([sections[0].id]);
    const [initialPose, setInitialPose] = useState({ x: 120, y: 120, theta: 0 });
    const [playPose, setPlayPose] = useState({ ...initialPose });
    const [drawMode, setDrawMode] = useState(true);
    const [snapGrid, setSnapGrid] = useState(true);
    const [snap45, setSnap45] = useState(false);
    const [ghost, setGhost] = useState({
        x: 0,
        y: 0,
        theta: 0,
        reference: 'center',
        displayX: 0,
        displayY: 0,
        originX: 0,
        originY: 0,
        active: false,
        hasCollision: false,
        collisionObstacleIds: [],
    });
    const [dragging, setDragging] = useState({ active: false, sectionId: null, index: -1 });
    const [hoverNode, setHoverNode] = useState({ sectionId: null, key: null, pointIndex: -1, kind: null });
    const [draggingStart, setDraggingStart] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [isSectionsPanelCollapsed, setIsSectionsPanelCollapsed] = useState(false);
    const [rulerActive, setRulerActive] = useState(false);
    const [rulerPoints, setRulerPoints] = useState({ start: null, end: null });
    const [isDraggingRuler, setIsDraggingRuler] = useState(false);
    const [isSettingOrigin, setIsSettingOrigin] = useState(false);
    const [unit, setUnit] = useState('cm');
    const [reverseDrawing, setReverseDrawing] = useState(false);
    const [referenceMode, setReferenceMode] = useState('center');
    const [zoom, setZoom] = useState(1);
    const [canvasBaseSize, setCanvasBaseSize] = useState({ width: 0, height: 0 });
    const [cursorGuide, setCursorGuide] = useState({ x: 0, y: 0, visible: false });
    const sectionNodesRef = useRef(new Map());
    const drawSessionRef = useRef({ active: false, lastPoint: null, addedDuringDrag: false, approvedCollisionKeys: new Set() });
    const drawThrottleRef = useRef({ lastAutoAddTs: 0 });
    const playbackSpeedRef = useRef(1);
    const DRAW_STEP_MIN_PX = 6;
    const DRAW_AUTO_INTERVAL_MS = 340;
    const COLLISION_ANIMATION_DURATION_MS = 900;
    const COLLISION_TRIGGER_PROGRESS = 0.25;

    const animRef = useRef(0);
    const actionCursorRef = useRef({ list: [], idx: 0, phase: 'idle', remainingPx: 0, remainingAngle: 0, moveDirection: 1, moveTotalPx: 0 });
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const rightEraseTimerRef = useRef(null);
    const rightPressActiveRef = useRef(false);
    const collisionPlaybackRef = useRef(new Map());
    const collisionAnimationRef = useRef({ active: false, timer: 0, obstacleIds: [], pose: null });
    const lastTickRef = useRef(Date.now());

    const currentSection = useMemo(() => sections.find(s => s.id === selectedSectionId) || sections[0], [sections, selectedSectionId]);

    const unitToPx = useCallback((d) => d * grid.pixelsPerUnit, [grid.pixelsPerUnit]);
    const pxToUnit = useCallback((px) => px / grid.pixelsPerUnit, [grid.pixelsPerUnit]);
    const normalizeAngle = useCallback((angle) => {
        let a = angle;
        while (a <= -Math.PI) a += 2 * Math.PI;
        while (a > Math.PI) a -= 2 * Math.PI;
        return a;
    }, []);

    const halfRobotLengthPx = useMemo(() => unitToPx(robot.length) / 2, [unitToPx, robot.length]);
    const halfRobotWidthPx = useMemo(() => unitToPx(robot.width) / 2, [unitToPx, robot.width]);

    const getReferencePoint = useCallback((pose, reference) => {
        if (!pose) return { x: 0, y: 0 };
        if (reference === 'tip') {
            return {
                x: pose.x + Math.cos(pose.theta) * halfRobotLengthPx,
                y: pose.y + Math.sin(pose.theta) * halfRobotLengthPx,
            };
        }
        return { x: pose.x, y: pose.y };
    }, [halfRobotLengthPx]);

    const activeObstacles = useMemo(
        () => obstacles.filter(obs => obs && obs.isActive !== false && Number.isFinite(obs.x) && Number.isFinite(obs.y)),
        [obstacles]
    );

    const formatObstacleNames = useCallback((ids) => {
        if (!ids?.length) return '';
        return ids
            .map(id => activeObstacles.find(obstacle => obstacle.id === id)?.name ?? '')
            .map(name => (typeof name === 'string' ? name.trim() : ''))
            .filter(Boolean)
            .join(', ');
    }, [activeObstacles]);

    const getObstacleRectBounds = useCallback((obstacle) => {
        if (!obstacle) return null;
        return {
            left: obstacle.x - obstacle.width / 2,
            right: obstacle.x + obstacle.width / 2,
            top: obstacle.y - obstacle.height / 2,
            bottom: obstacle.y + obstacle.height / 2,
        };
    }, []);

    const findObstacleAtPoint = useCallback((point) => {
        for (let i = obstacles.length - 1; i >= 0; i -= 1) {
            const obs = obstacles[i];
            if (!obs || obs.isActive === false) continue;
            const rect = getObstacleRectBounds(obs);
            if (!rect) continue;
            if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
                return obs;
            }
        }
        return null;
    }, [obstacles, getObstacleRectBounds]);

    const findObstacleHandleAtPoint = useCallback((point) => {
        if (!selectedObstacleId) return null;
        const obstacle = obstacles.find(obs => obs.id === selectedObstacleId);
        if (!obstacle || obstacle.isActive === false) return null;
        const rect = getObstacleRectBounds(obstacle);
        if (!rect) return null;
        const handleHalf = OBSTACLE_HANDLE_SIZE / 2;
        const handles = [
            { corner: 'top-left', x: rect.left, y: rect.top },
            { corner: 'top-right', x: rect.right, y: rect.top },
            { corner: 'bottom-right', x: rect.right, y: rect.bottom },
            { corner: 'bottom-left', x: rect.left, y: rect.bottom },
        ];
        for (const handle of handles) {
            if (Math.abs(point.x - handle.x) <= handleHalf && Math.abs(point.y - handle.y) <= handleHalf) {
                return { obstacleId: obstacle.id, corner: handle.corner, x: handle.x, y: handle.y, rect };
            }
        }
        return null;
    }, [obstacles, selectedObstacleId, getObstacleRectBounds]);

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

    const resetObstacleTransform = useCallback(() => {
        setObstacleTransform({ type: 'idle', obstacleId: null, corner: null, offsetX: 0, offsetY: 0, baseRect: null });
    }, []);

    const detectSegmentCollisions = useCallback((startPose, endPose) => {
        if (!startPose || !endPose || !activeObstacles.length) return [];
        const hits = new Set();
        const dx = endPose.x - startPose.x;
        const dy = endPose.y - startPose.y;
        const distance = Math.hypot(dx, dy);
        const deltaTheta = normalizeAngle(endPose.theta - startPose.theta);
        const sampleStepPx = Math.max(halfRobotWidthPx, 12);
        if (distance < 1e-3) {
            const steps = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (5 * DEG2RAD)));
            for (let i = 0; i <= steps; i += 1) {
                const t = steps === 0 ? 0 : i / steps;
                const pose = { x: startPose.x, y: startPose.y, theta: normalizeAngle(startPose.theta + deltaTheta * t) };
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

    const evaluateSegmentCollision = useCallback((startPose, endPose, reference) => {
        if (!startPose || !endPose) {
            return { startPoint: null, endPoint: null, collisions: [] };
        }
        const startPoint = getReferencePoint(startPose, reference);
        const endPoint = getReferencePoint(endPose, reference);
        const collisions = detectSegmentCollisions(startPose, endPose);
        return { startPoint, endPoint, collisions };
    }, [detectSegmentCollisions, getReferencePoint]);

    const toggleReverseDrawing = useCallback(() => {
        setReverseDrawing(prev => !prev);
    }, []);

    const handleReferenceModeChange = useCallback((mode) => {
        setReferenceMode(mode === 'tip' ? 'tip' : 'center');
    }, []);

    const handleZoomIn = useCallback(() => {
        setZoom(prev => {
            const next = Math.min(ZOOM_LIMITS.max, +(prev + ZOOM_LIMITS.step).toFixed(2));
            return next;
        });
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom(prev => {
            const next = Math.max(ZOOM_LIMITS.min, +(prev - ZOOM_LIMITS.step).toFixed(2));
            return next;
        });
    }, []);

    const handleZoomReset = useCallback(() => {
        setZoom(1);
    }, [setZoom]);

    const addObstacle = useCallback(() => {
        setObstacleMode(true);
        setDrawMode(false);
        setObstacles(prev => {
            const obstacle = {
                id: uid('obs'),
                name: `Obstaculo ${prev.length + 1}`,
                x: initialPose.x,
                y: initialPose.y,
                width: DEFAULT_OBSTACLE_SIZE.width,
                height: DEFAULT_OBSTACLE_SIZE.height,
                isActive: true,
                fillColor: DEFAULT_OBSTACLE_COLOR,
                opacity: DEFAULT_OBSTACLE_OPACITY,
            };
            setSelectedObstacleId(obstacle.id);
            resetObstacleTransform();
            return [...prev, obstacle];
        });
    }, [initialPose, resetObstacleTransform, setSelectedObstacleId, setObstacleMode, setDrawMode]);

    const updateObstacle = useCallback((id, updates) => {
        setObstacles(prev => prev.map(obstacle => (obstacle.id === id ? { ...obstacle, ...updates } : obstacle)));
    }, []);

    const removeObstacle = useCallback((id) => {
        setObstacles(prev => prev.filter(obstacle => obstacle.id !== id));
        setSelectedObstacleId(prev => (prev === id ? null : prev));
        setObstacleTransform(current => (current.obstacleId === id ? { type: 'idle', obstacleId: null, corner: null, offsetX: 0, offsetY: 0, baseRect: null } : current));
    }, []);

    useEffect(() => {
        return () => {
            if (rightEraseTimerRef.current) {
                clearInterval(rightEraseTimerRef.current);
                rightEraseTimerRef.current = null;
            }
            rightPressActiveRef.current = false;
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.repeat) return;
            if (event.code === 'Space' || event.key === ' ') {
                const target = event.target;
                const tagName = target?.tagName?.toLowerCase?.() ?? '';
                const isEditable = target?.isContentEditable;
                if (isEditable) return;
                if (['input', 'textarea', 'select', 'button'].includes(tagName)) return;
                event.preventDefault();
                toggleReverseDrawing();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleReverseDrawing]);

    useEffect(() => {
        drawSessionRef.current = { active: false, lastPoint: null, addedDuringDrag: false, approvedCollisionKeys: new Set() };
    }, [selectedSectionId]);

    useEffect(() => {
        if (obstacleMode) {
            setDrawMode(false);
            setHoverNode({ sectionId: null, key: null, pointIndex: -1, kind: null });
            drawSessionRef.current = { active: false, lastPoint: null, addedDuringDrag: false, approvedCollisionKeys: new Set() };
            setGhost(prev => (prev.active ? { ...prev, active: false, hasCollision: false, collisionObstacleIds: [] } : prev));
        } else {
            resetObstacleTransform();
        }
    }, [obstacleMode, resetObstacleTransform, setDrawMode, setGhost, setHoverNode]);

    useEffect(() => {
        if (selectedObstacleId && !obstacles.some(obs => obs.id === selectedObstacleId)) {
            setSelectedObstacleId(null);
            resetObstacleTransform();
        }
    }, [obstacles, selectedObstacleId, resetObstacleTransform]);

    useEffect(() => {
        if (!drawMode) {
            drawSessionRef.current = { active: false, lastPoint: null, addedDuringDrag: false, approvedCollisionKeys: new Set() };
        }
    }, [drawMode]);

    useEffect(() => {
        const base = 420;
        const min = 320;
        const zoomRange = Math.max(ZOOM_LIMITS.max - 1, 1);
        const ratio = zoom <= 1 ? 0 : Math.min((zoom - 1) / zoomRange, 1);
        const computed = base - (base - min) * ratio;
        const rootStyle = document.documentElement?.style;
        if (rootStyle) {
            rootStyle.setProperty('--panel-w', `${computed}px`);
        }
        return () => {
            if (rootStyle && !document.documentElement.contains(document.getElementById('root'))) {
                rootStyle.setProperty('--panel-w', `${base}px`);
            }
        };
    }, [zoom]);

    const computePoseUpToSection = useCallback((sectionId) => {
        let pose = { ...initialPose };
        for (const s of sections) {
            if (sectionId && s.id === sectionId) break;
            for (const act of s.actions) {
                if (act.type === 'rotate') { pose.theta = normalizeAngle(pose.theta + act.angle * DEG2RAD); }
                else { pose.x += Math.cos(pose.theta) * unitToPx(act.distance); pose.y += Math.sin(pose.theta) * unitToPx(act.distance); }
            }
        }
        return pose;
    }, [sections, initialPose, unitToPx, normalizeAngle]);

    const getPoseAfterActions = useCallback((startPose, actions) => {
        let pose = { ...startPose };
        for (const act of actions) {
            if (act.type === 'rotate') {
                pose.theta = normalizeAngle(pose.theta + act.angle * DEG2RAD);
            } else {
                const delta = unitToPx(act.distance);
                pose = {
                    x: pose.x + Math.cos(pose.theta) * delta,
                    y: pose.y + Math.sin(pose.theta) * delta,
                    theta: pose.theta,
                };
            }
        }
        return pose;
    }, [unitToPx, normalizeAngle]);

    const getLastPoseOfSection = useCallback((section) => {
        if (!section) return { ...initialPose };
        let pose = computePoseUpToSection(section.id);
        for (const pt of section.points || []) {
            const dx = pt.x - pose.x;
            const dy = pt.y - pose.y;
            const dist = Math.hypot(dx, dy);
            let nextTheta = typeof pt.heading === 'number' ? pt.heading : pose.theta;
            if (dist >= 1e-3) {
                const headingToPoint = Math.atan2(dy, dx);
                nextTheta = typeof pt.heading === 'number'
                    ? pt.heading
                    : normalizeAngle((pt.reverse ? headingToPoint + Math.PI : headingToPoint));
            }
            pose = { x: pt.x, y: pt.y, theta: nextTheta };
        }
        return pose;
    }, [computePoseUpToSection, normalizeAngle, initialPose]);

    const buildReversePlayback = useCallback((actions) => {
        const reversed = [];
        for (let i = actions.length - 1; i >= 0; i -= 1) {
            const act = actions[i];
            if (act.type === 'rotate') {
                const angle = Number((-act.angle).toFixed(2));
                if (Math.abs(angle) > 1e-3) {
                    reversed.push({ type: 'rotate', angle });
                }
            } else {
                const distance = Number((-act.distance).toFixed(2));
                if (Math.abs(distance) > 1e-3) {
                    const reversedMove = { type: 'move', distance, reference: act.reference || 'center' };
                    if (Array.isArray(act.collisionObstacleIds) && act.collisionObstacleIds.length) {
                        reversedMove.collisionObstacleIds = [...act.collisionObstacleIds];
                    }
                    if (act.collisionApproved) {
                        reversedMove.collisionApproved = true;
                    }
                    reversed.push(reversedMove);
                }
            }
        }
        return reversed;
    }, []);

    const buildActionsFromPolyline = useCallback((points, startPose) => {
        const acts = [];
        let prev = { ...startPose };
        for (const pt of points) {
            const dx = pt.x - prev.x;
            const dy = pt.y - prev.y;
            const distPx = Math.hypot(dx, dy);
            if (distPx < 1e-3) {
                prev = { ...prev, x: pt.x, y: pt.y };
                continue;
            }
            const segmentReverse = Boolean(pt.reverse);
            const segmentReference = pt.reference || 'center';
            const headingToPoint = Math.atan2(dy, dx);
            const storedHeading = typeof pt.heading === 'number'
                ? normalizeAngle(pt.heading)
                : normalizeAngle(headingToPoint + (segmentReverse ? Math.PI : 0));
            const targetHeading = storedHeading;
            const ang = normalizeAngle(targetHeading - prev.theta);
            const deg = ang * RAD2DEG;
            if (Math.abs(deg) > 1e-3) {
                acts.push({ type: 'rotate', angle: Number(deg.toFixed(2)) });
            }
            const cm = pxToUnit(distPx);
            if (cm > 1e-3) {
                const signed = segmentReverse ? -cm : cm;
                const moveAction = { type: 'move', distance: Number(signed.toFixed(2)), reference: segmentReference };
                if (Array.isArray(pt.collisionObstacleIds) && pt.collisionObstacleIds.length > 0) {
                    moveAction.collisionObstacleIds = [...new Set(pt.collisionObstacleIds)];
                    moveAction.collisionApproved = Boolean(pt.collisionApproved);
                }
                acts.push(moveAction);
            }
            prev = { x: pt.x, y: pt.y, theta: targetHeading };
        }
        return acts;
    }, [pxToUnit, normalizeAngle]);

    const pointsFromActions = useCallback((actions, startPose) => {
        const pts = [];
        let pose = { ...startPose };
        for (const a of actions) {
            if (a.type === 'rotate') {
                pose.theta = normalizeAngle(pose.theta + a.angle * DEG2RAD);
            } else {
                const direction = Math.sign(a.distance) || 1;
                const travelPx = unitToPx(Math.abs(a.distance));
                const dx = Math.cos(pose.theta) * travelPx * direction;
                const dy = Math.sin(pose.theta) * travelPx * direction;
                pose = {
                    x: pose.x + dx,
                    y: pose.y + dy,
                    theta: pose.theta,
                };
                pts.push({
                    x: pose.x,
                    y: pose.y,
                    reverse: a.distance < 0,
                    reference: a.reference || 'center',
                    heading: pose.theta,
                    collisionObstacleIds: Array.isArray(a.collisionObstacleIds) ? [...a.collisionObstacleIds] : [],
                    collisionApproved: Boolean(a.collisionApproved),
                });
            }
        }
        return pts;
    }, [unitToPx, normalizeAngle]);

    const recalcAllFollowingSections = useCallback((allSections, changedSectionId, options = {}) => {
        const changedIndex = allSections.findIndex(s => s.id === changedSectionId);
        if (changedIndex === -1) return allSections;

        const { preserveChangedSectionPoints = false } = options;

        const sectionsCopy = allSections.map(section => ({ ...section }));
        const advancePose = (start, actions) => {
            let pose = { ...start };
            for (const act of actions) {
                if (act.type === 'rotate') {
                    pose.theta += act.angle * DEG2RAD;
                } else {
                    const dx = Math.cos(pose.theta) * unitToPx(act.distance);
                    const dy = Math.sin(pose.theta) * unitToPx(act.distance);
                    pose = { x: pose.x + dx, y: pose.y + dy, theta: pose.theta };
                }
            }
            return pose;
        };

        let runningPose = { ...initialPose };

        for (let i = 0; i < sectionsCopy.length; i++) {
            const startPose = { ...runningPose };
            if (i > changedIndex || (i === changedIndex && !preserveChangedSectionPoints)) {
                const newPoints = pointsFromActions(sectionsCopy[i].actions, startPose);
                sectionsCopy[i] = { ...sectionsCopy[i], points: newPoints };
            }
            runningPose = advancePose(startPose, sectionsCopy[i].actions);
        }

        return sectionsCopy;
    }, [initialPose, pointsFromActions, unitToPx]);

    const updateSectionActions = useCallback((sectionId, newActions) => {
        setSections(prev => {
            let newSections = prev.map(s => { if (s.id !== sectionId) return s; const start = computePoseUpToSection(s.id); const pts = pointsFromActions(newActions, start); return { ...s, actions: newActions, points: pts }; });
            return recalcAllFollowingSections(newSections, sectionId);
        });
    }, [computePoseUpToSection, pointsFromActions, recalcAllFollowingSections]);

    const recalcSectionFromPoints = useCallback((section) => {
        const start = computePoseUpToSection(section.id); const acts = buildActionsFromPolyline(section.points, start); return { ...section, actions: acts };
    }, [computePoseUpToSection, buildActionsFromPolyline]);

    const removeLastPointFromCurrentSection = useCallback(() => {
        if (!currentSection) return;
        setSections(prev => {
            let changed = false;
            const updated = prev.map(s => {
                if (s.id !== currentSection.id) return s;
                if (!s.points.length) return s;
                changed = true;
                const newPts = s.points.slice(0, -1);
                return recalcSectionFromPoints({ ...s, points: newPts });
            });
            if (!changed) return prev;
            return recalcAllFollowingSections(updated, currentSection.id);
        });
    }, [currentSection, recalcAllFollowingSections, recalcSectionFromPoints, setSections]);

    const projectPointWithReference = useCallback((rawPoint, anchorPose, reference, reverse = false) => {
        const anchorRefPoint = reference === 'tip'
            ? getReferencePoint(anchorPose, 'tip')
            : { x: anchorPose.x, y: anchorPose.y };

        const dx = rawPoint.x - anchorRefPoint.x;
        const dy = rawPoint.y - anchorRefPoint.y;
        let distanceRef = Math.hypot(dx, dy);
        if (distanceRef < 1e-6) {
            const thetaIdle = reverse ? normalizeAngle(anchorPose.theta + Math.PI) : anchorPose.theta;
            return {
                center: { x: anchorPose.x, y: anchorPose.y },
                theta: thetaIdle,
                distanceCenter: 0,
                referenceDistance: 0,
            };
        }

        let travelTheta = Math.atan2(dy, dx);
        if (snap45) {
            let bestMatch = null;
            for (const baseAngle of SNAP_45_BASE_ANGLES) {
                const ux = Math.cos(baseAngle);
                const uy = Math.sin(baseAngle);
                const projection = dx * ux + dy * uy;
                const projX = anchorRefPoint.x + ux * projection;
                const projY = anchorRefPoint.y + uy * projection;
                const error = Math.hypot(projX - rawPoint.x, projY - rawPoint.y);
                const thetaCandidate = projection >= 0 ? baseAngle : normalizeAngle(baseAngle + Math.PI);
                const distanceCandidate = Math.abs(projection);
                if (!bestMatch || error < bestMatch.error) {
                    bestMatch = { theta: thetaCandidate, distance: distanceCandidate, error };
                }
            }
            if (bestMatch) {
                travelTheta = bestMatch.theta;
                distanceRef = bestMatch.distance;
            }
        }

        const facingTheta = reverse ? normalizeAngle(travelTheta + Math.PI) : normalizeAngle(travelTheta);
        let centerX;
        let centerY;
        if (reference === 'tip') {
            const finalTipX = anchorRefPoint.x + Math.cos(travelTheta) * distanceRef;
            const finalTipY = anchorRefPoint.y + Math.sin(travelTheta) * distanceRef;
            centerX = finalTipX - Math.cos(facingTheta) * halfRobotLengthPx;
            centerY = finalTipY - Math.sin(facingTheta) * halfRobotLengthPx;
        } else {
            centerX = anchorPose.x + Math.cos(travelTheta) * distanceRef;
            centerY = anchorPose.y + Math.sin(travelTheta) * distanceRef;
        }

        const distanceCenter = Math.hypot(centerX - anchorPose.x, centerY - anchorPose.y);

        return {
            center: { x: centerX, y: centerY },
            theta: facingTheta,
            distanceCenter,
            referenceDistance: distanceRef,
        };
    }, [getReferencePoint, halfRobotLengthPx, normalizeAngle, snap45]);

    const drawRobot = useCallback((ctx, pose, isGhost = false) => {
        ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.theta);
        const w = unitToPx(robot.width), l = unitToPx(robot.length);
        ctx.globalAlpha = (isGhost ? 0.5 : 1) * (robot.opacity ?? 1);
        if (robotImgObj) {
            ctx.drawImage(robotImgObj, -l / 2, -w / 2, l, w);
        } else {
            const wheelThickness = Math.max(unitToPx(1), Math.min(unitToPx(2), w * 0.32));
            const wheelLength = Math.max(l - unitToPx(4), l * 0.78);
            const wheelOffsetX = -wheelLength / 2;
            const wheelOffsetY = w / 2 + wheelThickness * 0.15;
            ctx.fillStyle = '#1f293b';
            ctx.fillRect(wheelOffsetX, -wheelOffsetY - wheelThickness, wheelLength, wheelThickness);
            ctx.fillRect(wheelOffsetX, wheelOffsetY, wheelLength, wheelThickness);

            ctx.fillStyle = robot.color;
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(-l / 2, -w / 2, l, w);
            ctx.fill();
            ctx.stroke();

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

    const appendPointToCurrentSection = useCallback((targetPoint, options = {}) => {
        if (!currentSection) return { success: false };

        const sectionId = currentSection.id;
        const segmentReference = options.reference || referenceMode;
        const reverseFlag = typeof options.reverse === 'boolean' ? options.reverse : reverseDrawing;

        const fallbackPose = currentSection.points.length
            ? getLastPoseOfSection(currentSection)
            : computePoseUpToSection(sectionId);

        let basePose = { ...fallbackPose };
        if (options.anchorPose && Number.isFinite(options.anchorPose.x) && Number.isFinite(options.anchorPose.y)) {
            basePose = {
                x: options.anchorPose.x,
                y: options.anchorPose.y,
                theta: typeof options.anchorPose.theta === 'number' ? options.anchorPose.theta : fallbackPose.theta,
            };
        } else if (drawSessionRef.current.lastPoint && Number.isFinite(drawSessionRef.current.lastPoint.x) && Number.isFinite(drawSessionRef.current.lastPoint.y)) {
            const { x, y, heading } = drawSessionRef.current.lastPoint;
            basePose = {
                x,
                y,
                theta: typeof heading === 'number' ? heading : fallbackPose.theta,
            };
        }

        const projection = projectPointWithReference(targetPoint, basePose, segmentReference, reverseFlag);
        if (!projection) return { success: false };

        const { center, theta, distanceCenter, referenceDistance } = projection;
        if ((distanceCenter ?? 0) < 1e-3 && (referenceDistance ?? 0) < 1e-3 && !options.allowZeroDistance) {
            return { success: false };
        }

        const previewTheta = typeof options.heading === 'number' ? options.heading : theta;
        const previewPose = { x: center.x, y: center.y, theta: previewTheta };
        const { collisions } = evaluateSegmentCollision(basePose, previewPose, segmentReference);
        const collisionIds = collisions.length ? [...new Set(collisions)] : [];

        let approvals = drawSessionRef.current.approvedCollisionKeys;
        if (!(approvals instanceof Set)) {
            approvals = new Set();
            drawSessionRef.current.approvedCollisionKeys = approvals;
        }

        if (collisionIds.length) {
            const sortedIds = [...collisionIds].sort();
            const key = `${segmentReference}:${sortedIds.join('|')}`;
            if (!approvals.has(key)) {
                const obstacleNames = formatObstacleNames(sortedIds);
                const label = obstacleNames
                    ? `${sortedIds.length > 1 ? 'los obstáculos' : 'el obstáculo'} ${obstacleNames}`
                    : (sortedIds.length > 1 ? 'varios obstáculos' : 'un obstáculo');
                const message = `El trayecto cruza ${label}. El robot colisionará. ¿Deseas continuar?`;
                const shouldContinue = window.confirm(message);
                if (!shouldContinue) {
                    return { success: false, aborted: true };
                }
                approvals.add(key);
            }
        }

        const centerPoint = {
            x: center.x,
            y: center.y,
            reverse: reverseFlag,
            reference: segmentReference,
            heading: previewTheta,
            collisionObstacleIds: collisionIds,
        };
        if (collisionIds.length) {
            centerPoint.collisionApproved = true;
        }

        setSections(prev => {
            const updated = prev.map(s => {
                if (s.id !== sectionId) return s;
                const newPts = [...s.points, centerPoint];
                return recalcSectionFromPoints({ ...s, points: newPts });
            });
            return recalcAllFollowingSections(updated, sectionId);
        });

        return { success: true, centerPoint };
    }, [currentSection, referenceMode, reverseDrawing, getLastPoseOfSection, computePoseUpToSection, projectPointWithReference, evaluateSegmentCollision, formatObstacleNames, setSections, recalcSectionFromPoints, recalcAllFollowingSections]);

    const findSectionNodeHit = useCallback((sectionId, point, radius = 10) => {
        if (!sectionId) return null;
        const nodes = sectionNodesRef.current.get(sectionId) || [];
        let closest = null;
        nodes.forEach(node => {
            const displayX = Number.isFinite(node.displayX) ? node.displayX : node.centerX;
            const displayY = Number.isFinite(node.displayY) ? node.displayY : node.centerY;
            const displayDist = Math.hypot(displayX - point.x, displayY - point.y);
            const centerDist = Math.hypot(node.centerX - point.x, node.centerY - point.y);
            const dist = Math.min(displayDist, centerDist);
            if (dist > radius) return;
            const hitX = displayDist <= centerDist ? displayX : node.centerX;
            const hitY = displayDist <= centerDist ? displayY : node.centerY;
            const priority = node.draggable ? 3 : (node.kind === 'rotation' ? 2 : 1);
            if (!closest || priority > closest.priority || (priority === closest.priority && dist < closest.distance)) {
                closest = { ...node, distance: dist, hitX, hitY, priority };
            }
        });
        if (closest) {
            const { priority: _priority, ...rest } = closest;
            return rest;
        }
        return null;
    }, []);

    const draw = useCallback(() => {
        const cvs = canvasRef.current; if (!cvs) return; const ctx = cvs.getContext('2d');
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        if (bgImage) { ctx.save(); ctx.globalAlpha = bgOpacity; ctx.drawImage(bgImage, 0, 0, cvs.width, cvs.height); ctx.restore(); }
        const step = unitToPx(grid.cellSize);
        if (step > 0) {
            ctx.save(); ctx.globalAlpha = grid.lineAlpha; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
            for (let x = grid.offsetX; x < cvs.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cvs.height); ctx.stroke(); }
            for (let x = grid.offsetX - step; x > 0; x -= step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cvs.height); ctx.stroke(); }
            for (let y = grid.offsetY; y < cvs.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cvs.width, y); ctx.stroke(); }
            for (let y = grid.offsetY - step; y > 0; y -= step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cvs.width, y); ctx.stroke(); }
            ctx.restore();
        }

        const collisionAnim = collisionAnimationRef.current;
        obstacles.forEach(obstacle => {
            if (obstacle.isActive === false) return;
            const halfW = obstacle.width / 2;
            const halfH = obstacle.height / 2;
            const animActive = collisionAnim?.active && Array.isArray(collisionAnim.obstacleIds) && collisionAnim.obstacleIds.includes(obstacle.id);
            const destructionProgress = animActive ? Math.min(1, Math.max(0, 1 - (collisionAnim.timer / COLLISION_ANIMATION_DURATION_MS))) : 0;
            const fadeFactor = animActive ? Math.max(0, 1 - destructionProgress) : 1;
            const fillOpacity = (Number.isFinite(obstacle.opacity) ? obstacle.opacity : DEFAULT_OBSTACLE_OPACITY) * fadeFactor;
            const strokeOpacity = Math.max(0.25, fadeFactor);
            const fillColor = hexToRgba(obstacle.fillColor || DEFAULT_OBSTACLE_COLOR, fillOpacity);
            const strokeColor = hexToRgba(obstacle.fillColor || DEFAULT_OBSTACLE_COLOR, strokeOpacity);
            const isSelected = obstacle.id === selectedObstacleId;

            ctx.save();
            ctx.translate(obstacle.x, obstacle.y);

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

            if (isSelected && obstacleMode && fadeFactor > 0.15) {
                const handleHalf = OBSTACLE_HANDLE_SIZE / 2;
                const handlePoints = [
                    { x: -halfW, y: -halfH },
                    { x: halfW, y: -halfH },
                    { x: halfW, y: halfH },
                    { x: -halfW, y: halfH },
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
    });
        sectionNodesRef.current.clear();
        sections.forEach(s => {
            if (s.isVisible === false || !s.points.length) return;
            const nodesForSection = [];
            const moveNodeRefs = [];
            const sectionStartPose = computePoseUpToSection(s.id);
            let pose = { ...sectionStartPose };
            let moveIndex = 0;
            s.points.forEach((pt, index) => {
                const segmentStartPose = { ...pose };
                const reference = pt.reference || 'center';
                const startDisplayPoint = getReferencePoint(pose, reference);
                const dx = pt.x - pose.x;
                const dy = pt.y - pose.y;
                const dist = Math.hypot(dx, dy);
                let segmentTheta = typeof pt.heading === 'number' ? pt.heading : pose.theta;
                if (dist >= 1e-3) {
                    const headingToPoint = Math.atan2(dy, dx);
                    segmentTheta = typeof pt.heading === 'number'
                        ? pt.heading
                        : normalizeAngle(pt.reverse ? headingToPoint + Math.PI : headingToPoint);
                }
                const endPose = { x: pt.x, y: pt.y, theta: segmentTheta };
                const endDisplayPoint = getReferencePoint(endPose, reference);
                const hasCollision = Array.isArray(pt.collisionObstacleIds) && pt.collisionObstacleIds.length > 0;
                const isReverse = Boolean(pt.reverse);
                const strokeBaseColor = hasCollision ? OBSTACLE_RENDER.blockedStroke : (s.color || '#000');
                const strokeColor = (!hasCollision && isReverse) ? applyAlphaToColor(strokeBaseColor, reference === 'tip' ? 0.75 : 0.68) : strokeBaseColor;
                const dashPattern = reference === 'tip'
                    ? (isReverse ? [12, 6, 4, 6] : [12, 8])
                    : (isReverse ? [6, 5] : []);
                ctx.save();
                ctx.lineWidth = reference === 'tip' ? 3.5 : 3;
                ctx.strokeStyle = strokeColor;
                ctx.setLineDash(dashPattern);
                ctx.beginPath();
                ctx.moveTo(startDisplayPoint.x, startDisplayPoint.y);
                ctx.lineTo(endDisplayPoint.x, endDisplayPoint.y);
                ctx.stroke();
                ctx.restore();
                const displayDx = endDisplayPoint.x - startDisplayPoint.x;
                const displayDy = endDisplayPoint.y - startDisplayPoint.y;
                const displayDist = Math.hypot(displayDx, displayDy);
                moveIndex += 1;
                if (displayDist > 1e-2) {
                    const midX = startDisplayPoint.x + displayDx * 0.5;
                    const midY = startDisplayPoint.y + displayDy * 0.5;
                    const angle = Math.atan2(displayDy, displayDx);
                    const arrowColor = hasCollision
                        ? OBSTACLE_RENDER.blockedStroke
                        : (isReverse ? applyAlphaToColor(s.color || '#1e293b', 0.9) : (s.color || '#1e293b'));
                    drawDirectionSymbol(ctx, midX, midY, angle, arrowColor, isReverse);
                    const perpX = displayDist > 0 ? (-displayDy / displayDist) : 0;
                    const perpY = displayDist > 0 ? (displayDx / displayDist) : 0;
                    const labelX = midX + perpX * 14;
                    const labelY = midY + perpY * 14;
                    drawMovementLabel(ctx, labelX, labelY, `${moveIndex}`, s.color || '#1e293b');
                }

                const moveNode = {
                    sectionId: s.id,
                    key: `${s.id}__move__${index}`,
                    pointIndex: index,
                    label: moveIndex,
                    centerX: pt.x,
                    centerY: pt.y,
                    displayX: endDisplayPoint.x,
                    displayY: endDisplayPoint.y,
                    startDisplayX: startDisplayPoint.x,
                    startDisplayY: startDisplayPoint.y,
                    reference,
                    isReverse,
                    hasCollision,
                    collisionObstacleIds: Array.isArray(pt.collisionObstacleIds) ? [...pt.collisionObstacleIds] : [],
                    startPose: segmentStartPose,
                    endPose,
                    heading: endPose.theta,
                    kind: 'move',
                    rotationAngle: 0,
                    actionIndex: null,
                    draggable: true,
                    markerRole: null,
                };

                nodesForSection.push(moveNode);
                moveNodeRefs.push(moveNode);

                pose = endPose;
            });

            const moveCount = moveNodeRefs.length;
            if (moveCount === 1) {
                moveNodeRefs[0].markerRole = 'single';
            } else if (moveCount > 1) {
                moveNodeRefs.forEach((nodeRef, idx) => {
                    if (idx === 0) nodeRef.markerRole = 'start';
                    else if (idx === moveCount - 1) nodeRef.markerRole = 'end';
                    else nodeRef.markerRole = 'middle';
                });
            }

            let actionCursorPose = { ...sectionStartPose };
            s.actions.forEach((act, actionIdx) => {
                if (act.type === 'rotate') {
                    const angleRad = act.angle * DEG2RAD;
                    if (Math.abs(angleRad) < 1e-6) {
                        actionCursorPose.theta = normalizeAngle(actionCursorPose.theta + angleRad);
                        return;
                    }
                    const rotationDisplay = getReferencePoint(actionCursorPose, 'center');
                    const endTheta = normalizeAngle(actionCursorPose.theta + angleRad);
                    nodesForSection.push({
                        sectionId: s.id,
                        key: `${s.id}__rot__${actionIdx}`,
                        pointIndex: -1,
                        label: null,
                        centerX: actionCursorPose.x,
                        centerY: actionCursorPose.y,
                        displayX: rotationDisplay.x,
                        displayY: rotationDisplay.y,
                        startDisplayX: rotationDisplay.x,
                        startDisplayY: rotationDisplay.y,
                        reference: 'center',
                        isReverse: false,
                        hasCollision: false,
                        collisionObstacleIds: [],
                        startPose: { ...actionCursorPose },
                        endPose: { x: actionCursorPose.x, y: actionCursorPose.y, theta: endTheta },
                        heading: endTheta,
                        kind: 'rotation',
                        rotationAngle: act.angle,
                        actionIndex: actionIdx,
                        draggable: false,
                        markerRole: null,
                    });
                    actionCursorPose = { ...actionCursorPose, theta: endTheta };
                    return;
                }
                if (act.type === 'move') {
                    const direction = Math.sign(act.distance) || 1;
                    const travelPx = unitToPx(Math.abs(act.distance));
                    const dx = Math.cos(actionCursorPose.theta) * travelPx * direction;
                    const dy = Math.sin(actionCursorPose.theta) * travelPx * direction;
                    actionCursorPose = {
                        x: actionCursorPose.x + dx,
                        y: actionCursorPose.y + dy,
                        theta: actionCursorPose.theta,
                    };
                }
            });

            sectionNodesRef.current.set(s.id, nodesForSection);

            nodesForSection.forEach(node => {
                const drawX = Number.isFinite(node.displayX) ? node.displayX : node.centerX;
                const drawY = Number.isFinite(node.displayY) ? node.displayY : node.centerY;
                const isEditing = !drawMode;
                const isDraggingNode = isEditing && node.draggable && dragging.active && dragging.sectionId === s.id && dragging.index === node.pointIndex;
                const isHoverNode = isEditing && hoverNode.sectionId === s.id && hoverNode.key === node.key;

                if (node.kind === 'rotation') {
                    const ringRadius = isHoverNode ? 8 : 6;
                    ctx.save();
                    ctx.beginPath();
                    ctx.lineWidth = isHoverNode ? 2.4 : 1.8;
                    ctx.strokeStyle = '#14b8a6';
                    ctx.arc(drawX, drawY, ringRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.setLineDash([4, 3]);
                    ctx.lineWidth = 1.2;
                    ctx.arc(drawX, drawY, Math.max(2, ringRadius - 3), 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                    return;
                }

                if (node.kind !== 'move') return;

                const baseRadius = 6;
                const radius = (isDraggingNode || isHoverNode) ? baseRadius + 2 : baseRadius;
                const pointCollision = node.hasCollision;
                const role = node.markerRole || 'middle';
                let fillColor;
                switch (role) {
                    case 'start':
                        fillColor = '#22c55e';
                        break;
                    case 'end':
                        fillColor = '#ef4444';
                        break;
                    case 'single':
                        fillColor = '#22c55e';
                        break;
                    case 'middle':
                    default:
                        fillColor = '#facc15';
                        break;
                }
                if (pointCollision) {
                    fillColor = OBSTACLE_RENDER.blockedStroke;
                }

                ctx.save();
                ctx.beginPath();
                ctx.shadowColor = 'rgba(15,23,42,0.28)';
                ctx.shadowBlur = 4;
                ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
                ctx.fillStyle = fillColor;
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.lineWidth = 2.2;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();

                if (role === 'single') {
                    ctx.beginPath();
                    ctx.arc(drawX, drawY, Math.max(2, radius * 0.45), 0, Math.PI * 2);
                    ctx.fillStyle = '#ef4444';
                    ctx.fill();
                    ctx.lineWidth = 1.1;
                    ctx.strokeStyle = '#ffffff';
                    ctx.stroke();
                }

                if (isDraggingNode || isHoverNode) {
                    ctx.lineWidth = 1.3;
                    ctx.strokeStyle = '#0f172a';
                    ctx.stroke();
                }

                if (pointCollision && role !== 'end') {
                    ctx.lineWidth = 1.3;
                    ctx.strokeStyle = OBSTACLE_RENDER.blockedStroke;
                    ctx.stroke();
                }

                ctx.restore();
            });
        });
        
        ctx.save(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(grid.offsetX - 10, grid.offsetY); ctx.lineTo(grid.offsetX + 10, grid.offsetY); ctx.moveTo(grid.offsetX, grid.offsetY - 10); ctx.lineTo(grid.offsetX, grid.offsetY + 10); ctx.stroke(); ctx.restore();

        if (!isRunning && currentSection) {
            let finalPose = computePoseUpToSection(currentSection.id);
            for (const act of currentSection.actions) {
                if (act.type === 'rotate') { finalPose.theta += act.angle * DEG2RAD; }
                else { finalPose.x += Math.cos(finalPose.theta) * unitToPx(act.distance); finalPose.y += Math.sin(finalPose.theta) * unitToPx(act.distance); }
            }
            if (showRobot) {
                drawRobot(ctx, finalPose, false);
            }
            if (drawMode && ghost.active) {
                const anchorPose = currentSection.points.length > 0
                    ? getLastPoseOfSection(currentSection)
                    : computePoseUpToSection(currentSection.id);
                const reference = ghost.reference || referenceMode;
                const fallbackOrigin = getReferencePoint(anchorPose, reference);
                const originX = Number.isFinite(ghost.originX) ? ghost.originX : fallbackOrigin.x;
                const originY = Number.isFinite(ghost.originY) ? ghost.originY : fallbackOrigin.y;
                const previewPose = { x: ghost.x, y: ghost.y, theta: ghost.theta };
                const previewPoint = getReferencePoint(previewPose, reference);
                ctx.save();
                ctx.setLineDash(reference === 'tip' ? [10, 6] : [8, 6]);
                const ghostStroke = ghost.hasCollision ? OBSTACLE_RENDER.blockedStroke : (reference === 'tip' ? '#fb923c' : (currentSection.color || '#64748b'));
                ctx.strokeStyle = ghostStroke;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(originX, originY);
                ctx.lineTo(previewPoint.x, previewPoint.y);
                ctx.stroke();
                ctx.restore();
                if (showRobot) {
                    drawRobot(ctx, previewPose, true);
                }
            }
        }

        if (rulerActive && rulerPoints.start && rulerPoints.end) {
            ctx.save();
            ctx.strokeStyle = '#f43f5e'; ctx.fillStyle = '#f43f5e'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(rulerPoints.start.x, rulerPoints.start.y); ctx.lineTo(rulerPoints.end.x, rulerPoints.end.y); ctx.stroke();
            ctx.beginPath(); ctx.arc(rulerPoints.start.x, rulerPoints.start.y, 4, 0, 2 * Math.PI); ctx.fill();
            ctx.beginPath(); ctx.arc(rulerPoints.end.x, rulerPoints.end.y, 4, 0, 2 * Math.PI); ctx.fill();
            const dx = rulerPoints.end.x - rulerPoints.start.x; const dy = rulerPoints.end.y - rulerPoints.start.y;
            const distPx = Math.hypot(dx, dy); const distCm = pxToUnit(distPx);
            const distLabel = unit === 'mm' ? `${(distCm * 10).toFixed(1)} mm` : `${distCm.toFixed(2)} cm`;
            const label = `${distLabel} (${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
            const angle = Math.atan2(dy, dx); const textAngle = (angle > -Math.PI / 2 && angle < Math.PI / 2) ? angle : angle + Math.PI;
            const midX = rulerPoints.start.x + dx / 2; const midY = rulerPoints.start.y + dy / 2;
            ctx.font = 'bold 13px sans-serif'; const textMetrics = ctx.measureText(label);
            ctx.translate(midX, midY); ctx.rotate(textAngle);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; ctx.fillRect(-textMetrics.width / 2 - 4, -18, textMetrics.width + 8, 18);
            ctx.fillStyle = '#f43f5e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, -9);
            ctx.restore();
        }

        if (isRunning) {
            ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(5, 5, 120, 20); ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; const { idx, list } = actionCursorRef.current; ctx.fillText(`Acci?n ${idx + 1}/${list.length}`, 10, 18); ctx.restore();
            if (showRobot) {
                drawRobot(ctx, playPose, false);
            }
            const anim = collisionAnimationRef.current;
            if (anim.active && anim.pose) {
                const intensity = Math.max(0, Math.min(1, anim.timer / COLLISION_ANIMATION_DURATION_MS));
                const baseRadius = unitToPx(robot.length);
                const pulseRadius = baseRadius * (0.45 + 0.35 * (1 - intensity));
                ctx.save();
                ctx.translate(anim.pose.x, anim.pose.y);
                ctx.globalAlpha = 0.45 + 0.35 * Math.sin((1 - intensity) * Math.PI * 4);
                ctx.strokeStyle = OBSTACLE_RENDER.blockedStroke;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 0.22;
                ctx.fillStyle = OBSTACLE_RENDER.blockedStroke;
                ctx.beginPath();
                ctx.arc(0, 0, pulseRadius * 0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        if (cursorGuide.visible) {
            ctx.save();
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(cursorGuide.x, 0);
            ctx.lineTo(cursorGuide.x, cvs.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, cursorGuide.y);
            ctx.lineTo(cvs.width, cursorGuide.y);
            ctx.stroke();
            ctx.restore();
        }
        ctx.save(); ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(initialPose.x, initialPose.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }, [bgImage, bgOpacity, grid, obstacles, sections, initialPose, drawMode, ghost, isRunning, playPose, dragging, hoverNode, unitToPx, computePoseUpToSection, drawRobot, currentSection, rulerActive, rulerPoints, pxToUnit, unit, getReferencePoint, getLastPoseOfSection, referenceMode, normalizeAngle, cursorGuide, obstacleMode, selectedObstacleId, robot, showRobot]);

    useEffect(() => { const preset = FIELD_PRESETS.find(p => p.key === fieldKey); if (!preset || !preset.bg) { setBgImage(null); return; } const img = new Image(); img.onload = () => setBgImage(img); img.src = preset.bg; }, [fieldKey]);
    useEffect(() => { if (!robot.imageSrc) { setRobotImgObj(null); return; } const img = new Image(); img.onload = () => setRobotImgObj(img); img.src = robot.imageSrc; }, [robot.imageSrc]);
    useEffect(() => {
        const handleResize = () => {
            const el = containerRef.current;
            const cvs = canvasRef.current;
            if (!el || !cvs) return;
            const r = el.getBoundingClientRect();
            const targetAspect = MAT_CM.w / MAT_CM.h;
            const cssW = Math.max(200, Math.floor(r.width));
            const cssH = Math.floor(cssW / targetAspect);
            cvs.width = cssW;
            cvs.height = cssH;
            setCanvasBaseSize({ width: cssW, height: cssH });
            setGrid(g => ({ ...g, pixelsPerUnit: cssW / MAT_CM.w }));
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [setGrid]);

    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const { width, height } = canvasBaseSize;
        if (!width || !height) return;
        cvs.style.width = `${width * zoom}px`;
        cvs.style.height = `${height * zoom}px`;
    }, [canvasBaseSize, zoom]);
    useEffect(() => { const handleKeyDown = (e) => { if (e.key === 'Escape') { setDrawMode(false); } }; window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, []);
    useEffect(() => { draw(); }, [draw]);
    useEffect(() => {
        playbackSpeedRef.current = playbackSpeedMultiplier;
    }, [playbackSpeedMultiplier]);
    useEffect(() => {
        if (drawMode) {
            setHoverNode({ sectionId: null, key: null, pointIndex: -1, kind: null });
        }
    }, [drawMode, setHoverNode]);

    useEffect(() => {
        if (!sections.length) return;
        let poseCursor = { ...initialPose };
        let changed = false;
        const recalculated = sections.map(section => {
            const sectionStartPose = { ...poseCursor };
            let anchorPose = { ...sectionStartPose };
            let pointsChanged = false;
            const updatedPoints = section.points.map(pt => {
                const nextTheta = typeof pt.heading === 'number' ? pt.heading : anchorPose.theta;
                const endPose = { x: pt.x, y: pt.y, theta: nextTheta };
                const { collisions } = evaluateSegmentCollision(anchorPose, endPose, pt.reference || 'center');
                const normalizedCollisions = collisions.length ? [...new Set(collisions)] : [];
                const prevCollisions = Array.isArray(pt.collisionObstacleIds) ? pt.collisionObstacleIds : [];
                const collisionsChanged = !sameIdList(normalizedCollisions, prevCollisions);
                const approved = normalizedCollisions.length ? (Boolean(pt.collisionApproved) && !collisionsChanged) : false;
                const shouldUpdate = collisionsChanged || approved !== Boolean(pt.collisionApproved);
                anchorPose = { x: endPose.x, y: endPose.y, theta: endPose.theta };
                if (shouldUpdate) {
                    pointsChanged = true;
                    return { ...pt, collisionObstacleIds: normalizedCollisions, collisionApproved: approved };
                }
                return pt;
            });
            const finalPoints = pointsChanged ? updatedPoints : section.points;
            const newActions = buildActionsFromPolyline(finalPoints, sectionStartPose);
            const actionsChanged = section.actions.length !== newActions.length || section.actions.some((act, idx) => {
                const other = newActions[idx];
                if (!other) return true;
                const keys = Object.keys({ ...act, ...other });
                for (const key of keys) {
                    const valA = act[key];
                    const valB = other[key];
                    if (Array.isArray(valA) || Array.isArray(valB)) {
                        const arrA = Array.isArray(valA) ? valA : [];
                        const arrB = Array.isArray(valB) ? valB : [];
                        if (!sameIdList(arrA, arrB)) return true;
                    } else if (valA !== valB) {
                        return true;
                    }
                }
                return false;
            });
            const finalActions = actionsChanged ? newActions : section.actions;
            poseCursor = getPoseAfterActions(sectionStartPose, finalActions);
            if (pointsChanged || actionsChanged) {
                changed = true;
                return { ...section, points: finalPoints, actions: finalActions };
            }
            return section;
        });
        if (changed) {
            setSections(recalculated);
        }
    }, [sections, activeObstacles, initialPose, evaluateSegmentCollision, buildActionsFromPolyline, getPoseAfterActions]);

    const canvasPos = (e, applySnapping = true) => {
        const canvasEl = canvasRef.current;
        const rect = canvasEl.getBoundingClientRect();
        const scaleX = rect.width > 0 ? (canvasEl.width / rect.width) : 1;
        const scaleY = rect.height > 0 ? (canvasEl.height / rect.height) : 1;
        let x = (e.clientX - rect.left) * scaleX;
        let y = (e.clientY - rect.top) * scaleY;
        if (snapGrid && applySnapping) {
            const step = unitToPx(grid.cellSize);
            x = Math.round((x - grid.offsetX) / step) * step + grid.offsetX;
            y = Math.round((y - grid.offsetY) / step) * step + grid.offsetY;
        }
        return { x, y };
    };

    const onCanvasDown = (e) => {
        if (isSettingOrigin) return;
        if (obstacleMode) {
            if (e.button !== 0) return;
            const point = canvasPos(e, false);
            const handleHit = findObstacleHandleAtPoint(point);
            if (handleHit) {
                const rect = handleHit.rect;
                const opposite = (() => {
                    switch (handleHit.corner) {
                        case 'top-left':
                            return { x: rect.right, y: rect.bottom };
                        case 'top-right':
                            return { x: rect.left, y: rect.bottom };
                        case 'bottom-right':
                            return { x: rect.left, y: rect.top };
                        case 'bottom-left':
                        default:
                            return { x: rect.right, y: rect.top };
                    }
                })();
                setSelectedObstacleId(handleHit.obstacleId);
                setObstacleTransform({
                    type: 'resize',
                    obstacleId: handleHit.obstacleId,
                    corner: handleHit.corner,
                    offsetX: 0,
                    offsetY: 0,
                    baseRect: { opposite },
                });
                return;
            }
            const obstacleHit = findObstacleAtPoint(point);
            if (obstacleHit) {
                setSelectedObstacleId(obstacleHit.id);
                setObstacleTransform({
                    type: 'pending-drag',
                    obstacleId: obstacleHit.id,
                    corner: null,
                    offsetX: point.x - obstacleHit.x,
                    offsetY: point.y - obstacleHit.y,
                    baseRect: { startX: point.x, startY: point.y },
                });
                return;
            }
            setSelectedObstacleId(null);
            resetObstacleTransform();
            return;
        }
        if (e.button === 2) {
            e.preventDefault();
            if (!drawMode || !currentSection) return;
            rightPressActiveRef.current = true;
            removeLastPointFromCurrentSection();
            clearInterval(rightEraseTimerRef.current);
            rightEraseTimerRef.current = window.setInterval(() => {
                if (rightPressActiveRef.current) {
                    removeLastPointFromCurrentSection();
                }
            }, 120);
            return;
        }
        if (rulerActive) {
            const p = canvasPos(e, false);
            setRulerPoints({ start: p, end: p });
            setIsDraggingRuler(true);
            return;
        }
        if (e.button !== 0) return;
        if (drawMode && currentSection) {
            const basePose = currentSection.points.length
                ? getLastPoseOfSection(currentSection)
                : computePoseUpToSection(currentSection.id);
            drawSessionRef.current = {
                active: true,
                lastPoint: { x: basePose.x, y: basePose.y, heading: basePose.theta },
                addedDuringDrag: false,
                approvedCollisionKeys: new Set(),
            };
            drawThrottleRef.current.lastAutoAddTs = 0;
            return;
        }
        if (drawMode) return;
        const p = canvasPos(e);
        if (Math.hypot(initialPose.x - p.x, initialPose.y - p.y) <= 10) { setDraggingStart(true); return; }
        if (currentSection) {
            const nodeHit = findSectionNodeHit(currentSection.id, p, 10);
            if (nodeHit && nodeHit.draggable && Number.isInteger(nodeHit.pointIndex)) {
                setDragging({ active: true, sectionId: currentSection.id, index: nodeHit.pointIndex });
            }
        }
    };


    const onCanvasMove = (e) => {
        if (obstacleMode) {
            const rawPoint = canvasPos(e, false);
            setCursorGuide({ x: rawPoint.x, y: rawPoint.y, visible: true });
            if (obstacleTransform.type === 'pending-drag') {
                const startX = obstacleTransform.baseRect?.startX ?? rawPoint.x;
                const startY = obstacleTransform.baseRect?.startY ?? rawPoint.y;
                const distance = Math.hypot(rawPoint.x - startX, rawPoint.y - startY);
                if (distance < OBSTACLE_DRAG_THRESHOLD) {
                    return;
                }
                const target = obstacles.find(obs => obs.id === obstacleTransform.obstacleId);
                if (!target) {
                    resetObstacleTransform();
                    return;
                }
                const dragTransform = {
                    type: 'drag',
                    obstacleId: obstacleTransform.obstacleId,
                    corner: null,
                    offsetX: obstacleTransform.offsetX,
                    offsetY: obstacleTransform.offsetY,
                    baseRect: null,
                };
                setObstacleTransform(dragTransform);
                const nextX = rawPoint.x - dragTransform.offsetX;
                const nextY = rawPoint.y - dragTransform.offsetY;
                setObstacles(prev => prev.map(obs => (obs.id === target.id ? { ...obs, x: nextX, y: nextY } : obs)));
                return;
            }
            if (obstacleTransform.type === 'drag') {
                const target = obstacles.find(obs => obs.id === obstacleTransform.obstacleId);
                if (!target) {
                    resetObstacleTransform();
                    return;
                }
                const nextX = rawPoint.x - obstacleTransform.offsetX;
                const nextY = rawPoint.y - obstacleTransform.offsetY;
                setObstacles(prev => prev.map(obs => (obs.id === target.id ? { ...obs, x: nextX, y: nextY } : obs)));
            } else if (obstacleTransform.type === 'resize') {
                const target = obstacles.find(obs => obs.id === obstacleTransform.obstacleId);
                if (!target) {
                    resetObstacleTransform();
                    return;
                }
                const opposite = obstacleTransform.baseRect?.opposite;
                if (!opposite) return;
                const minSize = 10;
                const px = rawPoint.x;
                const py = rawPoint.y;
                const nextWidth = Math.max(minSize, Math.abs(opposite.x - px));
                const nextHeight = Math.max(minSize, Math.abs(opposite.y - py));
                const centerX = (opposite.x + px) / 2;
                const centerY = (opposite.y + py) / 2;
                setObstacles(prev => prev.map(obs => (obs.id === target.id ? { ...obs, x: centerX, y: centerY, width: nextWidth, height: nextHeight } : obs)));
            }
            return;
        }
        const rawPoint = canvasPos(e, false);
        setCursorGuide({ x: rawPoint.x, y: rawPoint.y, visible: true });

        if (!drawMode || !currentSection) {
            setGhost(prev => (prev.active ? { ...prev, active: false, hasCollision: false, collisionObstacleIds: [] } : prev));
        }

        if (rulerActive && isDraggingRuler) {
            setRulerPoints(prev => ({ ...prev, end: rawPoint }));
            return;
        }

        const p = snapGrid ? canvasPos(e, true) : rawPoint;

        if (draggingStart) {
            setInitialPose(prev => ({ ...prev, x: p.x, y: p.y }));
            setSections(prev => {
                const newSections = prev.map(sec => recalcSectionFromPoints(sec));
                return recalcAllFollowingSections(newSections, prev[0].id);
            });
            return;
        }

        if (dragging.active) {
            setSections(prev => {
                const newSections = prev.map(s => {
                    if (s.id !== dragging.sectionId) return s;
                    const pts = s.points.map((pt, i) => (i === dragging.index ? { ...pt, x: p.x, y: p.y } : pt));
                    return recalcSectionFromPoints({ ...s, points: pts });
                });
                return recalcAllFollowingSections(newSections, dragging.sectionId, { preserveChangedSectionPoints: true });
            });
            return;
        }

        if (!drawMode && currentSection) {
            const nodeHit = findSectionNodeHit(currentSection.id, p, 10);
            if (nodeHit) {
                setHoverNode({
                    sectionId: currentSection.id,
                    key: nodeHit.key || null,
                    pointIndex: Number.isInteger(nodeHit.pointIndex) ? nodeHit.pointIndex : -1,
                    kind: nodeHit.kind || null,
                });
            } else {
                setHoverNode({ sectionId: null, key: null, pointIndex: -1, kind: null });
            }
            return;
        }

        if (drawMode && currentSection) {
            const segmentReference = referenceMode;
            const basePose = currentSection.points.length
                ? getLastPoseOfSection(currentSection)
                : computePoseUpToSection(currentSection.id);
            const activeSession = drawSessionRef.current.active;
            let anchorPose = basePose;
            if (activeSession && drawSessionRef.current.lastPoint) {
                const last = drawSessionRef.current.lastPoint;
                anchorPose = {
                    x: last.x,
                    y: last.y,
                    theta: typeof last.heading === 'number' ? last.heading : basePose.theta,
                };
            }

            const projection = projectPointWithReference(p, anchorPose, segmentReference, reverseDrawing);
            const previewPose = { x: projection.center.x, y: projection.center.y, theta: projection.theta };
            const { startPoint: segmentStart, endPoint: segmentEnd, collisions } = evaluateSegmentCollision(anchorPose, previewPose, segmentReference);
            const fallbackOrigin = segmentStart || getReferencePoint(anchorPose, segmentReference);
            const previewDisplay = segmentEnd || getReferencePoint(previewPose, segmentReference);
            setGhost({
                x: previewPose.x,
                y: previewPose.y,
                theta: previewPose.theta,
                reference: segmentReference,
                displayX: previewDisplay.x,
                displayY: previewDisplay.y,
                originX: fallbackOrigin.x,
                originY: fallbackOrigin.y,
                active: true,
                hasCollision: collisions.length > 0,
                collisionObstacleIds: collisions,
            });

            if (activeSession) {
                const dist = segmentReference === 'tip' ? projection.referenceDistance : projection.distanceCenter;
                if (dist >= DRAW_STEP_MIN_PX) {
                    const now = Date.now();
                    const last = drawThrottleRef.current.lastAutoAddTs;
                    if (now - last < DRAW_AUTO_INTERVAL_MS) {
                        return;
                    }
                    const result = appendPointToCurrentSection(p, {
                        reference: segmentReference,
                        reverse: reverseDrawing,
                        heading: projection.theta,
                        anchorPose,
                    });
                    if (result?.success && result.centerPoint) {
                        const approvals = drawSessionRef.current.approvedCollisionKeys instanceof Set
                            ? drawSessionRef.current.approvedCollisionKeys
                            : new Set();
                        drawSessionRef.current = {
                            active: true,
                            lastPoint: {
                                x: result.centerPoint.x,
                                y: result.centerPoint.y,
                                heading: result.centerPoint.heading ?? projection.theta,
                            },
                            addedDuringDrag: true,
                            approvedCollisionKeys: approvals,
                        };
                        drawThrottleRef.current.lastAutoAddTs = now;
                    } else if (result?.aborted) {
                        drawSessionRef.current = { active: false, lastPoint: null, addedDuringDrag: false, approvedCollisionKeys: new Set() };
                    }
                }
            }
        }
    };

    const onCanvasUp = () => {
        if (obstacleMode) {
            rightPressActiveRef.current = false;
            resetObstacleTransform();
            return;
        }
        rightPressActiveRef.current = false;
        if (rightEraseTimerRef.current) {
            clearInterval(rightEraseTimerRef.current);
            rightEraseTimerRef.current = null;
        }
        if (rulerActive) {
            setIsDraggingRuler(false);
            return;
        }
        setDraggingStart(false);
        setDragging({ active: false, sectionId: null, index: -1 });
        if (drawSessionRef.current.active) {
            drawSessionRef.current = { active: false, lastPoint: null, addedDuringDrag: drawSessionRef.current.addedDuringDrag, approvedCollisionKeys: new Set() };
        }
        drawThrottleRef.current.lastAutoAddTs = 0;
        setGhost(prev => (prev.active ? { ...prev, active: false, hasCollision: false, collisionObstacleIds: [] } : prev));
    };

    const onCanvasLeave = () => {
        setCursorGuide(prev => ({ ...prev, visible: false }));
        onCanvasUp();
    };

    const onCanvasClick = (e) => {
        if (obstacleMode) return;
        if (isSettingOrigin) {
            const p = canvasPos(e, false);
            setGrid(g => ({ ...g, offsetX: p.x, offsetY: p.y }));
            setIsSettingOrigin(false);
            return;
        }
        if (rulerActive) return;
        if (!drawMode || !currentSection) return;
        if (drawSessionRef.current.addedDuringDrag) {
            drawSessionRef.current = { active: false, lastPoint: null, addedDuringDrag: false, approvedCollisionKeys: new Set() };
            return;
        }
        const rawPoint = canvasPos(e, false);
        const p = snapGrid ? canvasPos(e, true) : rawPoint;
        const result = appendPointToCurrentSection(p, {
            reference: referenceMode,
            reverse: reverseDrawing,
        });
        if (result?.success) {
            drawSessionRef.current = { active: false, lastPoint: null, addedDuringDrag: false, approvedCollisionKeys: new Set() };
            drawThrottleRef.current.lastAutoAddTs = Date.now();
        } else if (result?.aborted) {
            drawSessionRef.current = { active: false, lastPoint: null, addedDuringDrag: false, approvedCollisionKeys: new Set() };
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
    };

    const stopPlayback = useCallback(() => {
        cancelAnimationFrame(animRef.current);
        setIsRunning(false);
        setIsPaused(false);
        actionCursorRef.current = { list: [], idx: 0, phase: 'idle', remainingPx: 0, remainingAngle: 0, moveDirection: 1, moveTotalPx: 0 };
        collisionPlaybackRef.current = new Map();
        lastTickRef.current = Date.now();
        collisionAnimationRef.current = { active: false, timer: 0, obstacleIds: [], pose: null };
        setPlayPose({ ...initialPose });
    }, [initialPose]);
    const tick = useCallback(() => {
        if (isPaused) { lastTickRef.current = Date.now(); animRef.current = requestAnimationFrame(tick); return; }
        const nowTs = Date.now();
        const deltaMs = Math.max(0, nowTs - lastTickRef.current);
        lastTickRef.current = nowTs;
        const currentAnim = collisionAnimationRef.current;
        if (currentAnim.active) {
            currentAnim.timer -= deltaMs;
            if (currentAnim.timer <= 0) {
                collisionAnimationRef.current = { active: false, timer: 0, obstacleIds: [], pose: null };
            }
        }
        const ac = actionCursorRef.current;
        if (ac.idx >= ac.list.length) { stopPlayback(); return; }
        const a = ac.list[ac.idx];
        const speedMultiplier = Math.max(0.05, playbackSpeedRef.current);
        const rotStepPerMs = (PLAYBACK_ROTATION_DEG_PER_SEC * DEG2RAD * speedMultiplier) / 1000;
        const speedPxPerMs = unitToPx(PLAYBACK_LINEAR_SPEED_UNITS_PER_SEC * speedMultiplier) / 1000;
        setPlayPose(prev => {
            let pose = { ...prev };
            if (a.type === 'rotate') {
                if (ac.phase !== 'rotate') {
                    ac.phase = 'rotate';
                    ac.remainingAngle = a.angle * DEG2RAD;
                }
                const remaining = ac.remainingAngle;
                if (Math.abs(remaining) < 1e-3) {
                    ac.phase = 'idle';
                    ac.idx++;
                    return pose;
                }
                const maxStep = rotStepPerMs * deltaMs;
                const step = Math.sign(remaining) * Math.min(Math.abs(remaining), maxStep);
                pose.theta += step;
                ac.remainingAngle -= step;
                if (Math.abs(ac.remainingAngle) < 1e-3) {
                    ac.phase = 'idle';
                    ac.idx++;
                }
            } else {
                if (ac.phase !== 'move') {
                    ac.phase = 'move';
                    ac.remainingPx = unitToPx(Math.abs(a.distance));
                    ac.moveTotalPx = ac.remainingPx;
                    ac.moveDirection = Math.sign(a.distance) || 1;
                }
                const remainingPx = ac.remainingPx ?? 0;
                if (remainingPx < 1e-3) {
                    ac.phase = 'idle';
                    ac.idx++;
                    ac.moveTotalPx = 0;
                    return pose;
                }
                const maxStep = speedPxPerMs * deltaMs;
                const step = Math.min(maxStep, remainingPx);
                const direction = ac.moveDirection ?? 1;
                pose.x += Math.cos(pose.theta) * step * direction;
                pose.y += Math.sin(pose.theta) * step * direction;
                ac.remainingPx = remainingPx - step;
                const totalPx = ac.moveTotalPx || (ac.remainingPx + step);
                if (totalPx > 0) {
                    const traveledPx = totalPx - ac.remainingPx;
                    const progress = traveledPx / totalPx;
                    const event = collisionPlaybackRef.current.get(ac.idx);
                    if (event && Array.isArray(event.obstacleIds) && event.obstacleIds.length) {
                        if (!event.triggered && progress >= COLLISION_TRIGGER_PROGRESS) {
                            collisionAnimationRef.current = {
                                active: true,
                                timer: COLLISION_ANIMATION_DURATION_MS,
                                obstacleIds: event.obstacleIds,
                                pose: { ...pose },
                            };
                            event.triggered = true;
                        } else if (event.triggered && collisionAnimationRef.current.active) {
                            collisionAnimationRef.current.pose = { ...pose };
                        }
                    }
                }
                if ((ac.remainingPx ?? 0) < 1e-3) {
                    ac.phase = 'idle';
                    ac.idx++;
                    ac.moveTotalPx = 0;
                }
            }
            return pose;
        });
        animRef.current = requestAnimationFrame(tick);
    }, [isPaused, stopPlayback, unitToPx]);
    const startPlayback = useCallback((list, startPose) => {
        if (!list.length) return;
        cancelAnimationFrame(animRef.current);
        setIsRunning(true);
        setIsPaused(false);
        const collisionMap = new Map();
        list.forEach((action, index) => {
            if (action.type === 'move' && action.collisionApproved && Array.isArray(action.collisionObstacleIds) && action.collisionObstacleIds.length) {
                collisionMap.set(index, { obstacleIds: [...new Set(action.collisionObstacleIds)], triggered: false });
            }
        });
        collisionPlaybackRef.current = collisionMap;
        collisionAnimationRef.current = { active: false, timer: 0, obstacleIds: [], pose: null };
        lastTickRef.current = Date.now();
        actionCursorRef.current = { list: [...list], idx: 0, phase: 'idle', remainingPx: 0, remainingAngle: 0, moveDirection: 1, moveTotalPx: 0 };
        setPlayPose({ ...startPose });
        animRef.current = requestAnimationFrame(tick);
    }, [tick]);

    const startMission = useCallback(() => {
        const list = sections.flatMap(s => s.actions);
        startPlayback(list, initialPose);
    }, [sections, initialPose, startPlayback]);

    const startMissionReverse = useCallback(() => {
        const list = sections.flatMap(s => s.actions);
        if (!list.length) return;
        const endPose = getPoseAfterActions(initialPose, list);
        const reverseList = buildReversePlayback(list);
        if (!reverseList.length) return;
        startPlayback(reverseList, endPose);
    }, [sections, initialPose, getPoseAfterActions, buildReversePlayback, startPlayback]);

    const startSection = useCallback(() => {
        if (!currentSection) return;
        const startPose = computePoseUpToSection(currentSection.id);
        startPlayback(currentSection.actions, startPose);
    }, [currentSection, computePoseUpToSection, startPlayback]);

    const startSectionReverse = useCallback(() => {
        if (!currentSection) return;
        const forwardList = currentSection.actions;
        if (!forwardList.length) return;
        const startPose = computePoseUpToSection(currentSection.id);
        const endPose = getPoseAfterActions(startPose, forwardList);
        const reverseList = buildReversePlayback(forwardList);
        if (!reverseList.length) return;
        startPlayback(reverseList, endPose);
    }, [currentSection, computePoseUpToSection, getPoseAfterActions, buildReversePlayback, startPlayback]);

    const pauseResume = () => { if (!isRunning) return; setIsPaused(p => !p); };

    const handleRulerToggle = () => {
        const isTurningOn = !rulerActive;
        setRulerActive(isTurningOn);
        if (isTurningOn) {
            setDrawMode(false);
        } else {
            setRulerPoints({ start: null, end: null });
        }
    };
    const toggleRobotVisibility = useCallback(() => {
        setShowRobot(prev => !prev);
    }, [setShowRobot]);
    const handlePlaybackSpeedChange = useCallback((value) => {
        if (!Number.isFinite(value)) return;
        setPlaybackSpeedMultiplier(Math.min(2, Math.max(0.25, value)));
    }, [setPlaybackSpeedMultiplier]);
    const addSection = () => { const id = uid('sec'); const lastSectionColor = sections.length > 0 ? sections[sections.length - 1].color : robot.color; const newSec = { id, name: `Sección ${sections.length + 1}`, points: [], actions: [], color: lastSectionColor, isVisible: true }; setSections(prev => [...prev, newSec]); setSelectedSectionId(id); setExpandedSections(prev => [...prev, id]); setDrawMode(true); };
    const toggleSectionExpansion = (id) => { setExpandedSections(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]); };
    const toggleSectionVisibility = (id) => { setSections(secs => secs.map(s => s.id === id ? { ...s, isVisible: !s.isVisible } : s)); };
    const handleBgUpload = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = () => setBgImage(img); img.src = r.result; }; r.readAsDataURL(f); };
    const handleRobotImageUpload = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setRobot(rbt => ({ ...rbt, imageSrc: r.result })); r.readAsDataURL(f); };
    const exportMission = () => { const payload = { fieldKey, grid: { ...grid, cellSize: grid.cellSize }, robot: { ...robot, imageSrc: null }, initialPose, sections, obstacles, bgOpacity }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `wro_mission_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`; a.click(); URL.revokeObjectURL(url); };
    const importMission = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const data = JSON.parse(r.result); if (Array.isArray(data.sections)) setSections(data.sections.map(s => ({...s, isVisible: s.isVisible !== false}))); if (Array.isArray(data.obstacles)) setObstacles(data.obstacles.map(obs => ({ id: obs.id || uid('obs'), name: obs.name || 'Obstaculo', x: (() => { const n = Number(obs.x); return Number.isFinite(n) ? n : 0; })(), y: (() => { const n = Number(obs.y); return Number.isFinite(n) ? n : 0; })(), width: (() => { const n = Number(obs.width); return Number.isFinite(n) ? n : DEFAULT_OBSTACLE_SIZE.width; })(), height: (() => { const n = Number(obs.height); return Number.isFinite(n) ? n : DEFAULT_OBSTACLE_SIZE.height; })(), isActive: obs.isActive !== false, fillColor: typeof obs.fillColor === 'string' && obs.fillColor.trim() ? obs.fillColor : DEFAULT_OBSTACLE_COLOR, opacity: (() => { const val = Number(obs.opacity); return Number.isFinite(val) ? Math.min(1, Math.max(0, val)) : DEFAULT_OBSTACLE_OPACITY; })() }))); if (data.initialPose) setInitialPose(data.initialPose); if (data.robot) setRobot(prev => ({ ...prev, ...data.robot })); if (data.grid) setGrid(prev => ({ ...prev, ...data.grid })); if (data.fieldKey) setFieldKey(data.fieldKey); if (typeof data.bgOpacity === 'number') setBgOpacity(data.bgOpacity); } catch (err) { console.error('Invalid mission file', err); alert('No se pudo importar: archivo inválido'); } }; r.readAsText(f); };return (
        <div className="w-full h-full min-h-screen">
            <main className="app-shell">
                <Toolbar
                    {...{
                        drawMode,
                        setDrawMode,
                        obstacleMode,
                        setObstacleMode,
                        snap45,
                        setSnap45,
                        snapGrid,
                        setSnapGrid,
                        isRunning,
                        isPaused,
                        startMission,
                        startMissionReverse,
                        startSection,
                        startSectionReverse,
                        pauseResume,
                        stopPlayback,
                        setShowOptions,
                        rulerActive,
                        handleRulerToggle,
                        showRobot,
                        onToggleRobot: toggleRobotVisibility,
                        playbackSpeedMultiplier,
                        onPlaybackSpeedChange: handlePlaybackSpeedChange,
                        reverseDrawing,
                        onToggleReverse: toggleReverseDrawing,
                        referenceMode,
                        onReferenceModeChange: handleReferenceModeChange,
                        zoom,
                        onZoomIn: handleZoomIn,
                        onZoomOut: handleZoomOut,
                        onZoomReset: handleZoomReset,
                        showZoomGroup: false,
                    }}
                />
                <div className="main-grid">
                    {/* PANEL IZQUIERDO (card) */}
                    <aside className="left-panel">
                        <div className="sections-list">
                            <SectionsPanel {...{ sections, setSections, selectedSectionId, setSelectedSectionId, addSection, exportMission, importMission, updateSectionActions, computePoseUpToSection, pxToUnit, isCollapsed: isSectionsPanelCollapsed, setIsCollapsed: setIsSectionsPanelCollapsed, expandedSections, toggleSectionExpansion, toggleSectionVisibility, unit }} />
                            <ObstaclesPanel {...{ obstacles, addObstacle, updateObstacle, removeObstacle }} />
                        </div>
                    </aside>

                    {/* AREA DEL CANVAS (card limpia) */}
                    <section className="canvas-card" aria-label="Canvas">
                        <div className="canvas-board" ref={containerRef}>
                            <canvas
                                ref={canvasRef}
                                onMouseMove={onCanvasMove}
                                onMouseDown={onCanvasDown}
                                onMouseUp={onCanvasUp}
                                onMouseLeave={onCanvasLeave}
                                onClick={onCanvasClick}
                                onContextMenu={handleContextMenu}
                                className={`canvas-surface ${isSettingOrigin ? 'cursor-copy' : 'cursor-crosshair'}`}
                            />
                        </div>
                        <div className="canvas-zoom-controls toolbar-card mt-4">
                            <div className="toolbar-group toolbar-group--zoom">
                                <span className="toolbar-group__label">Zoom</span>
                                <div className="toolbar-zoom-control">
                                    <button type="button" className="toolbar-zoom-btn" onClick={handleZoomOut} aria-label="Alejar">−</button>
                                    <span className="toolbar-zoom-value">{Math.round(zoom * 100)}%</span>
                                    <button type="button" className="toolbar-zoom-btn" onClick={handleZoomIn} aria-label="Acercar">+</button>
                                    <button type="button" className="toolbar-zoom-reset" onClick={handleZoomReset}>Restablecer</button>
                                </div>
                            </div>
                        </div>
                        <div className="canvas-legend" aria-hidden="true">
                            <div className="canvas-legend__item">
                                <span className="canvas-legend__swatch canvas-legend__swatch--center" />
                                <span>Centro de ruedas</span>
                            </div>
                            <div className="canvas-legend__item">
                                <span className="canvas-legend__swatch canvas-legend__swatch--tip" />
                                <span>Punta del robot</span>
                            </div>
                        </div>
                    </section>
                </div>

            </main>

            <OptionsPanel {...{ showOptions, setShowOptions, fieldKey, setFieldKey, bgOpacity, setBgOpacity, grid, setGrid, robot, setRobot, initialPose, setInitialPose, handleBgUpload, handleRobotImageUpload, setIsSettingOrigin, unit, setUnit }} />

            <footer className="footer-note">Dimensiones del tapete: 2362mm × 1143mm.</footer>
        </div>
    );
}
