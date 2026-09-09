import type { ReactNode } from 'react';
import { SelectControl,type SelectControlOption } from '../../components/controls/SelectControl';
import '../../styles/automation-parameter-controls.css';
import '../../styles/automation-rosbag.css';
import { AutomationJSONParameterField,type AutomationParameterOption } from './AutomationParameterControls';

type RecorderParameterName = 'slotIds' | 'robotTopics' | 'globalTopics';

type TopicPreset = SelectControlOption & {
  topics: readonly string[];
};

const RELATIVE_TOPIC_PRESETS: TopicPreset[] = [
  {
    value: 'px4-flight',
    label: 'PX4 / MAVROS flight state',
    group: 'Aerial robots',
    topics: [
      'mavros/state',
      'mavros/extended_state',
      'mavros/local_position/pose',
      'mavros/local_position/velocity_local',
    ],
  },
  {
    value: 'px4-sensors',
    label: 'PX4 / MAVROS sensors & power',
    group: 'Aerial robots',
    topics: ['mavros/imu/data','mavros/battery'],
  },
  {
    value: 'scout-state',
    label: 'Scout Mini state',
    group: 'Ground robots',
    topics: ['odom','imu/data_raw','scout_status'],
  },
  {
    value: 'wheeltec-state',
    label: 'WHEELTEC / Mecanum state',
    group: 'Ground robots',
    topics: ['odom','imu','PowerVoltage'],
  },
];

const ABSOLUTE_TOPIC_PRESETS: TopicPreset[] = [
  {
    value: 'transforms',
    label: 'TF transforms',
    topics: ['/tf','/tf_static'],
  },
  {
    value: 'simulation-clock',
    label: 'Simulation clock',
    topics: ['/clock'],
  },
  {
    value: 'ros-logs',
    label: 'ROS logs',
    topics: ['/rosout','/rosout_agg'],
  },
];

export function ROSBagRecorderFields({ nodeId,robotOptions,slotIds,robotTopics,globalTopics,readOnly,renderField,onChange,onError }: {
  nodeId: string;
  robotOptions: readonly (string | AutomationParameterOption)[];
  slotIds: unknown;
  robotTopics: unknown;
  globalTopics: unknown;
  readOnly: boolean;
  renderField: (name: RecorderParameterName, fixedField: ReactNode) => ReactNode;
  onChange: (name: string, value: unknown) => void;
  onError: (error: string) => void;
}) {
  const availableRobots = robotOptions.map(normalizeRobotOption);
  const selectedSlotIds = isStringArray(slotIds) ? slotIds : [];
  const relativeTopics = isStringArray(robotTopics) ? robotTopics : [];
  const absoluteTopics = isStringArray(globalTopics) ? globalTopics : [];
  const robotScopeOptions: SelectControlOption[] = [
    { value: '__all__',label: 'All robots in scope' },
    ...availableRobots.map((robot) => ({
      ...robot,
      group: 'Experiment robots',
      disabled: selectedSlotIds.includes(robot.value),
    })),
  ];

  return (
    <div className="automation-rosbag-fields" data-xgc-role="automation-rosbag-fields" data-xgc-id={nodeId}>
      <section className="automation-rosbag-section" data-xgc-role="automation-rosbag-robots" data-xgc-id={nodeId}>
        {renderField('slotIds', <div data-xgc-role="automation-node-parameter" data-xgc-id={`${nodeId}:slotIds`}>
          <SelectControl
            value=""
            options={robotScopeOptions}
            placeholder="Select robot scope"
            ariaLabel="Select robot scope"
            dataXgcRole="automation-rosbag-robot-slot"
            dataXgcId={nodeId}
            size="compact"
            compact
            disabled={readOnly || availableRobots.length === 0}
            onChange={(robotId) => onChange('slotIds', robotId === '__all__'
              ? []
              : [...new Set([...(selectedSlotIds.length === 0 ? [] : selectedSlotIds),robotId])].sort())}
          />
          <AutomationJSONParameterField
            label="Robot slots ([] = all)"
            roleId={`${nodeId}:slotIds`}
            expected="array"
            value={Array.isArray(slotIds) ? slotIds : []}
            readOnly={readOnly}
            onValid={(slots) => onChange('slotIds', requireStringArray(slots, 'Robot slots'))}
            onError={onError}
          />
        </div>)}
      </section>

      <section data-xgc-role="automation-rosbag-presets" data-xgc-id={nodeId}>
        {renderField('robotTopics', <TopicEditor
          nodeId={nodeId}
          parameter="robotTopics"
          label="Robot topics (relative)"
          presetLabel="Add robot topic preset"
          presets={RELATIVE_TOPIC_PRESETS}
          value={robotTopics}
          topics={relativeTopics}
          readOnly={readOnly}
          onChange={(topics) => onChange('robotTopics', topics)}
          onError={onError}
        />)}
        {renderField('globalTopics', <TopicEditor
          nodeId={nodeId}
          parameter="globalTopics"
          label="Global topics (absolute)"
          presetLabel="Add absolute topic preset"
          presets={ABSOLUTE_TOPIC_PRESETS}
          value={globalTopics}
          topics={absoluteTopics}
          readOnly={readOnly}
          onChange={(topics) => onChange('globalTopics', topics)}
          onError={onError}
        />)}
      </section>
    </div>
  );
}

function TopicEditor({ nodeId,parameter,label,presetLabel,presets,value,topics,readOnly,onChange,onError }: {
  nodeId: string;
  parameter: 'robotTopics' | 'globalTopics';
  label: string;
  presetLabel: string;
  presets: TopicPreset[];
  value: unknown;
  topics: string[];
  readOnly: boolean;
  onChange: (topics: string[]) => void;
  onError: (error: string) => void;
}) {
  return (
    <div className="automation-rosbag-topic-editor" data-xgc-role="automation-node-parameter" data-xgc-id={`${nodeId}:${parameter}`}>
      <SelectControl
        value=""
        options={presets}
        placeholder={presetLabel}
        ariaLabel={presetLabel}
        dataXgcRole="automation-rosbag-topic-preset"
        dataXgcId={`${nodeId}:${parameter}`}
        size="compact"
        compact
        disabled={readOnly}
        onChange={(presetId) => {
          const preset = presets.find((candidate) => candidate.value === presetId);
          if (preset) onChange(mergeTopics(topics, preset.topics));
        }}
      />
      <AutomationJSONParameterField
        label={label}
        roleId={`${nodeId}:${parameter}`}
        expected="array"
        value={Array.isArray(value) ? value : []}
        readOnly={readOnly}
        onValid={(next) => onChange(requireStringArray(next, label))}
        onError={onError}
      />
    </div>
  );
}

function mergeTopics(current: string[], added: readonly string[]) {
  return [...new Set([...current,...added].map((topic) => topic.trim()).filter(Boolean))];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function requireStringArray(value: unknown, label: string) {
  if (!isStringArray(value)) throw new Error(`${label} must contain only strings`);
  return value;
}

function normalizeRobotOption(option: string | AutomationParameterOption) {
  return typeof option === 'string' ? { value: option,label: option } : option;
}
