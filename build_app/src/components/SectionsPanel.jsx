import React from 'react';
import { IconChevronDown, IconEye, IconEyeOff, IconGripVertical, IconTrash } from './Icons';
import { getContrastingHex } from '../utils/helpers';

const SectionsPanel = ({ sections, setSections, selectedSectionId, setSelectedSectionId, addSection, removeSection, exportMission, importMission, updateSectionActions, computePoseUpToSection, pxToUnit, isCollapsed, setIsCollapsed, expandedSections, toggleSectionExpansion, toggleSectionVisibility, toggleSectionIsolation, isolatedSectionId, unit }) => {
    const handleDragStart = (e, id) => {
        e.dataTransfer.setData("section-id", id);
    };

    const handleDrop = (e, targetId) => {
        const sourceId = e.dataTransfer.getData("section-id");
        if (sourceId === targetId) return;

        const sourceIndex = sections.findIndex(s => s.id === sourceId);
        const targetIndex = sections.findIndex(s => s.id === targetId);

        const reordered = [...sections];
        const [removed] = reordered.splice(sourceIndex, 1);
        reordered.splice(targetIndex, 0, removed);
        setSections(reordered);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    return (
        <div className={`sections-panel-container ${isCollapsed ? 'collapsed' : ''}`}>
            <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
                {isCollapsed ? '›' : '‹'}
            </button>
            <div className="sections-panel">
                <div className="panel-header">
                    <h3>Secciones</h3>
                    <div className="panel-actions">
                        <button onClick={addSection}>+</button>
                        <button onClick={exportMission}>Exportar</button>
                        <label htmlFor="import-mission" className="import-button">Importar</label>
                        <input id="import-mission" type="file" accept=".json" onChange={importMission} style={{ display: 'none' }} />
                    </div>
                </div>
                <ul className="sections-list">
                    {sections.map(section => {
                        const isExpanded = expandedSections[section.id];
                        const isIsolated = isolatedSectionId === section.id;
                        const isSelected = selectedSectionId === section.id;
                        const sectionColor = section.color || '#3b82f6';
                        const textColor = getContrastingHex(sectionColor);

                        return (
                            <li
                                key={section.id}
                                draggable
                                onDragStart={e => handleDragStart(e, section.id)}
                                onDrop={e => handleDrop(e, section.id)}
                                onDragOver={handleDragOver}
                                className={`section-item ${isSelected ? 'selected' : ''} ${isIsolated ? 'isolated' : ''}`}
                                style={{ '--section-color': sectionColor, '--text-color': textColor }}
                            >
                                <div className="section-header" onClick={() => setSelectedSectionId(section.id)}>
                                    <div className="drag-handle"><IconGripVertical /></div>
                                    <input
                                        type="color"
                                        value={section.color || '#3b82f6'}
                                        onChange={e => setSections(secs => secs.map(s => s.id === section.id ? { ...s, color: e.target.value } : s))}
                                        className="section-color-picker"
                                    />
                                    <input
                                        type="text"
                                        value={section.name}
                                        onChange={e => setSections(secs => secs.map(s => s.id === section.id ? { ...s, name: e.target.value } : s))}
                                        className="section-name-input"
                                    />
                                    <div className="section-item-actions">
                                        <button onClick={(e) => { e.stopPropagation(); toggleSectionVisibility(section.id); }} title={section.isVisible ? "Ocultar" : "Mostrar"}>
                                            {section.isVisible ? <IconEye /> : <IconEyeOff />}
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); toggleSectionIsolation(section.id); }} title={isIsolated ? "Quitar aislamiento" : "Aislar"}>
                                            <span className={`isolate-icon ${isIsolated ? 'active' : ''}`}>●</span>
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); removeSection(section.id); }}><IconTrash /></button>
                                        <button onClick={(e) => { e.stopPropagation(); toggleSectionExpansion(section.id); }} className={`expand-button ${isExpanded ? 'expanded' : ''}`}>
                                            <IconChevronDown />
                                        </button>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="section-details">
                                        <p>Puntos: {section.points.length}</p>
                                        <p>Acciones: {section.actions.length}</p>
                                        {/* More details can be added here */}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

export default SectionsPanel;
