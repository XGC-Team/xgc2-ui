import { request,requestBlob } from '../../api/http';
import { queryString } from '../../shared/url';

/** One recorded bag file in the execution artifact archive. */
export type ROSBagRecording = {
  id: string;
  name: string;
  path: string;
  size: number;
  createdAt: string;
  experimentId?: string;
  sessionId?: string;
  bindingId?: string;
  startedAt?: string;
  endedAt?: string;
};

/**
 * One explicit window of the archive.
 *
 * The window is part of the answer rather than a hidden ceiling: `truncated`
 * says bags remain beyond it and `nextOffset` says where to continue, so a list
 * that stops is visibly a stopped read rather than an empty archive.
 * `attributionTruncated` is the separate incompleteness — a listed bag may be
 * missing the Session that produced it.
 */
export type ROSBagRecordingPage = {
  items: ROSBagRecording[];
  limit: number;
  offset: number;
  total: number;
  truncated: boolean;
  nextOffset?: number;
  attributionTruncated?: boolean;
};

export type ListROSBagRecordingsInput = {
  experimentId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
};

export function listROSBagRecordings(
  input: ListROSBagRecordingsInput = {},
  signal?: AbortSignal,
): Promise<ROSBagRecordingPage> {
  return request<ROSBagRecordingPage>(
    `/recordings/rosbags${queryString({ ...input })}`,
    { signal },
  );
}

export function rosbagRecordingDownloadPath(id: string) {
  return `/recordings/rosbags/${encodeURIComponent(id)}/download`;
}

export function downloadROSBagRecording(id: string,signal?: AbortSignal): Promise<Blob> {
  return requestBlob(`/recordings/rosbags/${encodeURIComponent(id)}/download`,{ signal });
}

export type ROSBagPlotTopic = {
  name: string;
  type: string;
  fields: string[];
  messageCount: number;
};

export type ROSBagPlotPoint = {
  t: number;
  v: number;
};

export type ROSBagPlotSeries = {
  id: string;
  topic: string;
  field: string;
  points: ROSBagPlotPoint[];
};

export type ROSBagRecordingPlot = {
  id: string;
  name: string;
  title: string;
  durationSec: number;
  topics: ROSBagPlotTopic[];
  series: ROSBagPlotSeries[];
};

export function getROSBagRecordingPlot(
  id: string,
  series: readonly string[] = [],
  signal?: AbortSignal,
): Promise<ROSBagRecordingPlot> {
  return request<ROSBagRecordingPlot>(
    `/recordings/rosbags/${encodeURIComponent(id)}/plot${queryString({
      series: series.length > 0 ? series.join(',') : undefined,
    })}`,
    { signal },
  );
}
