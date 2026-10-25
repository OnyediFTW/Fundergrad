/* Fundergrad: source registry
 *
 * Every lesson in the game points at one or more of these keys (see events.js).
 * The "Hints & Sources" tab and the final Sources screen read from this file,
 * so a link only needs to be fixed in one place.
 *
 * Plain <script> file, no modules: that way index.html works when you
 * double-click it, with no server needed.
 */
const SOURCES = {
  CB: {
    org: 'College Board',
    title: 'Trends in College Pricing',
    url: 'https://research.collegeboard.org/trends/college-pricing',
  },
  CFPB_APR: {
    org: 'CFPB',
    title: 'What is a credit card interest rate? What does APR mean?',
    url: 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-card-interest-rate-what-does-apr-mean-en-44/',
  },
  CFPB_SPEND: {
    org: 'CFPB',
    title: 'Consumer tips for managing spending',
    url: 'https://files.consumerfinance.gov/f/documents/201702_cfpb_Consumer-Tips-on-Managing-Spending.pdf',
  },
  FTC_TRIALS: {
    org: 'FTC',
    title: 'Getting In and Out of Free Trials, Auto-Renewals, and Negative Option Subscriptions',
    url: 'https://consumer.ftc.gov/articles/getting-and-out-free-trials-auto-renewals-and-negative-option-subscriptions',
  },
  CFPB_OVERDRAFT: {
    org: 'CFPB',
    title: 'What can I do if my bank charged me a fee for overdrawing my account?',
    url: 'https://www.consumerfinance.gov/ask-cfpb/what-can-i-do-if-my-bank-charged-me-a-fee-for-overdrawing-my-account-en-1037/',
  },
  FED_SHED: {
    org: 'Federal Reserve',
    title: 'Economic Well-Being of U.S. Households in 2025: Savings and Investments',
    url: 'https://www.federalreserve.gov/publications/2026-economic-well-being-of-us-households-in-2025-savings-investments.htm',
  },
  BLS_COLLEGE: {
    org: 'Bureau of Labor Statistics',
    title: 'Employment-population ratio for college students',
    url: 'https://www.bls.gov/opub/ted/2024/employment-population-ratio-22-5-percent-for-high-school-students-44-3-percent-for-college-students.htm',
  },
  CFPB_LENDING: {
    org: 'CFPB',
    title: 'Tips for managing family lending and borrowing',
    url: 'https://www.consumerfinance.gov/consumer-tools/educator-tool/adult-financial-education/tips-for-managing-family-lending-and-borrowing/',
  },
  FTC_FAKECHECK: {
    org: 'FTC',
    title: 'How To Spot, Avoid, and Report Fake Check Scams',
    url: 'https://consumer.ftc.gov/articles/how-spot-avoid-and-report-fake-check-scams',
  },
  FTC_SPOTLIGHT: {
    org: 'FTC',
    title: 'Data Spotlight: Don\u2019t bank on a \u201Ccleared\u201D check',
    url: 'https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2020/02/dont-bank-cleared-check',
  },
  CFPB_BNPL: {
    org: 'CFPB',
    title: 'The Buy Now, Pay Later Market',
    url: 'https://www.consumerfinance.gov/data-research/research-reports/the-buy-now-pay-later-market/',
  },
  CFPB_BNPL_PR: {
    org: 'CFPB',
    title: 'Research on heavy Buy Now, Pay Later use (January 2025)',
    url: 'https://www.consumerfinance.gov/archive/newsroom/cfpb-research-reveals-heavy-buy-now-pay-later-use-among-borrowers-with-high-credit-balances-and-multiple-pay-in-four-loans/',
  },
  CFPB_CASHFLOW: {
    org: 'CFPB',
    title: 'Creating a cash flow budget (tool)',
    url: 'https://files.consumerfinance.gov/f/documents/cfpb_creating-cash-flow-budget_tool_2021-08.pdf',
  },
  CONSUMER_BUDGET: {
    org: 'consumer.gov (FTC)',
    title: 'Making a Budget',
    url: 'https://consumer.gov/your-money/making-budget',
  },
  NOBEL_THALER: {
    org: 'Nobel Prize',
    title: 'Economic Sciences 2017: Richard Thaler (press release)',
    url: 'https://www.nobelprize.org/prizes/economic-sciences/2017/press-release/',
  },
  NOBEL_KAHNEMAN: {
    org: 'Nobel Prize',
    title: 'Economic Sciences 2002: Kahneman and Smith (advanced information)',
    url: 'https://www.nobelprize.org/uploads/2018/06/advanced-economicsciences2002.pdf',
  },
};
