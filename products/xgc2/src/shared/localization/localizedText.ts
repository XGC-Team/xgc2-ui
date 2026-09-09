import { useCallback,useContext } from 'react';
import { commonZhMessages } from './commonMessages';
import { LanguageContext } from './languageContext';
import type { AppLanguage } from './languagePreference';

export type MessageCatalog = Readonly<Record<string,string>>;
export type MessageCatalogSource = MessageCatalog | ReadonlyArray<MessageCatalog>;
export type MessageValues = Readonly<Record<string,string | number>>;
export type LocalizedText = (text: string, values?: MessageValues) => string;

export function useAppLanguage(): AppLanguage {
  return useContext(LanguageContext);
}

export function formatLocalizedText(
  language: AppLanguage,
  source: MessageCatalogSource,
  text: string,
  values?: MessageValues,
): string {
  const catalogs: ReadonlyArray<MessageCatalog> = Array.isArray(source)
    ? source
    : [source as MessageCatalog];
  const translated: string | undefined = catalogs.find((messages) => messages[text] !== undefined)?.[text];
  const template = language === 'zh-CN' ? translated ?? commonZhMessages[text] ?? text : text;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match: string, key: string) => String(values[key] ?? match));
}

export function useLocalizedText(source: MessageCatalogSource): LocalizedText {
  const language = useAppLanguage();
  return useCallback(
    (text: string, values?: MessageValues) => formatLocalizedText(language, source, text, values),
    [language,source],
  );
}
