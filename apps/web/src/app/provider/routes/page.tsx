"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, MapPin, Navigation, Clock, DollarSign, TrendingDown, Route } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/pricing/calculate-booking-price-complete";
import { fetcher } from "@/lib/http/fetcher";

interface RouteSegment {
  id: string;
  order: number;
  distance_km: number;
  duration_minutes: number;
  travel_fee_calculated: number;
  travel_fee_charged: number;
  from_location: any;
  to_location: any;
  booking: {
    id: string;
    ref_number: string;
    scheduled_at: string;
    duration: number;
    status: string;
    customer: {
      full_name: string;
      phone: string;
    };
  };
}

interface RouteData {
  route: {
    id: string;
    date: string;
    total_distance_km: number;
    total_duration_minutes: number;
    optimization_status: string;
    optimized_at: string;
  };
  segments: RouteSegment[];
  savings: {
    standard_total: number;
    chained_total: number;
    savings: number;
    savings_percentage: number;
  };
}

export default function RoutesPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);

  useEffect(() => {
    if (selectedDate) {
      fetchRoute();
    }
  }, [selectedDate]);

  const fetchRoute = async () => {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await fetcher.get<{ data: RouteData }>(`/api/provider/routes?date=${dateStr}`);
      const data = response.data;
      if (data?.route) {
        setRouteData(data);
      } else {
        setRouteData(null);
      }
    } catch (error) {
      console.error("Failed to fetch route:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const res = await fetcher.post<{ data: { savings: { amount_saved: number; percentage_saved: number } } }>(
        '/api/provider/routes/optimize',
        { date: dateStr }
      );
      const data = res.data;

      toast.success(`Route optimized! Saved ${formatCurrency(data?.savings?.amount_saved ?? 0)} (${data?.savings?.percentage_saved ?? 0}%)`);

      fetchRoute();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setOptimizing(false);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container max-w-7xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Route Optimizer</h1>
        <p className="text-muted-foreground mt-2">
          Optimize travel routes for at-home appointments and reduce travel fees
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Date Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Select Date</CardTitle>
            <CardDescription>Choose a date to view or optimize routes</CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md border"
            />
            <Button
              className="w-full mt-4"
              onClick={handleOptimize}
              disabled={optimizing || loading}
            >
              {optimizing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                  <Route className="w-4 h-4 mr-2" />
                  Optimize Route
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right Column - Route Details */}
        <div className="lg:col-span-2 space-y-6">
          {loading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : !routeData ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Navigation className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Route Found</h3>
                <p className="text-muted-foreground mb-4">
                  No at-home appointments scheduled for this date, or route hasn't been optimized yet.
                </p>
                <Button onClick={handleOptimize} disabled={optimizing}>
                  <Route className="w-4 h-4 mr-2" />
                  Create Route
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Route Summary */}
              <Card className="border-2 border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Route className="w-6 h-6 text-primary" />
                      Route for {new Date(routeData.route.date).toLocaleDateString()}
                    </span>
                    <Badge variant={routeData.route.optimization_status === 'optimized' ? 'default' : 'secondary'}>
                      {routeData.route.optimization_status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-background rounded-lg p-4 border">
                      <p className="text-sm text-muted-foreground mb-1">Appointments</p>
                      <p className="text-2xl font-bold">{routeData.segments.length}</p>
                    </div>
                    <div className="bg-background rounded-lg p-4 border">
                      <p className="text-sm text-muted-foreground mb-1">Total Distance</p>
                      <p className="text-2xl font-bold">{routeData.route.total_distance_km.toFixed(1)} km</p>
                    </div>
                    <div className="bg-background rounded-lg p-4 border">
                      <p className="text-sm text-muted-foreground mb-1">Travel Time</p>
                      <p className="text-2xl font-bold">{routeData.route.total_duration_minutes} min</p>
                    </div>
                    <div className="bg-background rounded-lg p-4 border">
                      <p className="text-sm text-muted-foreground mb-1">Travel Fees</p>
                      <p className="text-2xl font-bold">{formatCurrency(routeData.savings.chained_total)}</p>
                    </div>
                  </div>

                  {/* Savings Highlight */}
                  {routeData.savings.savings > 0 && (
                    <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800 mt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-green-700 dark:text-green-300 mb-1">
                            💰 Route Optimization Savings
                          </p>
                          <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                            {formatCurrency(routeData.savings.savings)}
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            {routeData.savings.savings_percentage.toFixed(1)}% less than standard fees
                          </p>
                        </div>
                        <TrendingDown className="w-12 h-12 text-green-600" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Route Segments */}
              <Card>
                <CardHeader>
                  <CardTitle>Route Details</CardTitle>
                  <CardDescription>
                    Appointment sequence with travel information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Starting Point */}
                  <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      🏢
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">Starting Location</p>
                      <p className="text-sm text-muted-foreground">Your salon/office</p>
                    </div>
                  </div>

                  {/* Segments */}
                  {routeData.segments.map((segment, index) => (
                    <div key={segment.id}>
                      {/* Travel Arrow */}
                      <div className="flex items-center gap-2 pl-4 py-2">
                        <Navigation className="w-4 h-4 text-muted-foreground" />
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {segment.distance_km.toFixed(1)} km
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {segment.duration_minutes} min
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {formatCurrency(segment.travel_fee_charged)}
                          </span>
                        </div>
                      </div>

                      {/* Appointment */}
                      <div className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-semibold">{segment.booking.customer.full_name}</p>
                            <Badge variant="outline">{formatTime(segment.booking.scheduled_at)}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {segment.booking.duration} min appointment • {segment.booking.customer.phone}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Booking #{segment.booking.ref_number}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Return Journey (Optional) */}
                  <div className="flex items-center gap-2 pl-4 py-2 border-t pt-4">
                    <Navigation className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Return to salon (optional)</p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
