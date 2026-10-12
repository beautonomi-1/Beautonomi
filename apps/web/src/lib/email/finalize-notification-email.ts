export {
  finalizeTemplateEmailHtml,
  maybeWrapNotificationEmailHtml,
  htmlToPlainText,
  isFullDocumentEmailHtml,
  renderBeautonomiTransactionalEmail,
  BEAUTONOMI_EMAIL_TOKENS,
} from "@/lib/email/beautonomi-transactional-layout";
export type {
  FinalizeTemplateEmailInput,
  FinalizeTemplateEmailResult,
  MaybeWrapNotificationEmailMeta,
  RenderBeautonomiTransactionalEmailInput,
  TransactionalEmailDetailRow,
} from "@/lib/email/beautonomi-transactional-layout";
