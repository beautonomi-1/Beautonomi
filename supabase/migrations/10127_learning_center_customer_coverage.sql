-- 10127: Learning Center — customer coverage (fact-checked; see docs/learning/FACT_LEDGER.md)
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, v.title, v.slug, v.summary, v.body, 'html', 'published', 'customer', false, NOW()
FROM (VALUES
  ('account-profile', 'Delete your Beautonomi account', 'delete-your-account',
   'Delete your account from Privacy & sharing on the app or web: confirm with your password (or a one-time code if you sign in without one) and type DELETE. Where a grace period applies, deletion is scheduled for 30 days and can be cancelled from the email link or through support.',
   $b$<p>You can permanently delete your Beautonomi account yourself from the app or the website. Deleting removes your profile and personal data and signs you out. If you only need a break, you can deactivate your account instead and come back later.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → Account settings → Privacy &amp; sharing → <strong>Delete account</strong>.</li>
<li><strong>Web:</strong> Account settings → Privacy &amp; sharing (/account-settings/privacy-and-sharing) → <strong>Advanced</strong> → <strong>Request permanent account deletion</strong>.</li>
</ul>
<div data-learn-mockup="customer-mobile-profile" data-caption="Account settings is at the top of the Profile tab"></div>
<h2>Step by step</h2>
<ol>
<li>Open <strong>Delete account</strong> using the path above.</li>
<li>Prove it is you. Enter your password, or, if your account has no password (for example you sign in with a code), tap <strong>Send verification code</strong> and enter the code you receive.</li>
<li>Optionally add a <strong>Reason</strong> so we can improve.</li>
<li>Type <strong>DELETE</strong> in the confirmation box.</li>
<li>Tap <strong>Delete account permanently</strong> (web: <strong>Permanently delete account</strong>), then confirm <strong>Delete permanently</strong>. You are signed out straight away.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li><strong>This cannot be undone.</strong> You will lose access to your bookings history, saved items and wallet.</li>
<li><strong>Grace period, where it applies:</strong> deletion is scheduled for 30 days and your account is locked. You get an email with a cancel link. To cancel, use that link or contact support; signing in again does not cancel it. Where no grace period applies, your data is erased immediately.</li>
<li><strong>Just need a break?</strong> Use Login &amp; security → <strong>Deactivate account</strong> instead.</li>
<li>Use up or request a refund of any eligible wallet balance before you delete. See <a href="/learn/article/wallet-bank-refund">Request a bank refund from your wallet</a>.</li>
<li>If you signed in with Apple, the link to your Apple ID is removed as part of deletion.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/account-profile-overview">Account and profile overview</a></li>
<li><a href="/learn/article/security-privacy-overview">Security and privacy overview</a></li>
<li><a href="/learn/article/customer-web-account-support">Account and support on the web</a></li>
</ul>$b$),

  ('wallet-gift-cards-coupons', 'Buy, send and redeem gift cards', 'gift-cards-buy-send-claim',
   'Where gift cards are available, buy one for yourself or send it to someone by email (optionally scheduled), then redeem the code into your wallet or enter it at checkout under Gift card. Redeeming adds the full balance to your Beautonomi wallet, and the card currency must match your wallet.',
   $b$<p>Beautonomi gift cards are a simple way to treat someone to a beauty or wellness service. You can buy a card for yourself, send it as a gift, and redeem codes into your Beautonomi wallet or use them directly at checkout. Gift cards are offered where available in your market.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → Payment methods → Gift cards → <strong>Buy gift card</strong>. Some provider profiles also have a <strong>Giftcard</strong> tab.</li>
<li><strong>Web:</strong> the gift card page (/gift-card/purchase).</li>
<li><strong>Redeem a code:</strong> App: Profile → Wallet → <strong>Top Up Option</strong> → <strong>Gift Card</strong>. Web: Account settings → Wallet (/account-settings/wallet) → <strong>Top up / Redeem Gift Card</strong> → <strong>Redeem Gift Card</strong>.</li>
</ul>
<div data-learn-mockup="customer-mobile-wallet" data-caption="Redeem a gift card code into your wallet"></div>
<h2>Step by step: buy a gift card</h2>
<ol>
<li>Open <strong>Buy Gift Card</strong>. On the web, start by choosing a design.</li>
<li>Pick a preset amount or enter a custom amount within the limits shown.</li>
<li>Choose who it is for: <strong>For myself</strong> or <strong>Send as a gift</strong>. For a gift, add the recipient's email, their name and a personal message, and optionally choose <strong>Send later</strong> to schedule delivery.</li>
<li>Pay by card. You must be signed in to buy.</li>
<li>Your code is shown on the success screen. Gift recipients get the code by email, and if they already have a Beautonomi account it appears in their wallet automatically.</li>
</ol>
<h2>Step by step: use a gift card</h2>
<ol>
<li><strong>Into your wallet:</strong> enter the code under Gift Card in the wallet and confirm. The full balance is added to your wallet instantly.</li>
<li><strong>At checkout:</strong> choose <strong>Gift card</strong> as the payment method and type the <strong>Gift card code</strong>.</li>
<li>If a gift card was sent to your email address, your wallet shows <strong>A gift card is waiting</strong>. Tap <strong>Add to wallet</strong>.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>A code can't be redeemed if it is inactive, has no balance left or has expired.</li>
<li>The gift card currency must match your wallet currency.</li>
<li>On the web you can buy several cards at once with <strong>Bulk purchase</strong>.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/wallet-gift-cards-coupons-overview">Wallet, gift cards and coupons overview</a></li>
<li><a href="/learn/article/customer-mobile-wallet-loyalty">Wallet and loyalty in the app</a></li>
<li><a href="/learn/article/payment-methods-accepted">Payment methods accepted</a></li>
</ul>$b$),

  ('loyalty-rewards', 'Refer friends and earn rewards', 'refer-friends-referrals',
   'Share your referral code or link from Referrals; when a friend signs up with it and makes their first qualifying (paid) booking, you earn the reward set by the platform as wallet credit, plus loyalty points where configured. Each person can only be referred once.',
   $b$<p>When the referral programme is running in your market, you can invite friends to Beautonomi with your personal code or link. When a friend you invited joins and makes their first qualifying booking, you earn a reward in your Beautonomi wallet.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → Account settings → <strong>Referrals</strong>. When the programme is on, the Profile tab also shows an <strong>Invite friends</strong> banner.</li>
<li><strong>Web:</strong> Account settings → <strong>Referral credit &amp; coupon</strong> (/account-settings/referrals).</li>
</ul>
<div data-learn-mockup="customer-web-account" data-caption="Referral credit &amp; coupon on the Account page"></div>
<h2>Step by step</h2>
<ol>
<li>Open Referrals. You will see <strong>Your referral code</strong> and <strong>Your referral link</strong>.</li>
<li>Tap <strong>Copy Link</strong> or <strong>Share</strong> to send it by message, email or social media.</li>
<li>Your friend signs up using your link or code.</li>
<li>When they make their first qualifying booking (a paid booking), the referral is marked successful and your reward is credited.</li>
<li>Track progress in the stats: <strong>Total Referrals</strong>, <strong>Successful</strong>, earnings and pending referrals.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li><strong>Reward amount:</strong> set by the platform and shown on the Referrals page. It can change, so check the page rather than relying on an old message.</li>
<li><strong>How you are paid:</strong> as Beautonomi wallet credit, plus loyalty points where the programme includes them. Rewards go to the person who sent the invite.</li>
<li><strong>One referral per person:</strong> a friend can only be referred once. If they used someone else's code first, that referral counts.</li>
<li>If the programme is paused in your market, the page shows a notice and no new rewards are earned.</li>
<li>Questions and answers specific to your market appear in the FAQ on the Referrals page.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/loyalty-rewards-overview">Loyalty and rewards overview</a></li>
<li><a href="/learn/article/wallet-gift-cards-coupons-overview">Wallet, gift cards and coupons overview</a></li>
<li><a href="/learn/article/customer-web-wallet-loyalty">Wallet and loyalty on the web</a></li>
</ul>$b$),

  ('wallet-gift-cards-coupons', 'Request a bank refund from your wallet', 'wallet-bank-refund',
   'Cancellation refunds go to your Beautonomi wallet; where bank refunds are offered, you can request an EFT of the eligible amount (refunds of card payments made through Beautonomi) from the wallet. Minimums, maximums, fees and processing time are set by the platform and shown before you submit.',
   $b$<p>When a booking is cancelled and a refund is due, the money is credited to your Beautonomi wallet so you can use it on your next booking. If you would rather have eligible funds paid into your bank account, you can request a bank refund where this is available in your market. Payments you made in person are returned by the provider, not through the wallet.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → Wallet → <strong>Wallet help</strong> → request a bank refund.</li>
<li><strong>Web:</strong> Account settings → Wallet (/account-settings/wallet) → <strong>Request a bank refund</strong>.</li>
</ul>
<p>The option only appears when bank refunds are offered in your market and you have an eligible amount or an open request.</p>
<h2>Step by step</h2>
<ol>
<li>Open the bank refund page. You will first be asked whether you would like to <strong>Keep it on Beautonomi</strong>. Choose <strong>Request a bank refund instead</strong> to continue.</li>
<li>Check <strong>Eligible for bank refund</strong>. Only refunds of card payments you made through Beautonomi qualify.</li>
<li>Enter how much should be sent to your bank, within the minimum and maximum shown. Any processing fee and the amount you will receive are shown before you submit.</li>
<li>Choose a bank account, or <strong>Add a bank account</strong>, and add a note if you like.</li>
<li>Tap <strong>Submit request</strong>. The amount is held in your wallet while the finance team reviews it. Approved refunds are paid by EFT within the number of business days shown on the page.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Wallet top-ups, gift card balances and promotional credit are not eligible and stay in your wallet.</li>
<li>You can have one open request at a time. While it is pending you can <strong>Cancel request</strong>.</li>
<li>Requests show their status: pending, approved, paid, rejected or cancelled.</li>
<li>Limits, fees and processing time are set by the platform and can differ by market.</li>
<li>If bank refunds are not offered where you are, the page says so, and your wallet balance can be used on any future booking or order.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
<li><a href="/learn/article/canceling-your-booking">Canceling your booking</a></li>
<li><a href="/learn/article/wallet-gift-cards-coupons-overview">Wallet, gift cards and coupons overview</a></li>
</ul>$b$),

  ('security-privacy', 'Safety tools: emergency help, reporting and your safety profile', 'safety-tools-customer',
   'Safety & parental controls brings together emergency guidance (Beautonomi is not an emergency service; call 112 in South Africa), Contact trust & safety, reporting a user, your emergency contact and age settings. Where available, booking details also have a Safety / Get help button.',
   $b$<p>Your safety matters on every appointment, whether you visit a salon or a professional comes to you. The Safety &amp; parental controls hub keeps emergency guidance, ways to reach our trust and safety team, and your safety settings in one place.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → <strong>Safety &amp; parental controls</strong> (under Support), or Profile → Account settings → Trust &amp; Safety.</li>
<li><strong>Web:</strong> Account settings → <strong>Safety &amp; parental controls</strong> (/account-settings/safety).</li>
</ul>
<h2>In an emergency</h2>
<p><strong>Beautonomi is not an emergency service.</strong> If you are in danger, call 112 in South Africa or your local emergency number first. The hub has a <strong>Call 112</strong> button.</p>
<h2>Step by step: get help</h2>
<ol>
<li>Open the hub and choose <strong>Contact trust &amp; safety</strong> to open a safety support ticket.</li>
<li>To report harassment or someone's behaviour, choose <strong>Report harassment or a user</strong> and describe what happened. Reports are reviewed by the trust and safety team.</li>
<li>During an appointment, where available, open the booking in the app and tap <strong>Safety / Get help</strong>, then <strong>Request help</strong> to alert the safety team.</li>
</ol>
<h2>Your safety profile</h2>
<ul>
<li><strong>Emergency contact:</strong> add a contact name, relationship, phone number and optional email. It is only shared with trust and safety during a help request or an urgent ticket. On the web it is kept in Personal info.</li>
<li><strong>Age assurance &amp; date of birth:</strong> confirms which protections apply to you. Accounts for 13 to 17 year olds get stricter defaults, and under-13s cannot use Beautonomi.</li>
<li><strong>Your controls:</strong> content and messaging settings and blocked users. See <a href="/learn/article/blocked-users-content-safety">Block users and manage content controls</a>.</li>
</ul>
<h2>Good to know</h2>
<ul>
<li>The Safety / Get help button on bookings is offered where available and may not appear in every market.</li>
<li>For general booking problems, such as a late provider or a pricing dispute, use Help centre or a support ticket instead.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/compliance-and-safety">Compliance and safety</a></li>
<li><a href="/learn/article/security-privacy-overview">Security and privacy overview</a></li>
<li><a href="/learn/article/verify-arrival">Verify arrival</a></li>
<li><a href="/learn/article/support-tickets-disputes-overview">Support tickets and disputes overview</a></li>
</ul>$b$),

  ('security-privacy', 'Block users and manage content controls', 'blocked-users-content-safety',
   'Block someone from a chat or an Explore post menu so they can''t message you and their content is hidden; unblock them later from Blocked users. Parental controls — content & safety has six switches, including Restricted mode and Disable direct messaging, which may be locked for 13 to 17 year olds.',
   $b$<p>You decide who can reach you and what you see on Beautonomi. Blocking stops a specific person from messaging you, and the content and safety switches let you limit social features and sensitive content across your account.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → Account settings → Trust &amp; Safety → <strong>Parental controls — content &amp; safety</strong> and <strong>Blocked users</strong>.</li>
<li><strong>Web:</strong> Account settings → content and safety (/account-settings/content-and-safety) and <strong>Blocked users</strong> (/account-settings/blocked-users).</li>
</ul>
<h2>Step by step: block someone</h2>
<ol>
<li>In a chat, open the menu in the chat header and choose <strong>Block</strong>. On an Explore post, open <strong>More options</strong> and choose <strong>Block</strong>.</li>
<li>Confirm. They won't be able to message you, and their content will be hidden from your feed.</li>
<li>To undo it, open <strong>Blocked users</strong>, find the person and tap <strong>Unblock</strong>, then confirm.</li>
</ol>
<h2>Content and safety switches</h2>
<ul>
<li><strong>Restricted mode</strong></li>
<li><strong>Hide social feed</strong> (this also hides Explore)</li>
<li><strong>Disable comments &amp; likes</strong></li>
<li><strong>Disable direct messaging</strong></li>
<li><strong>Sensitive content filter</strong></li>
<li><strong>Require device authentication</strong>, which asks for your phone's screen lock the next time you open the mobile app</li>
</ul>
<h2>Good to know</h2>
<ul>
<li>For 13 to 17 year olds, some switches are <strong>Managed</strong> and can't be turned off. If we don't know your age, you'll be asked to add your date of birth first.</li>
<li>In the app you may need to unlock with your device before changing these settings.</li>
<li>To report a post, open its menu and choose <strong>Report post</strong>. To report a person's behaviour, use Safety &amp; parental controls.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/safety-tools-customer">Safety tools: emergency help, reporting and your safety profile</a></li>
<li><a href="/learn/article/explore-feed-posts-videos-collections">Explore: posts, videos and collections</a></li>
<li><a href="/learn/article/messaging-providers-overview">Messaging providers overview</a></li>
</ul>$b$),

  ('account-profile', 'Wishlists, saved items and recently viewed', 'wishlists-and-saved',
   'Save providers, products and Explore posts with the heart or bookmark icon, then find them under Saved in the app (Profile quick action or the Home header heart) or Account settings → Wishlists & Recently Viewed on the web. Group saves into boards with New board.',
   $b$<p>Saving lets you keep track of the providers, products and looks you love so you can book or buy later. Saved items sync between the app and the website when you are signed in.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → <strong>Saved</strong> (quick action), or tap the heart in the Home header. You can also use Profile → Account settings → Preferences → <strong>Saved &amp; wishlists</strong>, which also shows recently viewed items.</li>
<li><strong>Web:</strong> Account settings → <strong>Wishlists &amp; Recently Viewed</strong> (/account-settings/wishlists). Recently viewed is at /account-settings/wishlists/recently-viewed.</li>
</ul>
<p>Saved is not a bottom tab in the app. The tabs are Home, Search, Bookings, Cart, Chats and Profile.</p>
<div data-learn-mockup="customer-mobile-home" data-caption="The heart in the Home header opens Saved"></div>
<h2>Step by step</h2>
<ol>
<li>Tap the <strong>heart</strong> on a provider or product to save it.</li>
<li>Tap the <strong>bookmark</strong> on an Explore post to save the look.</li>
<li>Open Saved and switch between <strong>Providers</strong>, <strong>Posts</strong> and <strong>Products</strong>.</li>
<li>To organise saves, tap <strong>New board</strong>, name it and add items. On the web you can also create a wishlist with <strong>New wishlist</strong>.</li>
<li>Tap a saved provider to book, or a saved product to view and buy it.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Tap the heart or bookmark again to remove an item.</li>
<li>Saved Explore posts are only visible when Explore is available to you.</li>
<li>Recently viewed helps you find a provider you browsed but didn't save.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/explore-feed-posts-videos-collections">Explore: posts, videos and collections</a></li>
<li><a href="/learn/article/account-profile-overview">Account and profile overview</a></li>
<li><a href="/learn/article/how-to-book-service">How to book a service</a></li>
</ul>$b$),

  ('payments-customer', 'Return a product and request a refund', 'return-a-product',
   'Request a return within 14 days of delivery from the order (Request Return / Refund), choosing a reason such as damaged or wrong item. The provider reviews it; approved refunds are usually wallet credit, and you can escalate a rejected request.',
   $b$<p>If something you bought in the Beautonomi shop arrives damaged, is the wrong item or isn't what you expected, you can ask the seller for a return and refund straight from your order.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → <strong>Orders</strong> (quick action), or Profile → Account settings → Product orders → open the order → <strong>Request Return / Refund</strong>. Track requests in Account settings → <strong>Returns &amp; refunds</strong>.</li>
<li><strong>Web:</strong> Account settings → <strong>Product Orders</strong> (/account-settings/orders) → open the order → <strong>Request Return / Refund</strong>. Track requests in <strong>Returns &amp; Refunds</strong> (/account-settings/returns).</li>
</ul>
<div data-learn-mockup="customer-mobile-shop" data-caption="Shop orders and returns"></div>
<h2>Step by step</h2>
<ol>
<li>Open the order. The return option appears once the order is delivered or ready for collection.</li>
<li>Tap <strong>Request Return / Refund</strong>.</li>
<li>Choose a reason: Item arrived damaged, Received wrong item, Not as described, Quality issue, Changed my mind, Arrived too late, or Other reason.</li>
<li>Add any extra details in <strong>Additional Details</strong>, then tap <strong>Submit Return Request</strong>. The seller is notified.</li>
<li>Follow the status: Pending, Approved, Item received, Refunded, Rejected, Escalated, Resolved or Cancelled.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li><strong>Return window:</strong> 14 days from when the order was delivered. After that, the option is no longer offered.</li>
<li><strong>How refunds are paid:</strong> the seller usually issues the refund as Beautonomi wallet credit. Some sellers may refund in cash instead.</li>
<li>While a request is <strong>Pending</strong> you can cancel it.</li>
<li>If the seller <strong>rejects</strong> your request, you can escalate it so the Beautonomi team reviews it.</li>
<li>To get money from your wallet into your bank account, see <a href="/learn/article/wallet-bank-refund">Request a bank refund from your wallet</a>.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/customer-mobile-shop-orders">Shop orders in the app</a></li>
<li><a href="/learn/article/customer-web-shop-orders">Shop orders on the web</a></li>
<li><a href="/learn/article/support-tickets-disputes-overview">Support tickets and disputes overview</a></li>
</ul>$b$),

  ('booking-checkout', 'Custom requests and offers', 'custom-requests-and-offers',
   'Send a provider a custom request (description, optional budget, location, preferred time and up to 6 inspiration photos) from the Custom request tab on their profile; they reply with an offer in chat. Nothing is booked until you pay the offer, and unanswered requests close after 7 days.',
   $b$<p>Want something that isn't on a provider's menu, such as a bridal look, a special colour or a combined treatment? Send a custom request. The provider reviews it and sends you a personalised offer with a price and time, which you can accept and pay to book.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>Send a request:</strong> open a provider's profile → <strong>Custom request</strong> tab → <strong>Start your request</strong>.</li>
<li><strong>Track requests and offers:</strong> the chat with the provider, and on the web Account settings → <strong>Custom Requests</strong> (/account-settings/custom-requests). In the app: Profile → Account settings → Bookings &amp; Activity → Custom requests.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Describe what you want in at least 10 characters. Be specific about the look, length and any allergies.</li>
<li>Optionally choose a <strong>Service category</strong>, set a <strong>Budget</strong> range and estimate the duration.</li>
<li>Under <strong>Where?</strong> choose <strong>At salon</strong> or <strong>At home</strong>. At-home requests need your address.</li>
<li>Pick a <strong>Preferred date and time</strong> from the provider's available slots.</li>
<li>Add up to 6 <strong>Inspiration photos</strong> (JPEG, PNG, WebP or GIF, up to 5 MB each), then tap <strong>Submit request</strong>.</li>
<li>When the provider sends an offer, review it. On the web you can <strong>Accept &amp; Pay</strong>, <strong>Request changes</strong> or <strong>Decline offer</strong>. In the app, open the offer to pay.</li>
<li>At payment you can use your wallet balance, a gift card code or loyalty points where offered. If the provider allows a deposit, you can pay that instead of the full amount. Once paid, the booking is confirmed.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li><strong>Nothing is booked</strong> until you pay the provider's offer.</li>
<li>Requests that aren't answered close after 7 days. Offers can also expire, so pay promptly if you are happy with one.</li>
<li>You can cancel a request you no longer need.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/how-to-book-service">How to book a service</a></li>
<li><a href="/learn/article/messaging-providers-overview">Messaging providers overview</a></li>
<li><a href="/learn/article/when-you-pay-booking">When you pay for a booking</a></li>
</ul>$b$),

  ('getting-started', 'Explore: posts, videos and collections', 'explore-feed-posts-videos-collections',
   'Explore is a feed of provider posts and videos, opened from the Home header in the app or Explore in the site header on the web, where available. Like, comment, save or share posts, use Book this look on linked services, and report or block from More options.',
   $b$<p>Explore is where providers share their latest work as posts and videos. Use it for inspiration, discover new providers and book a look you love. Explore is available where enabled, and it is hidden for under-13s and for anyone who turns on Hide social feed.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> tap <strong>Explore</strong> in the Home header. It is not one of the bottom tabs (Home, Search, Bookings, Cart, Chats, Profile).</li>
<li><strong>Web:</strong> <strong>Explore</strong> in the site header (/explore).</li>
</ul>
<div data-learn-mockup="customer-mobile-home" data-caption="Explore opens from the Home header"></div>
<h2>Step by step</h2>
<ol>
<li>Open Explore and scroll the feed, or search and filter by category.</li>
<li>Tap a post or video to see it in full. Use <strong>Like</strong>, <strong>Comment</strong>, <strong>Save</strong> or <strong>Share</strong>.</li>
<li>If the post is linked to a service, tap <strong>Book this look</strong> to go straight to booking. Use <strong>View Profile</strong> to see the provider's full menu.</li>
<li>Browse boards to see curated collections of posts.</li>
<li>Find your saved posts with the bookmark icon in the Explore header (app) or at /explore/saved (web).</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Open <strong>More options</strong> on any post to <strong>Report post</strong> or <strong>Block</strong> the account.</li>
<li>If Explore is hidden for you, a message explains that Explore is turned off. Check Hide social feed in Parental controls — content &amp; safety.</li>
<li>Disable comments &amp; likes in the same settings switches off those interactions for your account.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/wishlists-and-saved">Wishlists, saved items and recently viewed</a></li>
<li><a href="/learn/article/blocked-users-content-safety">Block users and manage content controls</a></li>
<li><a href="/learn/article/getting-started-overview">Getting started overview</a></li>
</ul>$b$),

  ('booking-checkout', 'Group booking invites and split payment', 'group-booking-invites-split-payment',
   'When booking for a group you choose who pays: I''ll pay for everyone, or Split payment (only where the provider allows it and you pay by card), in which case each guest gets a link to pay their own share. Guests accept from the invite link, pay their share or cancel their spot.',
   $b$<p>Booking for a bridal party, a birthday or friends? When you book for several people, you decide whether to pay for everyone or have each guest pay their own share. This article covers the payment choice and how guest invites work. For how to add people to a group booking, see <a href="/learn/article/group-bookings-customer">Group bookings</a>.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>At checkout:</strong> the <strong>Who pays?</strong> section appears for group bookings.</li>
<li><strong>Afterwards:</strong> open the group booking to see each guest's status.</li>
</ul>
<h2>Step by step: as the organiser</h2>
<ol>
<li>Add your guests and their services.</li>
<li>Under <strong>Who pays?</strong> choose <strong>I'll pay for everyone</strong> or <strong>Split payment</strong>. With split payment, you pay your own services and the booking fees now, and each guest gets a link to pay their share.</li>
<li>Guests receive the link by email or SMS, and in the app if they have an account.</li>
<li>Track each guest: <strong>Share paid</strong>, <strong>Share unpaid</strong> or <strong>Spot cancelled</strong>. You can <strong>Resend pay link</strong>, <strong>Re-send invite</strong> or <strong>Remove guest</strong>.</li>
</ol>
<h2>Step by step: as a guest</h2>
<ol>
<li>Open the invite link and sign in or create an account.</li>
<li>Tap <strong>Accept invite</strong>. You'll see <strong>Your share</strong>.</li>
<li>Tap <strong>Pay my share</strong> to pay by card.</li>
<li>If you can't make it, tap <strong>Cancel my spot</strong>. After the provider's cancellation window it is too late to cancel online, so contact the organiser.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li><strong>Split payment</strong> is only offered when the provider allows it and you pay by card. Otherwise the organiser pays for everyone.</li>
<li>If the organiser paid for a guest who is later removed, the credit goes to the organiser's Beautonomi wallet.</li>
<li>Only the organiser can reschedule the group session or cancel the whole booking.</li>
<li>Invite links can expire. If a link says it is invalid or expired, ask the organiser to resend it.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/group-bookings-customer">Group bookings</a></li>
<li><a href="/learn/article/booking-checkout-overview">Booking and checkout overview</a></li>
<li><a href="/learn/article/canceling-your-booking">Canceling your booking</a></li>
</ul>$b$),

  ('reviews-ratings', 'Edit or delete your review', 'edit-or-delete-your-review',
   'You can edit a review for 24 hours after posting it: in the app from Account settings → My reviews → Edit, or on the web from My Reviews, where you can also delete it. After 24 hours, contact support to request a change.',
   $b$<p>After a completed booking you can leave a star rating and review to help others choose. If you made a mistake or want to add detail, you have a short window to change what you wrote.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → Account settings → Bookings &amp; Activity → <strong>My reviews</strong>.</li>
<li><strong>Web:</strong> Account settings → <strong>My Reviews</strong> (/account-settings/reviews).</li>
</ul>
<div data-learn-mockup="customer-web-account" data-caption="My Reviews on the Account page"></div>
<h2>Step by step</h2>
<ol>
<li>Open My reviews and find the review.</li>
<li><strong>To edit:</strong> in the app tap <strong>Edit</strong>; on the web tap the edit icon to open <strong>Edit Review</strong>. Update the rating or text, then save (web: <strong>Save Changes</strong>).</li>
<li><strong>To delete (web):</strong> tap the bin icon and confirm when asked whether you are sure you want to delete the review.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li><strong>24-hour window:</strong> edits and deletions are only possible for 24 hours after you post. After that the review is locked and only the Beautonomi team can change it, so contact support with the reason.</li>
<li>Deleting a review is only available on the web.</li>
<li>Reviews can only be left for completed bookings.</li>
<li>If the provider responds, their answer appears under your review as <strong>Provider reply</strong>.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/reviews-ratings-overview">Reviews and ratings overview</a></li>
<li><a href="/learn/article/customer-web-reviews-messaging-support">Reviews, messaging and support on the web</a></li>
<li><a href="/learn/article/troubleshooting-faq-overview">Troubleshooting and FAQ overview</a></li>
</ul>$b$),

  ('notifications-messaging', 'Choose which notifications you get', 'notification-preferences-customer',
   'Set notification preferences in the app (Profile → Account settings → Notifications) or on the web (Account settings → Notifications); each topic can be switched on for email, SMS, WhatsApp, push or browser. Marketing messages stay off unless you opt in, and the Profile Notifications item opens your inbox, not your preferences.',
   $b$<p>Beautonomi can reach you by email, SMS, WhatsApp, push notifications and browser notifications. You choose which topics you hear about and on which channels, so you get booking reminders without unwanted marketing.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → Account settings → Preferences → <strong>Notifications</strong>. The <strong>Notifications</strong> item on the Profile tab opens your notification inbox, not your settings.</li>
<li><strong>Web:</strong> Account settings → <strong>Notifications</strong> (/account-settings/notifications). Use <strong>View inbox</strong> to see past notifications.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Open the notification settings.</li>
<li>Choose a tab: <strong>Offers and updates</strong> (inspiration and offers, news and programmes, Beautonomi updates) or <strong>Account</strong> (account activity and policies, reminders, messages).</li>
<li>On the web, tap <strong>Edit</strong> next to a topic and switch Email, SMS, WhatsApp or Browser notifications on or off, then <strong>Save</strong>. In the app, use the switches in each section, including <strong>Push notifications</strong>.</li>
<li>To stop all promotional email at once, use <strong>Unsubscribe from all marketing emails</strong>.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Marketing topics stay off unless you opt in.</li>
<li>WhatsApp messages need your opt-in, and you can reply STOP to opt out.</li>
<li>Keep reminders and account activity on so you don't miss booking changes, payment issues or security alerts.</li>
<li>Push notifications also depend on your phone's settings. If they are blocked at device level, allow notifications for Beautonomi in your phone settings.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/notifications-messaging-overview">Notifications and messaging overview</a></li>
<li><a href="/learn/article/customer-mobile-notifications-support">Notifications and support in the app</a></li>
<li><a href="/learn/article/account-profile-overview">Account and profile overview</a></li>
</ul>$b$),

  ('account-profile', 'Change your language', 'change-your-language',
   'Change the language on the web in Account settings → Global preferences → Preferred language, or in the app in Profile → Language & region → Language. The app currently offers English variants (UK, US, Australia), while the website offers more languages; provider content may stay in its original language.',
   $b$<p>You can choose the language Beautonomi uses for menus, buttons and messages. Language is set separately on the website and in the app, alongside your currency and time zone.</p>
<h2>Where to find it</h2>
<ul>
<li><strong>App:</strong> Profile → <strong>Language &amp; region</strong> (or Profile → Account settings → Preferences → Language &amp; region) → <strong>Language</strong>.</li>
<li><strong>Web:</strong> Account settings → <strong>Global preferences</strong> (/account-settings/preferences) → <strong>Preferred language</strong>.</li>
</ul>
<div data-learn-mockup="customer-web-account" data-caption="Global preferences on the Account page"></div>
<h2>Step by step</h2>
<ol>
<li>Open the language setting using the path above.</li>
<li>On the web, tap <strong>Edit</strong> next to Preferred language. In the app, tap <strong>Language</strong>.</li>
<li>Choose your language and save.</li>
<li>In the app, if you are asked to restart, close and reopen the app to apply the change fully.</li>
</ol>
<h2>Which languages are available</h2>
<ul>
<li><strong>App:</strong> English, English (UK), English (US) and English (Australia).</li>
<li><strong>Website:</strong> a wider list, including Afrikaans, isiZulu, isiXhosa, Sesotho, Setswana, French, Portuguese, Spanish, Arabic and more. Arabic displays right to left.</li>
</ul>
<h2>Good to know</h2>
<ul>
<li>Service names, descriptions and messages written by providers may stay in the language the provider used.</li>
<li>Learning Center articles are in English.</li>
<li>The same screens let you set your currency and time zone, which affect how prices and appointment times are shown.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/account-profile-overview">Account and profile overview</a></li>
<li><a href="/learn/article/customer-mobile-app">Using the customer app</a></li>
<li><a href="/learn/article/customer-web-account-support">Account and support on the web</a></li>
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
  'delete-your-account', 'gift-cards-buy-send-claim', 'refer-friends-referrals', 'wallet-bank-refund',
  'safety-tools-customer', 'blocked-users-content-safety', 'wishlists-and-saved', 'return-a-product',
  'custom-requests-and-offers', 'explore-feed-posts-videos-collections', 'group-booking-invites-split-payment',
  'edit-or-delete-your-review', 'notification-preferences-customer', 'change-your-language'
) AND a.tenant_id IS NULL
ON CONFLICT (article_id) DO NOTHING;
