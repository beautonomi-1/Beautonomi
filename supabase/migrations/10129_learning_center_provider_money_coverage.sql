-- 10129: Learning Center — provider money & policy coverage (fact-checked; see docs/learning/FACT_LEDGER.md)
-- Per-claim evidence for this migration: docs/learning/_ledger_provider_money.md
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, v.title, v.slug, v.summary, v.body, 'html', 'published', 'provider', false, NOW()
FROM (VALUES

  -- 1. Cancellation policy presets
  ('policies',
   'Cancellation policy presets and late-cancel fees',
   'provider-cancellation-policy-presets',
   'The four onboarding presets (No penalty, Flexible, Standard, Strict) create your first cancellation policy. After onboarding you edit the cutoff, late refund percentage and fee directly under Cancellation policies.',
   $b$<p>When you set up your business on Beautonomi you choose a cancellation preset. The preset creates your first default cancellation policy, which you can change at any time afterwards. Whatever policy applies, money refunded to a customer is credited to the customer's Beautonomi wallet.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="More → Settings → Cancellation policies &amp; fees"></div>
<ul>
  <li><strong>In the app:</strong> More → Settings → <strong>Cancellation policies &amp; fees</strong>. You can also open More → Settings &amp; account → Clients → <strong>Cancellation policies</strong>.</li>
  <li><strong>On the web:</strong> <strong>Settings</strong> in the sidebar → Clients → <strong>Cancellation Policies</strong> (/provider/settings/cancellation-policies).</li>
</ul>
<h2>How it works</h2>
<p>These are the four presets offered during onboarding. If you skip the choice, <strong>Standard</strong> is used.</p>
<table>
  <thead><tr><th>Preset</th><th>Free cancellation until</th><th>Grace period</th><th>Refund for a late cancellation</th><th>Extra protection</th></tr></thead>
  <tbody>
    <tr><td>No penalty</td><td>Any time</td><td>None</td><td>100%</td><td>None</td></tr>
    <tr><td>Flexible</td><td>4 hours before</td><td>15 minutes</td><td>50%</td><td>None</td></tr>
    <tr><td>Standard</td><td>24 hours before</td><td>15 minutes</td><td>50%</td><td>None</td></tr>
    <tr><td>Strict</td><td>48 hours before</td><td>15 minutes</td><td>0%</td><td>50% deposit, and the no-show fee is switched on</td></tr>
  </tbody>
</table>
<p>After onboarding there is no preset picker. Instead you edit the policy itself:</p>
<ol>
  <li>Open <strong>Cancellation Policies</strong> and tap <strong>Edit</strong> on a policy, or use <strong>Add Policy</strong>.</li>
  <li>Set <strong>Hours Before Appointment</strong>. Cancellations closer to the appointment than this count as late.</li>
  <li>Set <strong>Refund Percentage</strong>, which is how much of what the client paid is refunded for a late cancellation.</li>
  <li>If the refund is 0%, choose a <strong>Fee Type</strong> (Fixed or Percentage) and a <strong>Fee Amount</strong>. The fee amount is only used when the refund is 0%.</li>
  <li>Choose what the policy <strong>Applies to</strong> (in-salon, at-home, or all), turn on <strong>Set as Default Policy</strong> if needed, and save.</li>
</ol>
<h2>Good to know</h2>
<ul>
  <li>Late-cancellation fees only apply to the service amount the customer paid online. Tips are always returned, and cash or card-machine payments are never charged a fee.</li>
  <li>If you or your team cancel, no policy fee is kept. The customer gets a full refund to their wallet.</li>
  <li>Every booking saves a copy of the policy at the time it was made. If you change your policy later, each existing booking uses whichever value is kinder to the customer: the shorter cutoff, the longer grace period, the higher refund and the lower fee.</li>
  <li>The Strict preset turns the no-show fee on with an amount of 0, so set an amount yourself. In the app, tap the banner <strong>No-show fees are configured under Payment Settings.</strong> on the Cancellation Policies screen, then use <strong>Charge no-show fee</strong> and <strong>No-show fee amount</strong>. The fee is taken only from what the client has already paid online, up to that amount.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-reschedule-cancellation-settlement">Reschedules and cancellation settlement</a></li>
  <li><a href="/learn/article/policies-overview">Policies overview</a></li>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
  <li><a href="/learn/article/canceling-your-booking">Canceling a booking</a></li>
  <li><a href="/learn/article/if-provider-cancels">If the provider cancels</a></li>
</ul>$b$),

  -- 2. Reschedule carry-over and cancellation settlement
  ('policies',
   'Reschedules and cancellation settlement: where the money goes',
   'provider-reschedule-cancellation-settlement',
   'When a customer reschedules through checkout, the original booking stays active until the new one is paid, then its online payment moves across as wallet credit with no fee. This article also explains how tips, gift cards, cash and card-machine money are handled when a booking is cancelled.',
   $b$<p>Cancelling or rescheduling a booking triggers a settlement step. Beautonomi works out the refund, any cancellation fee you keep, and what happens to tips, gift cards, loyalty points and in-person money. Online refunds to customers always go to the customer's Beautonomi wallet.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Refunds, fees and reversals appear in your Finance ledger"></div>
<ul>
  <li><strong>In the app:</strong> More → Business → <strong>Money</strong>, then the <strong>Ledger</strong> tab shows refunds and cancellation fees. Your rules live under More → Settings → <strong>Cancellation policies &amp; fees</strong>.</li>
  <li><strong>On the web:</strong> <strong>Finance</strong> in the sidebar (/provider/finance). Rules are under Settings → Clients → <strong>Cancellation Policies</strong> (/provider/settings/cancellation-policies).</li>
</ul>
<h2>How it works</h2>
<h3>Rescheduling through checkout (carry-over)</h3>
<ol>
  <li>The customer picks a new time and goes through checkout. Their original booking stays active in the meantime. Customers see: "This booking is being replaced by your reschedule."</li>
  <li>Once the new booking is paid, or confirmed as a cash booking, the original is cancelled with the reason "Rescheduled to new time" and a full, fee-free refund to the customer's wallet.</li>
  <li>The part of that credit used by the new booking is moved onto it. Anything above the new amount due stays in the customer's wallet.</li>
  <li>Package sessions are restored to the customer, promo-code use moves off the old booking, and waitlist matching runs for the freed slot.</li>
</ol>
<p>A booking paid in person can't be rescheduled this way. The customer is asked to reschedule from the booking page so the payment stays on the same appointment, or to ask you to refund the in-person amount first. Group bookings are rescheduled from the group.</p>
<h3>Cancellation settlement</h3>
<ul>
  <li><strong>Tips</strong> are always returned. Any fee is worked out on the service amount only.</li>
  <li><strong>Who cancelled matters:</strong> if you, your team or Beautonomi cancel, no policy fee is kept. A no-show is charged only your no-show fee.</li>
  <li><strong>Fee cap:</strong> the fee can never be more than the customer actually paid online. For deposit-only bookings that means the deposit at most.</li>
  <li><strong>Gift cards:</strong> on a full refund the redemption is cancelled and the value returns to the gift card. On a partial refund the gift card stays used and its share is credited to the customer's wallet.</li>
  <li><strong>Loyalty points:</strong> points the customer redeemed are restored and points they earned are reversed.</li>
  <li><strong>Your fee:</strong> the cancellation fee you keep appears in your ledger. If <strong>Share cancellation fees with staff</strong> is on in Commissions, the assigned staff member earns commission on it.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>Cash and card-machine money is not moved automatically. If a card-machine payment needs refunding, refund it on the machine. Yoco refunds are always done on the Yoco device.</li>
  <li>If a customer paid cash and is owed some of it back, that cash refund is your responsibility and is not added to their wallet credit.</li>
  <li>If the wallet credit fails, Beautonomi retries it automatically, so a cancellation can show as settled a little later.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-cancellation-policy-presets">Cancellation policy presets and late-cancel fees</a></li>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
  <li><a href="/learn/article/if-provider-cancels">If the provider cancels</a></li>
  <li><a href="/learn/article/understanding-earnings">Understanding your earnings</a></li>
  <li><a href="/learn/article/provider-team-commissions-tips">Team commissions and tip distribution</a></li>
</ul>$b$),

  -- 3. Payout accounts and cooling-off
  ('payouts-earnings',
   'Payout accounts and the new-account security hold',
   'provider-payout-accounts-cooling-off',
   'How to add, verify and choose a payout account, and why a newly added account can be on a short security hold before it receives payouts. Covers the alerts you get and the rules for removing accounts.',
   $b$<p>Your payout account is where Beautonomi sends the money you request from your available balance. Because bank details are a common target for fraud, adding or changing a payout account comes with extra checks and alerts.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Payout accounts and payout requests"></div>
<ul>
  <li><strong>In the app:</strong> More → Business → <strong>Payment setup</strong> → <strong>Payout bank accounts</strong>. You can also use the <strong>Bank accounts</strong> quick action on the More tab, or More → Settings &amp; account → Sales → <strong>Payout accounts</strong>.</li>
  <li><strong>On the web:</strong> <strong>Bank Accounts</strong> in the sidebar (/provider/settings/payout-accounts), or Settings → Sales → <strong>Payout Accounts</strong>.</li>
</ul>
<h2>Step by step</h2>
<ol>
  <li>Open payout accounts and add a new account. In markets that pay out through a bank list, choose your bank and enter the account number (8 to 20 digits).</li>
  <li>Optionally tap <strong>Verify Account (optional)</strong> to check the account details with the bank before saving.</li>
  <li>If you have more than one account, use <strong>Set Primary</strong> to choose the default.</li>
  <li>In markets that use <strong>Stripe Connect</strong>, you connect with Stripe instead and add your bank on Stripe's secure onboarding page.</li>
</ol>
<h2>How it works</h2>
<ul>
  <li><strong>Confirm it's you:</strong> depending on your security settings you may be asked to confirm your identity before saving. On a device you only just started using, bank changes can be blocked for a while: "For your security, bank and team changes are temporarily unavailable on this device."</li>
  <li><strong>Alerts:</strong> the business owner, and the team member who made the change, get a security alert (for example "Payout account added") by push and email. If you didn't make the change, contact support immediately.</li>
  <li><strong>Security hold:</strong> a newly added account can be put on a hold (a cooling-off period) set by Beautonomi. Depending on platform settings, your very first account is usually exempt, extra accounts are held, and accounts added by Beautonomi staff on your behalf are held. While an account is on hold, payouts go to another active account. If you pick the held account you'll see: "This bank account was added recently. For your security it can receive payouts once the hold ends."</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>The account currency must match your payout currency.</li>
  <li>You can't delete your only payout account. Add another account before removing your only payout account.</li>
  <li>Only people with the Edit settings permission can manage payout accounts. Payment setup is hidden for team members without it.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-payout-bank-accounts">Payout bank accounts on the web</a></li>
  <li><a href="/learn/article/request-payout">Request a payout</a></li>
  <li><a href="/learn/article/provider-payout-rails-available-balance">Payout rails and your available balance</a></li>
  <li><a href="/learn/article/payouts-earnings-overview">Payouts and earnings overview</a></li>
</ul>$b$),

  -- 4. Payout rails and available balance
  ('payouts-earnings',
   'Payout rails and what counts toward your available balance',
   'provider-payout-rails-available-balance',
   'Your market decides whether payouts go through Paystack, Stripe Connect or Flutterwave. Only money Beautonomi actually holds (online card, wallet and gift-card payments) counts toward the balance you can withdraw.',
   $b$<p>Your available balance is the money Beautonomi is holding for you and can pay out. It is not the same as your total sales: money you collected yourself, such as cash or card-machine payments, is already in your hands and is never part of it.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Money → Payouts and the Provider payouts card"></div>
<ul>
  <li><strong>In the app:</strong> More → Business → <strong>Money</strong> → <strong>Payouts</strong> tab, or the <strong>Provider payouts</strong> card on the More tab ("All-time available to withdraw").</li>
  <li><strong>On the web:</strong> <strong>Finance</strong> in the sidebar (/provider/finance?tab=payouts), or Settings → Sales → <strong>Payout center</strong> (/provider/payouts).</li>
</ul>
<h2>How it works</h2>
<h3>Payout rails</h3>
<p>The payout rail comes from the payment provider used in your market. You don't choose it yourself.</p>
<ul>
  <li><strong>Paystack:</strong> payouts go to a bank account you add from the bank list.</li>
  <li><strong>Stripe:</strong> you complete <strong>Stripe Connect</strong> onboarding, and payouts need card payments and payouts enabled on your Stripe account. Until then the button reads "Complete Stripe Connect payout setup first".</li>
  <li><strong>Flutterwave:</strong> payouts go to a bank account from the Flutterwave bank list, where available.</li>
</ul>
<h3>What counts</h3>
<table>
  <thead><tr><th>How the customer paid</th><th>Counts toward available balance?</th></tr></thead>
  <tbody>
    <tr><td>Online card through Paystack, Stripe or Flutterwave (including Paystack walk-in payments)</td><td>Yes</td></tr>
    <tr><td>Beautonomi wallet credit</td><td>Yes</td></tr>
    <tr><td>Beautonomi gift card</td><td>Yes</td></tr>
    <tr><td>Paystack Terminal (QR or link)</td><td>Yes, after the payment is allocated</td></tr>
    <tr><td>Cash, Yoco, card machines, bank transfer or manual card</td><td>No, you already collected it</td></tr>
  </tbody>
</table>
<p>From the qualifying money, Beautonomi subtracts refunds, completed payouts, payout requests still pending, and any open payment disputes. Earnings still inside the platform's payout hold window, if one is set, are shown as on hold until they are released. Tips, travel fees and cancellation fees from qualifying payments count too.</p>
<h2>Good to know</h2>
<ul>
  <li>Your subscription and ad purchases are charged to your card. They are not taken from your payout balance.</li>
  <li>A payout can be blocked if your account is under review ("Payouts are temporarily on hold while we review your account"), if your balance is negative after refunds, or if you ask for more than is available.</li>
  <li>The minimum payout amount is set by Beautonomi for your market and appears on the payout card as "Min …".</li>
  <li>Reports that include cash and card-machine sales will show more than your available balance. That is expected.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/understanding-earnings">Understanding your earnings</a></li>
  <li><a href="/learn/article/request-payout">Request a payout</a></li>
  <li><a href="/learn/article/provider-payout-accounts-cooling-off">Payout accounts and the new-account security hold</a></li>
  <li><a href="/learn/article/walk-in-addons-payout">Walk-in add-ons and your payout</a></li>
  <li><a href="/learn/article/provider-web-finance-payouts">Finance and payouts on the web</a></li>
</ul>$b$),

  -- 5. Subscription and billing
  ('pricing-subscriptions',
   'Subscription billing: App Store, Paystack and plan changes',
   'provider-subscription-billing-ios',
   'On iPhone your Beautonomi plan is billed through Apple, while Android and the web use Beautonomi checkout. This article covers cancelling, scheduled downgrades, finishing a pending upgrade, and where to see invoices.',
   $b$<p>Your Beautonomi subscription is the plan for your business account. It is separate from the memberships you sell to customers. How you are billed depends on where you subscribed, and you should always manage the plan in the same place to avoid being charged twice.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Subscription and billing"></div>
<ul>
  <li><strong>In the app:</strong> the <strong>Subscription</strong> quick action on the More tab, or More → Settings &amp; account → Account → <strong>Subscription &amp; plan</strong>. Invoices are under More → Business → <strong>Billing</strong>, which has the tabs Plan, Invoices, Bills paid and VAT.</li>
  <li><strong>On the web:</strong> <strong>Subscription</strong> in the sidebar (/provider/subscription), or Settings → Sales → <strong>Subscription &amp; plan</strong>. Invoices are under Settings → Appointment Activity → <strong>Billing details and invoices</strong> (/provider/settings/billing).</li>
</ul>
<h2>How it works</h2>
<h3>Billing channels</h3>
<ul>
  <li><strong>iPhone app:</strong> plans are auto-renewable in-app purchases marked <strong>Billed through Apple</strong>. Use <strong>Restore App Store purchases</strong> if your plan doesn't show, and <strong>Redeem App Store offer code</strong> for Apple offer codes.</li>
  <li><strong>Android and web:</strong> plans are paid through Beautonomi checkout. Plans <strong>Billed through Stripe</strong> have a <strong>Manage billing</strong> portal for cards and invoices.</li>
  <li>If you subscribed on one channel and open another, you'll be told where to manage the plan, for example: "This subscription is billed on Android or the website. Manage it there so you are not charged twice."</li>
</ul>
<h3>Cancelling</h3>
<ul>
  <li><strong>Apple:</strong> cancel at least 24 hours before the period ends, in Apple ID → Subscriptions. You keep access until the current period ends.</li>
  <li><strong>Web or Android:</strong> your plan stays active until the end of the current billing period, and you can renew anytime before it expires.</li>
</ul>
<h3>Changing plans</h3>
<ul>
  <li><strong>Downgrades</strong> between paid plans take effect at the end of the current period, without a partial refund. You'll see "Plan change scheduled. Changes on …".</li>
  <li><strong>Pending upgrades:</strong> if you chose a higher plan but didn't finish paying, the plan page shows <strong>Finish upgrade to …</strong> with the plan name. Your current plan stays as it is until you pay.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>Prices depend on your region and on whether you pick Monthly or Yearly. Compare them on the plan page.</li>
  <li>Invoices show their status (paid, partially paid or overdue), and you're notified about overdue invoices.</li>
  <li>Billing in the app is available to the owner and to team members with finance or settings permissions.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-subscription-plan">Provider web subscription and plan management</a></li>
  <li><a href="/learn/article/pricing-subscriptions-overview">Pricing and subscriptions overview</a></li>
  <li><a href="/learn/article/provider-platform-fees-commission">Platform fees and commission</a></li>
  <li><a href="/learn/article/provider-web-packages-memberships">Packages and memberships on the web</a></li>
</ul>$b$),

  -- 6. Platform fees and commission
  ('payments-checkout-provider',
   'Platform fees and commission: what comes out of your earnings',
   'provider-platform-fees-commission',
   'The platform service fee is paid by the customer at checkout and doesn''t reduce your price. Commission applies only when Beautonomi switches it on for your market, and only to payments Beautonomi processes.',
   $b$<p>Two different things are often called "fees": the platform service fee that customers pay at checkout, and commission that may be deducted from your earnings. They work very differently, and neither applies to money you collect yourself.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Money → Ledger shows each fee and commission line"></div>
<ul>
  <li><strong>In the app:</strong> More → Business → <strong>Money</strong> → <strong>Ledger</strong> tab lists earnings, commission, tips, travel fees and refunds per booking.</li>
  <li><strong>On the web:</strong> <strong>Finance</strong> in the sidebar (/provider/finance).</li>
</ul>
<h2>How it works</h2>
<h3>Platform service fee</h3>
<ul>
  <li>The customer pays it at checkout and Beautonomi keeps it. It is added on top of your price, so it is not taken from your earnings.</li>
  <li>It isn't charged on bookings you or your team create yourselves, on walk-ins, or on payments made in cash or on card machines.</li>
</ul>
<h3>Commission</h3>
<ul>
  <li>Commission is off unless Beautonomi switches it on. The rate is set by Beautonomi, and your business can have its own agreed rate.</li>
  <li>The rate in force when a booking is made is saved on that booking, so later rate changes don't affect existing bookings.</li>
  <li>It applies only to money Beautonomi processes: online card payments, customer wallet credit and gift cards. Cash, Yoco and card-machine payments carry no commission.</li>
  <li>Tips carry no commission. Travel fees are posted to you in full, and VAT is passed through and excluded from commission.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>Provider invoices are for your subscription, transaction fees, and other charges. Platform fees and commission are not invoiced to you; they are settled at checkout.</li>
  <li>Because rates are set per market and can change, Beautonomi doesn't publish a fixed percentage here. Check the Ledger to see what was applied to each booking.</li>
  <li>Promo-code discounts you create reduce what you collect on the bookings they cover.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/understanding-earnings">Understanding your earnings</a></li>
  <li><a href="/learn/article/provider-payout-rails-available-balance">Payout rails and your available balance</a></li>
  <li><a href="/learn/article/provider-taxes-vat">Taxes and VAT settings</a></li>
  <li><a href="/learn/article/payments-checkout-provider-overview">Payments and checkout overview</a></li>
</ul>$b$),

  -- 7. Taxes and VAT
  ('payments-checkout-provider',
   'Taxes and VAT settings',
   'provider-taxes-vat',
   'Register as a VAT vendor with your SARS VAT number, choose whether your prices already include VAT, and let Beautonomi apply your country''s rate automatically. VAT is passed through and never counted toward commission.',
   $b$<p>If your business is VAT registered, Beautonomi adds or includes VAT on your bookings and product sales, prints it on receipts, and keeps it out of commission. VAT registration with a SARS number is for South African businesses. Other tax setups depend on what is available in your market.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Settings → Sales → Taxes"></div>
<ul>
  <li><strong>In the app:</strong> More → Settings &amp; account → Sales → <strong>Taxes</strong>. Your VAT summary is on More → Business → <strong>Billing</strong> → <strong>VAT</strong> tab.</li>
  <li><strong>On the web:</strong> <strong>Settings</strong> in the sidebar → Sales → <strong>Taxes</strong> (/provider/settings/sales/taxes). The page is titled Taxes &amp; VAT.</li>
</ul>
<h2>Step by step</h2>
<ol>
  <li>Tick <strong>I am VAT registered with SARS</strong>.</li>
  <li>Enter your <strong>VAT Number (SARS)</strong>. It must be 10 digits and start with 4.</li>
  <li>Leave <strong>Prices include VAT</strong> on if your listed prices already include VAT. Turn it off if VAT should be added at checkout.</li>
  <li>Save. The <strong>Tax Rate</strong> field is filled in automatically and can't be edited.</li>
</ol>
<h2>How it works</h2>
<ul>
  <li>The rate comes from the VAT rate Beautonomi has configured for your country. If no rate is configured, registration is not saved and you'll see a message saying so.</li>
  <li>If you are not VAT registered, your tax rate is 0 and no VAT is charged.</li>
  <li>Each booking and product order saves your VAT number and whether prices included VAT at the time, so later changes don't alter past sales.</li>
  <li>When a customer is refunded, the VAT on that refund is reversed in proportion.</li>
  <li>Receipts show the tax amount and tax rate.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>Unticking VAT registration sets your rate to 0 and clears your VAT number.</li>
  <li>Tax is a pass-through amount and is excluded from platform commission.</li>
  <li>PAYE and UIF for staff are handled in Payroll, not here.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-receipts-template-numbering">Receipt template and numbering</a></li>
  <li><a href="/learn/article/provider-platform-fees-commission">Platform fees and commission</a></li>
  <li><a href="/learn/article/provider-payroll-pay-runs">Payroll pay runs, PAYE/UIF and payslips</a></li>
  <li><a href="/learn/article/payments-checkout-provider-overview">Payments and checkout overview</a></li>
</ul>$b$),

  -- 8. Payroll (South Africa)
  ('staff-permissions',
   'Payroll pay runs, PAYE/UIF and payslips (South Africa)',
   'provider-payroll-pay-runs',
   'Where available, salon owners can run pay runs that calculate staff pay, PAYE and UIF, then approve them, mark them as paid and issue payslips. Payroll is separate from your Beautonomi payouts.',
   $b$<p>Payroll turns your staff pay models and commissions into pay runs. Where available, PAYE and UIF are worked out automatically using South African tax rules. Payroll records what you owe your team; you pay your staff yourself, separately from your Beautonomi payouts. For setting up commission rules first, see <a href="/learn/article/provider-commissions-payroll">Commissions and payroll</a>.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-team" data-caption="Team → Payroll"></div>
<ul>
  <li><strong>In the app:</strong> More → Business → <strong>Team &amp; pay</strong> → <strong>Payroll</strong> tab. The same hub has <strong>Team totals</strong> and <strong>My earnings</strong>.</li>
  <li><strong>On the web:</strong> <strong>Payroll</strong> in the sidebar (/provider/team/payroll), or Settings → Team → <strong>Payroll</strong>. Staff see their own pay under <strong>My Earnings</strong>.</li>
</ul>
<h2>Step by step</h2>
<ol>
  <li>Select <strong>New Pay Run</strong> and choose the period type: weekly, bi-weekly, semi-monthly, monthly, or a custom range.</li>
  <li>Review each staff line. Add manual deductions if needed and save the draft line items.</li>
  <li>Check any compliance warnings. If a staff member's pay for the period is below the minimum wage, a <strong>Suggested top-up</strong> amount is shown.</li>
  <li>Select <strong>Approve</strong>. Payslips become available once a run is approved.</li>
  <li>After paying your team, select <strong>Mark as Paid</strong>. Use <strong>Export CSV</strong> for your accountant or bank.</li>
</ol>
<h2>How it works</h2>
<ul>
  <li>Each staff member's <strong>Statutory deductions (PAYE / UIF)</strong> setting is Auto, Manual or None. Set it in Commissions.</li>
  <li>Booth renters are not included in pay runs.</li>
  <li>A shortfall is carried forward into the next run, and commission on refunded bookings can be clawed back.</li>
  <li>Payslips open as a printable page that you can save as a PDF. Staff can only open their own payslip.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>Payroll is for salon accounts. Freelancers see "Upgrade to a salon account to run payroll and team pay."</li>
  <li>Only the owner and team members with the Manage payroll permission can run payroll. Everyone else sees only My earnings.</li>
  <li>Tax tables are maintained by Beautonomi. Check figures with your accountant before filing.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-commissions-payroll">Commissions and payroll</a></li>
  <li><a href="/learn/article/provider-team-commissions-tips">Team commissions and tip distribution</a></li>
  <li><a href="/learn/article/provider-web-staff-permissions">Staff permissions on the web</a></li>
  <li><a href="/learn/article/staff-permissions-overview">Staff and permissions overview</a></li>
</ul>$b$),

  -- 9. Team commissions and tips
  ('staff-permissions',
   'Team commissions and tip distribution',
   'provider-team-commissions-tips',
   'Set service and product commission rates, tiered commission and pay models for each team member, and decide whether tips stay with the business or go to the staff member on the booking.',
   $b$<p>Commissions decide how much of each sale a team member earns. Tip settings decide who keeps tips. Both feed into Payroll and into each person's My earnings view.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-team" data-caption="Commissions &amp; Compensation"></div>
<ul>
  <li><strong>In the app:</strong> More → Settings &amp; account → Team → <strong>Commissions</strong>. For tips, use More → Settings &amp; account → Sales → <strong>Tips</strong> and <strong>Tips distribution</strong>.</li>
  <li><strong>On the web:</strong> Settings → Team → <strong>Commissions</strong> (/provider/settings/team/commissions), Settings → Sales → <strong>Tips</strong> (/provider/settings/sales/tips) and <strong>Tips Distribution</strong> (/provider/settings/tips/distribution).</li>
</ul>
<h2>How it works</h2>
<h3>Commissions &amp; Compensation</h3>
<ul>
  <li>Work through the <strong>Commission setup checklist</strong>, then turn on <strong>Enable Commission</strong> and set the service and product commission rates.</li>
  <li>Optionally use <strong>Tiered Commission</strong>. In Retroactive mode the reached tier's rate applies to all sales; in Marginal mode each tier's rate applies only to sales within that tier.</li>
  <li>Choose each person's pay model: commission only, base salary plus commission, higher of base or commission, commission above a threshold, hourly, hourly plus commission, salary, or booth renter.</li>
  <li>Set the employment type (employee, contractor or apprentice) and the <strong>Statutory deductions (PAYE / UIF)</strong> mode used by Payroll.</li>
  <li>Turn on <strong>Share cancellation fees with staff</strong> if staff should earn commission on late-cancellation fees you keep.</li>
</ul>
<h3>Tips</h3>
<ul>
  <li>Tips are on by default for every provider. You can manage tips at checkout and their presets under Tips.</li>
  <li>Solo providers keep tips by default. Salons choose <strong>Keep All Tips</strong> or <strong>Distribute Tips to Staff</strong>, which gives each tip to the staff member assigned to the booking.</li>
  <li>Changing the distribution only affects future bookings.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>Only people with the Manage payroll permission can change pay models and rates.</li>
  <li>Tips never carry platform commission, and they are always returned to the customer if a booking is cancelled.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-commissions-payroll">Commissions and payroll</a></li>
  <li><a href="/learn/article/provider-payroll-pay-runs">Payroll pay runs, PAYE/UIF and payslips</a></li>
  <li><a href="/learn/article/provider-web-staff-permissions">Staff permissions on the web</a></li>
  <li><a href="/learn/article/staff-permissions-overview">Staff and permissions overview</a></li>
</ul>$b$),

  -- 10. Tiered travel fees
  ('locations-service-areas',
   'Travel fees for house calls: per kilometre and distance tiers',
   'provider-travel-fees-tiered',
   'Charge at-home customers either a per-kilometre rate or a fee per distance band, measured from your nearest active location. You can also use the platform default rates and check the result with the live preview.',
   $b$<p>Travel fees are added to at-home (house call) bookings. Beautonomi measures the distance from your nearest active location to the customer's address and applies your fee rules, or the platform defaults if you prefer.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-mobile-house-calls" data-caption="Travel fees for at-home bookings"></div>
<ul>
  <li><strong>In the app:</strong> More → Settings → <strong>Travel fees</strong>, or More → Settings &amp; account → Sales → <strong>Travel fees</strong>.</li>
  <li><strong>On the web:</strong> Settings → Sales → <strong>Travel Fees</strong> (/provider/settings/sales/travel-fees). The same page opens from Settings → Appointment Activity → <strong>House calls &amp; travel</strong>.</li>
</ul>
<h2>Step by step</h2>
<ol>
  <li>Turn on <strong>Enable Travel Fees</strong>.</li>
  <li>Either keep <strong>Use Platform Default Rates</strong>, or turn it off to set your own.</li>
  <li>Choose a <strong>Pricing model</strong>:
    <ul>
      <li><strong>Per kilometer:</strong> a rate per km with a minimum fee, an optional maximum, and an optional free distance.</li>
      <li><strong>Distance tiers:</strong> use <strong>Add tier</strong> to set bands, each with a maximum distance and a fee, in increasing order.</li>
    </ul>
  </li>
  <li>Use the <strong>Live travel-fee preview</strong> to check the fee for a sample distance, then save.</li>
</ol>
<h2>How it works</h2>
<ul>
  <li>No travel fee or at-home booking is possible unless you offer house calls and have at least one active location.</li>
  <li>Distance is the driving distance from your nearest active location. If driving distance can't be worked out, a straight-line distance is used.</li>
  <li>The address must fall inside one of your service zones and within your maximum service distance. Otherwise the customer is told it's outside your service area.</li>
  <li>With distance tiers, an address beyond your last tier is treated as outside your service area.</li>
  <li>If a service zone has its own travel fee set, that fee is used instead of the calculated one.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>If you see "Provider customization is currently disabled by the platform. You must use the platform default rates.", the platform defaults apply for now.</li>
  <li>Travel fees are posted to you in full. When paid online they count toward your available balance.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/at-home-services-overview">At-home services overview</a></li>
  <li><a href="/learn/article/locations-service-areas-overview">Locations and service areas overview</a></li>
  <li><a href="/learn/article/provider-payout-rails-available-balance">Payout rails and your available balance</a></li>
  <li><a href="/learn/article/provider-platform-fees-commission">Platform fees and commission</a></li>
</ul>$b$),

  -- 11. Receipts
  ('payments-checkout-provider',
   'Receipt template and numbering',
   'provider-receipts-template-numbering',
   'Add your own header and footer to customer receipts and set a receipt prefix and starting number. Booking receipts are numbered with the booking number, and your prefix and number are used only as a fallback.',
   $b$<p>Receipts give customers a record of what they paid, including tax. You can brand them with your own header and footer text and set how fallback receipt numbers look.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Settings → Sales → Receipt Template"></div>
<ul>
  <li><strong>In the app:</strong> More → Settings &amp; account → Sales → <strong>Receipt template</strong> or <strong>Receipt sequencing</strong>.</li>
  <li><strong>On the web:</strong> Settings → Sales → <strong>Receipt Template</strong> (/provider/settings/sales/receipt-template) or <strong>Receipt Sequencing</strong> (/provider/settings/sales/receipt-sequencing).</li>
</ul>
<h2>Step by step</h2>
<ol>
  <li>In Receipt Template, add a <strong>Header</strong>, such as your business name and contact details, and a <strong>Footer</strong>, such as a thank-you note or your returns policy.</li>
  <li>Under numbering, set a <strong>Prefix</strong> (the default is REC) and the next number, which must be 1 or higher.</li>
  <li>Check the preview. Numbers look like REC-00001.</li>
  <li>Save. Receipt Sequencing edits the same <strong>Receipt Prefix</strong> and <strong>Starting Number</strong>, so changing either page updates both.</li>
</ol>
<h2>How it works</h2>
<ul>
  <li>Booking receipts use the booking number as the receipt number. Your prefix and number are only used if a booking has no booking number.</li>
  <li>Receipts print your header and footer, and show the tax amount and tax rate when VAT applies.</li>
  <li>The platform sets maximum lengths for the prefix, header and footer. The form tells you if you go over.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>Keep footer text short and factual. Customers see it on every receipt.</li>
  <li>VAT details on receipts come from your Taxes settings.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-taxes-vat">Taxes and VAT settings</a></li>
  <li><a href="/learn/article/provider-web-locations-receipts">Locations and receipts on the web</a></li>
  <li><a href="/learn/article/payments-checkout-provider-overview">Payments and checkout overview</a></li>
</ul>$b$),

  -- 12. Gift cards and promo codes
  ('marketing-automations',
   'Gift cards and promo codes',
   'provider-gift-cards-promo-codes',
   'Accept Beautonomi gift cards at your business if your plan includes them, and create your own promo codes with limits such as total uses, a minimum booking amount and one use per client.',
   $b$<p>Gift cards and promo codes both reduce what a customer pays at checkout, but they work differently. Gift cards are sold by Beautonomi and spent at your business. Promo codes are discounts you create and fund yourself.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="More → Payment setup → Gift cards and Grow your business → Promo codes"></div>
<ul>
  <li><strong>In the app:</strong> gift cards are under More → Business → <strong>Payment setup</strong> → <strong>Gift cards</strong>, or More → Settings &amp; account → Sales → <strong>Gift cards</strong>. Promo codes are under More → Grow your business → <strong>Promo codes</strong>.</li>
  <li><strong>On the web:</strong> gift cards are under Settings → Sales → <strong>Gift Cards</strong> (/provider/settings/sales/gift-cards). Promo codes are at /provider/promotions.</li>
</ul>
<h2>How it works</h2>
<h3>Gift cards</h3>
<ul>
  <li>Turn on <strong>Enable Gift Cards</strong> to allow customers to use platform gift cards at your business. Gift cards are sold by the platform and can be redeemed for bookings at any provider.</li>
  <li>Your subscription plan must include gift cards before you can turn them on.</li>
  <li>Gift-card payments count toward your available payout balance.</li>
  <li>If a booking paid by gift card is fully refunded, the value returns to the gift card. On a partial refund the value goes to the customer's wallet.</li>
</ul>
<h3>Promo codes</h3>
<ol>
  <li>Select <strong>New code</strong>, enter a <strong>Code</strong>, and choose <strong>Percentage</strong> or <strong>Fixed amount</strong> with a <strong>Value</strong>.</li>
  <li>Set <strong>Starts</strong> and <strong>Ends</strong>, or choose <strong>No end date</strong>.</li>
  <li>Under Limits, optionally set <strong>Total uses</strong>, <strong>Minimum booking amount</strong>, <strong>Max discount (%)</strong>, <strong>One use per client</strong>, and a <strong>Salon branch</strong> or All salons.</li>
  <li>Turn on <strong>Show on my public profile</strong> if customers should see the code.</li>
</ol>
<p>Each code shows a status: Active, Scheduled, Expired, Used up or Off.</p>
<h2>Good to know</h2>
<ul>
  <li>Discounts reduce what you collect on covered bookings. Track redemptions in each code's details and in Finance and reports.</li>
  <li>One use per client applies across both bookings and product orders.</li>
  <li>A code that has been used can't be deleted. Turn it off instead.</li>
  <li>Your codes only apply to your business. They are not the same as platform-wide coupons.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/marketing-automations-overview">Marketing and automations overview</a></li>
  <li><a href="/learn/article/provider-payout-rails-available-balance">Payout rails and your available balance</a></li>
  <li><a href="/learn/article/provider-reschedule-cancellation-settlement">Reschedules and cancellation settlement</a></li>
  <li><a href="/learn/article/provider-web-subscription-plan">Provider web subscription and plan management</a></li>
</ul>$b$),

  -- 13. Paystack Terminal
  ('card-machines',
   'Paystack Terminal: QR and link payments',
   'provider-paystack-terminal',
   'Where available, Paystack Terminal lets you take in-person payments with a QR code or payment link instead of a card machine. Each payment is allocated to a sale in your payment inbox before it counts toward your payouts.',
   $b$<p>Paystack Terminal is a virtual terminal. Customers pay by scanning your QR code or opening your payment link on their own phone, and the money is held by Beautonomi and paid out to you like online payments. It is available where your market, your subscription plan and your account allow it.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Paystack Terminal under Payment setup"></div>
<ul>
  <li><strong>In the app:</strong> the <strong>Paystack Terminal</strong> quick action on the More tab, or More → Business → <strong>Payment setup</strong> → <strong>Paystack Terminal</strong>.</li>
  <li><strong>On the web:</strong> <strong>Paystack Terminal</strong> in the sidebar, or Settings → Sales → <strong>Paystack Terminal</strong> (/provider/settings/sales/paystack-terminal).</li>
</ul>
<h2>Step by step</h2>
<ol>
  <li>Open Paystack Terminal and select <strong>Request Paystack Terminal setup</strong>.</li>
  <li>The Beautonomi team sets up your terminal. You then get a terminal code, a payment link, a QR code and a printable poster.</li>
  <li>Show the QR code or share the link. The customer pays on their phone and Paystack verifies the payment.</li>
  <li>Open your payment inbox and match each payment to the right sale with <strong>Approve match</strong>. If you can't match it, use <strong>Send to admin to allocate</strong>.</li>
</ol>
<h2>How it works</h2>
<ul>
  <li>Payments become payoutable only after they have been allocated and any payout hold has passed.</li>
  <li>If your plan doesn't include it you'll see "Your subscription plan does not include Paystack Terminal. Upgrade under Subscription to request terminal setup."</li>
  <li>If your market doesn't support it you'll see "Paystack Terminal payments are not enabled for this market."</li>
  <li>Setting up the terminal needs the Edit settings permission.</li>
</ul>
<h2>Good to know</h2>
<ul>
  <li>Paystack Terminal is different from card machines. Card machines are physical PayCloud terminals, covered in the card machine guides below.</li>
  <li>If your business also uses Yoco, its settings are under Settings → Sales → <strong>Yoco Integration</strong> where available, not under Paystack Terminal.</li>
  <li>Refunds to customers for online-held payments go to the customer's Beautonomi wallet.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/card-machines-before-you-apply">Card machines: before you apply</a></li>
  <li><a href="/learn/article/card-machines-application-guide">Card machines application guide</a></li>
  <li><a href="/learn/article/card-machines-first-payment">Taking your first card machine payment</a></li>
  <li><a href="/learn/article/card-machines-faq">Card machines FAQ</a></li>
  <li><a href="/learn/article/provider-payout-rails-available-balance">Payout rails and your available balance</a></li>
</ul>$b$)

) AS v(category_slug, title, slug, summary, body)
JOIN public.learning_categories c ON c.slug = v.category_slug AND c.tenant_id IS NULL
ON CONFLICT (slug) WHERE tenant_id IS NULL DO UPDATE
SET category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
    body = EXCLUDED.body, content_format = 'html', status = 'published', audience = EXCLUDED.audience,
    is_internal = false, updated_at = NOW();

INSERT INTO public.learning_article_stats (article_id)
SELECT a.id FROM public.learning_articles a
WHERE a.slug IN (
  'provider-cancellation-policy-presets',
  'provider-reschedule-cancellation-settlement',
  'provider-payout-accounts-cooling-off',
  'provider-payout-rails-available-balance',
  'provider-subscription-billing-ios',
  'provider-platform-fees-commission',
  'provider-taxes-vat',
  'provider-payroll-pay-runs',
  'provider-team-commissions-tips',
  'provider-travel-fees-tiered',
  'provider-receipts-template-numbering',
  'provider-gift-cards-promo-codes',
  'provider-paystack-terminal'
) AND a.tenant_id IS NULL
ON CONFLICT (article_id) DO NOTHING;
