/**
 * React Native `FormData` accepts `{ uri, name, type }` for multipart file parts,
 * but TypeScript's DOM lib only types `append` as `string | Blob`. Centralize the
 * cast here so app code stays clean.
 */
export type NativeFormDataFilePart = {
  uri: string;
  name: string;
  type: string;
};

export function appendFormDataFileNative(
  formData: FormData,
  fieldName: string,
  file: NativeFormDataFilePart
): void {
  formData.append(fieldName, file as never);
}
