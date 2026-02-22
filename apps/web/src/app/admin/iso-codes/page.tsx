"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Globe, CreditCard, Clock, Languages } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Currency {
  code: string;
  name: string;
  symbol?: string | null;
  decimal_places: number;
  is_active: boolean;
  is_default: boolean;
}

interface Language {
  code: string;
  name: string;
  native_name?: string | null;
  is_active: boolean;
  is_default: boolean;
  rtl: boolean;
}

interface Country {
  code: string;
  code3?: string | null;
  numeric_code?: string | null;
  name: string;
  phone_country_code: string;
  is_active: boolean;
  is_default: boolean;
}

interface Locale {
  code: string;
  language_code: string;
  country_code: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
}

interface Timezone {
  code: string;
  name: string;
  utc_offset: string;
  country_code?: string | null;
  is_active: boolean;
  is_default: boolean;
}

export default function AdminIsoCodes() {
  const [activeTab, setActiveTab] = useState<"currencies" | "languages" | "countries" | "locales" | "timezones">("currencies");
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [locales, setLocales] = useState<Locale[]>([]);
  const [timezones, setTimezones] = useState<Timezone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [dialogType, setDialogType] = useState<typeof activeTab | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps -- load when tab changes

  // Load dependencies (languages and countries) when needed
  useEffect(() => {
    if (activeTab === "locales" || activeTab === "timezones") {
      loadDependencies();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps -- load dependencies when tab is locales/timezones

  const loadDependencies = async () => {
    try {
      // Load languages and countries if not already loaded
      if (languages.length === 0) {
        const langsResponse = await fetcher.get<{ data: any[] }>("/api/admin/iso-codes/languages");
        setLanguages(langsResponse.data || []);
      }
      if (countries.length === 0) {
        const countriesResponse = await fetcher.get<{ data: any[] }>("/api/admin/iso-codes/countries");
        setCountries(countriesResponse.data || []);
      }
    } catch {
      // Don't show toast for dependency loading failures
    }
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const endpoint = `/api/admin/iso-codes/${activeTab}`;
      const response = await fetcher.get<{ data: any[]; error?: any }>(endpoint);
      
      // Handle response structure: { data: [...], error: null }
      const data = response.data || [];
      
      switch (activeTab) {
        case "currencies":
          setCurrencies(data);
          break;
        case "languages":
          setLanguages(data);
          break;
        case "countries":
          setCountries(data);
          break;
        case "locales":
          setLocales(data);
          break;
        case "timezones":
          setTimezones(data);
          break;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to load data";
      toast.error(errorMessage);
      
      // Set empty arrays on error to show empty state
      switch (activeTab) {
        case "currencies":
          setCurrencies([]);
          break;
        case "languages":
          setLanguages([]);
          break;
        case "countries":
          setCountries([]);
          break;
        case "locales":
          setLocales([]);
          break;
        case "timezones":
          setTimezones([]);
          break;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    setDialogType(activeTab);
    setShowDialog(true);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setDialogType(activeTab);
    setShowDialog(true);
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Are you sure you want to delete ${item.code || item.name}?`)) return;

    try {
      const code = item.code;
      await fetcher.delete(`/api/admin/iso-codes/${activeTab}/${code}`);
      toast.success("Deleted successfully");
      loadData();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleSave = async (formData: any) => {
    try {
      if (editingItem) {
        await fetcher.put(`/api/admin/iso-codes/${activeTab}/${editingItem.code}`, formData);
        toast.success("Updated successfully");
      } else {
        await fetcher.post(`/api/admin/iso-codes/${activeTab}`, formData);
        toast.success("Created successfully");
      }
      setShowDialog(false);
      setEditingItem(null);
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading ISO codes..." />;
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-2">ISO Codes Management</h1>
          <p className="text-gray-600">Manage currencies, languages, countries, locales, and timezones</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-6">
            <TabsTrigger value="currencies">
              <CreditCard className="w-4 h-4 mr-2" />
              Currencies
            </TabsTrigger>
            <TabsTrigger value="languages">
              <Languages className="w-4 h-4 mr-2" />
              Languages
            </TabsTrigger>
            <TabsTrigger value="countries">
              <Globe className="w-4 h-4 mr-2" />
              Countries
            </TabsTrigger>
            <TabsTrigger value="locales">
              <Globe className="w-4 h-4 mr-2" />
              Locales
            </TabsTrigger>
            <TabsTrigger value="timezones">
              <Clock className="w-4 h-4 mr-2" />
              Timezones
            </TabsTrigger>
          </TabsList>

          <TabsContent value="currencies">
            <CurrencyTab
              currencies={currencies}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreate={handleCreate}
            />
          </TabsContent>

          <TabsContent value="languages">
            <LanguageTab
              languages={languages}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreate={handleCreate}
            />
          </TabsContent>

          <TabsContent value="countries">
            <CountryTab
              countries={countries}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreate={handleCreate}
            />
          </TabsContent>

          <TabsContent value="locales">
            <LocaleTab
              locales={locales}
              languages={languages}
              countries={countries}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreate={handleCreate}
            />
          </TabsContent>

          <TabsContent value="timezones">
            <TimezoneTab
              timezones={timezones}
              countries={countries}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreate={handleCreate}
            />
          </TabsContent>
        </Tabs>

        {showDialog && dialogType && (
          <IsoCodeDialog
            type={dialogType}
            item={editingItem}
            languages={languages}
            countries={countries}
            onClose={() => {
              setShowDialog(false);
              setEditingItem(null);
            }}
            onSave={handleSave}
          />
        )}
      </div>
    </RoleGuard>
  );
}

function CurrencyTab({
  currencies,
  onEdit,
  onDelete,
  onCreate,
}: {
  currencies: Currency[];
  onEdit: (item: Currency) => void;
  onDelete: (item: Currency) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">ISO 4217 Currency Codes</p>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Currency
        </Button>
      </div>
      {currencies.length === 0 ? (
        <EmptyState title="No currencies" description="Add your first currency" />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Decimal Places</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {currencies.map((currency) => (
                <tr key={currency.code} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{currency.code}</span>
                      {currency.is_default && <Badge variant="default">Default</Badge>}
                    </div>
                  </td>
                  <td className="px-6 py-4">{currency.name}</td>
                  <td className="px-6 py-4">{currency.symbol || "-"}</td>
                  <td className="px-6 py-4">{currency.decimal_places}</td>
                  <td className="px-6 py-4">
                    <Badge className={currency.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {currency.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(currency)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(currency)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LanguageTab({
  languages,
  onEdit,
  onDelete,
  onCreate,
}: {
  languages: Language[];
  onEdit: (item: Language) => void;
  onDelete: (item: Language) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">ISO 639-1 Language Codes</p>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Language
        </Button>
      </div>
      {languages.length === 0 ? (
        <EmptyState title="No languages" description="Add your first language" />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Native Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RTL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {languages.map((language) => (
                <tr key={language.code} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{language.code}</span>
                      {language.is_default && <Badge variant="default">Default</Badge>}
                    </div>
                  </td>
                  <td className="px-6 py-4">{language.name}</td>
                  <td className="px-6 py-4">{language.native_name || "-"}</td>
                  <td className="px-6 py-4">{language.rtl ? "Yes" : "No"}</td>
                  <td className="px-6 py-4">
                    <Badge className={language.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {language.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(language)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(language)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CountryTab({
  countries,
  onEdit,
  onDelete,
  onCreate,
}: {
  countries: Country[];
  onEdit: (item: Country) => void;
  onDelete: (item: Country) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">ISO 3166-1 Country Codes with Phone Codes (ITU-T E.164)</p>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Country
        </Button>
      </div>
      {countries.length === 0 ? (
        <EmptyState title="No countries" description="Add your first country" />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {countries.map((country) => (
                <tr key={country.code} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{country.code}</span>
                      {country.is_default && <Badge variant="default">Default</Badge>}
                    </div>
                  </td>
                  <td className="px-6 py-4">{country.name}</td>
                  <td className="px-6 py-4 font-mono">{country.phone_country_code}</td>
                  <td className="px-6 py-4">
                    <Badge className={country.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {country.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(country)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(country)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LocaleTab({
  locales,
  onEdit,
  onDelete,
  onCreate,
}: {
  locales: Locale[];
  languages: Language[];
  countries: Country[];
  onEdit: (item: Locale) => void;
  onDelete: (item: Locale) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">ISO 639-1 + ISO 3166-1 Locale Codes (e.g., en-US, en-ZA)</p>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Locale
        </Button>
      </div>
      {locales.length === 0 ? (
        <EmptyState title="No locales" description="Add your first locale" />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Language</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {locales.map((locale) => (
                <tr key={locale.code} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{locale.code}</span>
                      {locale.is_default && <Badge variant="default">Default</Badge>}
                    </div>
                  </td>
                  <td className="px-6 py-4">{locale.name}</td>
                  <td className="px-6 py-4">{locale.language_code}</td>
                  <td className="px-6 py-4">{locale.country_code}</td>
                  <td className="px-6 py-4">
                    <Badge className={locale.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {locale.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(locale)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(locale)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TimezoneTab({
  timezones,
  onEdit,
  onDelete,
  onCreate,
}: {
  timezones: Timezone[];
  countries: Country[];
  onEdit: (item: Timezone) => void;
  onDelete: (item: Timezone) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">IANA Timezone Codes</p>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Timezone
        </Button>
      </div>
      {timezones.length === 0 ? (
        <EmptyState title="No timezones" description="Add your first timezone" />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">UTC Offset</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {timezones.map((timezone) => (
                <tr key={timezone.code} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{timezone.code}</span>
                      {timezone.is_default && <Badge variant="default">Default</Badge>}
                    </div>
                  </td>
                  <td className="px-6 py-4">{timezone.name}</td>
                  <td className="px-6 py-4 font-mono">{timezone.utc_offset}</td>
                  <td className="px-6 py-4">
                    <Badge className={timezone.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {timezone.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(timezone)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(timezone)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IsoCodeDialog({
  type,
  item,
  languages,
  countries,
  onClose,
  onSave,
}: {
  type: "currencies" | "languages" | "countries" | "locales" | "timezones";
  item: any;
  languages: Language[];
  countries: Country[];
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState<any>(() => {
    if (item) return { ...item };
    
    // Default values for new items
    switch (type) {
      case "currencies":
        return { code: "", name: "", symbol: "", decimal_places: 2, is_active: true, is_default: false };
      case "languages":
        return { code: "", name: "", native_name: "", is_active: true, is_default: false, rtl: false };
      case "countries":
        return { code: "", code3: "", numeric_code: "", name: "", phone_country_code: "", is_active: true, is_default: false };
      case "locales":
        return { code: "", language_code: "", country_code: "", name: "", is_active: true, is_default: false };
      case "timezones":
        return { code: "", name: "", utc_offset: "+00:00", country_code: "", is_active: true, is_default: false };
      default:
        return {};
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-generate locale code from language + country
    const dataToSave = type === "locales" && !item && formData.language_code && formData.country_code
      ? { ...formData, code: `${formData.language_code.toLowerCase()}-${formData.country_code.toUpperCase()}` }
      : formData;
    onSave(dataToSave);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${type.slice(0, -1)}` : `Add ${type.slice(0, -1)}`}</DialogTitle>
          <DialogDescription>
            {type === "currencies" && "ISO 4217 Currency Code (3 uppercase letters)"}
            {type === "languages" && "ISO 639-1 Language Code (2 lowercase letters)"}
            {type === "countries" && "ISO 3166-1 Country Code (2 uppercase letters) with ITU-T E.164 phone code"}
            {type === "locales" && "ISO 639-1 + ISO 3166-1 Locale Code (e.g., en-US)"}
            {type === "timezones" && "IANA Timezone Code (e.g., Africa/Johannesburg)"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {type === "currencies" && (
            <>
              <div>
                <Label htmlFor="code">Currency Code (ISO 4217) *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="USD"
                  maxLength={3}
                  required
                  disabled={!!item}
                  pattern="[A-Z]{3}"
                />
                <p className="text-xs text-gray-500 mt-1">3 uppercase letters (e.g., USD, ZAR, EUR)</p>
              </div>
              <div>
                <Label htmlFor="name">Currency Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="US Dollar"
                  required
                />
              </div>
              <div>
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  value={formData.symbol || ""}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                  placeholder="$"
                />
              </div>
              <div>
                <Label htmlFor="decimal_places">Decimal Places *</Label>
                <Input
                  id="decimal_places"
                  type="number"
                  min="0"
                  max="4"
                  value={formData.decimal_places}
                  onChange={(e) => setFormData({ ...formData, decimal_places: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  />
                  <span>Default</span>
                </label>
              </div>
            </>
          )}

          {type === "languages" && (
            <>
              <div>
                <Label htmlFor="code">Language Code (ISO 639-1) *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase() })}
                  placeholder="en"
                  maxLength={2}
                  required
                  disabled={!!item}
                  pattern="[a-z]{2}"
                />
                <p className="text-xs text-gray-500 mt-1">2 lowercase letters (e.g., en, af, zu)</p>
              </div>
              <div>
                <Label htmlFor="name">Language Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="English"
                  required
                />
              </div>
              <div>
                <Label htmlFor="native_name">Native Name</Label>
                <Input
                  id="native_name"
                  value={formData.native_name || ""}
                  onChange={(e) => setFormData({ ...formData, native_name: e.target.value })}
                  placeholder="English"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.rtl}
                    onChange={(e) => setFormData({ ...formData, rtl: e.target.checked })}
                  />
                  <span>Right-to-Left (RTL)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  />
                  <span>Default</span>
                </label>
              </div>
            </>
          )}

          {type === "countries" && (
            <>
              <div>
                <Label htmlFor="code">Country Code (ISO 3166-1 alpha-2) *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="US"
                  maxLength={2}
                  required
                  disabled={!!item}
                  pattern="[A-Z]{2}"
                />
                <p className="text-xs text-gray-500 mt-1">2 uppercase letters (e.g., US, ZA, GB)</p>
              </div>
              <div>
                <Label htmlFor="code3">Country Code (ISO 3166-1 alpha-3)</Label>
                <Input
                  id="code3"
                  value={formData.code3 || ""}
                  onChange={(e) => setFormData({ ...formData, code3: e.target.value.toUpperCase() })}
                  placeholder="USA"
                  maxLength={3}
                  pattern="[A-Z]{3}"
                />
              </div>
              <div>
                <Label htmlFor="numeric_code">Numeric Code (ISO 3166-1 numeric)</Label>
                <Input
                  id="numeric_code"
                  value={formData.numeric_code || ""}
                  onChange={(e) => setFormData({ ...formData, numeric_code: e.target.value })}
                  placeholder="840"
                  maxLength={3}
                  pattern="[0-9]{3}"
                />
              </div>
              <div>
                <Label htmlFor="name">Country Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="United States"
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone_country_code">Phone Country Code (ITU-T E.164) *</Label>
                <Input
                  id="phone_country_code"
                  value={formData.phone_country_code}
                  onChange={(e) => setFormData({ ...formData, phone_country_code: e.target.value })}
                  placeholder="+1"
                  required
                  pattern="\+\d{1,4}"
                />
                <p className="text-xs text-gray-500 mt-1">Format: +XXX (e.g., +1, +27, +44)</p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  />
                  <span>Default</span>
                </label>
              </div>
            </>
          )}

          {type === "locales" && (
            <>
              <div>
                <Label htmlFor="language_code">Language Code (ISO 639-1) *</Label>
                <Select
                  value={formData.language_code}
                  onValueChange={(value) => {
                    const newCode = item ? formData.code : `${value.toLowerCase()}-${formData.country_code.toUpperCase()}`;
                    setFormData({ ...formData, language_code: value, code: newCode });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name} ({lang.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="country_code">Country Code (ISO 3166-1) *</Label>
                <Select
                  value={formData.country_code}
                  onValueChange={(value) => {
                    const newCode = item ? formData.code : `${formData.language_code.toLowerCase()}-${value.toUpperCase()}`;
                    setFormData({ ...formData, country_code: value, code: newCode });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name} ({country.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="code">Locale Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="en-US"
                  required
                  disabled={!!item}
                  pattern="[a-z]{2}-[A-Z]{2}"
                />
                <p className="text-xs text-gray-500 mt-1">Format: ll-CC (e.g., en-US, en-ZA, af-ZA)</p>
              </div>
              <div>
                <Label htmlFor="name">Locale Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="English (United States)"
                  required
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  />
                  <span>Default</span>
                </label>
              </div>
            </>
          )}

          {type === "timezones" && (
            <>
              <div>
                <Label htmlFor="code">Timezone Code (IANA) *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Africa/Johannesburg"
                  required
                  disabled={!!item}
                />
                <p className="text-xs text-gray-500 mt-1">IANA timezone identifier (e.g., Africa/Johannesburg, America/New_York)</p>
              </div>
              <div>
                <Label htmlFor="name">Timezone Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="South Africa Standard Time"
                  required
                />
              </div>
              <div>
                <Label htmlFor="utc_offset">UTC Offset *</Label>
                <Input
                  id="utc_offset"
                  value={formData.utc_offset}
                  onChange={(e) => setFormData({ ...formData, utc_offset: e.target.value })}
                  placeholder="+02:00"
                  required
                  pattern="[+-]\d{2}:\d{2}"
                />
                <p className="text-xs text-gray-500 mt-1">Format: +/-HH:MM (e.g., +02:00, -05:00)</p>
              </div>
              <div>
                <Label htmlFor="country_code">Country Code (Optional)</Label>
                <Select
                  value={formData.country_code || ""}
                  onValueChange={(value) => setFormData({ ...formData, country_code: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name} ({country.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  />
                  <span>Default</span>
                </label>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {item ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
