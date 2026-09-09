import { describe,expect,it } from 'vitest';
import {
  formatLocalizedText,
  type LocalizedText,
} from '../../shared/localization/localizedText';
import {
  cameraZhMessages,
  localizeCameraMessage,
  localizeCameraValidationIssue,
} from './cameraMessages';
import type { CameraValidationIssue } from './cameraValidationIssue';

const t:LocalizedText=(message,values) => formatLocalizedText('zh-CN',cameraZhMessages,message,values);

const dynamicCases:Array<[CameraValidationIssue,string]> = [
  [{ code:'camera-source-not-object',args:{ index:2 } },'2'],
  [{ code:'camera-source-invalid-field-types',args:{ index:3 } },'3'],
  [{ code:'camera-sources-too-many',args:{ maximum:16 } },'16'],
  [{ code:'camera-source-invalid-id',args:{ label:'Front camera' } },'Front camera'],
  [{ code:'camera-source-duplicate-id',args:{ id:'front' } },'front'],
  [{ code:'camera-source-name-required',args:{ index:4 } },'4'],
  [{
    code:'camera-source-runtime-invalid',args:{
      label:'Front camera',issue:{ code:'media-edge-url-invalid' },
    },
  },'Front camera：Media Edge URL 必须是绝对 HTTP 或 HTTPS 源地址。'],
  [{ code:'camera-option-unsupported',args:{ key:'layoutColumns' } },'layoutColumns'],
  [{ code:'camera-boolean-option-invalid',args:{ field:'autoConnect' } },'autoConnect'],
  [{ code:'world-coordinate-out-of-range',args:{ axis:'X' } },'X'],
  [{ code:'world-angle-out-of-range',args:{ angle:'Pitch' } },'俯仰'],
];

describe('camera validation localization',() => {
  it('localizes typed dynamic args without parsing rendered English',() => {
    expect(localizeCameraValidationIssue(t,{
      code:'camera-sources-too-many',args:{ maximum:16 },
    })).toContain('16');
    expect(localizeCameraValidationIssue(t,{
      code:'camera-source-invalid-id',args:{ label:'Front camera' },
    })).toContain('Front camera');
    expect(localizeCameraValidationIssue(t,{
      code:'camera-source-runtime-invalid',args:{
        label:'Front camera',issue:{ code:'media-edge-url-invalid' },
      },
    })).toBe('Front camera：Media Edge URL 必须是绝对 HTTP 或 HTTPS 源地址。');
    expect(localizeCameraValidationIssue(t,{
      code:'world-angle-out-of-range',args:{ angle:'Pitch' },
    })).toContain('俯仰');
    expect(localizeCameraValidationIssue(t,{
      code:'camera-boolean-option-invalid',args:{ field:'autoConnect' },
    })).toContain('autoConnect');
  });

  it.each(dynamicCases)('localizes dynamic issue %# without English parsing', (issue,expected) => {
    expect(localizeCameraValidationIssue(t,issue)).toContain(expected);
  });

  it('preserves unknown backend errors verbatim',() => {
    const unknown='camera backend exploded: opaque-code-17';
    expect(localizeCameraMessage(t,unknown)).toBe(unknown);
    expect(localizeCameraMessage(t,'Camera source configuration is missing.'))
      .toBe('缺少相机源配置。');
  });

  it('retains the latest static-marker copy',() => {
    expect(t('{count} static markers',{ count:4 })).toBe('4 个静态标记');
  });
});
