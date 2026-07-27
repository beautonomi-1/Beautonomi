/**
 * Published PayCloud sandbox test fixtures (official Test Integration doc).
 * Served only via superadmin API — never bundle into client SPAs.
 * @see https://developers.paycloud.africa/docs/public/PayCloudTestIntegration
 */
export const PAYCLOUD_SANDBOX_FIXTURES = {
  api_base_url: "https://addpay-open.wangtest.cn/api/entry",
  app_id: "wz715fc0d10ee9d156",
  merchant_no: "302100085224",
  store_no: "4021000637",
  gateway_rsa_public_key:
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2m4nkQKyQAxJc8VVsz/L6qVbtDWRTBolUK8Dwhi9wH6aygA6363PVNEPM8eRI5W19ssCyfdtNFy6DRAureoYV053ETPUefEA5bHDOQnjbb9PuNEfT651v8cqwEaTptaxj2zujsWI8Ad3R50EyQHsskQWms/gv2aB36XUM4vyOIk4P1f3dxtqigH0YROEYiuwFFqsyJuNSjJzNbCmfgqlQv/+pE/pOV9MIQe0CAdD26JF10QpSssEwKgvKvnXPUynVu09cjSEipev5cLJSApKSDZxrRjSFBXrh6nzg8JK05ehkI8wdsryRUneh0PGN0PgYLP/wjKiqlgTJaItxnb/JQIDAQAB",
  /** PKCS#8 private key from the official test integration doc. */
  app_rsa_private_key_pkcs8:
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCqYYFrbdXFhOv3zEo4fmORUmYKsadE/QMJhD5kGzthsfwvMoqJHzN41rrGWOp4ljL64elsd2amgnEkWi8ImtV9hS4IKLft/Lq0oP5OBUvbqldaG6KX5wjq7Q11W7Ec5/tSX0IdAtV++UaO/IJyydn2JNZjspeSxbUuE+cymGs9sXtO5s5wRQmeJWv3VhDzQMj8N0ptD2dVvoFkKZ7lbnpNo9ULwAn2oVQgLrmEv/R+TEZPiAcCIhcez4eimY9i6ucTcj4I9liUeTgydAnNAesQZDCt3qQyfl8EZvfWtCUVVbin4uiYsxbzcFSW3q0q27fLsruPRGf+XHnjbR4438MpAgMBAAECggEAMo4YDr5abe9Q7QgLBdRKyvX+HTI1hbzlR8+bi6yg5A4h3AdNH/7IERT1+qCrgfhfTB34WxzaspGF7Nltl0oKCuKXlAgw+0bAR5R1oMTli1px7OTCS/xbowmPssDwPrl+0yQ8w8rxemmQzCCUvGa0a9rmWlLFsuFDL1bshRDA0V73/RB+GG2GtYQFwcu9RgbWcb8YUXBkck7UccGfSoLhtiiDISYTcQy7FQUZHXrr/v6BapG/oVp0PXwIyglw44rHFbpAQVFZw7SzEJcJmLj3PPZkzTGOEPB1b+4Mv0jQszKx+O2whbziXoZGaBWW7jsozi07f0+xom8vWUOd0GhgWQKBgQD97kSx4U2PlnCOvVjHAXWAqBmw2L4gngoCQndWZTTx95nAX4OUUKljWWJhC1/9x/21l52SZhO3q/TAgHON42zIf/1PSDaUuhTATAqrHCgudpRTVd9X1bvJItXNvmbLKkb2hXUPnrd2DxasZI8YAgp6CJFmH+g5plrKF90y1JahowKBgQCrxPEO1CpG/Xso7PuW9fqdz+wS2F6S9UXFm4V0+CcL49ieCY7ImOFtXsTJjQrZEQE7DhONjic07Xd1xlyFjY6RJ5FlFSPGoU3rmbaDKPvcK65nNaH/Nf8V1iWZqTl5Cg4jKboNRilVtAcF+hJNC7jmOdk/kxLDLobxN7XYiiUMwwKBgQCNSrDqkUTI6pqCshTd1o/9IIv6/P79wzIqg7VHW1UUdgMVKZBbTG6UGz5EZUHqQgeHrW898JJ0Frg/DLo/bxYukhjurm3AX7IANc+R2j75a32oyRVXGFQ+3KU+r/0ees21ihjSsiu/AzJIhkOgxjHyKSZOPt7GhSvrW0/3YpbWJQKBgGBJ3F/Vq4V0HxBIGJj9dun0XoAJ7qou+FfX4K47VZgit5GQBgyJNwVadLIPcJ9SGwCB2ZAmue+/lpHdCoyLV/oi1ix190Intkh2OIu588XubqvIsvEf0cjp7NYAuQkTC+3GPFeolw9GBhHhp1StV48nqpMq3P+xG1ApTLUAa9iFAoGAQrbQRkq3TIbsTYIpxE5kM5fgHaaHlcg6qoiLzHuEidWXVa3PssJQnJs5jKGFcErWjn3o3ttfrllk3mm5MzJCChse9a54/KifNhCeDcCQHl/+WPswRBjYz5rw5XJacmz7S8rd7JEEXT2fY3uv47ey4N9CZaWw+Y0UzQ8MeAAJ5jY=",
  /** PKCS#1 private key from the official test integration doc (for signing tests). */
  app_rsa_private_key_pkcs1:
    "MIIEowIBAAKCAQEAqmGBa23VxYTr98xKOH5jkVJmCrGnRP0DCYQ+ZBs7YbH8LzKKiR8zeNa6xljqeJYy+uHpbHdmpoJxJFovCJrVfYUuCCi37fy6tKD+TgVL26pXWhuil+cI6u0NdVuxHOf7Ul9CHQLVfvlGjvyCcsnZ9iTWY7KXksW1LhPnMphrPbF7TubOcEUJniVr91YQ80DI/DdKbQ9nVb6BZCme5W56TaPVC8AJ9qFUIC65hL/0fkxGT4gHAiIXHs+HopmPYurnE3I+CPZYlHk4MnQJzQHrEGQwrd6kMn5fBGb31rQlFVW4p+LomLMW83BUlt6tKtu3y7K7j0Rn/lx5420eON/DKQIDAQABAoIBADKOGA6+Wm3vUO0ICwXUSsr1/h0yNYW85UfPm4usoOQOIdwHTR/+yBEU9fqgq4H4X0wd+Fsc2rKRhezZbZdKCgril5QIMPtGwEeUdaDE5Ytacezkwkv8W6MJj7LA8D65ftMkPMPK8XppkMwglLxmtGva5lpSxbLhQy9W7IUQwNFe9/0QfhhthrWEBcHLvUYG1nG/GFFwZHJO1HHBn0qC4bYogyEmE3EMuxUFGR166/7+gWqRv6FadD18CMoJcOOKxxW6QEFRWcO0sxCXCZi49zz2ZM0xjhDwdW/uDL9I0LMysfjtsIW84l6GRmgVlu47KM4tO39PsaJvL1lDndBoYFkCgYEA/e5EseFNj5Zwjr1YxwF1gKgZsNi+IJ4KAkJ3VmU08feZwF+DlFCpY1liYQtf/cf9tZedkmYTt6v0wIBzjeNsyH/9T0g2lLoUwEwKqxwoLnaUU1XfV9W7ySLVzb5myypG9oV1D563dg8WrGSPGAIKegiRZh/oOaZayhfdMtSWoaMCgYEAq8TxDtQqRv17KOz7lvX6nc/sEthekvVFxZuFdPgnC+PYngmOyJjhbV7EyY0K2REBOw4TjY4nNO13dcZchY2OkSeRZRUjxqFN65m2gyj73CuuZzWh/zX/FdYlmak5eQoOIym6DUYpVbQHBfoSTQu45jnZP5MSwy6G8Te12IolDMMCgYEAjUqw6pFEyOqagrIU3daP/SCL+vz+/cMyKoO1R1tVFHYDFSmQW0xulBs+RGVB6kIHh61vPfCSdBa4Pwy6P28WLpIY7q5twF+yADXPkdo++Wt9qMkVVxhUPtylPq/9HnrNtYoY0rIrvwMySIZDoMYx8ikmTj7exoUr61tP92KW1iUCgYBgSdxf1auFdB8QSBiY/Xbp9F6ACe6qLvhX1+CuO1WYIreRkAYMiTcFWnSyD3CfUhsAgdmQJrnvv5aR3QqMi1f6ItYsdfdCJ7ZIdjiLufPF7m6ryLLxH9HI6ezWALkJEwvtxjxXqJcPRgYR4adUrVePJ6qTKtz/sRtQKUy1AGvYhQKBgEK20EZKt0yG7E2CKcROZDOX4B2mh5XIOqqIi8x7hInVl1Wtz7LCUJybOYyhhXBK1o596N7bX65ZZN5puTMyQgobHvWuePyonzYQng3AkB5f/lj7MEQY2M+a8OVyWnJs+0vK3eyRBF09n2N7r+O3suDfQmWlsPmNFM0PDHgACeY2",
} as const;

const SANDBOX_GATEWAY_HOST = "addpay-open.wangtest.cn";

export function isPaycloudSandboxFixtureValue(
  environment: "live" | "sandbox",
  field: "app_id" | "merchant_no" | "gateway_rsa_public_key" | "api_base_url",
  value: string | null | undefined,
): boolean {
  if (environment !== "live") return false;
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (field === "app_id") return trimmed === PAYCLOUD_SANDBOX_FIXTURES.app_id;
  if (field === "merchant_no") return trimmed === PAYCLOUD_SANDBOX_FIXTURES.merchant_no;
  if (field === "api_base_url") {
    // Host comparison so any path/scheme form of the sandbox gateway is caught.
    try {
      return new URL(trimmed).hostname.toLowerCase() === SANDBOX_GATEWAY_HOST;
    } catch {
      return trimmed === PAYCLOUD_SANDBOX_FIXTURES.api_base_url;
    }
  }
  if (field === "gateway_rsa_public_key") {
    return trimmed === PAYCLOUD_SANDBOX_FIXTURES.gateway_rsa_public_key;
  }
  return false;
}

export function paycloudSandboxFixtureMatchesLiveSave(payload: {
  app_id?: string;
  merchant_no?: string;
  gateway_rsa_public_key?: string;
  api_base_url?: string;
}): string | null {
  for (const field of ["app_id", "gateway_rsa_public_key", "api_base_url"] as const) {
    if (isPaycloudSandboxFixtureValue("live", field, payload[field])) {
      return `Sandbox test ${field} cannot be saved to the live environment.`;
    }
  }
  return null;
}
