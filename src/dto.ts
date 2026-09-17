export type SlotDTO = {
  key: string;
  slot: string;
  daimon: string | null;
};

export type PaperDTO = {
  id: string;
  name: string;
  options: string[];
  slots: SlotDTO[];
  tategaki: boolean;
  extraLabels: string[];
};

export type MarkDTO = {
  key: string;
  predicted: string | undefined;
  gold: string[];
  unordered: boolean;
  correct: boolean;
  points: number;
  probability: number | undefined;
};

export type FilledDTO = {
  id: string;
  elapsedMs: number;
  inputTokens: number | undefined;
  items: MarkDTO[];
  demo: boolean;
  score: number;
  maxScore: number;
};

export type SubjectInfo = {
  id: string;
  name: string;
  /** True when committed JSON fixture is available for the web path. */
  hasFixture: boolean;
};
