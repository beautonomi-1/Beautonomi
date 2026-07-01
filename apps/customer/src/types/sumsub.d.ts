/**
 * Type declarations for @sumsub/react-native-mobilesdk-module (v1.44.x).
 * The package does not ship its own types; this file provides enough coverage
 * for the launchSumsub helper.
 */
declare module "@sumsub/react-native-mobilesdk-module" {
  type TokenExpirationHandler = () => Promise<string>;

  type SumsubHandlers = {
    onStatusChanged?: (newStatus: string, prevStatus?: string) => void;
    onEvent?: (event: unknown) => void;
    onLog?: (level: string, message: string) => void;
  };

  interface SNSMobileSDKInstance {
    launch(): Promise<void>;
    dismiss(): void;
  }

  interface Builder {
    withAccessToken(token: string, expirationHandler: TokenExpirationHandler): Builder;
    withHandlers(handlers: SumsubHandlers): Builder;
    withLocale(locale: string): Builder;
    withStrings(strings: Record<string, string>): Builder;
    withTheme(theme: Record<string, unknown>): Builder;
    withBaseUrl(apiUrl: string): Builder;
    onTestEnv(): Builder;
    build(): SNSMobileSDKInstance;
  }

  const SNSMobileSDK: {
    init(accessToken: string, expirationHandler: TokenExpirationHandler): Builder;
    reset(): void;
  };

  export default SNSMobileSDK;
}
