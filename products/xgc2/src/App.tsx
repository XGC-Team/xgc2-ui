import { AppFrame } from './app/AppFrame';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import { AppRoutes } from './app/AppRoutes';
import { NavigationProvider } from './app/navigationStore';
import { OperatorTimeProvider } from './domains/settings/settingsPublic';

export function App() {
  return (
    <AppErrorBoundary>
      <NavigationProvider>
        <OperatorTimeProvider>
          <AppFrame>
            <AppRoutes />
          </AppFrame>
        </OperatorTimeProvider>
      </NavigationProvider>
    </AppErrorBoundary>
  );
}
