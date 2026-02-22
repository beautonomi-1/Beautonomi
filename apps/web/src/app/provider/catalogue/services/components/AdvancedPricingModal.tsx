"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Clock, Users, Calendar } from "lucide-react";
import { toast } from "sonner";

interface AdvancedPricingRule {
  id: string;
  type: "time_based" | "location_based" | "client_type" | "package" | "seasonal";
  name: string;
  enabled: boolean;
  conditions: Record<string, any>;
  priceAdjustment: {
    type: "fixed" | "percentage";
    value: number;
  };
}

interface AdvancedPricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (rules: AdvancedPricingRule[]) => void;
  initialRules?: AdvancedPricingRule[];
}

export function AdvancedPricingModal({
  open,
  onOpenChange,
  onSave,
  initialRules = [],
}: AdvancedPricingModalProps) {
  const [rules, setRules] = useState<AdvancedPricingRule[]>(initialRules);
  const [activeTab, setActiveTab] = useState<string>("time");

  const addRule = (type: AdvancedPricingRule["type"]) => {
    const newRule: AdvancedPricingRule = {
      id: `rule-${Date.now()}`,
      type,
      name: "",
      enabled: true,
      conditions: getDefaultConditions(type),
      priceAdjustment: {
        type: "percentage",
        value: 0,
      },
    };
    setRules([...rules, newRule]);
  };

  const getDefaultConditions = (type: AdvancedPricingRule["type"]): Record<string, any> => {
    switch (type) {
      case "time_based":
        return {
          days: [],
          startTime: "09:00",
          endTime: "17:00",
        };
      case "location_based":
        return {
          locationIds: [],
        };
      case "client_type":
        return {
          clientType: "new", // "new" | "returning" | "vip"
        };
      case "package":
        return {
          minServices: 1,
          discountType: "percentage",
        };
      case "seasonal":
        return {
          startDate: "",
          endDate: "",
        };
      default:
        return {};
    }
  };

  const updateRule = (id: string, updates: Partial<AdvancedPricingRule>) => {
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  const updateRuleCondition = (id: string, conditionKey: string, value: any) => {
    setRules(
      rules.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              conditions: {
                ...rule.conditions,
                [conditionKey]: value,
              },
            }
          : rule
      )
    );
  };

  const removeRule = (id: string) => {
    setRules(rules.filter((rule) => rule.id !== id));
  };

  const handleSave = () => {
    // Validate rules
    const invalidRules = rules.filter(
      (rule) => !rule.name || (rule.enabled && rule.priceAdjustment.value === 0)
    );

    if (invalidRules.length > 0) {
      toast.error("Please complete all required fields for enabled rules");
      return;
    }

    onSave(rules);
    toast.success("Advanced pricing rules saved");
    onOpenChange(false);
  };

  const renderTimeBasedRule = (rule: AdvancedPricingRule) => (
    <Card key={rule.id} className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              checked={rule.enabled}
              onCheckedChange={(checked) => updateRule(rule.id, { enabled: checked })}
            />
            <CardTitle className="text-base">Time-Based Pricing</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeRule(rule.id)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Rule Name</Label>
          <Input
            placeholder="e.g., Peak Hours, Weekend Pricing"
            value={rule.name}
            onChange={(e) => updateRule(rule.id, { name: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Start Time</Label>
            <Input
              type="time"
              value={rule.conditions.startTime || "09:00"}
              onChange={(e) => updateRuleCondition(rule.id, "startTime", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>End Time</Label>
            <Input
              type="time"
              value={rule.conditions.endTime || "17:00"}
              onChange={(e) => updateRuleCondition(rule.id, "endTime", e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label>Days of Week</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
              (day) => {
                const days = rule.conditions.days || [];
                const isSelected = days.includes(day);
                return (
                  <Button
                    key={day}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const newDays = isSelected
                        ? days.filter((d: string) => d !== day)
                        : [...days, day];
                      updateRuleCondition(rule.id, "days", newDays);
                    }}
                  >
                    {day.slice(0, 3)}
                  </Button>
                );
              }
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Price Adjustment Type</Label>
            <Select
              value={rule.priceAdjustment.type}
              onValueChange={(value: "fixed" | "percentage") =>
                updateRule(rule.id, {
                  priceAdjustment: { ...rule.priceAdjustment, type: value },
                })
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              {rule.priceAdjustment.type === "percentage" ? "Percentage (%)" : "Amount (R)"}
            </Label>
            <Input
              type="number"
              step={rule.priceAdjustment.type === "percentage" ? 1 : 0.01}
              value={rule.priceAdjustment.value}
              onChange={(e) =>
                updateRule(rule.id, {
                  priceAdjustment: {
                    ...rule.priceAdjustment,
                    value: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="mt-1.5"
              placeholder={rule.priceAdjustment.type === "percentage" ? "10" : "50.00"}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderClientTypeRule = (rule: AdvancedPricingRule) => (
    <Card key={rule.id} className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              checked={rule.enabled}
              onCheckedChange={(checked) => updateRule(rule.id, { enabled: checked })}
            />
            <CardTitle className="text-base">Client Type Pricing</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeRule(rule.id)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Rule Name</Label>
          <Input
            placeholder="e.g., New Client Discount, VIP Pricing"
            value={rule.name}
            onChange={(e) => updateRule(rule.id, { name: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Client Type</Label>
          <Select
            value={rule.conditions.clientType || "new"}
            onValueChange={(value) => updateRuleCondition(rule.id, "clientType", value)}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New Clients</SelectItem>
              <SelectItem value="returning">Returning Clients</SelectItem>
              <SelectItem value="vip">VIP Clients</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Price Adjustment Type</Label>
            <Select
              value={rule.priceAdjustment.type}
              onValueChange={(value: "fixed" | "percentage") =>
                updateRule(rule.id, {
                  priceAdjustment: { ...rule.priceAdjustment, type: value },
                })
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              {rule.priceAdjustment.type === "percentage" ? "Percentage (%)" : "Amount (R)"}
            </Label>
            <Input
              type="number"
              step={rule.priceAdjustment.type === "percentage" ? 1 : 0.01}
              value={rule.priceAdjustment.value}
              onChange={(e) =>
                updateRule(rule.id, {
                  priceAdjustment: {
                    ...rule.priceAdjustment,
                    value: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderSeasonalRule = (rule: AdvancedPricingRule) => (
    <Card key={rule.id} className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              checked={rule.enabled}
              onCheckedChange={(checked) => updateRule(rule.id, { enabled: checked })}
            />
            <CardTitle className="text-base">Seasonal Pricing</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeRule(rule.id)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Rule Name</Label>
          <Input
            placeholder="e.g., Holiday Season, Summer Special"
            value={rule.name}
            onChange={(e) => updateRule(rule.id, { name: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Start Date</Label>
            <Input
              type="date"
              value={rule.conditions.startDate || ""}
              onChange={(e) => updateRuleCondition(rule.id, "startDate", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>End Date</Label>
            <Input
              type="date"
              value={rule.conditions.endDate || ""}
              onChange={(e) => updateRuleCondition(rule.id, "endDate", e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Price Adjustment Type</Label>
            <Select
              value={rule.priceAdjustment.type}
              onValueChange={(value: "fixed" | "percentage") =>
                updateRule(rule.id, {
                  priceAdjustment: { ...rule.priceAdjustment, type: value },
                })
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              {rule.priceAdjustment.type === "percentage" ? "Percentage (%)" : "Amount (R)"}
            </Label>
            <Input
              type="number"
              step={rule.priceAdjustment.type === "percentage" ? 1 : 0.01}
              value={rule.priceAdjustment.value}
              onChange={(e) =>
                updateRule(rule.id, {
                  priceAdjustment: {
                    ...rule.priceAdjustment,
                    value: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const timeBasedRules = rules.filter((r) => r.type === "time_based");
  const clientTypeRules = rules.filter((r) => r.type === "client_type");
  const seasonalRules = rules.filter((r) => r.type === "seasonal");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced Pricing Options</DialogTitle>
          <DialogDescription>
            Set up custom pricing rules based on time, client type, seasons, and more. These rules
            will automatically adjust the base price when conditions are met.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="time" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Time-Based
            </TabsTrigger>
            <TabsTrigger value="client" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Client Type
            </TabsTrigger>
            <TabsTrigger value="seasonal" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Seasonal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="time" className="space-y-4 mt-4">
            {timeBasedRules.map(renderTimeBasedRule)}
            <Button
              type="button"
              variant="outline"
              onClick={() => addRule("time_based")}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Time-Based Rule
            </Button>
            {timeBasedRules.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Clock className="w-12 h-12 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500 text-center">
                    No time-based pricing rules. Add one to set different prices for specific times
                    or days.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="client" className="space-y-4 mt-4">
            {clientTypeRules.map(renderClientTypeRule)}
            <Button
              type="button"
              variant="outline"
              onClick={() => addRule("client_type")}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Client Type Rule
            </Button>
            {clientTypeRules.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500 text-center">
                    No client type pricing rules. Add one to offer discounts or premiums based on
                    client type.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="seasonal" className="space-y-4 mt-4">
            {seasonalRules.map(renderSeasonalRule)}
            <Button
              type="button"
              variant="outline"
              onClick={() => addRule("seasonal")}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Seasonal Rule
            </Button>
            {seasonalRules.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Calendar className="w-12 h-12 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500 text-center">
                    No seasonal pricing rules. Add one to adjust prices during specific date
                    ranges.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Rules</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
