import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { I18nextProvider, i18n, initI18n } from "@beautonomi/i18n";

initI18n("en");

export function renderWithI18n(ui: React.ReactElement, options?: RenderOptions) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>, options);
}

export * from "@testing-library/react";
