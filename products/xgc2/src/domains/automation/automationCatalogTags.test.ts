import { describe,expect,it } from 'vitest';
import { automationCatalogSearchTerms,automationCatalogTags,mergeAutomationCatalogTags } from './automationCatalogTags';

describe('automationCatalogTags',() => {
  it('keeps authoring tags and removes internal provisioning identities',() => {
    expect(automationCatalogTags([
      'template','ros1','xgc.seed.roscore','xgc.template.internal',
    ])).toEqual(['template','ros1']);
  });

  it('never projects the private resource system key into catalog search or tags',() => {
    const document = {
      head: { resourceId: 'resource-id',systemKey: 'ros-basic-services.control' },
      spec: { metadata: { name: 'ROS Control',description: 'Starts ROS services',tags: ['ros','control'] } },
    };
    const projected = [...automationCatalogSearchTerms(document),...automationCatalogTags(document.spec.metadata.tags)];
    expect(projected).not.toContain(document.head.systemKey);
    expect(projected.join(' ')).not.toContain('ros-basic-services.control');
  });

  it('keeps internal provisioning identities when merging catalog tags', () => {
    expect(mergeAutomationCatalogTags(
      ['ros','xgc.seed.roscore'],
      ['lab'],
    )).toEqual(['xgc.seed.roscore','lab']);
  });
});
