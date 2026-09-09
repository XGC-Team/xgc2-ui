import { createContext } from 'react';
import type { AppLanguage } from './languagePreference';

export const LanguageContext = createContext<AppLanguage>('en-US');
