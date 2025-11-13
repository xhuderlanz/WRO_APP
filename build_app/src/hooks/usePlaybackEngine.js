import { useState, useRef, useCallback, useEffect } from 'react';
import { 
    PLAYBACK_LINEAR_SPEED_UNITS_PER_SEC, 
    PLAYBACK_ROTATION_DEG_PER_SEC,
    DEG2RAD,
    RAD2DEG,
    COLLISION_ANIMATION_DURATION_MS,
    COLLISION_TRIGGER_PROGRESS
} from '../constants';

// Función auxiliar para normalizar ángulos
const normalizeAngle = (angle) => {
    let a = angle;
    while (a <= -Math.PI) a += 2 * Math.PI;
    while (a > Math.PI) a -= 2 * Math.PI;
    return a;
};

/**
 * Hook que maneja el motor de reproducción/animación de misiones
 */
export const usePlaybackEngine = ({
    sections,
    initialPose,
    computePoseUpToSection,
    currentSection,
    unitToPx,
    collisionAnimationRef: externalCollisionAnimationRef
}) => {
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [playPose, setPlayPose] = useState(() => ({ ...initialPose }));
    const [playbackSpeedMultiplier, setPlaybackSpeedMultiplier] = useState(1);
    
    const animRef = useRef(0);
    const playbackSpeedRef = useRef(1);
    const isPausedRef = useRef(false);
    const lastTickRef = useRef(Date.now());
    
    const actionCursorRef = useRef({ 
        list: [], 
        idx: 0, 
        phase: 'idle', 
        remainingPx: 0, 
        remainingAngle: 0, 
        moveDirection: 1, 
        moveTotalPx: 0 
    });
    
    const collisionPlaybackRef = useRef(new Map());
    
    // Usar el ref externo si se proporciona, sino usar uno interno
    const internalCollisionAnimationRef = useRef({ 
        active: false, 
        timer: 0, 
        obstacleIds: [], 
        pose: null 
    });
    const collisionAnimationRef = externalCollisionAnimationRef || internalCollisionAnimationRef;

    // Sincronizar velocidad de playback
    useEffect(() => {
        playbackSpeedRef.current = playbackSpeedMultiplier;
    }, [playbackSpeedMultiplier]);

    // Sincronizar estado de pausa
    useEffect(() => {
        isPausedRef.current = false; // Placeholder - será actualizado por setIsPaused
    }, []);

    /**
     * Construye una lista invertida de acciones para reproducción en reversa
     */
    const buildReversedActionsList = useCallback((actions) => {
        if (!Array.isArray(actions) || !actions.length) return [];
        
        const reversed = [];
        for (let i = actions.length - 1; i >= 0; i -= 1) {
            const act = actions[i];
            if (act.type === 'rotate') {
                reversed.push({
                    type: 'rotate',
                    angle: -act.angle,
                    collisionObstacleIds: Array.isArray(act.collisionObstacleIds) ? [...act.collisionObstacleIds] : [],
                    collisionApproved: Boolean(act.collisionApproved),
                });
            } else if (act.type === 'move') {
                reversed.push({
                    type: 'move',
                    distance: act.distance,
                    reference: act.reference || 'center',
                    collisionObstacleIds: Array.isArray(act.collisionObstacleIds) ? [...act.collisionObstacleIds] : [],
                    collisionApproved: Boolean(act.collisionApproved),
                    reversedDirection: true,
                });
            }
        }
        return reversed;
    }, []);

    /**
     * Obtiene la pose después de aplicar una lista de acciones
     */
    const getPoseAfterActions = useCallback((startPose, actions) => {
        if (!startPose || !Array.isArray(actions)) return startPose;
        
        let pose = { ...startPose };
        for (const action of actions) {
            if (action.type === 'rotate') {
                pose.theta = normalizeAngle(pose.theta + action.angle * DEG2RAD);
            } else if (action.type === 'move') {
                const distPx = unitToPx(action.distance);
                const direction = action.reversedDirection ? -1 : 1;
                pose.x += Math.cos(pose.theta) * distPx * direction;
                pose.y += Math.sin(pose.theta) * distPx * direction;
            }
        }
        return pose;
    }, [unitToPx]);

    /**
     * Inicializa el cursor de acciones para playback
     */
    const initializeActionCursor = useCallback((actionsList, startPose) => {
        if (!actionsList || !actionsList.length) {
            actionCursorRef.current = { 
                list: [], 
                idx: 0, 
                phase: 'done', 
                remainingPx: 0, 
                remainingAngle: 0, 
                moveDirection: 1, 
                moveTotalPx: 0 
            };
            return null;
        }

        const firstAction = actionsList[0];
        let initialState = {
            list: actionsList,
            idx: 0,
            phase: 'idle',
            remainingPx: 0,
            remainingAngle: 0,
            moveDirection: 1,
            moveTotalPx: 0,
        };

        if (firstAction.type === 'rotate') {
            initialState.phase = 'rotating';
            initialState.remainingAngle = firstAction.angle;
        } else if (firstAction.type === 'move') {
            initialState.phase = 'moving';
            initialState.remainingPx = unitToPx(firstAction.distance);
            initialState.moveTotalPx = unitToPx(firstAction.distance);
            initialState.moveDirection = firstAction.reversedDirection ? -1 : 1;
        }

        actionCursorRef.current = initialState;
        return { ...startPose };
    }, [unitToPx]);

    /**
     * Tick del motor de animación - avanza el estado del cursor
     */
    const tickPlayback = useCallback((deltaSec, currentPose) => {
        const cursor = actionCursorRef.current;
        if (cursor.phase === 'done' || cursor.phase === 'idle') return null;

        const speedMult = playbackSpeedRef.current;
        let newPose = { ...currentPose };
        let advanced = false;

        // Fase de rotación
        if (cursor.phase === 'rotating') {
            const degPerSec = PLAYBACK_ROTATION_DEG_PER_SEC * speedMult;
            const deltaAngle = degPerSec * deltaSec;
            const absRemaining = Math.abs(cursor.remainingAngle);
            
            if (deltaAngle >= absRemaining) {
                // Completar rotación
                newPose.theta = normalizeAngle(newPose.theta + cursor.remainingAngle * DEG2RAD);
                cursor.remainingAngle = 0;
                cursor.idx += 1;
                
                // Avanzar a siguiente acción
                if (cursor.idx >= cursor.list.length) {
                    cursor.phase = 'done';
                } else {
                    const nextAction = cursor.list[cursor.idx];
                    if (nextAction.type === 'rotate') {
                        cursor.phase = 'rotating';
                        cursor.remainingAngle = nextAction.angle;
                    } else if (nextAction.type === 'move') {
                        cursor.phase = 'moving';
                        cursor.remainingPx = unitToPx(nextAction.distance);
                        cursor.moveTotalPx = unitToPx(nextAction.distance);
                        cursor.moveDirection = nextAction.reversedDirection ? -1 : 1;
                    }
                }
                advanced = true;
            } else {
                // Rotación parcial
                const sign = cursor.remainingAngle >= 0 ? 1 : -1;
                newPose.theta = normalizeAngle(newPose.theta + sign * deltaAngle * DEG2RAD);
                cursor.remainingAngle -= sign * deltaAngle;
                advanced = true;
            }
        }

        // Fase de movimiento
        else if (cursor.phase === 'moving') {
            const unitsPerSec = PLAYBACK_LINEAR_SPEED_UNITS_PER_SEC * speedMult;
            const deltaPx = unitToPx(unitsPerSec * deltaSec);
            const absRemaining = Math.abs(cursor.remainingPx);
            
            if (deltaPx >= absRemaining) {
                // Completar movimiento
                newPose.x += Math.cos(newPose.theta) * cursor.remainingPx * cursor.moveDirection;
                newPose.y += Math.sin(newPose.theta) * cursor.remainingPx * cursor.moveDirection;
                cursor.remainingPx = 0;
                cursor.idx += 1;
                
                // Avanzar a siguiente acción
                if (cursor.idx >= cursor.list.length) {
                    cursor.phase = 'done';
                } else {
                    const nextAction = cursor.list[cursor.idx];
                    if (nextAction.type === 'rotate') {
                        cursor.phase = 'rotating';
                        cursor.remainingAngle = nextAction.angle;
                    } else if (nextAction.type === 'move') {
                        cursor.phase = 'moving';
                        cursor.remainingPx = unitToPx(nextAction.distance);
                        cursor.moveTotalPx = unitToPx(nextAction.distance);
                        cursor.moveDirection = nextAction.reversedDirection ? -1 : 1;
                    }
                }
                advanced = true;
            } else {
                // Movimiento parcial
                newPose.x += Math.cos(newPose.theta) * deltaPx * cursor.moveDirection;
                newPose.y += Math.sin(newPose.theta) * deltaPx * cursor.moveDirection;
                cursor.remainingPx -= deltaPx;
                advanced = true;
            }

            // Detectar colisiones durante movimiento
            if (advanced && cursor.phase === 'moving') {
                const currentAction = cursor.list[cursor.idx];
                if (currentAction?.collisionObstacleIds?.length && !currentAction.collisionApproved) {
                    const progress = 1 - (Math.abs(cursor.remainingPx) / cursor.moveTotalPx);
                    if (progress >= COLLISION_TRIGGER_PROGRESS) {
                        const key = `${cursor.idx}`;
                        if (!collisionPlaybackRef.current.has(key)) {
                            collisionPlaybackRef.current.set(key, true);
                            collisionAnimationRef.current = {
                                active: true,
                                timer: COLLISION_ANIMATION_DURATION_MS,
                                obstacleIds: [...currentAction.collisionObstacleIds],
                                pose: { ...newPose },
                            };
                        }
                    }
                }
            }
        }

        return advanced ? newPose : null;
    }, [unitToPx, collisionAnimationRef]);

    /**
     * Loop principal de animación
     */
    const animationLoop = useCallback(() => {
        if (isPausedRef.current) {
            lastTickRef.current = Date.now();
            animRef.current = requestAnimationFrame(animationLoop);
            return;
        }

        const now = Date.now();
        const deltaSec = (now - lastTickRef.current) / 1000;
        lastTickRef.current = now;

        // Actualizar animación de colisión
        if (collisionAnimationRef.current.active) {
            collisionAnimationRef.current.timer -= deltaSec * 1000;
            if (collisionAnimationRef.current.timer <= 0) {
                collisionAnimationRef.current = { active: false, timer: 0, obstacleIds: [], pose: null };
            }
        }

        // Avanzar playback
        setPlayPose(currentPose => {
            const newPose = tickPlayback(deltaSec, currentPose);
            if (newPose) {
                if (actionCursorRef.current.phase === 'done') {
                    // Playback terminado
                    cancelAnimationFrame(animRef.current);
                    setIsRunning(false);
                    setIsPaused(false);
                    return currentPose;
                }
                return newPose;
            }
            return currentPose;
        });

        animRef.current = requestAnimationFrame(animationLoop);
    }, [tickPlayback, collisionAnimationRef]);

    /**
     * Inicia reproducción de una misión completa
     */
    const startMission = useCallback((reverse = false) => {
        if (!sections || !sections.length) return;

        let allActions = [];
        sections.forEach(section => {
            if (Array.isArray(section.actions)) {
                allActions.push(...section.actions);
            }
        });

        if (reverse) {
            allActions = buildReversedActionsList(allActions);
        }

        const startPose = initializeActionCursor(allActions, { ...initialPose });
        if (!startPose) return;

        collisionPlaybackRef.current.clear();
        collisionAnimationRef.current = { active: false, timer: 0, obstacleIds: [], pose: null };
        
        setPlayPose(startPose);
        setIsRunning(true);
        setIsPaused(false);
        lastTickRef.current = Date.now();
        animRef.current = requestAnimationFrame(animationLoop);
    }, [sections, initialPose, buildReversedActionsList, initializeActionCursor, animationLoop, collisionAnimationRef]);

    /**
     * Inicia reproducción de una sección específica
     */
    const startSection = useCallback((sectionId, reverse = false) => {
        const section = sections.find(s => s.id === sectionId);
        if (!section || !section.actions?.length) return;

        let actionsList = [...section.actions];
        if (reverse) {
            actionsList = buildReversedActionsList(actionsList);
        }

        const sectionStartPose = computePoseUpToSection(sectionId);
        const startPose = initializeActionCursor(actionsList, sectionStartPose);
        if (!startPose) return;

        collisionPlaybackRef.current.clear();
        collisionAnimationRef.current = { active: false, timer: 0, obstacleIds: [], pose: null };

        setPlayPose(startPose);
        setIsRunning(true);
        setIsPaused(false);
        lastTickRef.current = Date.now();
        animRef.current = requestAnimationFrame(animationLoop);
    }, [sections, computePoseUpToSection, buildReversedActionsList, initializeActionCursor, animationLoop, collisionAnimationRef]);

    /**
     * Pausa o reanuda la reproducción
     */
    const pauseResume = useCallback(() => {
        setIsPaused(prev => {
            const newPaused = !prev;
            isPausedRef.current = newPaused;
            if (!newPaused) {
                lastTickRef.current = Date.now();
            }
            return newPaused;
        });
    }, [setIsPaused]);

    /**
     * Detiene completamente la reproducción
     */
    const stopPlayback = useCallback(() => {
        if (animRef.current) {
            cancelAnimationFrame(animRef.current);
            animRef.current = 0;
        }
        actionCursorRef.current = { 
            list: [], 
            idx: 0, 
            phase: 'idle', 
            remainingPx: 0, 
            remainingAngle: 0, 
            moveDirection: 1, 
            moveTotalPx: 0 
        };
        collisionPlaybackRef.current.clear();
        collisionAnimationRef.current = { active: false, timer: 0, obstacleIds: [], pose: null };
        setIsRunning(false);
        setIsPaused(false);
    }, [collisionAnimationRef]);

    /**
     * Cambia el multiplicador de velocidad
     */
    const onPlaybackSpeedChange = useCallback((speed) => {
        setPlaybackSpeedMultiplier(speed);
    }, []);

    return {
        // Estados
        isRunning,
        isPaused,
        playPose,
        playbackSpeedMultiplier,
        // Funciones de control
        startMission,
        startSection,
        pauseResume,
        stopPlayback,
        onPlaybackSpeedChange,
        // Refs y utilidades
        collisionAnimationRef,
        actionCursorRef,
        getPoseAfterActions,
        buildReversedActionsList
    };
};
