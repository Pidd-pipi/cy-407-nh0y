import type { ExhibitionStatus } from './enums';

/** 一次发布包含的全部内容：线上快照与待发布草稿共用同一结构 */
export interface ExhibitionContent {
  title: string;
  intro: string;
  curator: string;
  artifactIds: string[];
  themeColor: string;
  backgroundMusicUrl?: string;
  /** 导览关系：发布时冻结进快照，与展品顺序、主题色一起生效 */
  tourIds: string[];
}

export interface ExhibitionVersion {
  id: string;
  version: number;
  snapshot: ExhibitionContent;
  publishedAt: string;
}

export interface Exhibition {
  id: string;
  status: ExhibitionStatus;
  /** 当前线上版本号，0 表示从未发布 */
  version: number;
  /** 待发布草稿，编辑只改这里 */
  draft: ExhibitionContent;
  /** 线上快照，3D 展厅展示的内容 */
  published: ExhibitionContent | null;
  /** 最近发布的版本（含当前线上版本），新的在前，最多保留 5 个 */
  history: ExhibitionVersion[];
  createdAt: string;
  updatedAt: string;
}

export type ExhibitionDraft = ExhibitionContent;

export const EXHIBITION_HISTORY_LIMIT = 5;
