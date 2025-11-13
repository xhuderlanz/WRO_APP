import React, { useEffect } from 'react';
import { FIELD_PRESETS } from '../constants';
import { IconChevronDown } from './Icons';

const OptionsPanel = ({ showOptions, setShowOptions, fieldKey, setFieldKey, bgOpacity, setBgOpacity, grid, setGrid, robot, setRobot, initialPose, setInitialPose, handleBgUpload, handleRobotImageUpload, setIsSettingOrigin, unit, setUnit }) => {
    const isMM = unit === 'mm';
    const sizeMin = isMM ? 1 : 0.1;
    const sizeMax = isMM ? 50 : 5;
    const sliderStep = isMM ? 1 : 0.1;
    const numberStep = isMM ? 0.1 : 0.01;

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setShowOptions(false);
            }
        };
        if (showOptions) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [showOptions, setShowOptions]);

    const handleSizeChange = (valueStr) => {
        const newSize = parseFloat(valueStr) || 0;
        setGrid(g => ({ ...g, cellSize: isMM ? newSize / 10 : newSize }));
    };

    const numericCellSize = isMM ? grid.cellSize * 10 : grid.cellSize;
    const formattedCellSize = isMM ? numericCellSize.toFixed(1) : numericCellSize.toFixed(2);

    return (
        <div className={`options-modal ${showOptions ? 'visible' : ''}`} onClick={() => setShowOptions(false)}>
            <div className="options-panel" onClick={e => e.stopPropagation()}>
                <div className="options-header">
                    <h2>Opciones de Visualización</h2>
                    <button onClick={() => setShowOptions(false)} className="close-button">&times;</button>
                </div>
                <div className="options-content">
                    {/* Field Background */}
                    <div className="option-group">
                        <label htmlFor="field-select" className="font-semibold">Fondo del Campo</label>
                        <div className="custom-select">
                            <select id="field-select" value={fieldKey} onChange={e => setFieldKey(e.target.value)}>
                                {FIELD_PRESETS.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                            </select>
                            <IconChevronDown />
                        </div>
                        {fieldKey === 'custom' && (
                            <div className="mt-2">
                                <label htmlFor="bg-upload" className="file-upload-label">Subir imagen de fondo</label>
                                <input id="bg-upload" type="file" accept="image/*" onChange={handleBgUpload} className="hidden" />
                            </div>
                        )}
                        <label htmlFor="bg-opacity" className="mt-2">Opacidad del fondo: {Math.round(bgOpacity * 100)}%</label>
                        <input type="range" id="bg-opacity" min="0" max="1" step="0.05" value={bgOpacity} onChange={e => setBgOpacity(parseFloat(e.target.value))} />
                    </div>

                    {/* Grid Settings */}
                    <div className="option-group">
                        <h3 className="font-semibold">Cuadrícula</h3>
                        <div className="flex items-center justify-between">
                            <label htmlFor="grid-size">Tamaño ({unit})</label>
                            <div className="flex items-center gap-2">
                                <input type="number" id="grid-size" value={formattedCellSize} onChange={e => handleSizeChange(e.target.value)} min={sizeMin} max={sizeMax} step={numberStep} className="w-24" />
                            </div>
                        </div>
                        <input type="range" min={sizeMin} max={sizeMax} step={sliderStep} value={numericCellSize} onChange={e => handleSizeChange(e.target.value)} className="w-full mt-1" />

                        <label htmlFor="grid-opacity" className="mt-2">Opacidad de línea: {Math.round(grid.lineAlpha * 100)}%</label>
                        <input type="range" id="grid-opacity" min="0" max="1" step="0.05" value={grid.lineAlpha} onChange={e => setGrid(g => ({ ...g, lineAlpha: parseFloat(e.target.value) }))} />
                    </div>

                    {/* Robot Settings */}
                    <div className="option-group">
                        <h3 className="font-semibold">Robot</h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <div>
                                <label htmlFor="robot-width">Ancho ({unit})</label>
                                <input type="number" id="robot-width" value={isMM ? robot.width * 10 : robot.width} onChange={e => setRobot(r => ({ ...r, width: isMM ? parseFloat(e.target.value) / 10 : parseFloat(e.target.value) }))} step={isMM ? 1 : 0.1} className="w-full" />
                            </div>
                            <div>
                                <label htmlFor="robot-length">Largo ({unit})</label>
                                <input type="number" id="robot-length" value={isMM ? robot.length * 10 : robot.length} onChange={e => setRobot(r => ({ ...r, length: isMM ? parseFloat(e.target.value) / 10 : parseFloat(e.target.value) }))} step={isMM ? 1 : 0.1} className="w-full" />
                            </div>
                        </div>
                        <div className="mt-2">
                            <label htmlFor="robot-color">Color</label>
                            <input type="color" id="robot-color" value={robot.color} onChange={e => setRobot(r => ({ ...r, color: e.target.value }))} className="w-full h-10" />
                        </div>
                        <div className="mt-2">
                            <label htmlFor="robot-image-upload" className="file-upload-label">Subir imagen del robot</label>
                            <input id="robot-image-upload" type="file" accept="image/*" onChange={handleRobotImageUpload} className="hidden" />
                            {robot.imageSrc && <button onClick={() => setRobot(r => ({ ...r, imageSrc: null }))} className="text-red-500 text-sm mt-1">Quitar imagen</button>}
                        </div>
                    </div>

                    {/* Initial Pose */}
                    <div className="option-group">
                        <h3 className="font-semibold">Posición Inicial</h3>
                        <div className="grid grid-cols-3 gap-x-2 gap-y-2">
                            <div>
                                <label htmlFor="initial-x">X ({unit})</label>
                                <input type="number" id="initial-x" value={isMM ? initialPose.x * 10 : initialPose.x} onChange={e => setInitialPose(p => ({ ...p, x: isMM ? parseFloat(e.target.value) / 10 : parseFloat(e.target.value) }))} step={isMM ? 1 : 0.1} className="w-full" />
                            </div>
                            <div>
                                <label htmlFor="initial-y">Y ({unit})</label>
                                <input type="number" id="initial-y" value={isMM ? initialPose.y * 10 : initialPose.y} onChange={e => setInitialPose(p => ({ ...p, y: isMM ? parseFloat(e.target.value) / 10 : parseFloat(e.target.value) }))} step={isMM ? 1 : 0.1} className="w-full" />
                            </div>
                            <div>
                                <label htmlFor="initial-theta">Ángulo (°)</label>
                                <input type="number" id="initial-theta" value={initialPose.theta} onChange={e => setInitialPose(p => ({ ...p, theta: parseFloat(e.target.value) }))} step="1" className="w-full" />
                            </div>
                        </div>
                        <button onClick={() => setIsSettingOrigin(true)} className="set-origin-button">
                            Fijar Origen Interactivamente
                        </button>
                    </div>

                    {/* Unit System */}
                    <div className="option-group">
                        <label htmlFor="unit-select" className="font-semibold">Unidades</label>
                        <div className="custom-select">
                            <select id="unit-select" value={unit} onChange={e => setUnit(e.target.value)}>
                                <option value="cm">Centímetros (cm)</option>
                                <option value="mm">Milímetros (mm)</option>
                            </select>
                            <IconChevronDown />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OptionsPanel;
