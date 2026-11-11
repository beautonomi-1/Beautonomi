import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromMinorUnits, percentOf, roundCurrency, subtractMoney } from "@beautonomi/utils";

const webRoot = join(process.cwd(), "src");
const repoRoot = join(process.cwd(), "..", "..");

function src(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("F4-06 leftover money helpers", () => {
  it("converts Stripe minor units with fromMinorUnits", () => {
    expect(fromMinorUnits(11500, "ZAR")).toBe(115);
    const settlement = src("lib/payments/stripe-settlement.ts");
    expect(settlement).toMatch(/fromMinorUnits\(Number\(amountMinor \|\| 0\), currency\)/);
    expect(settlement).not.toMatch(/Math\.round\(\(Number\(amountMinor/);
  });

  it("rounds Flutterwave webhook majors with roundCurrency", () => {
    expect(roundCurrency(10.005, "ZAR")).toBe(10.01);
    const flw = src("app/api/payments/flutterwave/webhook/_handlers/flutterwave-charge.ts");
    expect(flw).toMatch(/roundCurrency\(Number\(data\.amount \|\| 0\), currency\)/);
    expect(flw).not.toMatch(/Math\.round\(Number\(data\.amount/);
  });

  it("persists product-order return amounts as numbers", () => {
    const returns = src("app/api/me/returns/route.ts");
    expect(returns).toMatch(/refund_amount: roundCurrency\(/);
    expect(returns).not.toMatch(/refund_amount: refundAmount\.toFixed\(2\)/);
  });

  it("persists walk-in order majors as numbers", () => {
    const walkIn = src("lib/provider-sales/create-walk-in-order-from-legacy-sale.ts");
    expect(walkIn).toMatch(/total_amount: roundCurrency\(/);
    expect(walkIn).not.toMatch(/total_amount: resolvedTotal\.toFixed\(2\)/);
    expect(walkIn).not.toMatch(/unit_price: oi\.unit_price\.toFixed\(2\)/);
  });

  it("restores product-order wallet_amount as a number", () => {
    const lifecycle = src("lib/orders/product-order-lifecycle.ts");
    expect(lifecycle).toMatch(/wallet_amount: roundCurrency\(w,/);
    expect(lifecycle).not.toMatch(/wallet_amount: w\.toFixed\(2\)/);
  });

  it("subtracts group-invite remaining due in minor units", () => {
    expect(subtractMoney(100, 33.33, "ZAR")).toBe(66.67);
    const pay = src("app/api/public/group-invites/[token]/pay/route.ts");
    expect(pay).toMatch(/subtractMoney\(due, paid,/);
    expect(pay).not.toMatch(/Math\.round\(Math\.max\(0, due - paid\)/);
  });

  it("derives provider-create deposits with percentOf", () => {
    const finance = src("lib/bookings/provider-booking-finance.ts");
    expect(finance).toMatch(/percentOf\(total, resolvedPercentage\)/);
    expect(finance).not.toMatch(/Math\.round\(total \* resolvedPercentage\)/);
  });

  it("converts PayCloud intent majors with toMinorUnits", () => {
    const intent = src("lib/payments/paycloud-intent-contract.ts");
    expect(intent).toMatch(/toMinorUnits\(amountMajor, LAST_RESORT_CURRENCY\)/);
    expect(intent).not.toMatch(/Math\.round\(amountMajor \* 100\)/);
  });

  it("converts Yoco stored cents with fromMinorUnits, not /100", () => {
    const yocoPage = src("app/provider/reports/payments/yoco-reconciliation/page.tsx");
    expect(yocoPage).toMatch(/fromMinorUnits\(Number\(p\.amount \?\? 0\), exportCurrency\)/);
    expect(yocoPage).not.toMatch(/p\.amount \?\? 0\) \/ 100/);
    const gift = src("lib/gift-cards/sale-gift-card.ts");
    expect(gift).toMatch(/fromMinorUnits\(Number\(row\.amount \?\? 0\)/);
    expect(gift).not.toMatch(/Number\(row\.amount \?\? 0\) \/ 100/);
  });

  it("converts Stripe gateway fees with fromMinorUnits", () => {
    const fees = src("lib/payments/resolve-gateway-fees.ts");
    expect(fees).toMatch(/fromMinorUnits\(Math\.max\(0, params\.feeMinor\), params\.currency\)/);
    expect(fees).not.toMatch(/const factor = 100;/);
  });

  it("adds pay-remaining tip in minor units", () => {
    const remaining = src("app/api/me/bookings/[id]/pay-remaining/route.ts");
    expect(remaining).toMatch(/addMoney\(remaining, requestedTip, currency\)/);
    expect(remaining).not.toMatch(/roundMoney\(remaining \+ requestedTip\)/);
  });

  it("converts leftover Yoco/ad-pack cents with fromMinorUnits", () => {
    expect(fromMinorUnits(15050, "ZAR")).toBe(150.5);
    const ads = src("lib/ads/resolve-ad-pack-price.ts");
    expect(ads).toMatch(/fromMinorUnits\(minor, resolveAdPackCurrency\(row\)\)/);
    expect(ads).not.toMatch(/return minor \/ 100/);
    const devices = src("app/provider/settings/sales/yoco-devices/page.tsx");
    expect(devices).toMatch(/fromMinorUnits\(Number\(device\.total_amount/);
    expect(devices).not.toMatch(/device\.total_amount \/ 100/);
  });

  it("uses percentOf for leftover package/loyalty/deposit percents", () => {
    expect(percentOf(199, 50, "ZAR")).toBe(99.5);
    const flow = src("app/booking/components/booking-flow.tsx");
    expect(flow).toMatch(/percentOf\(servicesTotal, pkg\.discount_percentage/);
    expect(flow).not.toMatch(/\(servicesTotal \* pkg\.discount_percentage\) \/ 100/);
    const promotions = src("app/booking/components/steps/step-promotions.tsx");
    expect(promotions).toMatch(/percentOf\(bookingSubtotalForLoyalty, maxRedemptionPercentage, tenantCurrency\)/);
    const validate = src("app/api/public/bookings/_helpers/validate-booking.ts");
    expect(validate).toMatch(/percentOf\(subtotalAfterMembership, maxPct, currency\)/);
    const pay = src("components/provider/booking/create/CreatePaymentSection.tsx");
    expect(pay).toMatch(/percentOf\(totalAmount, depositPercentage, currency\)/);
    expect(pay).not.toMatch(/Math\.ceil\(\(totalAmount \* depositPercentage\) \/ 100\)/);
  });

  it("rounds leftover charge payloads and completion balance with roundCurrency", () => {
    const actions = src("components/provider/front-desk/PaymentActions.tsx");
    expect(actions).toMatch(/roundCurrency\(remaining, currency\)/);
    expect(actions).not.toMatch(/Number\(remaining\.toFixed\(2\)\)/);
    const collect = src("components/provider/booking/view/BookingPaymentCollectSection.tsx");
    expect(collect).toMatch(/roundCurrency\(charge\.chargeAmount\)/);
    const guards = src("lib/bookings/completion-guards.ts");
    expect(guards).toMatch(/const balanceDue = roundCurrency\(/);
    expect(guards).not.toMatch(/Math\.round\(/);
  });

  it("heals wallet balances with addMoney/subtractMoney and roundCurrency", () => {
    const rec = src("app/api/admin/finance/wallet-reconciliation/route.ts");
    expect(rec).toMatch(/subtractMoney\(prev, amt, currency\)/);
    expect(rec).toMatch(/computedBalance = Math.max\(0, roundCurrency\(computedBalance, currency\)\)/);
    expect(rec).not.toMatch(/Number\(computedSum.toFixed\(2\)\)/);
    expect(rec).not.toMatch(/Number\(computedBalance.toFixed\(2\)\)/);
    const audit = src("app/api/admin/finance/wallet-booking-debit-audit/route.ts");
    expect(audit).toMatch(/subtractMoney\(expected, actual, currency\)/);
    expect(audit).not.toMatch(/Number\(\(expected - actual\).toFixed\(2\)\)/);
  });

  it("derives catalogue cost and retail with percentOf", () => {
    const svc = src("app/provider/catalogue/services/components/ServiceCreateEditDialog.tsx");
    expect(svc).toMatch(/percentOf\(primaryPricing.price, formData.serviceCostPercentage, currencyCode\)/);
    const product = src("app/provider/catalogue/products/components/ProductCreateEditDialog.tsx");
    expect(product).toMatch(/addMoney\(formData.supplyPrice, percentOf\(formData.supplyPrice, val, currencyCode\), currencyCode\)/);
    const booking = src("app/provider/bookings/[id]/page.tsx");
    expect(booking).toMatch(/roundCurrency\(Number\(tp\)\)/);
    expect(booking).not.toMatch(/Number\(tp\).toFixed\(2\)/);
  });

  it("multiplies leftover write-path money with multiplyMoney / percentOf", () => {
    const za = src("lib/payroll/jurisdictions/packs/za.ts");
    expect(za).toMatch(/addMoney\(b.base, percentOf\(subtractMoney\(annual, prevCap\), b.rate\)\)/);
    expect(za).toMatch(/multiplyMoney\(uifBase, uifRate\)/);
    expect(za).not.toMatch(/\(\(annual - prevCap\) \* b.rate\) \/ 100/);
    const invoices = src("app/api/provider/invoices/route.ts");
    expect(invoices).toMatch(/multiplyMoney\(unitPrice, quantity, currency\)/);
    const sales = src("app/api/provider/product-sales/route.ts");
    expect(sales).toMatch(/multiplyMoney\(unitPrice, item.quantity, saleCurrency\)/);
    const salary = src("lib/payroll/salary-proration.ts");
    expect(salary).toMatch(/multiplyMoney\(monthlySalary, \(12 \* payableDays\) \/ 365\)/);
    const lifecycle = src("lib/orders/product-order-lifecycle.ts");
    expect(lifecycle).toMatch(/multiplyMoney\(capturedProviderEarnings, refundRatio\)/);
  });

  it("converts leftover Yoco cents, ad packs, and reschedule credit with shared helpers", () => {
    const open = src("lib/payments/open-terminal-payments.ts");
    expect(open).toMatch(/yocoStoredAmountToMajor\(/);
    expect(open).not.toMatch(/Math\.round\(Number\(row\.amount \?\? 0\)\) \/ 100/);
    const adsPage = src("app/provider/settings/ads/page.tsx");
    expect(adsPage).toMatch(/resolveAdPackAmountMajor/);
    expect(adsPage).not.toMatch(/price_minor\) \/ 100/);
    const process = src("app/api/public/bookings/_helpers/process-payment.ts");
    expect(process).toMatch(/subtractMoney\(amountToCollect, rescheduleCreditApplied, v\.currency\)/);
    expect(process).not.toMatch(/amountToCollect - rescheduleCreditApplied/);
    const repair = src("app/api/admin/finance/ledger-repair/candidates/route.ts");
    expect(repair).toMatch(/fromMinorUnits\(Math\.round\(feesRaw\)/);
    const yocoSheet = repo("apps/provider/src/components/YocoPaymentSheet.tsx");
    expect(yocoSheet).toMatch(/fromMinorUnits\(amountCents, currency\)/);
    expect(yocoSheet).not.toMatch(/amountCents \/ 100/);
    const checkout = repo("apps/customer/app/(app)/book-checkout.tsx");
    expect(checkout).toMatch(/subtractMoney\(rescheduleCredit, rescheduleCreditApplied, currency\)/);
    expect(checkout).toMatch(/sumMoney\(currency, subtotalAfterLoyalty/);
  });

  it("adds and subtracts leftover persist money with addMoney / subtractMoney", () => {
    const totals = src("lib/orders/compute-product-order-totals.ts");
    expect(totals).toMatch(/subtractMoney\(subtotal, promotionDiscount\)/);
    const gift = src("lib/gift-cards/sale-gift-card.ts");
    expect(gift).toMatch(/subtractMoney\(previousBalance, amount\)/);
    expect(gift).toMatch(/addMoney\(recorded, cardAmount\)/);
    const recovered = src("lib/orders/recovered-order-amount-due.ts");
    expect(recovered).toMatch(/subtractMoney\(total, covered\)/);
    const bill = src("lib/bookings/checkout-bill-adjustment.ts");
    expect(bill).toMatch(/addMoney\(owed, tip\)/);
    expect(bill).toMatch(/subtractMoney\(giftApply, giftBase\)/);
    const apple = src("lib/iap/apple/settlement-import.ts");
    expect(apple).toMatch(/subtractMoney\(gross, proceeds\)/);
    const splits = src("app/api/me/custom-offers/_helpers/custom-offer-splits.ts");
    expect(splits).toMatch(/subtractMoney\(remaining, loyaltyDiscountAmount, currency\)/);
    const shop = repo("apps/customer/src/features/shop/productOrderCheckoutHelpers.ts");
    expect(shop).toMatch(/subtractMoney\(total, covered\)/);
    const inPerson = repo("apps/provider/src/lib/product-order-in-person.ts");
    expect(inPerson).toMatch(/subtractMoney\(subtractMoney\(total, gift\), wallet\)/);
  });

  it("adds and subtracts leftover refund / wallet / Paystack persist money with helpers", () => {
    const apply = src("lib/bookings/apply-collectible-gift-wallet.ts");
    expect(apply).toMatch(/addMoney\(prevGift, giftCardAmountApplied\)/);
    expect(apply).toMatch(/addMoney\(prevWallet, walletAmountApplied\)/);
    const hold = src("lib/gift-cards/hold-gift-card-for-booking.ts");
    expect(hold).toMatch(/subtractMoney\(balance, take\)/);
    const cap = src("lib/bookings/cap-gateway-refund-to-remaining-balance.ts");
    expect(cap).toMatch(/subtractMoney\(totalPaid, totalRefunded\)/);
    const paystack = src("lib/payments/resolve-paystack-initialize-amount.ts");
    expect(paystack).toMatch(/subtractMoney\(\s*subtractMoney\(subtractMoney\(input\.total, input\.wallet\), input\.gift\)/);
    const refunds = src("lib/ecommerce/refund-product-order-online-tender.ts");
    expect(refunds).toMatch(/subtractMoney\(subtractMoney\(total, wallet\), gift\)/);
    const ctx = src("lib/admin/booking-refund-context.ts");
    expect(ctx).toMatch(/subtractMoney\(chargeAmount, effectiveRefunded\)/);
    const apple = src("lib/iap/apple/config.ts");
    expect(apple).toMatch(/subtractMoney\(grossMajor, commissionMajor\)/);
  });

  it("adds and subtracts leftover settlement / refund-queue / Apple catalog money with helpers", () => {
    const catalog = src("lib/iap/apple/product-catalog.ts");
    expect(catalog).toMatch(/multiplyMoney\(webPriceZar, 1 \/ \(1 - rate\), LAST_RESORT_CURRENCY\)/);
    const vat = src("lib/receipts/subscription-receipt-vat.ts");
    expect(vat).toMatch(/subtractMoney\(gross, vatAmount, input\.currency\)/);
    const payout = src("lib/provider/available-payout-balance.ts");
    expect(payout).toMatch(/addMoney\(onlineEarnings, onHoldAmount\)/);
    const settle = src("lib/payments/settle-card-machine-payment.ts");
    expect(settle).toMatch(/subtractMoney\(remainingBudget, alloc\)/);
    const extraCharge = src("lib/bookings/settle-additional-charge-without-paystack.ts");
    expect(extraCharge).toMatch(/addMoney\(walletAmountApplied, giftCardAmountApplied\)/);
    const queue = src("lib/admin/refund-queue-rows.ts");
    expect(queue).toMatch(/subtractMoney\(collected, refunded\)/);
    const cancel = src("lib/bookings/cancelGroupGuest.ts");
    expect(cancel).toMatch(/subtractMoney\(leadOverpaid, walletCredited\)/);
  });

  it("persists leftover booking totals and VAT with addMoney / multiplyMoney", () => {
    const vat = repo("packages/utils/src/vat/computeVat.ts");
    expect(vat).toMatch(/multiplyMoney\(gross, rate \/ \(100 \+ rate\), currency\)/);
    expect(vat).toMatch(/addMoney\(netAmount, taxAmount, currency\)/);
    const tip = src("lib/bookings/increment-booking-tip.ts");
    expect(tip).toMatch(/addMoney\(Number\(booking.tip_amount \?\? 0\), rounded\)/);
    const extraCharge = src("lib/bookings/settle-additional-charge-platform-held.ts");
    expect(extraCharge).toMatch(/addMoney\(Number\(bookingData.total_amount \?\? 0\), chargeAmountMajor\)/);
    const reschedule = src("lib/bookings/reschedule-carry-over.ts");
    expect(reschedule).toMatch(/addMoney\(Number\(row.wallet_amount \?\? 0\), applied\)/);
    const payout = src("lib/provider/available-payout-balance.ts");
    expect(payout).toMatch(/sumMoney\(completedPayouts, pendingPayoutsSum, openDisputeReserve\)/);
  });

  it("adds and subtracts leftover cancellation / refund money with helpers", () => {
    const settle = src("lib/bookings/settle-booking-cancellation.ts");
    expect(settle).toMatch(/subtractMoney\(params.refundAmount, params.giftCardCollected\)/);
    expect(settle).toMatch(/addMoney\(Math.max\(0, subtractMoney\(basis, f\)\), tipPaid\)/);
    const awaiting = src("lib/bookings/awaiting-machine-refunds.ts");
    expect(awaiting).toMatch(/subtractMoney\(row.amount, left\)/);
    const outcome = src("lib/bookings/resolve-cancellation-outcome.ts");
    expect(outcome).toMatch(/subtractMoney\(platformCollected, feeRetained\)/);
    const guests = src("lib/bookings/group-guest-refunds.ts");
    expect(guests).toMatch(/addMoney\(refunded, amount\)/);
    const caps = src("lib/bookings/booking-refund-limits.ts");
    expect(caps).toMatch(/subtractMoney\(onlineCollected, onlineRefunded\)/);
  });

  it("persists leftover net_amount / booking subtotal / promo / travel fee with helpers", () => {
    const offer = src("lib/custom-offers/finalize-custom-offer-payment.ts");
    expect(offer).toMatch(/net_amount: subtractMoney\(paystackAmountMajor, paystackFeesMajor\)/);
    const terminal = src("lib/terminal/record-terminal-order-payment.ts");
    expect(terminal).toMatch(/net_amount: subtractMoney\(amountMajor, feesMajor\)/);
    const create = src("app/api/public/bookings/_helpers/create-booking-record.ts");
    expect(create).toMatch(/subtotal: addMoney\(v.subtotal, v.packageDiscountAmount\)/);
    const validate = src("app/api/public/bookings/_helpers/validate-booking.ts");
    expect(validate).toMatch(/addMoney\(subtotal, packageDiscountAmount\)/);
    const promo = src("lib/promotions/validate.ts");
    expect(promo).toMatch(/final_amount: subtractMoney\(amount, discountAmount\)/);
    const travel = src("lib/travel/travelFeeEngine.ts");
    expect(travel).toMatch(/multiplyMoney\(perKmRate, chargeableDistance\)/);
    const payments = src("app/api/provider/bookings/[id]/payments/route.ts");
    expect(payments).toMatch(/net_amount: subtractMoney\(total_paid, total_refunded\)/);
  });

  it("adds leftover booking totals / receipt / POS / terminal net with helpers", () => {
    const totals = src("lib/booking/compute-booking-totals.ts");
    expect(totals).toMatch(/sumMoney\(subtotalAfterDiscounts, taxAmount, serviceFeeAmount, tipAmount\)/);
    const price = src("lib/pricing/calculate-booking-price.ts");
    expect(price).toMatch(/multiplyMoney\(\s*platformFeeBase,/);
    const terminal = src("lib/payments/paystack-terminal-webhook.ts");
    expect(terminal).toMatch(/net_amount: Math.max\(0, subtractMoney\(paidAmount, feeAmount\)\)/);
    const receipt = src("lib/receipts/build-booking-receipt.ts");
    expect(receipt).toMatch(/sumMoney\(discount, promotionDiscount, membershipDiscount, loyaltyDiscount\)/);
    const pos = src("components/provider-portal/NewSaleDialog.tsx");
    expect(pos).toMatch(/addMoney\(taxInclusive \? taxableSubtotal : vatSplit.grossAmount, tipAmount\)/);
    const appSales = repo("apps/provider/app/(app)/(tabs)/sales.tsx");
    expect(appSales).toMatch(/computeVat\(\{/);
    expect(appSales).toMatch(/sumMoney\(afterDiscount, taxAmount, tipAmount\)/);
  });

  it("adds leftover POS line totals and refund/invoice reduce sums with helpers", () => {
    const pos = src("components/provider-portal/NewSaleDialog.tsx");
    expect(pos).toMatch(/multiplyMoney\(newCart\[existingIndex\]\.unit_price, newCart\[existingIndex\]\.quantity\)/);
    expect(pos).toMatch(/addMoney\(sum, item.total\)/);
    const caps = src("lib/bookings/booking-refund-limits.ts");
    expect(caps).toMatch(/addMoney\(sum, Number\(p.amount \?\? 0\)\)/);
    const invoices = src("app/api/provider/invoices/route.ts");
    expect(invoices).toMatch(/addMoney\(sum, item.total_price, currency\)/);
    const series = src("lib/recurring/create-booking-from-series.ts");
    expect(series).toMatch(/multiplyMoney\(Number\(a.price \|\| 0\), Number\(a.quantity \|\| 1\)\)/);
    const appSales = repo("apps/provider/app/(app)/(tabs)/sales.tsx");
    expect(appSales).toMatch(/formatCurrency\(multiplyMoney\(item.price, item.quantity\)\)/);
  });

  it("adds leftover hold / checkout / gift / chargeback money with helpers", () => {
    const hold = src("lib/bookings/create-booking-from-hold.ts");
    expect(hold).toMatch(/addMoney\(sum, Number\(s.price \|\| 0\)\)/);
    const request = src("app/api/provider/bookings/[id]/request-payment/route.ts");
    expect(request).toMatch(/addMoney\(sum, Number\(charge.amount \|\| 0\)\)/);
    const gift = src("lib/gift-cards/sale-gift-card.ts");
    expect(gift).toMatch(/addMoney\(sum, Number\(leg.amount \?\? 0\)\)/);
    const flow = src("app/booking/components/booking-flow.tsx");
    expect(flow).toMatch(/multiplyMoney\(p.price, p.quantity\)/);
    const checkout = src("components/provider-portal/CheckoutDialog.tsx");
    expect(checkout).toMatch(/multiplyMoney\(s.price, s.quantity\)/);
    const walkIn = repo("apps/provider/app/(app)/(tabs)/more/walk-in-sale.tsx");
    expect(walkIn).toMatch(/multiplyMoney\(c.price, c.quantity\)/);
    const customer = repo("apps/customer/app/(app)/book-checkout.tsx");
    expect(customer).toMatch(/addMoney\(s, multiplyMoney\(p.price, p.quantity\)\)/);
  });

  it("adds leftover completion / reschedule / checkout line money with helpers", () => {
    const guards = src("lib/bookings/completion-guards.ts");
    expect(guards).toMatch(/subtractMoney\(Number\(b.total_paid \?\? 0\), Number\(b.total_refunded \?\? 0\)\)/);
    const membership = src("lib/memberships/reverse-membership-payment.ts");
    expect(membership).toMatch(/addMoney\(s, Math.abs\(Number\(r.amount \?\? 0\)\)\)/);
    const gift = src("lib/gift-cards/reverse-gift-card-order.ts");
    expect(gift).toMatch(/addMoney\(s, Number\(c.balance \?\? 0\)\)/);
    const pay = src("app/booking/components/steps/step-payment.tsx");
    expect(pay).toMatch(/totalPrice: multiplyMoney\(p.price, p.quantity\)/);
    const products = src("app/booking/components/steps/booking-products.tsx");
    expect(products).toMatch(/addMoney\(sum, multiplyMoney\(p.price, p.quantity\)\)/);
    const walkIn = src("app/provider/ecommerce/walk-in/page.tsx");
    expect(walkIn).toMatch(/multiplyMoney\(c.unitPrice, c.qty\)/);
    const appBooking = repo("apps/provider/app/(app)/(tabs)/more/bookings/[id].tsx");
    expect(appBooking).toMatch(/multiplyMoney\(i.unit_price, i.quantity\)/);
  });

  it("adds leftover group / payroll / ledger / walk-in money with helpers", () => {
    const group = src("lib/provider-booking/group-booking-utils.ts");
    expect(group).toMatch(/addMoney\(sum, Number\(p.price\) \|\| 0\)/);
    const payroll = src("lib/payroll/compute-compensation.ts");
    expect(payroll).toMatch(/addMoney\(s, l.amount\)/);
    const ledger = src("lib/admin/aggregate-finance-ledger-rows.ts");
    expect(ledger).toMatch(/addMoney\(s, Number\(r\[field\] \?\? 0\)\)/);
    const walkIn = src("components/provider/booking/commerce/WalkInSaleSheet.tsx");
    expect(walkIn).toMatch(/multiplyMoney\(c.unitPrice, c.qty\)/);
    const dialog = src("components/provider-portal/GroupBookingDialog.tsx");
    expect(dialog).toMatch(/multiplyMoney\(p.unitPrice, qty\)/);
    const appGroup = repo("apps/provider/app/(app)/(tabs)/more/group-bookings.tsx");
    expect(appGroup).toMatch(/multiplyMoney\(p.unitPrice, p.quantity\)/);
    const chips = repo("apps/customer/src/features/checkout/SelectedProductChips.tsx");
    expect(chips).toMatch(/multiplyMoney\(item.price, item.quantity\)/);
  });

  it("adds leftover persist line totals with helpers", () => {
    const validate = src("app/api/public/bookings/_helpers/validate-booking.ts");
    expect(validate).toMatch(/multiplyMoney\(unitPrice, qty\)/);
    const orderTotals = src("lib/orders/compute-product-order-totals.ts");
    expect(orderTotals).toMatch(/multiplyMoney\(unitPrice, item.quantity\)/);
    const products = src("lib/bookings/validate-provider-booking-products.ts");
    expect(products).toMatch(/multiplyMoney\(unitPrice, quantity\)/);
    const view = src("components/provider/booking/view/AppointmentViewSheet.tsx");
    expect(view).toMatch(/multiplyMoney\(unitPrice, quantity\)/);
    const paycloud = src("lib/payments/initiate-paycloud-refund.ts");
    expect(paycloud).toMatch(/addMoney\(sum, Number\(r.amount \?\? 0\)\)/);
    const posting = src("lib/ledger/posting-map.ts");
    expect(posting).toMatch(/addMoney\(s, l.amount\)/);
  });

  it("adds leftover cart / booking-edit / walk-in sale subtotals with helpers", () => {
    const sales = src("app/api/provider/product-sales/route.ts");
    expect(sales).toMatch(/addMoney\(subtotal, lineTotal, saleCurrency\)/);
    const edit = repo("apps/provider/src/lib/build-booking-edit-patch-payload.ts");
    expect(edit).toMatch(/multiplyMoney\(unit, qty\)/);
    const newBooking = repo("apps/provider/app/(app)/(tabs)/more/bookings/new.tsx");
    expect(newBooking).toMatch(/multiplyMoney\(unit, qty\)/);
    const groupPatch = repo("apps/provider/src/features/group-bookings/optimisticGroupPatch.ts");
    expect(groupPatch).toMatch(/addMoney\(sum, Number\(p.total_paid \?\? 0\)\)/);
    const cart = src("app/cart/page.tsx");
    expect(cart).toMatch(/multiplyMoney\(item.effective_price \?\? item.product\?\.retail_price \?\? 0, item.quantity\)/);
  });

  it("adds leftover shared booking-edit / receipt / collected money with helpers", () => {
    const sharedEdit = repo("packages/provider-booking/src/build-booking-edit-patch-payload.ts");
    expect(sharedEdit).toMatch(/multiplyMoney\(unit, qty\)/);
    const create = src("components/provider/booking/create/CreateProductsSection.tsx");
    expect(create).toMatch(/multiplyMoney\(p.unitPrice, qty\)/);
    const collected = src("lib/orders/record-product-order-payment.ts");
    expect(collected).toMatch(/addMoney\(sum, Number\(row.amount \?\? 0\)\)/);
    const receipt = src("lib/receipts/build-order-receipt.ts");
    expect(receipt).toMatch(/multiplyMoney\(unit, qty\)/);
    const adapters = repo("packages/utils/src/receipts/adapters.ts");
    expect(adapters).toMatch(/multiplyMoney\(unit, qty\)/);
  });

  it("adds leftover payout / extra-charge / appointment-order money with helpers", () => {
    const payout = src("lib/provider/available-payout-balance.ts");
    expect(payout).toMatch(/addMoney\(s, Number\(p.net_amount \?\? p.amount \?\? 0\)\)/);
    const sync = src("lib/orders/sync-appointment-product-order.ts");
    expect(sync).toMatch(/multiplyMoney\(unit, qty\)/);
    const tip = src("lib/bookings/increment-booking-tip.ts");
    expect(tip).toMatch(/addMoney\(sum, Number\(row.tip_amount \?\? 0\)\)/);
    const charges = src("app/api/provider/bookings/route.ts");
    expect(charges).toMatch(/addMoney\(sum, Number\(charge\?\.amount \?\? 0\)\)/);
    const finance = src("app/api/provider/finance/route.ts");
    expect(finance).toMatch(/addMoney\(s, Number\(r.net \?\? r.amount \?\? 0\)\)/);
    const card = src("lib/payments/settle-card-machine-payment.ts");
    expect(card).toMatch(/addMoney\(inner, Number\(charge\?\.amount \|\| 0\)\)/);
    const revenue = src("lib/reports/revenue-helpers.ts");
    expect(revenue).toMatch(/addMoney\(sum, Number\(t.net \|\| t.amount \|\| 0\)\)/);
  });

  it("adds leftover report GMV / staff / brand money with helpers", () => {
    const staff = src("app/api/provider/staff/totals/route.ts");
    expect(staff).toMatch(/addMoney\(sum, Number\(x.price \?\? 0\)\)/);
    const gift = src("app/api/provider/reports/gift-cards/route.ts");
    expect(gift).toMatch(/addMoney\(s, r.amount\)/);
    const measured = src("lib/brand-marketing/measured.ts");
    expect(measured).toMatch(/addMoney\(s, Number\(b.total_amount \?\? 0\)\)/);
    const cron = src("app/api/cron/recognize-period-revenue/route.ts");
    expect(cron).toMatch(/addMoney\(s, r.recognized_amount\)/);
    const appBookings = repo("apps/provider/app/(app)/(tabs)/more/bookings/index.tsx");
    expect(appBookings).toMatch(/addMoney\(n, Number\(b.total_amount \|\| 0\)\)/);
  });

  it("adds leftover cart / group-financial / revenue-accumulator money with helpers", () => {
    const cart = repo("apps/customer/app/(app)/(tabs)/cart.tsx");
    expect(cart).toMatch(/multiplyMoney\(item.effective_price \?\? item.product\?\.retail_price \?\? 0, item.quantity\)/);
    const group = repo("apps/provider/src/lib/group-booking-detail-helpers.ts");
    expect(group).toMatch(/addMoney\(sum, Number\(p.price\) \|\| 0\)/);
    const adminRev = src("app/api/admin/reports/revenue/route.ts");
    expect(adminRev).toMatch(/addMoney\(totalRevenue, gmvAmount\)/);
    const metrics = src("lib/admin/customer-report-metrics.ts");
    expect(metrics).toMatch(/addMoney\(completedByCustomer\[id\].total_amount, Number\(b.total_amount \?\? 0\)\)/);
  });

  it("adds leftover unit-qty receipts / unpaid-charge / remaining GMV money with helpers", () => {
    const checkout = repo("apps/customer/app/(app)/(tabs)/shop/product-checkout.tsx");
    expect(checkout).toMatch(/multiplyMoney\(i.effective_price \?\? i.product\?\.retail_price \?\? 0, i.quantity\)/);
    const ledgerPerf = src("lib/reports/service-ledger-performance.ts");
    expect(ledgerPerf).toMatch(/addMoney\(existing.revenue, multiplyMoney\(bookingRevenue, proportion\)\)/);
    const addons = src("lib/bookings/provider-booking-finance.ts");
    expect(addons).toMatch(/addMoney\(sum, multiplyMoney\(Number\(addon.price\) \|\| 0, qty\)\)/);
    const adminProv = src("app/api/admin/reports/providers/route.ts");
    expect(adminProv).toMatch(/addMoney\(bookingsByProvider\[id\].revenue, Number\(b.total_amount\)\)/);
  });

  it("adds leftover net/fee accumulators and money reduces with helpers", () => {
    const semantics = src("lib/reports/provider-revenue-semantics.ts");
    expect(semantics).toMatch(/addMoney\(bookingEarningsTotal, net\)/);
    const methods = src("lib/reports/build-payment-methods-report.ts");
    expect(methods).toMatch(/addMoney\(b.ptAmount, net\)/);
    const taxes = src("app/api/admin/taxes/route.ts");
    expect(taxes).toMatch(/addMoney\(sum, Number\(b.tax_amount\) \|\| 0\)/);
    const group = repo("apps/provider/src/lib/group-booking-detail-helpers.ts");
    expect(group).toMatch(/addMoney\(sum, participantCollectAmount\(participant\)\)/);
  });

  it("adds leftover at-home / refund-coverage / analytics-ledger money with helpers", () => {
    const atHome = repo("packages/utils/src/booking/at-home-pricing.ts");
    expect(atHome).toMatch(/displayPrice: addMoney\(base, adj\)/);
    expect(atHome).toMatch(/addMoney\(sum, subtractMoney\(Number\(price\), Number\(base\)\)\)/);
    const coverage = src("lib/admin/booking-refund-coverage.ts");
    expect(coverage).toMatch(/addMoney\(sum, parseRefundAmount\(r.amount\)\)/);
    const ledger = src("lib/reports/analytics-ledger-breakdown.ts");
    expect(ledger).toMatch(/addMoney\(fromRefunds, fromNeg\)/);
  });

  it("adds leftover revenue-map / finance-refund / group-guest money with helpers", () => {
    const helpers = src("lib/reports/revenue-helpers.ts");
    expect(helpers).toMatch(/addMoney\(current, Number\(t.net \|\| t.amount \|\| 0\)\)/);
    const finance = src("app/api/provider/finance/route.ts");
    expect(finance).toMatch(/addMoney\(s, Math.abs\(Number\(r.net \?\? r.amount \?\? 0\)\)\)/);
    const guests = repo("packages/utils/src/booking/group-guests-service-subtotal.ts");
    expect(guests).toMatch(/addMoney\(s, priceByOfferingId.get\(id\) \?\? 0\)/);
  });

  it("adds leftover wallet-gift coverage / group rollup money with helpers", () => {
    const bookings = src("app/api/provider/bookings/route.ts");
    expect(bookings).toMatch(/addMoney\(Number\(child.wallet_amount \?\? 0\), Number\(child.gift_card_amount \?\? 0\)\)/);
    expect(bookings).toMatch(/addMoney\(addMoney\(prev.totalAmount, childTotal\), childUnpaidCharges\)/);
    const limits = src("lib/bookings/booking-refund-limits.ts");
    expect(limits).toMatch(/onlineCollected = addMoney\(onlineCollected, amt\)/);
    const queue = src("lib/admin/refund-queue-rows.ts");
    expect(queue).toMatch(/addMoney\(parseRefundAmount\(b.wallet_amount\), parseRefundAmount\(b.gift_card_amount\)\)/);
    const receipt = src("lib/receipts/subscription-receipt-pdf.ts");
    expect(receipt).toMatch(/addMoney\(Number\(tx.net \?\? 0\), Number\(tx.fees \?\? 0\)\)/);
  });

  it("adds leftover admin-revenue / dashboard-day / tips maps with helpers", () => {
    const adminRev = src("app/api/admin/reports/revenue/route.ts");
    expect(adminRev).toMatch(/addMoney\(revenueByBooking.get\(bid\) \?\? 0, Number\(\(row as \{ net\?: number \}\).net \?\? 0\)\)/);
    const dash = src("lib/server/provider/get-provider-dashboard.ts");
    expect(dash).toMatch(/addMoney\(\s*revenueByDay.get\(key\) \?\? 0,/);
    const tips = src("lib/payroll/tips-helper.ts");
    expect(tips).toMatch(/addMoney\(result.get\(a.staff_id\) \|\| 0, amt\)/);
  });

  it("adds leftover dashboard / takings / invoice-outstanding money with helpers", () => {
    const semantics = src("lib/reports/provider-revenue-semantics.ts");
    expect(semantics).toMatch(/sum = addMoney\(sum, rowNet\(r\)\)/);
    expect(semantics).toMatch(/netAfterRefunds: subtractMoney\(recognized, refundDeduction\)/);
    const takings = src("lib/reports/recorded-takings.ts");
    expect(takings).toMatch(/salesTotal = addMoney\(salesTotal, split.total\)/);
    const invoices = src("lib/invoices/provider-invoice-status.ts");
    expect(invoices).toMatch(/subtractMoney\(Number\(row.total_amount \?\? 0\), Number\(row.amount_paid \?\? 0\)\)/);
  });

  it("subtracts leftover share / refund / fee-net money with helpers", () => {
    const summary = src("app/api/provider/reports/payments/summary/route.ts");
    expect(summary).toMatch(/subtractMoney\(Number\(pt.amount \?\? 0\), Number\(pt.refund_amount \?\? 0\)\)/);
    const feeNet = src("lib/admin/fee-adjustment-net.ts");
    expect(feeNet).toMatch(/subtractMoney\(Number\(amount\), Number\(adjustedFee\)\)/);
    const guests = repo("apps/provider/src/lib/group-booking-detail-helpers.ts");
    expect(guests).toMatch(/subtractMoney\(Number\(participant.price \?\? 0\), Number\(participant.total_paid \?\? 0\)\)/);
  });

  it("adds leftover statutory / group-price / ledger-feed money with helpers", () => {
    const statutory = src("lib/payroll/apply-statutory.ts");
    expect(statutory).toMatch(/tax = addMoney\(tax, line.amount\)/);
    const group = src("lib/bookings/group-booking-services.ts");
    expect(group).toMatch(/total = addMoney\(total, service.price\)/);
    const feed = src("lib/provider/provider-transactions-feed.ts");
    expect(feed).toMatch(/totalIn = addMoney\(totalIn, row.amount\)/);
    const apple = src("lib/iap/apple/settlement-import.ts");
    expect(apple).toMatch(/total = addMoney\(total, proceeds\)/);
  });

  it("subtracts leftover nested outstanding / sale-taxable money with helpers", () => {
    const settle = src("lib/payments/settle-card-machine-payment.ts");
    expect(settle).toMatch(/subtractMoney\(totalPaid, totalRefunded\)/);
    expect(settle).toMatch(/addMoney\(walletAmount, giftCardAmount\)/);
    const sales = src("app/api/provider/sales/route.ts");
    expect(sales).toMatch(/subtractMoney\(calculatedSubtotal, discountNum\)/);
    const dash = src("lib/server/provider/get-provider-dashboard.ts");
    expect(dash).toMatch(/subtractMoney\(paid, refunded\)/);
  });

  it("subtracts leftover nested display outstanding money with helpers", () => {
    const providerDetail = repo("apps/provider/app/(app)/(tabs)/more/bookings/[id].tsx");
    expect(providerDetail).toMatch(/subtractMoney\(totalPaid, totalRefunded\)/);
    expect(providerDetail).toMatch(/subtractMoney\(subtractMoney\(totalPaid, walletPaid\), giftPaid\)/);
    const customerDetail = repo("apps/customer/app/(app)/booking-detail.tsx");
    expect(customerDetail).toMatch(/subtractMoney\(total, paid\)/);
    expect(customerDetail).toMatch(/subtractMoney\(subtractMoney\(totalPaid, walletPaid\), giftPaid\)/);
    const sheet = src("components/provider/booking/view/AppointmentViewSheet.tsx");
    expect(sheet).toMatch(/subtractMoney\(totalPaid, totalRefunded\)/);
    const confirm = src("app/booking/confirmation/page.tsx");
    expect(confirm).toMatch(/subtractMoney\(subtractMoney\(totalPaid, walletPaid\), giftCardPaid\)/);
    const step = src("app/booking/components/steps/step-payment.tsx");
    expect(step).toMatch(/subtractMoney\(totals.total, groupGuestShareTotal\)/);
    const checkout = repo("apps/customer/app/(app)/(tabs)/shop/product-checkout.tsx");
    expect(checkout).toMatch(/subtractMoney\(total, giftCredit\)/);
    const schedule = repo("apps/provider/src/components/bookings/BookingScheduleCard.tsx");
    expect(schedule).toMatch(/subtractMoney\(total, Math.max\(paidAfterRefunds, walletGiftCoverage\)\)/);
    const groupSheet = src("components/provider/booking/group/GroupBookingViewSheet.tsx");
    expect(groupSheet).toMatch(/subtractMoney\(Math.max\(totalPaid, walletGift\), totalRefunded\)/);
  });

  it("subtracts leftover membership / loyalty / collected money with helpers", () => {
    const validate = src("app/api/public/bookings/_helpers/validate-booking.ts");
    expect(validate).toMatch(/subtractMoney\(combinedAfterPromo, membershipDiscountAmount\)/);
    expect(validate).toMatch(/subtractMoney\(subtotalAfterMembership, loyaltyDiscountAmount\)/);
    const bookCheckout = repo("apps/customer/app/(app)/book-checkout.tsx");
    expect(bookCheckout).toMatch(/subtractMoney\(subtotalAfterPromo, membershipDiscountAmount\)/);
    const offerPricing = src("app/api/me/custom-offers/_helpers/custom-offer-pricing.ts");
    expect(offerPricing).toMatch(/subtractMoney\(combinedAfterPromo, membershipDiscountAmount\)/);
    const commission = src("lib/payroll/commission-calculator.ts");
    expect(commission).toMatch(/subtractMoney\(subtotal, discount\)/);
    const finance = src("lib/bookings/provider-booking-finance.ts");
    expect(finance).toMatch(/subtractMoney\(\s*subtractMoney\(\s*subtractMoney\(\s*Number\(subtotal\)/);
    const settle = src("lib/payments/settle-card-machine-payment.ts");
    expect(settle).toMatch(/subtractMoney\(\s*subtractMoney\(\s*subtractMoney\(\s*Math.max\(0, Number\(input.captured\)/);
    const apple = src("lib/iap/apple/settlement-import.ts");
    expect(apple).toMatch(/subtractMoney\(amount, Number.isFinite\(fees\) \? fees : 0\)/);
    const adminBookings = src("app/api/admin/bookings/route.ts");
    expect(adminBookings).toMatch(/subtractMoney\(totalPaid, totalRefunded\)/);
    const sync = src("lib/bookings/sync-booking-after-paystack-success.ts");
    expect(sync).toMatch(/addMoney\(walletAmount, giftCardAmount\)/);
    const refund = src("app/api/provider/bookings/[id]/refund/route.ts");
    expect(refund).toMatch(/subtractMoney\(totalCollectedAllSources, totalRefunded\)/);
    const processPay = src("app/api/public/bookings/_helpers/process-payment.ts");
    expect(processPay).toMatch(/addMoney\(walletAmountApplied, giftCardAmountApplied\)/);
    const finalize = src("lib/custom-offers/finalize-custom-offer-payment.ts");
    expect(finalize).toMatch(/addMoney\(addMoney\(paystackAmountMajor, walletAmountApplied\), giftCardAmountApplied\)/);
  });

  it("subtracts leftover charge remaining after wallet / gift with helpers", () => {
    const processPay = src("app/api/public/bookings/_helpers/process-payment.ts");
    expect(processPay).toMatch(/subtractMoney\(amountToCollect, giftCardAmountApplied\)/);
    expect(processPay).toMatch(/subtractMoney\(amountToCollect, walletAmountApplied\)/);
    const step = src("app/booking/components/steps/step-payment.tsx");
    expect(step).toMatch(/subtractMoney\(subtractMoney\(amountDueNow, giftCardApplied\), walletApplied\)/);
    const saleGift = src("lib/gift-cards/sale-gift-card.ts");
    expect(saleGift).toMatch(/subtractMoney\(subtractMoney\(Number\(saleTotal\)/);
    const guests = repo("apps/provider/src/lib/group-booking-detail-helpers.ts");
    expect(guests).toMatch(/subtractMoney\(Math.max\(totalPaid, walletGift\), totalRefunded\)/);
    const cancel = src("lib/bookings/settle-booking-cancellation.ts");
    expect(cancel).toMatch(/subtractMoney\(basis, refundOnBasis\)/);
    const flow = src("app/booking/components/booking-flow.tsx");
    expect(flow).toMatch(/subtractMoney\(subtotal, nonMembershipDiscounts\)/);
    const checkout = repo("apps/customer/app/(app)/book-checkout.tsx");
    expect(checkout).toMatch(/subtractMoney\(servicesSubtotal, packageDiscount\)/);
  });

  it("subtracts leftover net-after-fee / tender remaining / payroll-band money with helpers", () => {
    const pay = src("lib/payroll/compute-compensation.ts");
    expect(pay).toMatch(/subtractMoney\(Math.min\(revenue, bandEnd\), bandStart\)/);
    expect(pay).toMatch(/subtractMoney\(addMoney\(serviceRev, productRev\), plan.thresholdAmount\)/);
    const za = src("lib/payroll/jurisdictions/packs/za.ts");
    expect(za).toMatch(/subtractMoney\(tax, rebate\)/);
    const tender = src("lib/orders/product-order-tender.ts");
    expect(tender).toMatch(/subtractMoney\(subtractMoney\(total, gift\), wallet\)/);
    const membership = src("lib/memberships/membership-payment.ts");
    expect(membership).toMatch(/subtractMoney\(grossAmount, feeAmount\)/);
    const cash = src("lib/admin/platform-cash-position.ts");
    expect(cash).toMatch(/subtractMoney\(subtractMoney\(subtractMoney\(collected, agg.payouts_paid_total\)/);
    const yoco = src("app/api/provider/yoco/payments/route.ts");
    expect(yoco).toMatch(/subtractMoney\(amountInRands, tipAmount\)/);
    const alloc = src("app/api/provider/paystack/terminal-payments/[id]/allocation/route.ts");
    expect(alloc).toMatch(/subtractMoney\(paidAmount, nextAllocatedAmount\)/);
    const fee = src("lib/bookings/provider-booking-platform-fee.ts");
    expect(fee).toMatch(/subtractMoney\(Number\(totalAmount\), Math.max\(0, feeAmount\)\)/);
  });

  it("subtracts leftover tip-base / collect outstanding / sale balance money with helpers", () => {
    const remaining = src("app/api/me/bookings/[id]/pay-remaining/route.ts");
    expect(remaining).toMatch(/subtractMoney\(subtractMoney\(totalAmount, Number\(\(booking as \{ tip_amount\?: number \}\).tip_amount \?\? 0\)\), fee\)/);
    const collect = src("lib/payments/paycloud-collect-cta.ts");
    expect(collect).toMatch(/subtractMoney\(params.totalAmount, params.totalPaid\)/);
    const appCollect = repo("apps/provider/src/lib/paycloud-collect-cta.ts");
    expect(appCollect).toMatch(/subtractMoney\(params.totalAmount, params.totalPaid\)/);
    const sale = src("lib/receipts/build-sale-receipt.ts");
    expect(sale).toMatch(/subtractMoney\(totalAmount, amountPaid\)/);
    const notify = src("lib/notifications/notify-product-order-paid.ts");
    expect(notify).toMatch(/subtractMoney\(totalAmount, walletAmount\)/);
  });

  it("adds leftover ledger provider-net / collected-split money with helpers", () => {
    const posting = src("lib/ledger/posting-map.ts");
    expect(posting).toMatch(/subtractMoney\(subtractMoney\(subtractMoney\(input.gross, input.platformFee\), input.taxAmount\), input.tipAmount\)/);
    const receipt = src("lib/receipts/build-order-receipt.ts");
    expect(receipt).toMatch(/subtractMoney\(addMoney\(addMoney\(addMoney\(subtotal, tax\), deliveryFee\), platformFee\), discount\)/);
    const ledger = src("lib/bookings/record-booking-online-charge-ledger.ts");
    expect(ledger).toMatch(/subtractMoney\(amountInCurrency, feesInCurrency\)/);
    expect(ledger).toMatch(/addMoney\(addMoney\(amountInCurrency, walletAmountFromMeta\), giftCardAmountFromMeta\)/);
    const fees = src("lib/payments/platform-fees.ts");
    expect(fees).toMatch(/addMoney\(bookingSubtotal, platformFee\)/);
    const cancel = src("lib/bookings/settle-booking-cancellation.ts");
    expect(cancel).toMatch(/addMoney\(walletCollected, giftCardCollected\)/);
    const shop = src("app/shop/checkout/page.tsx");
    expect(shop).toMatch(/addMoney\(addMoney\(subtotal, deliveryFee\), platformFee\)/);
  });

  it("adds leftover create-subtotal / fee-net / receipt-reconstruct money with helpers", () => {
    const bookings = src("app/api/provider/bookings/route.ts");
    expect(bookings).toMatch(/addMoney\(addMoney\(servicesSubtotal, addonsSubtotal\), productsSubtotal\)/);
    expect(bookings).toMatch(/subtractMoney\(addMoney\(serverSubtotal, serverTravelFee\), serverDiscountAmount\)/);
    const group = src("lib/bookings/create-group-participant-booking.ts");
    expect(group).toMatch(/addMoney\(price, addonTotal\)/);
    expect(group).toMatch(/addMoney\(merchandiseSubtotal, travelFee\)/);
    const sub = src("lib/subscriptions/provider-subscription-payment.ts");
    expect(sub).toMatch(/subtractMoney\(amountMajor, resolvedFeesMajor\)/);
    const marketing = src("lib/marketing/marketing-credit-topup-payment.ts");
    expect(marketing).toMatch(/subtractMoney\(amountMajor, feesMajor\)/);
    const terminal = src("lib/terminal/record-terminal-order-payment.ts");
    expect(terminal).toMatch(/net: subtractMoney\(amountMajor, feesMajor\)/);
    const inv = src("lib/bookings/display-invariants.ts");
    expect(inv).toMatch(/addMoney\(addMoney\(addMoney\(addMoney\(sub, travel\), tax\), fees\), tip\)/);
    const portal = src("lib/provider-portal/api.ts");
    expect(portal).toMatch(/addMoney\(data.price, data.travel_fee \|\| 0\)/);
    const payroll = src("lib/payroll/assemble-staff-pay-run-gross.ts");
    expect(payroll).toMatch(/multiplyMoney\(hourlyRate, input.hoursWorked\)/);
    const paycloud = src("lib/payments/paycloud-amount-guards.ts");
    expect(paycloud).toMatch(/addMoney\(addMoney\(expected, tip\), cashback\)/);
  });

  it("adds leftover package-discount / cancel-preview / takings / delivery money with helpers", () => {
    const pkgMatch = repo("packages/utils/src/booking/packageCartMatch.ts");
    expect(pkgMatch).toMatch(/subtractMoney\(servicesSubtotal, Number\(pkg.price\)\)/);
    const cancel = src("app/api/me/bookings/[id]/cancel-preview/route.ts");
    expect(cancel).toMatch(/addMoney\(walletRefund, outcome.leadWalletRefund \?\? outcome.walletRefund\)/);
    expect(cancel).toMatch(/addMoney\(fee, outcome.leadFeeRetained \?\? outcome.feeRetained\)/);
    const takings = src("lib/reports/provider-retail-takings.ts");
    expect(takings).toMatch(/amount = addMoney\(amount, taken\)/);
    const invoices = src("lib/invoices/provider-invoices-query.ts");
    expect(invoices).toMatch(/addMoney\(acc.paid_amount, paid\)/);
    const metrics = src("app/api/admin/subscription-metrics/route.ts");
    expect(metrics).toMatch(/addMoney\(monthRevenue, isMonthly \? price : multiplyMoney\(price, 1 \/ 12\)\)/);
    const premiums = src("lib/payroll/time-premiums.ts");
    expect(premiums).toMatch(/multiplyMoney\(hourlyRate, \(otMult - 1\) \* overtimeHours\)/);
    const delivery = src("lib/orders/delivery-fee.ts");
    expect(delivery).toMatch(/addMoney\(baseFee, multiplyMoney\(rate, weightKg\)\)/);
    expect(delivery).toMatch(/addMoney\(baseFee, distanceCharge\)/);
  });

  it("adds leftover remaining-refundable / at-home price / mark-paid / PayCloud void money with helpers", () => {
    const orders = src("app/provider/ecommerce/orders/page.tsx");
    expect(orders).toMatch(/subtractMoney\(Number\(order.total_amount \?\? 0\), Math.max\(0, Number\(order.refunded_amount \?\? 0\)\)\)/);
    const validate = src("app/api/public/bookings/_helpers/validate-booking.ts");
    expect(validate).toMatch(/addMoney\(Number\(off.price\), homeAdj\)/);
    const markPaid = src("app/api/provider/bookings/[id]/mark-paid/route.ts");
    expect(markPaid).toMatch(/addMoney\(Number\(booking.total_paid \|\| 0\), giftBase\)/);
    expect(markPaid).toMatch(/subtractMoney\(Number\(booking.total_paid \|\| 0\), giftBase\)/);
    const folio = src("components/provider/front-desk/ActionPanel.tsx");
    expect(folio).toMatch(/addMoney\(Number\(booking.total_amount \|\| 0\), unpaidAdditionalCharges\)/);
    const paycloudVoid = src("app/api/provider/paycloud/payments/[id]/void/route.ts");
    expect(paycloudVoid).toMatch(/addMoney\(addMoney\(Number\(payment.amount\), Math.max\(0, Number\(payment.tip_amount \?\? 0\)\)\), Math.max\(0, Number\(payment.cashback_amount \?\? 0\)\)\)/);
    const customerOrder = repo("apps/customer/app/(app)/product-order-detail.tsx");
    expect(customerOrder).toMatch(/addMoney\(addMoney\(addMoney\(subtractMoney\(Number\(order.subtotal \?\? 0\), Number\(order.discount_amount \?\? 0\)\), Number\(order.delivery_fee \?\? 0\)\), Number\(order.tax_amount \?\? 0\)\), platformFee\)/);
  });

  it("adds leftover app remaining-refundable / ads net / travel-fee preview money with helpers", () => {
    const productOrders = repo("apps/provider/app/(app)/(tabs)/more/product-orders.tsx");
    expect(productOrders).toMatch(/subtractMoney\(numOrZero\(order.total_amount\), Math.max\(0, numOrZero\(order.refunded_amount\)\)\)/);
    const ads = src("lib/ads/ads-budget-order-payment.ts");
    expect(ads).toMatch(/subtractMoney\(amountMajor, feesMajor\)/);
    const editor = repo("apps/provider/src/features/travel-fees/TravelFeesEditor.tsx");
    expect(editor).toMatch(/addMoney\(min, multiplyMoney\(r, Math.max\(0, km - freeKm\)\)\)/);
    const onboard = src("components/provider/travel-fees/TravelFeesOnboardingForm.tsx");
    expect(onboard).toMatch(/addMoney\(minimum, multiplyMoney\(rate, km\)\)/);
    const settings = src("app/provider/settings/sales/travel-fees/page.tsx");
    expect(settings).toMatch(/addMoney\(minimum, multiplyMoney\(rate, km\)\)/);
  });

  it("multiplies leftover PAYE annualize / EMP201 / ARR / trial plan-price money with helpers", () => {
    const za = src("lib/payroll/jurisdictions/packs/za.ts");
    expect(za).toMatch(/multiplyMoney\(periodTaxable, payPeriodsPerYear\)/);
    expect(za).toMatch(/multiplyMoney\(annualTax, 1 \/ payPeriodsPerYear\)/);
    const emp201 = src("app/api/provider/pay-runs/[id]/export/emp201/route.ts");
    expect(emp201).toMatch(/multiplyMoney\(gross, periodsPerYear\)/);
    const metrics = src("app/api/admin/subscription-metrics/route.ts");
    expect(metrics).toMatch(/multiplyMoney\(mrr, 12\)/);
    const trial = src("lib/subscriptions/trial.ts");
    expect(trial).toMatch(/multiplyMoney\(monthly, 12\)/);
    expect(trial).toMatch(/multiplyMoney\(yearly, 1 \/ 12\)/);
  });

  it("adds leftover marketplace MRR / contribution / weekly salary-slice money with helpers", () => {
    const health = src("lib/admin/marketplace-health.ts");
    expect(health).toMatch(/addMoney\(agg.platform_take_net, agg.service_fee_revenue\)/);
    expect(health).toMatch(/subtractMoney\(subtractMoney\(platformNet, gateway\), Math.abs\(refundImpact\)\)/);
    expect(health).toMatch(/multiplyMoney\(Number\(price\), 1 \/ 12\)/);
    const contrib = src("lib/admin/marketplace-health-contribution.ts");
    expect(contrib).toMatch(/addMoney\(agg.platform_take_net, agg.service_fee_revenue\)/);
    const salary = src("lib/payroll/salary-proration.ts");
    expect(salary).toMatch(/multiplyMoney\(monthlySalary, 1 \/ 4\)/);
  });

  it("multiplies leftover gift-card sales / FX display money with helpers", () => {
    const gift = src("app/api/provider/reports/gift-cards/sales/route.ts");
    expect(gift).toMatch(/multiplyMoney\(amount, count\)/);
    const fx = src("lib/fx/get-fx-rate.ts");
    expect(fx).toMatch(/multiplyMoney\(amount, rate, lookup.quote\)/);
    const display = src("hooks/useDisplayMoney.ts");
    expect(display).toMatch(/multiplyMoney\(amount, rate, display\)/);
  });

  it("adds leftover payouts net-of-refunds / at-home price / custom-offer subtotal money with helpers", () => {
    const payouts = src("app/provider/reports/payments/payouts/page.tsx");
    expect(payouts).toMatch(/subtractMoney\(totalBookedAmount, \(data.totalRefunded \?\? 0\)\)/);
    const appPayouts = repo("apps/provider/src/features/reports/PayoutsReportView.tsx");
    expect(appPayouts).toMatch(/subtractMoney\(booked, Number\(data.totalRefunded \?\? 0\)\)/);
    const offer = src("app/api/me/custom-offers/_helpers/custom-offer-pricing.ts");
    expect(offer).toMatch(/addMoney\(Math.max\(0, offerPrice\), Math.max\(0, travelFee\)\)/);
    const appGroup = repo("apps/provider/app/(app)/(tabs)/more/group-bookings.tsx");
    expect(appGroup).toMatch(/price: addMoney\(basePrice, addOnPrice\)/);
    const holds = src("app/api/public/booking-holds/route.ts");
    expect(holds).toMatch(/addMoney\(basePrice, homeAdj\)/);
    const houseWeb = src("components/booking/HouseCallPricingNotes.tsx");
    expect(houseWeb).toMatch(/addMoney\(basePrice, adj\)/);
    const houseCust = repo("apps/customer/src/components/booking/HouseCallPricingNotes.tsx");
    expect(houseCust).toMatch(/addMoney\(basePrice, adj\)/);
    const carry = src("lib/bookings/reschedule-carry-over.ts");
    expect(carry).toMatch(/addMoney\(s, Math.max\(0, Number\(r.amount \?\? 0\)\)\)/);
    const groupRoute = src("app/api/provider/group-bookings/[id]/route.ts");
    expect(groupRoute).toMatch(/addMoney\(sum, Math.max\(0, Number\(p.price \|\| 0\)\)\)/);
    const commissionCtx = src("lib/bookings/fetch-booking-commission-context.ts");
    expect(commissionCtx).toMatch(/addMoney\(priorPaid, Math.max\(0, Number\(input.chargeAmount \|\| 0\)\)\)/);
  });

  it("multiplies leftover gateway-fee / Stripe cents / receipt-cache / admin MRR money with helpers", () => {
    const fee = src("lib/payments/expected-gateway-fee.ts");
    expect(fee).toMatch(/multiplyMoney\(amount, pct, currency\)/);
    expect(fee).toMatch(/addMoney\(computed, fixed, currency\)/);
    expect(fee).toMatch(/addMoney\(computed, multiplyMoney\(computed, vatRate, currency\), currency\)/);
    const stripe = src("app/api/payments/stripe/webhook/_handlers/stripe-dispute.ts");
    expect(stripe).toMatch(/fromMinorUnits\(Math.round\(Number\(dispute.amount\)\)/);
    const cache = src("lib/receipts/pdf-cache.ts");
    expect(cache).toMatch(/toMinorUnits\(input.totalAmount \|\| 0\)/);
    expect(cache).toMatch(/toMinorUnits\(input.totalPaid \|\| 0\)/);
    const adminMrr = repo("apps/admin-web/src/routes/providers/tabs/ProviderFinanceTab.tsx");
    expect(adminMrr).toMatch(/multiplyMoney\(Number\(yearly\), 1 \/ 12\)/);
  });

  it("subtracts leftover no-show collected / product-return remaining / product-sales line revenue money with helpers", () => {
    const noShow = src("components/provider/booking/view/BookingNoShowDialog.tsx");
    expect(noShow).toMatch(/subtractMoney\(Math.max\(Number\(raw.total_paid \?\? 0\), 0\), Number\(raw.total_refunded \?\? 0\)\)/);
    const ret = src("lib/ecommerce/process-product-return-refund.ts");
    expect(ret).toMatch(/subtractMoney\(orderTotal, priorRefunded\)/);
    expect(ret).toMatch(/addMoney\(priorRefunded, refundAmount\)/);
    const orders = src("app/api/provider/product-orders/[id]/route.ts");
    expect(orders).toMatch(/addMoney\(alreadyRefunded, refundAmount, orderCurrency\)/);
    const sales = src("app/api/provider/reports/products/sales/route.ts");
    expect(sales).toMatch(/multiplyMoney\(unitPrice, quantity\)/);
    expect(sales).toMatch(/addMoney\(orderRevenue, lineRevenue\)/);
    expect(sales).toMatch(/addMoney\(sum, pr\)/);
  });

  it("subtracts leftover persisted booking total / custom-offer commission-base money with helpers", () => {
    const pricing = repo("packages/utils/src/booking/calculateBookingPricing.ts");
    expect(pricing).toMatch(/subtractMoney\(net, nonNeg\(input.discountAmount \?\? 0\), currency\)/);
    expect(pricing).toMatch(/sumMoney\(\s*currency,\s*net,\s*tax,/);
    const offer = src("app/api/me/custom-offers/_helpers/custom-offer-pricing.ts");
    expect(offer).toMatch(/subtractMoney\(subtractMoney\(prePromoCommissionBase, promotionDiscountAmount\), membershipDiscountAmount\)/);
  });

  it("adds leftover provider-create total / recurring series / Apple settlement proceeds money with helpers", () => {
    const create = src("app/api/provider/bookings/route.ts");
    expect(create).toMatch(/sumMoney\(bookingCurrency, taxableAmount, serverTipAmount, serverTravelFee, serverPlatformFeeAmount\)/);
    expect(create).toMatch(/sumMoney\(\s*bookingCurrency,\s*taxableAmount,\s*recomputedTaxAmount,/);
    const apple = src("lib/iap/apple/settlement-import.ts");
    expect(apple).toMatch(/addMoney\(sum, multiplyMoney\(row.extendedPartnerShare, sign, currency\), currency\)/);
    const series = src("lib/recurring/create-booking-from-series.ts");
    expect(series).toMatch(/subtractMoney\(recurringSubtotal, recurringDiscountAmount, currency\)/);
    expect(series).toMatch(/addMoney\(netAfterRecurringDiscounts, effectiveRecurringTravelFee, currency\)/);
    expect(series).toMatch(/sumMoney\(\s*currency,\s*netAfterRecurringDiscounts,\s*effectiveRecurringTravelFee,/);
  });

  it("adds leftover outstanding coverage / payroll net-pay / PayCloud deposit-due / admin this-month / sales-history net with helpers", () => {
    const finance = src("lib/bookings/provider-booking-finance.ts");
    expect(finance).toMatch(/subtractMoney\(Number\(totalPaid\) \|\| 0, Number\(totalRefunded\) \|\| 0\)/);
    expect(finance).toMatch(/addMoney\(Number\(walletAmount\) \|\| 0, Number\(giftCardAmount\) \|\| 0\)/);
    expect(finance).toMatch(/addMoney\(paidAfterRefunds, pendingWalletGift\)/);
    expect(finance).toMatch(/addMoney\(subtractMoney\(Number\(totalAmount\) \|\| 0, coverage\), Number\(unpaidAdditionalCharges\) \|\| 0\)/);
    const netPay = src("lib/payroll/net-pay.ts");
    expect(netPay).toMatch(/sumMoney\(\s*currency,\s*Number\(input.manualDeductions\) \|\| 0,/);
    expect(netPay).toMatch(/addMoney\(subtractMoney\(gross, deductions, currency\), carry, currency\)/);
    const paycloud = src("lib/payments/paycloud-booking-charge.ts");
    expect(paycloud).toMatch(/addMoney\(totalPaid, pendingWalletGift\)/);
    expect(paycloud).toMatch(/subtractMoney\(configuredDeposit, depositCovered\)/);
    const appPaycloud = repo("apps/provider/src/hooks/usePaycloudCollectAvailability.ts");
    expect(appPaycloud).toMatch(/subtractMoney\(configuredDeposit, totalPaid\)/);
    const dash = src("app/api/admin/dashboard/route.ts");
    expect(dash).toMatch(/addMoney\(addMoney\(thisMonth.provider_earnings_net, thisMonth.tips_gross\), thisMonth.cancellation_fees_retained\)/);
    const sales = src("lib/reports/provider-sales-history.ts");
    expect(sales).toMatch(/sumMoney\(\s*agg.provider_earnings_net,\s*agg.tip,/);
    expect(sales).toMatch(/subtractMoney\(\s*sumMoney\(/);
  });

  it("adds leftover team-totals rollups / ledger-health deferred-recognized money with helpers", () => {
    const webTotals = src("app/provider/team/totals/page.tsx");
    expect(webTotals).toMatch(/addMoney\(acc.revenue, total.revenue\)/);
    expect(webTotals).toMatch(/addMoney\(acc.tips, total.tips\)/);
    expect(webTotals).toMatch(/addMoney\(acc.commission, total.commission\)/);
    const appTotals = repo("apps/provider/app/(app)/(tabs)/more/team-totals.tsx");
    expect(appTotals).toMatch(/addMoney\(acc.revenue, t.revenue\)/);
    expect(appTotals).toMatch(/addMoney\(acc.tips, t.tips\)/);
    expect(appTotals).toMatch(/addMoney\(acc.commission, t.commission\)/);
    const health = src("app/api/admin/finance/ledger-health/route.ts");
    expect(health).toMatch(/addMoney\(acc.amount, v.amount\)/);
    expect(health).toMatch(/addMoney\(acc.net, v.net\)/);
  });

  it("adds leftover tip-cashback extras / LTV median / staff revenue share / taxable accum money with helpers", () => {
    const settle = src("lib/payments/settle-card-machine-payment.ts");
    expect(settle).toMatch(/addMoney\(tip, cashback\)/);
    const ltv = src("app/api/provider/reports/clients/lifetime-value/route.ts");
    expect(ltv).toMatch(/addMoney\(enrichedLTV\[mid\]/);
    const commission = src("lib/payroll/commission-calculator.ts");
    expect(commission).toMatch(/multiplyMoney\(bookingRevenue, staffProportion\)/);
    expect(commission).toMatch(/addMoney\(result.serviceRevenue, staffRevenueShare\)/);
    const adminRev = src("app/api/admin/reports/revenue/route.ts");
    expect(adminRev).toMatch(/multiplyMoney\(bookingRevenue, proportion\)/);
    const sales = src("app/api/provider/reports/sales/summary/route.ts");
    expect(sales).toMatch(/multiplyMoney\(bookingRevenue, serviceProportion\)/);
    const statutory = src("lib/payroll/apply-statutory.ts");
    expect(statutory).toMatch(/addMoney\(out.get\(sid\) \?\? 0, taxable\)/);
  });

  it("adds leftover report allocated-revenue / ledger accumulators money with helpers", () => {
    const rev = src("app/api/provider/reports/revenue/route.ts");
    expect(rev).toMatch(/multiplyMoney\(bRev, proportion\)/);
    expect(rev).toMatch(/addMoney\(serviceMap.get\(name\)/);
    expect(rev).toMatch(/addMoney\(staffMap.get\(staffName\)/);
    const sales = src("app/api/provider/reports/sales/summary/route.ts");
    expect(sales).toMatch(/addMoney\(appointmentLedgerRevenue, v\)/);
    expect(sales).toMatch(/addMoney\(retailLedgerRevenue, v\)/);
    const sub = src("app/api/admin/subscription-metrics/route.ts");
    expect(sub).toMatch(/addMoney\(realizedSubscriptionRevenue, v\)/);
  });

  it("adds leftover recognized MRR / recorded-takings / wallet-gift / channel-revenue money with helpers", () => {
    const metrics = src("app/api/admin/subscription-metrics/route.ts");
    expect(metrics).toMatch(/addMoney\(recognizedMrr, v\)/);
    const takings = src("lib/reports/recorded-takings.ts");
    expect(takings).toMatch(/addMoney\(bpAmountByBooking.get\(row.booking_id\)/);
    const wallet = src("lib/bookings/ensure-wallet-gift-booking-payments.ts");
    expect(wallet).toMatch(/addMoney\(totals.get\(bookingId\)/);
    const channel = src("lib/reports/booking-channel-breakdown.ts");
    expect(channel).toMatch(/addMoney\(channelRevenue.get\(channel\)/);
  });

  it("adds leftover payroll deduction-total / parseMoney rounding money with helpers", () => {
    const payroll = src("app/provider/team/payroll/[id]/page.tsx");
    expect(payroll).toMatch(/Math.max\(0, roundCurrency\(n\)\)/);
    expect(payroll).toMatch(/addMoney\(addMoney\(parseMoney\(manualStr\), tax\), uif\)/);
  });

  it("adds leftover payout-balance / geo booking-value accumulators money with helpers", () => {
    const payout = src("lib/provider/available-payout-balance.ts");
    expect(payout).toMatch(/addMoney\(vatHeldForProvider, vatAmount\)/);
    expect(payout).toMatch(/addMoney\(excludedProviderCollectedAmount, value\)/);
    expect(payout).toMatch(/addMoney\(onHoldAmount, value\)/);
    expect(payout).toMatch(/addMoney\(onlineEarnings, value\)/);
    expect(payout).toMatch(/addMoney\(excludedProviderCollectedAmount, earnings\)/);
    expect(payout).toMatch(/addMoney\(onHoldAmount, earnings\)/);
    expect(payout).toMatch(/addMoney\(onlineEarnings, earnings\)/);
    const geo = src("app/api/admin/analytics/geo/route.ts");
    expect(geo).toMatch(/addMoney\(totalBookingValue, val\)/);
    expect(geo).toMatch(/addMoney\(atHomeValue, val\)/);
    expect(geo).toMatch(/addMoney\(atSalonValue, val\)/);
  });

  it("adds leftover inventory category stock-value accumulators money with helpers", () => {
    const inv = src("app/api/provider/reports/products/inventory/route.ts");
    expect(inv).toMatch(/addMoney\(existing.stockValue, cost\)/);
    expect(inv).toMatch(/addMoney\(existing.costStockValue, cost\)/);
    expect(inv).toMatch(/addMoney\(existing.retailStockValue, retail\)/);
  });

  it("adds leftover extra-charge persist total / held wallet+gift money with helpers", () => {
    const extra = src("lib/bookings/settle-additional-charge-without-paystack.ts");
    expect(extra.replace(/\s+/g, " ")).toContain(
      "addMoney( Number((bookingRow as { total_amount?: number } | null)?.total_amount ?? 0), collectible,",
    );
    expect(extra).toMatch(/addMoney\(input.heldWallet, input.heldGift\)/);
    const terminal = src("lib/payments/resolve-terminal-expected-amount.ts");
    expect(terminal).toMatch(/addMoney\(held.wallet, held.gift\)/);
    const list = src("app/api/provider/bookings/[id]/additional-charges/route.ts");
    expect(list).toMatch(/addMoney\(held.wallet, held.gift\)/);
    const pay = src("app/api/me/bookings/[id]/additional-charges/[chargeId]/pay/route.ts");
    expect(pay).toMatch(/addMoney\(alreadyHeld.wallet, alreadyHeld.gift\)/);
    const guards = src("lib/payments/paycloud-amount-guards.ts");
    expect(guards).toMatch(/addMoney\(held.wallet, held.gift\)/);
    const mark = src("app/api/provider/bookings/[id]/additional-charges/[chargeId]/mark-paid/route.ts");
    expect(mark).toMatch(/heldTotal = addMoney\(held.wallet, held.gift\)/);
    const settle = src("lib/payments/settle-card-machine-payment.ts");
    expect(settle).toMatch(/heldTotal = addMoney\(held.wallet, held.gift\)/);
  });

  it("adds leftover ledger aggregate / admin finance / fees+commission money with helpers", () => {
    const ledger = src("lib/admin/aggregate-finance-ledger-rows.ts");
    expect(ledger).toMatch(/bookingGmv = sumMoney\(/);
    expect(ledger).toMatch(/addMoney\(subtractMoney\(platformCommissionNet, gatewayFeesServices\), manualAdjustmentsNet\)/);
    expect(ledger).toMatch(/return sumMoney\(\s*a.platform_take_net/);
    expect(ledger).toMatch(/return sumMoney\(\s*a.gateway_fees_services/);
    const summary = src("app/api/admin/finance/summary/route.ts");
    expect(summary).toMatch(/sumMoney\(\s*agg.platform_take_net/);
    const user = repo("apps/admin-web/src/routes/users/UserDetailPage.tsx");
    expect(user).toMatch(/addMoney\(summary.fees, summary.commission\)/);
  });

  it("adds leftover ads / brand-marketing spend accumulators money with helpers", () => {
    const place = src("lib/brand-marketing/placement-metrics.ts");
    expect(place).toMatch(/spend = addMoney\(spend, val\)/);
    expect(place).toMatch(/known: addMoney\(entered, estimated_owned\)/);
    const metrics = src("lib/brand-marketing/metrics.ts");
    expect(metrics).toMatch(/addMoney\(estimated_owned, multiplyMoney\(rate, sends\)\)/);
    const pillars = src("lib/brand-marketing/pack-rollup-pillars.ts");
    expect(pillars).toMatch(/known_spend = addMoney\(known_spend, spendByCampaign.get\(c.id\) \?\? 0\)/);
    const pack = src("lib/brand-marketing/pack-rollup.ts");
    expect(pack).toMatch(/addMoney\(demandMeasured.promo_booking_value, measured.promo_booking_value\)/);
    const ads = src("app/api/admin/ads/overview/route.ts");
    expect(ads).toMatch(/addMoney\(s, Number\(\(r as \{ amount: number \}\).amount \?\? 0\)\)/);
    const page = src("app/provider/settings/ads/page.tsx");
    expect(page).toMatch(/subtractMoney\(Number\(c.budget \|\| 0\), Number\(c.spent \|\| 0\)\)/);
  });

  it("adds leftover brand strategy envelope / campaign allocated budget money with helpers", () => {
    const strategy = src("lib/brand-marketing/strategy.ts");
    expect(strategy).toMatch(/envelope = addMoney\(envelope, Number\(c.budget_envelope \?\? 0\)\)/);
    expect(strategy).toMatch(/known = addMoney\(known, spend.known\)/);
    const readiness = src("lib/brand-marketing/readiness.ts");
    expect(readiness).toMatch(/addMoney\(s, Number\(p.budget \?\? 0\)\)/);
  });

  it("adds leftover scorecard measured money with helpers", () => {
    const score = src("lib/brand-marketing/scorecard.ts");
    expect(score).toMatch(/measured\[k\] = addMoney\(measured\[k\], slice\[k\]\)/);
    expect(score).toMatch(/"promo_discount"/);
    expect(score).toMatch(/"referral_rewards"/);
  });

  it("adds leftover gift-card daily cap / wallet credit / payment-method totals money with helpers", () => {
    const caps = src("lib/gift-cards/gift-card-purchase-caps.ts");
    expect(caps).toMatch(/addMoney\(input.priorAmount, input.totalAmount\)/);
    const life = src("lib/orders/product-order-lifecycle.ts");
    expect(life).toMatch(/roundProductOrderMoney\(addMoney\(walletCreditAmount, giftPortion\)\)/);
    const methods = src("lib/reports/build-payment-methods-report.ts");
    expect(methods).toMatch(/sumMoney\(m.ptAmount, m.bpAmount, m.walletAdjAmount\)/);
    const rev = src("lib/memberships/reverse-membership-payment.ts");
    expect(rev).toMatch(/addMoney\(priorSale, saleReversed\) \+ 0.01/);
  });

  it("adds leftover unpaid-card refund totals and provider refund coverage money with helpers", () => {
    const life = src("lib/orders/product-order-lifecycle.ts");
    expect(life).toMatch(/roundProductOrderMoney\(addMoney\(onlineRefunded, amount\)\)/);
    expect(life).toMatch(/roundProductOrderMoney\(addMoney\(walletFallback, amount\)\)/);
    const refund = src("app/api/provider/bookings/[id]/refund/route.ts");
    expect(refund).toMatch(/addMoney\(totalRefunded, amount\) \+ 0.01/);
    expect(refund).toMatch(/newTotalRefunded = addMoney\(totalRefunded, amount\)/);
  });

  it("adds leftover recorded-takings wallet / mark-paid total / front-desk paid money with helpers", () => {
    const takings = src("lib/reports/recorded-takings.ts");
    expect(takings).toMatch(/addMoney\(byPaymentMethod.wallet \|\| 0, walletPortion\)/);
    expect(takings).toMatch(/walletTotal = addMoney\(walletTotal, walletPortion\)/);
    const mark = src("app/api/provider/bookings/[id]/mark-paid/route.ts");
    expect(mark).toMatch(/expectedTotalPaid = addMoney\(currentTotalPaid \|\| 0, paymentAmount\)/);
    const tile = src("components/provider/front-desk/BookingTile.tsx");
    expect(tile).toMatch(/subtractMoney\(bkTotalPaid, bkTotalRefunded\)/);
    expect(tile).toMatch(/addMoney\(Math\.max\(0, subtractMoney\(bkTotalPaid, bkTotalRefunded\)\), bkWallet\)/);
    expect(tile).toMatch(/bkGift/);
  });

  it("adds leftover gateway-fee anomaly total and provider ads budget remaining money with helpers", () => {
    const fees = src("lib/admin/gateway-fee-capture-anomalies.ts");
    expect(fees).toMatch(/expectedTotal = addMoney\(expectedTotal, est\)/);
    const ads = repo("apps/provider/app/(app)/(tabs)/more/settings/ads.tsx");
    expect(ads).toMatch(/subtractMoney\(budget, Number\(c.spent \|\| 0\)\)/);
  });

  it("adds leftover ads auction remaining and attributed spend money with helpers", () => {
    const auction = src("lib/ads/auction.ts");
    expect(auction).toMatch(/subtractMoney\(Number\(c.budget\), Number\(c.spent \?\? 0\)\)/);
    expect(auction).toMatch(/multiplyMoney\(costPerImp, todayImpressions\)/);
    const spend = src("lib/ads/ad-performance-spend.ts");
    expect(spend).toMatch(/multiplyMoney\(prepaid, ov \/ span\)/);
  });

  it("adds leftover subscription MRR bridge and marketing credit balances with helpers", () => {
    const metrics = src("app/api/admin/subscription-metrics/route.ts");
    expect(metrics).toMatch(/startingMrr = addMoney\(startingMrr, rowMrr\)/);
    expect(metrics).toMatch(/subtractMoney\(subtractMoney\(addMoney\(startingMrr, newMrr\), churnedMrr\), mrr\)/);
    const bridge = src("lib/admin/marketplace-health.ts");
    expect(bridge).toMatch(/subtractMoney\(\s*addMoney\(addMoney\(startingMrr, newMrr\), expansionMrr\),/);
    const credits = src("lib/marketing/credits.ts");
    expect(credits).toMatch(/newPurchased = subtractMoney\(purchased, clawed\)/);
    expect(credits).toMatch(/addMoney\(bal.purchased_balance_zar, input.amountZar\)/);
    const estimate = src("app/api/provider/marketing/credits/estimate/route.ts");
    expect(estimate).toMatch(/multiplyMoney\(unitCost, recipients\)/);
    expect(estimate).toMatch(/subtractMoney\(balance.total_zar, estimatedCost\)/);
    const revenue = src("app/api/admin/reports/revenue/route.ts");
    expect(revenue).toMatch(/actual_collected = addMoney\(revenueByDay\[date\].actual_collected, collectedAmount\)/);
    const dispatch = src("lib/marketing/dispatch-campaign.ts");
    expect(dispatch).toMatch(/multiplyMoney\(unitCost, validCustomers.length\)/);
    const automations = src("app/api/provider/automations/execute/route.ts");
    expect(automations).toMatch(/multiplyMoney\(unitCost, customers.length\)/);
  });

  it("adds leftover fee variance collected net and PayCloud charge total with helpers", () => {
    const fees = src("app/api/admin/fees/reconciliations/route.ts");
    expect(fees).toMatch(/subtractMoney\(Number\(actual_fees\), Number\(expected_fees\)\)/);
    const revenue = src("app/api/admin/reports/revenue/route.ts");
    expect(revenue).toMatch(/netCollected: subtractMoney\(totalActualCollected, totalRefunded\)/);
    const trial = src("app/api/admin/finance/trial-balance/route.ts");
    expect(trial).toMatch(/closingBalance = addMoney\(openingBalance, signedBalance/);
    const sheet = repo("apps/provider/src/components/payments/PayCloudPaymentSheet.tsx");
    expect(sheet).toMatch(/addMoney\(addMoney\(amount, parsedTip, currency\), parsedCashback, currency\)/);
    const gateway = src("lib/payments/resolve-gateway-fees.ts");
    expect(gateway).toMatch(/netAmount: subtractMoney\(amountInCurrency, resolved.feesMajor\)/);
    const credits = src("lib/marketing/credits.ts");
    expect(credits).toMatch(/total_zar: addMoney\(included, purchased\)/);
  });

  it("adds leftover group price sums receipt card paid and deposit remaining with helpers", () => {
    const created = src("app/api/public/bookings/_helpers/create-booking-record.ts");
    expect(created).toMatch(/addMoney\(sum, svc \? Number\(svc.price\) : 0\)/);
    const participants = src("app/booking/components/steps/step-group-participants.tsx");
    expect(participants).toMatch(/addMoney\(sum, service\?\.price \|\| 0\)/);
    expect(participants).toMatch(/addMoney\(total, participantTotal\)/);
    const receipt = src("lib/receipts/build-order-receipt.ts");
    expect(receipt).toMatch(/addMoney\(sum, num\(row.amount\)\)/);
    const rollup = src("lib/bookings/group-booking-payment-rollup.ts");
    expect(rollup).toMatch(/subtractMoney\(resolvedDisplayTotal, payment.coverage\)/);
    const checkout = repo("apps/customer/app/(app)/book-checkout.tsx");
    expect(checkout).toMatch(/subtractMoney\(checkoutBaseTotal, depositAmount, currency\)/);
    const tx = repo("apps/provider/app/(app)/(tabs)/more/transactions.tsx");
    expect(tx).toMatch(/multiplyMoney\(t.amount, t.sign \?\? 1\)/);
  });

  it("adds leftover ads period spend payout commission and client total spent with helpers", () => {
    const ads = src("app/api/provider/ads/performance/route.ts");
    expect(ads).toMatch(/multiplyMoney\(budget, 1 \/ pack\)/);
    expect(ads).toMatch(/periodSpent = addMoney\(periodSpent, inc\)/);
    expect(ads).toMatch(/addMoney\(s, x.spent\)/);
    const statements = src("app/api/provider/payouts/statements/route.ts");
    expect(statements).toMatch(/addMoney\(s, Math.max\(0, Number\(r.net \?\? 0\)\)\)/);
    const client = src("app/api/provider/clients/[id]/route.ts");
    expect(client).toMatch(/addMoney\(sum, apt.total_paid \|\| apt.total_amount \|\| 0\)/);
    const exported = src("app/api/admin/export/analytics/route.ts");
    expect(exported).toMatch(/addMoney\(sum, Math.abs\(Number\(t.net \|\| 0\)\)\)/);
  });

  it("derives leftover unit prices and report averages with multiplyMoney", () => {
    const sale = src("lib/provider-booking/build-sale-items-from-booking-detail.ts");
    expect(sale).toMatch(/multiplyMoney\(lineTotal, 1 \/ qty\)/);
    const mobile = repo("apps/provider/src/lib/build-sale-items-from-booking.ts");
    expect(mobile).toMatch(/multiplyMoney\(lineTotal, 1 \/ qty\)/);
    const products = src("app/api/provider/reports/products/sales/route.ts");
    expect(products).toMatch(/multiplyMoney\(revenue, 1 \/ quantity\)/);
    expect(products).toMatch(/multiplyMoney\(totalRevenue, 1 \/ totalProductsSold\)/);
    const payouts = src("app/api/provider/reports/payments/payouts/route.ts");
    expect(payouts).toMatch(/multiplyMoney\(totalPayoutAmount, 1 \/ totalPayouts\)/);
    const methods = src("lib/reports/build-payment-methods-report.ts");
    expect(methods).toMatch(/multiplyMoney\(totalAmount, 1 \/ totalCount\)/);
  });

  it("derives leftover ARPU and average booking value with multiplyMoney", () => {
    const metrics = src("app/api/admin/subscription-metrics/route.ts");
    expect(metrics).toMatch(/multiplyMoney\(mrr, 1 \/ activeTotal\)/);
    expect(metrics).toMatch(/multiplyMoney\(mrr, 1 \/ mrrEligibleCount\)/);
    const geo = src("app/api/admin/analytics/geo/route.ts");
    expect(geo).toMatch(/multiplyMoney\(totalBookingValue, 1 \/ valueRows.length\)/);
    const revenue = src("app/api/provider/reports/revenue/route.ts");
    expect(revenue).toMatch(/multiplyMoney\(ledgerFromBookings, 1 \/ bookingCountWithRevenue\)/);
    const services = src("app/provider/reports/sales/services/page.tsx");
    expect(services).toMatch(/multiplyMoney\(service.revenue, 1 \/ service.bookings\)/);
  });

  it("derives leftover client and overview averages with multiplyMoney", () => {
    const overview = src("app/api/provider/reports/business/overview/route.ts");
    expect(overview).toMatch(/multiplyMoney\(ledgerEarningsFromBookings, 1 \/ bookingsWithEarnings\)/);
    const summary = src("app/api/provider/reports/clients/summary/route.ts");
    expect(summary).toMatch(/multiplyMoney\(totalBookedGross, 1 \/ totalClients, LAST_RESORT_CURRENCY\)/);
    expect(summary).toMatch(/multiplyMoney\(totalLedgerEarnings, 1 \/ totalClients, LAST_RESORT_CURRENCY\)/);
    const clients = src("app/api/provider/reports/clients/route.ts");
    expect(clients).toMatch(/multiplyMoney\(totalBookedGross, 1 \/ totalClients\)/);
    expect(clients).toMatch(/multiplyMoney\(totalLedgerEarnings, 1 \/ totalClients\)/);
  });

  it("derives leftover lifetime-value averages with multiplyMoney", () => {
    const ltv = src("app/api/provider/reports/clients/lifetime-value/route.ts");
    expect(ltv).toMatch(/multiplyMoney\(client.totalSpent, 1 \/ client.totalBookings\)/);
    expect(ltv).toMatch(/multiplyMoney\(totalLedgerEarnings, 1 \/ totalClients\)/);
    expect(ltv).toMatch(/multiplyMoney\(addMoney\(enrichedLTV\[mid\]\?\.totalSpent \?\? 0, enrichedLTV\[mid \+ 1\]\?\.totalSpent \?\? 0\), 1 \/ 2\)/);
    expect(ltv).toMatch(/multiplyMoney\(averageLTV, 1\.5\)/);
  });

  it("subtracts leftover revenue growth deltas with subtractMoney", () => {
    const growth = repo("packages/utils/src/reports/growth-display.ts");
    expect(growth).toMatch(/subtractMoney\(current, previous\) \/ previous/);
    const trends = src("app/api/provider/reports/sales/trends/route.ts");
    expect(trends).toMatch(/subtractMoney\(current.revenue, previous.revenue\)/);
    const summary = src("app/api/provider/reports/sales/summary/route.ts");
    expect(summary).toMatch(/subtractMoney\(totalRevenue, prevRevenue\)/);
    const dash = src("lib/server/provider/get-provider-dashboard.ts");
    expect(dash).toMatch(/subtractMoney\(revenueThisMonth, revenueLastMonth\)/);
  });

  it("adds leftover report revenue maps and refund-cap rails with helpers", () => {
    const noshows = src("app/api/provider/reports/bookings/no-shows/route.ts");
    expect(noshows).toMatch(/ledger_earnings = addMoney\(existing.ledger_earnings/);
    const summary = src("app/api/provider/reports/bookings/summary/route.ts");
    expect(summary).toMatch(/addMoney\(statusRevenue\[status\] \|\| 0, bookingRevenue\)/);
    expect(summary).toMatch(/addMoney\(sourceRevenue\[source\] \|\| 0, bookingRevenue\)/);
    const analytics = src("app/api/provider/analytics/route.ts");
    expect(analytics).toMatch(/subtractMoney\(thisMonthRevenue, lastMonthRevenue\)/);
    const comparison = src("app/api/provider/reports/business/comparison/route.ts");
    expect(comparison).toMatch(/subtractMoney\(currentRevenue, previousRevenue\)/);
    expect(comparison).toMatch(/multiplyMoney\(ledgerBookings, 1 \/ count\)/);
    const ads = src("app/api/provider/ads/campaigns/[id]/route.ts");
    expect(ads).toMatch(/subtractMoney\(budget, spent\)/);
    const caps = src("lib/bookings/booking-refund-limits.ts");
    expect(caps).toMatch(/onlineRefunded = addMoney\(onlineRefunded, amt\)/);
    expect(caps).toMatch(/inPersonRefunded = addMoney\(inPersonRefunded, amt\)/);
  });

  it("multiplies leftover signed amounts and report averages with multiplyMoney", () => {
    const bookings = src("app/api/admin/reports/bookings/route.ts");
    expect(bookings).toMatch(/multiplyMoney\(completedGmv, 1 \/ completed\)/);
    const payments = src("app/api/provider/reports/payments/summary/route.ts");
    expect(payments).toMatch(/multiplyMoney\(gmv, 1 \/ totalPayments\)/);
    const create = src("components/provider/booking/create/AppointmentCreateFlow.tsx");
    expect(create).toMatch(/multiplyMoney\(tipBase, pct\)/);
    const checkout = src("lib/bookings/checkout-bill-adjustment.ts");
    expect(checkout).toMatch(/multiplyMoney\(Math.max\(0, Number\(input.checkoutTip\) \|\| 0\), sign\)/);
    const feed = src("lib/provider/provider-transactions-feed.ts");
    expect(feed).toMatch(/multiplyMoney\(row.amount, -1\)/);
    expect(feed).toMatch(/multiplyMoney\(row.amount, row.sign \?\? 1\)/);
    const finance = src("app/provider/finance/page.tsx");
    expect(finance).toMatch(/multiplyMoney\(financePageLedgerDisplayAbs\(t\), sign\)/);
    const activity = src("lib/provider/build-provider-activity-feed.ts");
    expect(activity).toMatch(/multiplyMoney\(Math.abs\(rawNet\), sign\)/);
    const loyalty = src("app/api/me/loyalty-points/route.ts");
    expect(loyalty).toMatch(/multiplyMoney\(available_balance, 1 \/ redemption_rate\)/);
  });
});
