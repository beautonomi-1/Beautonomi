import { describe, expect, it } from "vitest";
import {
  buildLocalizedPushMaps,
  resolveLocalizedTemplateCopy,
  type LocalizedTemplateCopy,
} from "@/lib/notifications/template-translations";

const base: LocalizedTemplateCopy = {
  title: "Hello {{name}}",
  body: "Body {{name}}",
  emailSubject: "Subject {{name}}",
  emailBody: "<p>Email {{name}}</p>",
  smsBody: "SMS {{name}}",
};

describe("template-translations", () => {
  it("resolveLocalizedTemplateCopy uses translation row and substitutes variables", () => {
    const rows = new Map<string, LocalizedTemplateCopy>([
      [
        "fr",
        {
          title: "Bonjour {{name}}",
          body: "Corps {{name}}",
          emailSubject: "Sujet {{name}}",
          emailBody: "<p>Courriel {{name}}</p>",
          smsBody: "Texto {{name}}",
        },
      ],
    ]);
    const copy = resolveLocalizedTemplateCopy(base, rows, "fr", { name: "Ada" });
    expect(copy.title).toBe("Bonjour Ada");
    expect(copy.emailBody).toBe("<p>Courriel Ada</p>");
    expect(copy.smsBody).toBe("Texto Ada");
  });

  it("buildLocalizedPushMaps includes all requested languages", () => {
    const rows = new Map<string, LocalizedTemplateCopy>([
      ["ar", { ...base, title: "مرحبا {{name}}", body: "نص {{name}}" }],
    ]);
    const { headings, contents } = buildLocalizedPushMaps(base, rows, ["ar"], { name: "Z" });
    expect(headings.en).toBe("Hello Z");
    expect(headings.ar).toBe("مرحبا Z");
    expect(contents.ar).toBe("نص Z");
  });
});
