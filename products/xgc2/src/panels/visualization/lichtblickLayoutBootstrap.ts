export function lichtblickLayoutWasBootstrapped(
  targetId: string,
  processInstanceId: string,
) {
  try {
    return window.sessionStorage.getItem(lichtblickBootstrapKey(targetId, processInstanceId)) === '1';
  } catch {
    return false;
  }
}

export function markLichtblickLayoutBootstrapped(
  targetId: string,
  processInstanceId: string,
) {
  try {
    window.sessionStorage.setItem(lichtblickBootstrapKey(targetId, processInstanceId), '1');
  } catch {
    // Storage can be unavailable in hardened browsers; the layout remains a safe default.
  }
}

function lichtblickBootstrapKey(targetId: string, processInstanceId: string) {
  return `xgc.lichtblick.layout-bootstrapped.${targetId}.${processInstanceId}`;
}
