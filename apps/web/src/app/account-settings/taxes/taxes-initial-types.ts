export type TaxInfoPayload = {
  country?: string;
  tax_id?: string;
  full_name?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  updated_at?: string;
};

export type TaxDocumentPayload = {
  year: number;
  document_url: string | null;
  issued_at: string | null;
  status: "issued" | "not_issued";
};

export type TaxesPageInitial = {
  tax_info: TaxInfoPayload | null;
  vat_id: string | null;
  tax_documents: TaxDocumentPayload[];
};
