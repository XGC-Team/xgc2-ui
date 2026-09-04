/// <reference types="vite/client" />

interface Window {
  MonacoEnvironment?: {
    getWorker: (...argumentsList: unknown[]) => Worker;
  };
}
