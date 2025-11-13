import React from 'react';
import { DEFAULT_OBSTACLE_COLOR, DEFAULT_OBSTACLE_OPACITY, DEFAULT_OBSTACLE_SIZE } from '../constants';
import { IconTrash } from './Icons';

const ObstaclesPanel = ({ obstacles, addObstacle, updateObstacle, removeObstacle }) => {
    return (
        <div className="obstacles-panel">
            <div className="panel-header">
                <h3>Obstáculos</h3>
                <button onClick={addObstacle} className="panel-actions">+</button>
            </div>
            <ul className="obstacles-list">
                {obstacles.map((obstacle, index) => (
                    <li key={obstacle.id} className="obstacle-item">
                        <div className="obstacle-header">
                            <span>Obstáculo {index + 1}</span>
                            <button onClick={() => removeObstacle(obstacle.id)}><IconTrash /></button>
                        </div>
                        <div className="obstacle-controls">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label>X (cm)</label>
                                    <input
                                        type="number"
                                        value={obstacle.x.toFixed(1)}
                                        onChange={e => updateObstacle(obstacle.id, { x: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label>Y (cm)</label>
                                    <input
                                        type="number"
                                        value={obstacle.y.toFixed(1)}
                                        onChange={e => updateObstacle(obstacle.id, { y: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label>Ancho (cm)</label>
                                    <input
                                        type="number"
                                        value={(obstacle.width || DEFAULT_OBSTACLE_SIZE.width).toFixed(1)}
                                        onChange={e => updateObstacle(obstacle.id, { width: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label>Alto (cm)</label>
                                    <input
                                        type="number"
                                        value={(obstacle.height || DEFAULT_OBSTACLE_SIZE.height).toFixed(1)}
                                        onChange={e => updateObstacle(obstacle.id, { height: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="mt-2">
                                <label>Color</label>
                                <input
                                    type="color"
                                    value={obstacle.color || DEFAULT_OBSTACLE_COLOR}
                                    onChange={e => updateObstacle(obstacle.id, { color: e.target.value })}
                                    className="w-full h-8"
                                />
                            </div>
                            <div className="mt-2">
                                <label>Opacidad: {Math.round((obstacle.opacity ?? DEFAULT_OBSTACLE_OPACITY) * 100)}%</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={obstacle.opacity ?? DEFAULT_OBSTACLE_OPACITY}
                                    onChange={e => updateObstacle(obstacle.id, { opacity: parseFloat(e.target.value) })}
                                />
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ObstaclesPanel;
