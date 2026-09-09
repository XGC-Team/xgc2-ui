export type AutomationTargetFile = {
  name: string;
  path: string;
  isDir: boolean;
};

export type AutomationTargetFileList = {
  path: string;
  parent: string;
  entries: AutomationTargetFile[];
};

export type AutomationWorldPreview = {
  worldPath: string;
  description?: string;
  imageDataUrl?: string;
};
