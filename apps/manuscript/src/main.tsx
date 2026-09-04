import { createRoot } from 'react-dom/client';
import { initializeSkin } from '@xgc2/ui-react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import 'monaco-editor/min/vs/editor/editor.main.css';
import '@xgc2/ui-react/styles.css';
import '@xgc2/ui-react/focus.css';
import { App } from './App';
import './styles.css';

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

initializeSkin({ defaultSkin: 'light' });

createRoot(document.getElementById('root')!).render(<App />);
