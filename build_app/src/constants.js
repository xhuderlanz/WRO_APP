import juniorFieldImg from "./assets/WRO-2025-GameMat-Junior2025.jpg";
import elementaryFieldImg from "./assets/WRO-2025-GameMat-Elementary2025.jpg";
import doubleTennisFieldImg from "./assets/WRO-2025_RoboSports_Double-Tennis_Playfield.jpg";

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const MAT_MM = { w: 2362, h: 1143 };
export const MAT_CM = { w: MAT_MM.w / 10, h: MAT_MM.h / 10 };
export const FIELD_PRESETS = [
    { key: "junior", name: "RoboMission Junior 2025", bg: juniorFieldImg },
    { key: "elementary", name: "RoboMission Elementary 2025", bg: elementaryFieldImg },
    { key: "double-tennis", name: "RoboSports Double Tennis 2025", bg: doubleTennisFieldImg },
    { key: "custom", name: "Personalizado", bg: null },
];
export const DEFAULT_GRID = { cellSize: 1, pixelsPerUnit: 5, lineAlpha: 0.35, offsetX: 0, offsetY: 0 };
export const DEFAULT_ROBOT = { width: 18, length: 20, color: "#0ea5e9", imageSrc: null, opacity: 1 };
export const DEFAULT_OBSTACLE_SIZE = { width: 80, height: 80 };
export const DEFAULT_OBSTACLE_COLOR = "#ef4444";
export const DEFAULT_OBSTACLE_OPACITY = 0.35;
export const OBSTACLE_RENDER = { fill: "rgba(248,113,113,0.25)", stroke: "#ef4444", blockedStroke: "#dc2626" };
export const OBSTACLE_HANDLE_SIZE = 10;
export const OBSTACLE_HANDLE_SPACING = 6;
export const OBSTACLE_DRAG_THRESHOLD = 4;
export const NODE_SNAP_RADIUS = 18;
export const ZOOM_LIMITS = { min: 0.5, max: 2, step: 0.25 };
export const DEFAULT_ZOOM = 1.2;
export const SNAP_45_BASE_ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
export const PLAYBACK_LINEAR_SPEED_UNITS_PER_SEC = 40;
export const PLAYBACK_ROTATION_DEG_PER_SEC = 300;
export const COLLISION_ANIMATION_DURATION_MS = 900;
export const COLLISION_TRIGGER_PROGRESS = 0.25;
