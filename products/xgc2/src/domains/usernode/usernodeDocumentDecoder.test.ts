import { describe,expect,it } from 'vitest';
import { newUsernodeAssetSpec,normalizeUsernodeAssetSpec } from './usernodeAuthoring';
import type { UsernodeAssetDocument } from './usernodeContractsPublic';
import { decodeUsernodeAssetDocument } from './usernodeDocumentDecoder';

describe('User script document decoder', () => {
  it('accepts a complete current document without hydrating defaults', () => {
    const document = documentFixture();
    expect(decodeUsernodeAssetDocument(document)).toEqual(document);
  });

  it('reads Go nil slices encoded as JSON null as empty arrays', () => {
    const document = documentFixture() as unknown as { spec: Record<string,unknown> };
    document.spec.defaultArgs = null;
    document.spec.setupScripts = null;
    const decoded = decodeUsernodeAssetDocument(document);
    expect(decoded.spec.defaultArgs).toEqual([]);
    expect(decoded.spec.setupScripts).toEqual([]);
  });

  it('rejects a missing field instead of substituting a default', () => {
    const missingSource = documentFixture() as unknown as Record<string,unknown>;
    delete (missingSource.spec as Record<string,unknown>).source;
    expect(() => decodeUsernodeAssetDocument(missingSource)).toThrow('spec.source is required');

    const missingEnv = documentFixture() as unknown as Record<string,unknown>;
    delete (missingEnv.spec as Record<string,unknown>).env;
    expect(() => decodeUsernodeAssetDocument(missingEnv)).toThrow('spec.env is required');
  });

  it('rejects an unknown field at every protocol boundary', () => {
    const unknownSpecField = documentFixture() as unknown as Record<string,unknown>;
    (unknownSpecField.spec as Record<string,unknown>).command = '/bin/sh';
    expect(() => decodeUsernodeAssetDocument(unknownSpecField)).toThrow('unknown field "command"');

    const unknownInputField = documentFixture();
    unknownInputField.spec.inputs = [{
      name: 'speed',kind: 'number',required: false,default: '',description: '',extra: 1,
    } as never];
    expect(() => decodeUsernodeAssetDocument(unknownInputField)).toThrow('unknown field "extra"');
  });

  it('rejects an interpreter or input kind outside the closed vocabulary', () => {
    const badInterpreter = documentFixture();
    badInterpreter.spec.interpreter = 'perl' as never;
    expect(() => decodeUsernodeAssetDocument(badInterpreter)).toThrow('spec.interpreter must be one of');

    const badKind = documentFixture();
    badKind.spec.inputs = [{ name: 'speed',kind: 'array' as never,required: false,default: '',description: '' }];
    expect(() => decodeUsernodeAssetDocument(badKind)).toThrow('inputs[0].kind must be one of');
  });

  it('rejects a payload the Core domain would refuse to commit', () => {
    const contradictory = documentFixture();
    contradictory.spec.interpreter = 'rosrun';
    contradictory.spec.package = '';
    expect(() => decodeUsernodeAssetDocument(contradictory)).toThrow('ROS package');
  });

  it('rejects a schema version it does not own', () => {
    const future = documentFixture();
    future.spec.schemaVersion = 2 as never;
    expect(() => decodeUsernodeAssetDocument(future)).toThrow('spec.schemaVersion must be 1');
  });
});

function documentFixture(): UsernodeAssetDocument {
  const timestamp = '2026-07-28T00:00:00Z';
  const spec = normalizeUsernodeAssetSpec(newUsernodeAssetSpec('Warm up'));
  return {
    head: {
      domain: 'usernode',resourceId: 'usernode-a',name: spec.name,description: spec.description,tags: spec.tags,
      mainCommitId: 'commit-1',currentVersion: 1,digest: 'a'.repeat(64),revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'usernode',resourceId: 'usernode-a',name: 'main',headCommitId: 'commit-1',headVersion: 1,revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}
