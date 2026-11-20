import fs from "node:fs";

const idPath = "C:/Users/NoloSehloho/Beautonomi/apps/provider/app/(app)/(tabs)/more/bookings/[id].tsx";
let src = fs.readFileSync(idPath, "utf8");

if (!src.includes("countOpenAppointmentProductOrders")) {
  src = src.replace(
    "  subtractMoney,\n} from \"@beautonomi/utils\";",
    `  subtractMoney,
  countOpenAppointmentProductOrders,
  isBookingResourceLocked,
  isCollectionFulfillment,
  isDeliveryFulfillment,
  isTerminalProductOrderStatus,
} from "@beautonomi/utils";`,
  );
}

src = src.replace(
  /function isCollectionFulfillment\(fulfillmentType\?: string \| null\): boolean \{[\s\S]*?\}\n\nfunction appointmentProductFulfillmentLabel/,
  "function appointmentProductFulfillmentLabel",
);

src = src.replace(
  /function isTerminalProductOrderStatus\(status\?: string \| null\): boolean \{[\s\S]*?\}\n\n/,
  "",
);

if (!src.includes("productsBlockYRef")) {
  src = src.replace(
    "  const mainScrollRef = useRef<ScrollView>(null);",
    `  const mainScrollRef = useRef<ScrollView>(null);
  const productsBlockYRef = useRef(0);`,
  );
}

if (!src.includes("const openProductOrderCount")) {
  src = src.replace(
    "  const appointmentProductOrders = appointmentProductOrdersData?.orders ?? [];",
    `  const appointmentProductOrders = appointmentProductOrdersData?.orders ?? [];
  const openProductOrderCount = countOpenAppointmentProductOrders(appointmentProductOrders);`,
  );
}

if (!src.includes("openProductCount:")) {
  src = src.replace(
    "{ outstanding, isAtHome, isAtSalon, needsCloseOut: b.needs_close_out === true },",
    "{ outstanding, isAtHome, isAtSalon, needsCloseOut: b.needs_close_out === true, openProductCount: openProductOrderCount },",
  );
}

if (!src.includes("const bookingResourcesLocked")) {
  src = src.replace(
    "  const nextStep = getBookingNextStepCard(",
    `  const bookingResourcesLocked = isBookingResourceLocked(currentDbStatus);
  const nextStep = getBookingNextStepCard(`,
  );
}

src = src.replace(
  /canEditAppointments && \(\s*<TouchableOpacity\s*onPress=\{\(\) => \{\s*loadAvailableResources/,
  "!bookingResourcesLocked && canEditAppointments && (\n                <TouchableOpacity\n                  onPress={() => {\n                    loadAvailableResources",
);

src = src.replace(
  /\{canEditAppointments && \(\s*<TouchableOpacity\s*onPress=\{\(\) => handleRemoveResource/g,
  "{!bookingResourcesLocked && canEditAppointments && (\n                    <TouchableOpacity\n                      onPress={() => handleRemoveResource",
);

if (!src.includes("productHandoverBanner")) {
  src = src.replace(
    "        </View>\n\n        <View\n          onLayout={(e) => {\n            handleNextStepCardLayout(e.nativeEvent.layout.y);\n          }}",
    `        </View>

        {openProductOrderCount > 0 ? (
          <TouchableOpacity
            onPress={() => {
              if (productsBlockYRef.current > 0) {
                mainScrollRef.current?.scrollTo({ y: productsBlockYRef.current - 12, animated: true });
              }
            }}
            style={twStyle("mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3")}
            accessibilityRole="button"
            accessibilityLabel={bk("productHandoverBannerA11y", { count: openProductOrderCount })}
          >
            <Text style={twStyle("text-sm font-semibold text-amber-950")}>
              {bk("productHandoverBannerTitle", { count: openProductOrderCount })}
            </Text>
            <Text style={twStyle("mt-1 text-xs text-amber-800")}>{bk("productHandoverBannerBody")}</Text>
          </TouchableOpacity>
        ) : null}

        <View
          onLayout={(e) => {
            handleNextStepCardLayout(e.nativeEvent.layout.y);
          }}`,
  );
}

if (!src.includes("productsBlockYRef.current = e.nativeEvent.layout.y")) {
  src = src.replace(
    "        {(b.products?.length ?? 0) > 0 && (\n          <View style={twStyle(\"mb-3\")}>",
    `        {(b.products?.length ?? 0) > 0 && (
          <View
            style={twStyle("mb-3")}
            onLayout={(e) => {
              productsBlockYRef.current = e.nativeEvent.layout.y;
            }}
          >`,
  );
}

if (!src.includes("handleSetProductFulfillmentType")) {
  src = src.replace(
    "  const handleMarkProductCollected = async (orderId: string) => {",
    `  const handleSetProductFulfillmentType = async (
    orderId: string,
    fulfillmentType: "collection" | "pickup" | "delivery",
  ) => {
    setCollectingProductOrderId(orderId);
    const { error, errorCode } = await patchMutation(\`/api/provider/product-orders/\${orderId}\`, {
      fulfillment_type: fulfillmentType,
    });
    setCollectingProductOrderId(null);
    if (error) {
      Alert.alert(bk("couldNotUpdateFulfillment"), mapProviderBookingActionError(error, errorCode));
      return;
    }
    await refreshProductOrders();
  };

  const handleMarkProductCollected = async (orderId: string) => {`,
  );
}

// Product row copy + unknown fulfillment
src = src.replace(
  `{appointmentProductOrders.length} product orders linked to this visit`,
  `{bk("productOrdersLinked", { count: appointmentProductOrders.length })}`,
);

src = src.replace(
  `{isCollection ? "Product pickup" : "Product delivery"}`,
  `{isCollection
                              ? bk("productPickupLabel")
                              : isDeliveryFulfillment(ord.fulfillment_type)
                                ? bk("productDeliveryLabel")
                                : bk("productFulfillmentUnknownLabel")}`,
);

src = src.replace(
  "Qty {p.quantity ?? 1}",
  `{bk("productQtyLine", { count: p.quantity ?? 1 })}`,
);

src = src.replace(
  `Appointment payment: {(b.payment_status ?? "pending").replace(/_/g, " ")}
                {b.payment_status === "paid" ? " — product payment is on this booking" : ""}`,
  `{bk("appointmentPaymentLine", {
                  status: (b.payment_status ?? "pending").replace(/_/g, " "),
                })}
                {b.payment_status === "paid" ? \` \${bk("appointmentPaymentPaidNote")}\` : ""}`,
);

// Unknown fulfillment actions
const oldBlock = `                      {!isTerminal ? (
                        isCollection ? (
                          <TouchableOpacity
                            onPress={() => void handleMarkProductCollected(ord.id)}
                            disabled={isCollecting || patchLoading}
                            style={twStyle(
                              \`mt-2 flex-row items-center justify-center rounded-lg bg-amber-900 px-3 py-2\${isCollecting || patchLoading ? " opacity-60" : ""}\`,
                            )}
                            accessibilityRole="button"
                            accessibilityLabel={bk("markCollectedA11y")}
                          >
                            {isCollecting ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={twStyle("text-sm font-semibold text-white")}>{bk("markCollected")}</Text>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() =>
                              router.push(
                                \`/(app)/(tabs)/more/product-orders?order=\${encodeURIComponent(ord.id)}\` as never,
                              )
                            }
                            style={twStyle("mt-2 flex-row items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2")}
                            accessibilityRole="button"
                            accessibilityLabel="Manage delivery and tracking"
                          >
                            <Text style={twStyle("text-sm font-semibold text-amber-900")}>{bk("manageDeliveryTracking")}</Text>
                          </TouchableOpacity>
                        )
                      ) : null}`;

const newBlock = `                      {!isTerminal ? (
                        isCollection ? (
                          <TouchableOpacity
                            onPress={() => void handleMarkProductCollected(ord.id)}
                            disabled={isCollecting || patchLoading}
                            style={twStyle(
                              \`mt-2 flex-row items-center justify-center rounded-lg bg-amber-900 px-3 py-2\${isCollecting || patchLoading ? " opacity-60" : ""}\`,
                            )}
                            accessibilityRole="button"
                            accessibilityLabel={bk("markCollectedA11y")}
                          >
                            {isCollecting ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={twStyle("text-sm font-semibold text-white")}>{bk("markCollected")}</Text>
                            )}
                          </TouchableOpacity>
                        ) : isDeliveryFulfillment(ord.fulfillment_type) ? (
                          <TouchableOpacity
                            onPress={() =>
                              router.push(
                                \`/(app)/(tabs)/more/product-orders?order=\${encodeURIComponent(ord.id)}\` as never,
                              )
                            }
                            style={twStyle("mt-2 flex-row items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2")}
                            accessibilityRole="button"
                            accessibilityLabel={bk("manageDeliveryA11y")}
                          >
                            <Text style={twStyle("text-sm font-semibold text-amber-900")}>{bk("manageDeliveryTracking")}</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={twStyle("mt-2 gap-2")}>
                            <TouchableOpacity
                              onPress={() => void handleSetProductFulfillmentType(ord.id, "collection")}
                              disabled={isCollecting || patchLoading}
                              style={twStyle("flex-row items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2")}
                            >
                              <Text style={twStyle("text-sm font-semibold text-amber-900")}>{bk("setPickupFulfillment")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => void handleSetProductFulfillmentType(ord.id, "delivery")}
                              disabled={isCollecting || patchLoading}
                              style={twStyle("flex-row items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2")}
                            >
                              <Text style={twStyle("text-sm font-semibold text-amber-900")}>{bk("setDeliveryFulfillment")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() =>
                                router.push(
                                  \`/(app)/(tabs)/more/product-orders?order=\${encodeURIComponent(ord.id)}\` as never,
                                )
                              }
                              style={twStyle("flex-row items-center justify-center rounded-lg border border-dashed border-amber-200 px-3 py-2")}
                            >
                              <Text style={twStyle("text-xs font-medium text-amber-800")}>{bk("manageInProductOrders")}</Text>
                            </TouchableOpacity>
                          </View>
                        )
                      ) : null}`;

if (src.includes(oldBlock)) {
  src = src.replace(oldBlock, newBlock);
} else if (!src.includes("handleSetProductFulfillmentType(ord.id")) {
  console.warn("product CTA block not found — skipped");
}

fs.writeFileSync(idPath, src);
console.log("patched", idPath);