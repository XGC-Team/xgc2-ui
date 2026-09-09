import type { AppLanguage } from '../../shared/localization/languagePreference';
import { productPageLabel,useProductWebComposition } from '../../shared/productWebComposition';
import type { Page } from '../navigation/navConfig';

export function PageTitle({ page,language }: {
  page: Page;
  language: AppLanguage;
}) {
  const composition = useProductWebComposition();
  return productPageLabel(composition, page, language);
}
