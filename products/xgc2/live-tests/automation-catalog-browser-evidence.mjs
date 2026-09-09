/* global URL,document */

// Passive browser evidence: these listeners never fetch a document, alter
// routing/cache behavior, or wait before an Experiment command is dispatched.
export function observeAutomationCatalogRequests(page,report) {
  const requests=new WeakMap();
  report.automationCatalogRequests=[];
  report.apiRequestFailures=[];
  page.on('request',(request) => {
    const path=new URL(request.url()).pathname;
    if (!path.endsWith('/api/automations')) return;
    const entry={ path,method:request.method(),startedAt:new Date().toISOString() };
    requests.set(request,entry);
    report.automationCatalogRequests.push(entry);
  });
  page.on('response',(response) => {
    const entry=requests.get(response.request());
    if (!entry) return;
    entry.responseAt=new Date().toISOString();
    entry.status=response.status();
    void response.json().then((body) => {
      entry.bodyReadAt=new Date().toISOString();
      entry.bodyKind=Array.isArray(body) ? 'array' : typeof body;
      if (Array.isArray(body)) {
        entry.documentCount=body.length;
        entry.documents=body.map((document) => ({
          resourceId:document?.head?.resourceId,
          branch:document?.branch?.name,
          schemaVersion:document?.spec?.schemaVersion,
        }));
      }
    }).catch((cause) => {
      entry.bodyReadError=String(cause);
    });
  });
  page.on('requestfinished',(request) => {
    const entry=requests.get(request);
    if (entry) entry.finishedAt=new Date().toISOString();
  });
  page.on('requestfailed',(request) => {
    const path=new URL(request.url()).pathname;
    const failure={
      path,method:request.method(),failedAt:new Date().toISOString(),
      error:request.failure()?.errorText ?? 'unknown transport failure',
    };
    const entry=requests.get(request);
    if (entry) Object.assign(entry,failure);
    if (path.startsWith('/api/')) report.apiRequestFailures.push(failure);
  });
}

export async function captureAutomationPanelFailure(page) {
  return page.evaluate(() => {
    // React internals are supplementary diagnostics, never an acceptance
    // contract. The DOM evidence remains available if those internals change.
    const panels=[...document.querySelectorAll('[data-xgc-role="experiment-panel"]')];
    return {
      capturedAt:new Date().toISOString(),
      iframeSources:[...document.querySelectorAll('iframe')].map((frame) => frame.src),
      panels:panels.map((panel) => {
        const buttons=[...panel.querySelectorAll('button')].map((button) => ({
          text:button.textContent,title:button.title,disabled:button.disabled,
          role:button.getAttribute('data-xgc-role'),id:button.getAttribute('data-xgc-id'),
        }));
        const runtimes=[];
        const fiberKey=Object.keys(panel).find((key) => key.startsWith('__reactFiber$'));
        let fiber=fiberKey ? panel[fiberKey] : undefined;
        for (let depth=0;fiber && depth<40;depth+=1,fiber=fiber.return) {
          const props=fiber.memoizedProps;
          for (const key of ['automation','localAutomation','automationFallback']) {
            const runtime=props?.[key];
            if (!Array.isArray(runtime?.documents)) continue;
            runtimes.push({
              component:fiber.type?.name ?? '',key,targetId:runtime.targetId,
              error:runtime.error,loading:runtime.loading,
              documentCount:runtime.documents.length,
              documents:runtime.documents.map((value) => ({
                resourceId:value.head?.resourceId,branch:value.branch?.name,
              })),
            });
          }
        }
        return { panelId:panel.getAttribute('data-xgc-id'),buttons,runtimes };
      }),
    };
  });
}
