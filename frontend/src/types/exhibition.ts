import type { TourNode } from './tour';

/** 展览的导览路线，随草稿与线上快照一起保存 */
export interface ExhibitionTour {
  name: string;
  nodes: TourNode[];
}

/** 可发布内容：草稿与线上快照共用同一结构 */
export interface ExhibitionContent {
  title: string;
  intro: string;
  curator: string;
  artifactIds: string[];
  themeColor: string;
  backgroundMusicUrl?: string;
  tour: ExhibitionTour | null;
}

/** 一次发布产生的线上快照 */
export interface ExhibitionVersion extends ExhibitionContent {
  version: number;
  publishedAt: string;
}

export interface Exhibition {
  id: string;
  /** 待发布草稿：所有编辑只写这里 */
  draft: ExhibitionContent;
  /** 线上快照：3D 展厅展示的内容，未发布时为 null */
  live: ExhibitionVersion | null;
  /** 最近五个历史版本，新的在前 */
  history: ExhibitionVersion[];
  createdAt: string;
  updatedAt: string;
}
