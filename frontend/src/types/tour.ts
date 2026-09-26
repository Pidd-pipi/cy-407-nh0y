import type { Vector3Tuple } from './annotation';

export interface TourNode {
  id: string;
  artifactId: string;
  cameraPosition: Vector3Tuple;
  targetPosition: Vector3Tuple;
  transitionMs: number;
  narration: string;
}

/** 旧版独立导览实体，仅用于迁移历史数据 */
export interface Tour {
  id: string;
  exhibitionId: string;
  name: string;
  nodes: TourNode[];
  createdAt: string;
  updatedAt: string;
}
