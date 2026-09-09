import type { ReactNode } from 'react';
import { LanguageContext } from './languageContext';
import type { AppLanguage } from './languagePreference';

export function LanguageProvider({ language,children }: { language: AppLanguage; children: ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}
