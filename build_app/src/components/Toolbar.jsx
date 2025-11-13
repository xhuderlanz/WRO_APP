import React from 'react';
import { IconRuler, IconTarget } from './Icons';

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
    return (
        <header className="toolbar">
            <div className="toolbar-group">
                <button onClick={() => setDrawMode(!drawMode)} className={drawMode ? 'active' : ''}>
                    Dibujar
                </button>
                <button onClick={() => setObstacleMode(prev => prev === 'move' ? 'off' : 'move')} className={obstacleMode !== 'off' ? 'active' : ''}>
                    Obstáculos
                </button>
                <button onClick={handleRulerToggle} className={rulerActive ? 'active' : ''}>
                    <IconRuler /> Regla
                </button>
            </div>

            <div className="toolbar-group">
                <button onClick={() => setSnapGrid(!snapGrid)} className={snapGrid ? 'active' : ''}>
                    Snap Grid
                </button>
                <button onClick={() => setSnap45(!snap45)} className={snap45 ? 'active' : ''}>
                    Snap 45°
                </button>
                <button onClick={onToggleReverse} className={reverseDrawing ? 'active' : ''} title="Dibujar en reversa">
                    Reversa
                </button>
                <div className="reference-mode-toggle">
                    <button
                        onClick={() => onReferenceModeChange('center')}
                        className={referenceMode === 'center' ? 'active' : ''}
                        title="Referencia al centro del robot"
                    >
                        Centro
                    </button>
                    <button
                        onClick={() => onReferenceModeChange('tip')}
                        className={referenceMode === 'tip' ? 'active' : ''}
                        title="Referencia a la punta del robot"
                    >
                        Punta
                    </button>
                </div>
            </div>

            <div className="toolbar-group">
                <button onClick={startMission} disabled={isRunning}>▶ Misión</button>
                <button onClick={startMissionReverse} disabled={isRunning}>◀ Misión</button>
                <button onClick={startSection} disabled={isRunning}>▶ Sección</button>
                <button onClick={startSectionReverse} disabled={isRunning}>◀ Sección</button>
                <button onClick={pauseResume} disabled={!isRunning}>{isPaused ? 'Resume' : 'Pausa'}</button>
                <button onClick={stopPlayback} disabled={!isRunning}>■ Stop</button>
                <div className="playback-speed">
                    <label htmlFor="speed-control">x{playbackSpeedMultiplier.toFixed(1)}</label>
                    <input
                        id="speed-control"
                        type="range"
                        min="0.5"
                        max="4"
                        step="0.1"
                        value={playbackSpeedMultiplier}
                        onChange={e => onPlaybackSpeedChange(parseFloat(e.target.value))}
                    />
                </div>
            </div>

            {showZoomGroup && (
                <div className="toolbar-group">
                    <button onClick={onZoomOut}>-</button>
                    <span className="zoom-level" onClick={onZoomReset}>{Math.round(zoom * 100)}%</span>
                    <button onClick={onZoomIn}>+</button>
                </div>
            )}

            <div className="toolbar-group">
                <button onClick={onToggleRobot}>
                    {showRobot ? 'Ocultar Robot' : 'Mostrar Robot'}
                </button>
                <button onClick={() => setShowOptions(true)}>Opciones</button>
            </div>
        </header>
    );
};

export default Toolbar;
