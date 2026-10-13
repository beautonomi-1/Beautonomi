/** Portaled Mapbox listbox lives on document.body; modal layers must not dismiss on interaction with it. */
export function isAddressAutocompletePortalTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest("[data-address-autocomplete-listbox='true']"))
  );
}
