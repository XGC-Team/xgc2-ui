import type { ComponentType } from 'react';
import type { HomeCardProps } from '../../shared/productWebComposition';
import { useNavigation } from '../navigationContext';

/**
 * App-owned route adapter: injects navigation language into Home as a narrow runtime port.
 * Accepts any Home card-shaped component; does not import Home domain modules.
 */
export function createHomePageAdapter(
  HomePage: ComponentType<HomeCardProps>,
): ComponentType {
  return function HomePageAdapter() {
    const nav = useNavigation();
    return <HomePage runtime={{ language: nav.language }} />;
  };
}
