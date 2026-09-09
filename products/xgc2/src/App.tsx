import { AppFrame } from './app/AppFrame';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import { AppRoutes } from './app/AppRoutes';
import { NavigationProvider } from './app/navigationStore';

export function App() {
  return (
    <AppErrorBoundary>
      <NavigationProvider>
        <AppFrame>
          <AppRoutes />
        </AppFrame>
      </NavigationProvider>
    </AppErrorBoundary>
  );
}
